import type { Action, GameState, PlayerId } from '../_shared/vendor/game/types.ts';
import { applyAction } from '../_shared/vendor/game/engine.ts';
import { serviceClient } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';
import { redact } from '../_shared/state.ts';

/**
 * Applies one game action, authoritatively.
 *
 * Either player may raise at any moment, so two bids can be in flight. Each
 * caller sends the version it read and the write is conditional on it: one wins,
 * the other matches zero rows and gets `stale` with the real state attached.
 */

/** Every action that speaks for one seat, and so must speak for the caller's. */
const SEATED = new Set<Action['type']>(['bid', 'sold', 'buy', 'decline']);

/**
 * Actions that name a player must name the caller's own seat. With the engine
 * refusing a concession from the bid holder, that stops anyone awarding
 * themselves the item they're winning.
 *
 * Keyed off the action type, never `'player' in action` — that asked the payload
 * whether to check it, so a bare `{ type: 'sold' }` skipped the check entirely.
 */
function actorMismatch(action: Action, seat: PlayerId): boolean {
	if (!SEATED.has(action.type)) return false;
	return (action as { player?: PlayerId }).player !== seat;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
	// The RPC takes a uuid, and a malformed one would surface as a server error.
	if (!UUID.test(roomId)) return fail('not_found', 'No game in that room');

	const db = serviceClient();

	const { data: context, error: contextError } = await db.rpc('room_action_context', {
		p_room_id: roomId,
		p_token: token,
		p_actor: actorOf(req, token)
	});

	if (contextError || !context) {
		console.error('room context failed', contextError);
		return fail('server_error', 'Could not load that room');
	}
	// Looser than room creation: a fast bidding war is normal play, not abuse.
	if (context.limited) return fail('rate_limited', 'Slow down a moment.');

	// The token is the whole authorisation story: it proves which seat is asking.
	if (context.seat === null) return fail('forbidden', 'You are not a player in this room');
	const seat = context.seat as PlayerId;

	// The engine can't catch this — abandonment lives on the room, not in `GameState`.
	if (!context.status) return fail('not_found', 'No game in that room');
	if (context.status === 'abandoned') return fail('forbidden', 'That game has ended.');

	if (actorMismatch(action, seat)) {
		return fail('forbidden', 'You can only act for your own seat');
	}

	if (!context.state) return fail('not_found', 'No game in that room');
	const state = context.state as GameState;
	const version = context.version as number;

	// Behind already — don't even try the write.
	if (version !== expected) {
		return fail('stale', 'Someone got there first', { state: redact(state, 2), version });
	}

	// `assign` moves a just-won item between slots; only its winner may do that.
	if (action.type === 'assign' && state.lastAward && state.lastAward.playerId !== seat) {
		return fail('forbidden', 'That pick is not yours to place');
	}

	const next = applyAction(state, action);

	// The engine returns the same object for anything illegal, which beats
	// re-deriving legality here.
	if (next === state) {
		return fail('illegal_action', 'That move is not legal right now', {
			state: redact(state, 2),
			version
		});
	}

	const publicState = redact(next, 2);
	const { data: commit, error: writeError } = await db.rpc('commit_room_action', {
		p_room_id: roomId,
		p_expected: expected,
		p_state: next,
		p_public: publicState,
		p_finished: next.phase === 'results'
	});

	if (writeError || !commit) {
		console.error('game write failed', writeError);
		return fail('server_error', 'Could not apply that move');
	}

	// Another request committed between our read and our write.
	if (!commit.ok) {
		return fail('stale', 'Someone got there first', {
			state: commit.state ? redact(commit.state as GameState, 2) : null,
			version: commit.version ?? null
		});
	}

	return json({ state: publicState, version: commit.version });
});
