import { containsSlur } from '../_shared/vendor/data/moderation.ts';
import { cleanName } from '../_shared/vendor/game/engine.ts';
import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';
import { startLobby, writeLobby } from '../_shared/lobby.ts';
import type { LobbySeat } from '../_shared/state.ts';

/**
 * Takes a lobby seat, by id or by code. Rejoining is the common case, not an
 * edge case: a token that already holds a seat gets it back rather than being
 * told the room is full.
 */
Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return fail('bad_request', 'Expected a JSON body');
	}

	const token = typeof body.token === 'string' && body.token.length >= 16 ? body.token : null;
	if (!token) return fail('bad_request', 'A device token of at least 16 characters is required');

	const db = serviceClient();

	if (!(await withinRateLimit(db, actorOf(req, token), 'join_room', 20, 60))) {
		return fail('rate_limited', 'Too many join attempts. Wait a minute and try again.');
	}

	const roomId = typeof body.roomId === 'string' ? body.roomId : null;
	const code = typeof body.code === 'string' ? body.code.trim() : null;
	if (!roomId && !code) return fail('bad_request', 'Provide a room id or a code');

	const query = db.from('rooms').select('id, status, slots, budget, category_label, variant_label');
	const { data: room, error } = roomId
		? await query.eq('id', roomId).maybeSingle()
		: await query.eq('code', code!).in('status', ['open', 'playing']).maybeSingle();

	if (error) {
		console.error('room lookup failed', error);
		return fail('server_error', 'Could not look up that room');
	}
	if (!room) return fail('not_found', 'No room with that code');
	if (room.status === 'finished' || room.status === 'abandoned') {
		return fail('not_found', 'That game has already finished');
	}

	// Already in this room? Hand back the same seat — this is what makes a
	// refresh mid-game recover instead of hitting "room full".
	const { data: existing } = await db
		.from('room_players')
		.select('id, seat, name')
		.eq('room_id', room.id)
		.eq('token', token)
		.maybeSingle();

	if (existing) {
		await db
			.from('room_players')
			.update({ last_seen_at: new Date().toISOString() })
			.eq('room_id', room.id)
			.eq('token', token);
		return json({ roomId: room.id, seat: existing.seat, playerId: existing.id, rejoined: true });
	}

	const name = cleanName(String(body.name ?? '')) || 'Player';
	if (containsSlur(name)) return fail('bad_request', "Slurs aren't allowed in names");

	// Seat choice and the open check happen under the room's row lock, so two
	// joins can't take one seat and nobody sits down after the deal.
	const { data: taken, error: seatError } = await db.rpc('take_lobby_seat', {
		p_room_id: room.id,
		p_token: token,
		p_name: name
	});
	if (seatError || !taken) {
		console.error('seat insert failed', seatError);
		return fail('server_error', 'Could not join that room');
	}
	if (taken.error === 'room_full') return fail('room_full', 'That room is full');
	if (taken.error === 'started') return fail('room_full', 'That draft has already started');
	if (taken.error) return fail('not_found', 'No room with that code');

	const seats = taken.seats as LobbySeat[];
	await writeLobby(db, room.id, seats, taken.max, taken.rev);

	// A full lobby has nobody left to wait for.
	if (seats.length >= taken.max) {
		const started = await startLobby(db, room.id);
		if (!started.ok) console.error('auto start failed', started.message);
	}

	// The seat may have closed up during an auto start, so read it back.
	const { data: mine } = await db
		.from('room_players')
		.select('seat')
		.eq('room_id', room.id)
		.eq('token', token)
		.maybeSingle();

	return json({
		roomId: room.id,
		seat: mine?.seat ?? taken.seat,
		playerId: taken.id,
		rejoined: false
	});
});
