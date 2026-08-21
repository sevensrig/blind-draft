import type { Action, GameState, PlayerId } from '../_shared/vendor/game/types.ts';
import { applyAction } from '../_shared/vendor/game/engine.ts';
import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';
import { redact } from '../_shared/state.ts';

/**
 * Applies one game action, authoritatively.
 *
 * The interesting part is the race. Either player may raise at any moment, so
 * two bids can be in flight together. Each caller sends the version it was
 * looking at; the write is a single UPDATE conditional on that version, which
 * Postgres settles atomically. Exactly one wins and bumps the version — the
 * other matches zero rows and is told `stale`, with the real state attached so
 * the loser's screen corrects itself instead of showing a bid that never landed.
 */

/** Every action that speaks for one seat, and so must speak for the caller's. */
const SEATED = new Set<Action['type']>(['bid', 'sold', 'buy', 'decline']);

/**
 * Actions that name a player must name the caller's own seat.
 *
 * This is what enforces issue #11's fix: `sold` names the player who is
 * conceding, so a client can only ever concede for itself, and the engine
 * separately refuses a concession from whoever holds the standing bid. Between
 * the two, nobody can award themselves the item they are winning.
 *
 * Keyed off the action type rather than `'player' in action`, which is the
 * version this replaced. That test asked the payload whether it should be
 * checked, so omitting the field skipped the check entirely — a stale bundle
 * still sending a bare `{ type: 'sold' }` would sail through, and
 * `canSell(state, undefined)` says yes to the holder. A whitelist can't be
 * opted out of by leaving something off the wire.
 */
function actorMismatch(action: Action, seat: PlayerId): boolean {
	if (!SEATED.has(action.type)) return false;
	return (action as { player?: PlayerId }).player !== seat;
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
	const action = body.action as Action | undefined;
	const expected = Number(body.version);

	if (!token || !roomId || !action?.type) {
		return fail('bad_request', 'roomId, token and action are required');
	}
	if (!Number.isInteger(expected)) return fail('bad_request', 'A version is required');

	const db = serviceClient();

	// Looser than room creation: this is the hot path of a live game, and a
	// fast back-and-forth bidding war is normal play, not abuse.
	if (!(await withinRateLimit(db, actorOf(req, token), 'room_action', 120, 60))) {
		return fail('rate_limited', 'Slow down a moment.');
	}

	// The token is the whole authorisation story: it proves which seat is asking.
	const { data: player } = await db
		.from('room_players')
		.select('seat')
		.eq('room_id', roomId)
		.eq('token', token)
		.maybeSingle();

	if (!player) return fail('forbidden', 'You are not a player in this room');
	const seat = player.seat as PlayerId;

	/*
	 * A closed room takes no more moves.
	 *
	 * Its own query rather than an embedded resource on the lookup above: getting
	 * that join wrong returns no row, which reads as "not a player in this room"
	 * and would lock both players out of every action. A second round trip is the
	 * cheaper mistake.
	 *
	 * This is what stops a client that quit — or one still holding the room open
	 * in a background tab — from playing on after the game ended. The engine
	 * can't catch it: abandonment lives on the room, not in `GameState`.
	 */
	const { data: room } = await db.from('rooms').select('status').eq('id', roomId).maybeSingle();

	if (!room) return fail('not_found', 'No game in that room');
	if (room.status === 'abandoned') return fail('forbidden', 'That game has ended.');

	if (actorMismatch(action, seat)) {
		return fail('forbidden', 'You can only act for your own seat');
	}

	const { data: game, error: loadError } = await db
		.from('games')
		.select('state, version')
		.eq('room_id', roomId)
		.maybeSingle();

	if (loadError || !game) return fail('not_found', 'No game in that room');

	const state = game.state as GameState;

	// Behind already — don't even try the write.
	if (game.version !== expected) {
		return fail('stale', 'Someone got there first', {
			state: redact(state, 2),
			version: game.version
		});
	}

	// `assign` moves a just-won item between slots; only its winner may do that.
	if (action.type === 'assign' && state.lastAward && state.lastAward.playerId !== seat) {
		return fail('forbidden', 'That pick is not yours to place');
	}

	const next = applyAction(state, action);

	// The engine returns the same object for anything illegal, which is a
	// cheaper and more reliable check than re-deriving legality here.
	if (next === state) {
		return fail('illegal_action', 'That move is not legal right now', {
			state: redact(state, 2),
			version: game.version
		});
	}

	const version = game.version + 1;

	// The atomic step. Conditional on the version we read.
	const { data: written, error: writeError } = await db
		.from('games')
		.update({ state: next, version, updated_at: new Date().toISOString() })
		.eq('room_id', roomId)
		.eq('version', expected)
		.select('version');

	if (writeError) {
		console.error('game write failed', writeError);
		return fail('server_error', 'Could not apply that move');
	}

	// Zero rows means another request committed between our read and our write.
	if (!written?.length) {
		const { data: fresh } = await db
			.from('games')
			.select('state, version')
			.eq('room_id', roomId)
			.maybeSingle();
		return fail('stale', 'Someone got there first', {
			state: fresh ? redact(fresh.state as GameState, 2) : null,
			version: fresh?.version ?? null
		});
	}

	// Only now is the redacted copy published — this is what clients subscribe to.
	const publicState = redact(next, 2);
	await db
		.from('game_public')
		.update({ payload: publicState, version, updated_at: new Date().toISOString() })
		.eq('room_id', roomId);

	await db
		.from('rooms')
		.update({
			last_active_at: new Date().toISOString(),
			...(next.phase === 'results' ? { status: 'finished' as const } : {})
		})
		.eq('id', roomId);

	return json({ state: publicState, version });
});
