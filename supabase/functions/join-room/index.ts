import type { GameState } from '../_shared/vendor/game/types.ts';
import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';
import { redact } from '../_shared/state.ts';

/**
 * Takes the second seat in a room, by id or by code.
 *
 * Rejoining is the common case, not an edge case: a refresh, a locked phone or
 * a dropped connection all come back through here. A device presenting a token
 * that already holds a seat gets that seat back rather than being told the room
 * is full.
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

	// Already in this room? Hand back the same seat. This is what makes a
	// refresh mid-game recover instead of hitting "room full".
	const { data: existing } = await db
		.from('room_players')
		.select('seat, name')
		.eq('room_id', room.id)
		.eq('token', token)
		.maybeSingle();

	if (existing) {
		await db
			.from('room_players')
			.update({ last_seen_at: new Date().toISOString() })
			.eq('room_id', room.id)
			.eq('token', token);
		return json({ roomId: room.id, seat: existing.seat, rejoined: true });
	}

	const name = String(body.name ?? '').slice(0, 14).trim() || 'Player 2';

	// The unique (room_id, seat) constraint is what actually settles a race
	// between two devices joining at once — one insert wins, the other gets
	// 23505 and is told the room is full.
	const { error: seatError } = await db
		.from('room_players')
		.insert({ room_id: room.id, seat: 1, name, token });

	if (seatError) {
		if (seatError.code === '23505') return fail('room_full', 'That room already has two players');
		console.error('seat insert failed', seatError);
		return fail('server_error', 'Could not join that room');
	}

	// Second seat taken: the game is on, and the room drops off the public list
	// via the trigger on `status`.
	const { data: game } = await db
		.from('games')
		.select('state, version')
		.eq('room_id', room.id)
		.single();

	if (game) {
		const state = game.state as GameState;
		state.players[1].name = name;
		await db.from('games').update({ state }).eq('room_id', room.id);
		// Redaction happens here, in TypeScript, because it depends on the engine.
		await db
			.from('game_public')
			.update({ payload: redact(state, 2), updated_at: new Date().toISOString() })
			.eq('room_id', room.id);
	}

	await db
		.from('rooms')
		.update({ status: 'playing', last_active_at: new Date().toISOString() })
		.eq('id', room.id);

	return json({ roomId: room.id, seat: 1, rejoined: false });
});
