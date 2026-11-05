import type { GameState } from '../_shared/vendor/game/types.ts';
import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';
import { readSettings, type Settings } from '../_shared/setup.ts';
import { redact } from '../_shared/state.ts';

/**
 * Plays again in the same room once a game has finished. One seat proposes
 * settings, the other accepts and the server deals; either may cancel. A new
 * proposal replaces the old one, which is how a player counters with another
 * category.
 */

type Op = 'propose' | 'accept' | 'cancel';
const OPS = new Set<Op>(['propose', 'accept', 'cancel']);

interface Offer {
	by: 0 | 1;
	settings: Settings;
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return fail('bad_request', 'Expected a JSON body');
	}

	const token = typeof body.token === 'string' ? body.token : null;
	const roomId = typeof body.roomId === 'string' ? body.roomId : null;
	const op = body.op as Op;
	if (!token || !roomId || !OPS.has(op)) {
		return fail('bad_request', 'roomId, token and op are required');
	}

	const db = serviceClient();

	if (!(await withinRateLimit(db, actorOf(req, token), 'rematch', 30, 60))) {
		return fail('rate_limited', 'Slow down a moment.');
	}

	const { data: player } = await db
		.from('room_players')
		.select('seat')
		.eq('room_id', roomId)
		.eq('token', token)
		.maybeSingle();
	if (!player) return fail('forbidden', 'You are not a player in this room');
	const seat = player.seat as 0 | 1;

	const [{ data: room }, { data: shown }, { data: game }] = await Promise.all([
		db.from('rooms').select('status, rematch').eq('id', roomId).maybeSingle(),
		db.from('game_public').select('left_by').eq('room_id', roomId).maybeSingle(),
		db.from('games').select('state, version').eq('room_id', roomId).maybeSingle()
	]);
	if (!room || !shown || !game) return fail('not_found', 'No game in that room');

	if (room.status !== 'finished') return fail('forbidden', 'That game is not over yet.');
	if (shown.left_by !== null) return fail('forbidden', 'Your opponent has left the room.');

	const offer = room.rematch as Offer | null;

	if (op === 'cancel') {
		await writeOffer(db, roomId, null);
		return json({ ok: true });
	}

	if (op === 'propose') {
		const setup = readSettings(body);
		if (!setup.ok) return fail('bad_request', setup.message);
		const { config } = setup;
		const ok = await writeOffer(
			db,
			roomId,
			{ by: seat, settings: setup.settings },
			{
				by: seat,
				categoryId: config.categoryId,
				variantId: config.variantId,
				categoryLabel: config.categoryLabel,
				variantLabel: config.variantLabel,
				budget: config.budget,
				slots: config.slots
			}
		);
		return ok ? json({ ok: true }) : fail('server_error', 'Could not send that offer');
	}

	// accept
	if (!offer) return fail('not_found', 'That offer was withdrawn.');
	if (offer.by === seat) return fail('forbidden', 'Your opponent has to accept your offer.');

	// Stored already validated, but the pools can change between deploys.
	const setup = readSettings(offer.settings as unknown as Record<string, unknown>);
	if (!setup.ok) return fail('bad_request', setup.message);

	const previous = game.state as GameState;
	const state = setup.deal([previous.players[0].name, previous.players[1].name]);
	const publicState = redact(state, 2);

	const { data: commit, error } = await db.rpc('commit_rematch', {
		p_room_id: roomId,
		p_expected: game.version,
		p_state: state,
		p_public: publicState,
		p_room: {
			category_id: setup.config.categoryId,
			variant_id: setup.config.variantId,
			category_label: setup.config.categoryLabel,
			variant_label: setup.config.variantLabel,
			budget: setup.config.budget,
			slots: setup.config.slots
		}
	});
	if (error || !commit) {
		console.error('rematch commit failed', error);
		return fail('server_error', 'Could not start the rematch');
	}
	if (!commit.ok) return fail('stale', 'The rematch already started');

	return json({ state: publicState, version: commit.version });
});

/** The full offer goes on `rooms`; only its labels go where players can read. */
async function writeOffer(
	db: ReturnType<typeof serviceClient>,
	roomId: string,
	offer: Offer | null,
	shown: Record<string, unknown> | null = null
): Promise<boolean> {
	const now = new Date().toISOString();
	const [a, b] = await Promise.all([
		db.from('rooms').update({ rematch: offer, last_active_at: now }).eq('id', roomId),
		db.from('game_public').update({ rematch: shown, updated_at: now }).eq('room_id', roomId)
	]);
	if (a.error || b.error) console.error('rematch offer write failed', a.error ?? b.error);
	return !a.error && !b.error;
}
