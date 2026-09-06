import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';

/**
 * Ends a room early. Two writes: `rooms.status = 'abandoned'`, which the trigger
 * turns into a delete from `public_room_listings`, then
 * `game_public.abandoned_by`, which is how the opponent finds out — clients have
 * no grant on `rooms`.
 *
 * The version is deliberately left alone: it mirrors `games.version` and
 * quitting applies no game action, so bumping it would make the survivor's next
 * move come back `stale`.
 *
 * Idempotent, and a no-op on a `finished` room.
 */
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
	if (!token || !roomId) return fail('bad_request', 'roomId and token are required');

	const db = serviceClient();

	if (!(await withinRateLimit(db, actorOf(req, token), 'leave_room', 30, 60))) {
		return fail('rate_limited', 'Slow down a moment.');
	}

	// Same as every other endpoint: the token is the seat.
	const { data: player } = await db
		.from('room_players')
		.select('seat')
		.eq('room_id', roomId)
		.eq('token', token)
		.maybeSingle();

	if (!player) return fail('forbidden', 'You are not a player in this room');
	const seat = player.seat as 0 | 1;

	const { data: room, error: loadError } = await db
		.from('rooms')
		.select('status')
		.eq('id', roomId)
		.maybeSingle();

	if (loadError) {
		console.error('room lookup failed', loadError);
		return fail('server_error', 'Could not leave that room');
	}
	// Already gone — cleanup may have reaped it. Safe to walk away either way.
	if (!room) return json({ ok: true, status: 'abandoned' });

	// A game that ran to the end stays finished. Nobody abandoned it.
	if (room.status === 'finished' || room.status === 'abandoned') {
		return json({ ok: true, status: room.status });
	}

	const now = new Date().toISOString();

	const { error: statusError } = await db
		.from('rooms')
		.update({ status: 'abandoned', last_active_at: now })
		.eq('id', roomId);

	if (statusError) {
		console.error('room abandon failed', statusError);
		return fail('server_error', 'Could not leave that room');
	}

	// Best effort past here: the room is already closed, which is the part that
	// matters. A failure costs the opponent a notification, not the fix.
	const { error: notifyError } = await db
		.from('game_public')
		.update({ abandoned_by: seat, updated_at: now })
		.eq('room_id', roomId);

	if (notifyError) console.error('abandon broadcast failed', notifyError);

	return json({ ok: true, status: 'abandoned' });
});
