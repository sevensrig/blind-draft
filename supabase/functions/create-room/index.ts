import { containsSlur } from '../_shared/vendor/data/moderation.ts';
import { cleanName } from '../_shared/vendor/game/engine.ts';
import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';
import { readSettings } from '../_shared/setup.ts';
import { redact } from '../_shared/state.ts';

/**
 * Creates a room and builds its deck server-side — the creator is also a player,
 * so building it on their device would hand them the whole sequence.
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

	/*
	 * The tightest limit in the system — a room is a row plus a stored deck. Not
	 * tighter than this, though: `actorOf` buckets by IP, so everyone behind one
	 * NAT shares the budget, and create → quit → create is normal play. Matched
	 * to `join_room` at 20/minute.
	 */
	if (!(await withinRateLimit(db, actorOf(req, token), 'create_room', 20, 60))) {
		return fail('rate_limited', 'Too many rooms just now. Wait a minute and try again.');
	}

	const setup = readSettings(body);
	if (!setup.ok) return fail('bad_request', setup.message);
	const { config } = setup;

	const hostName = cleanName(String(body.name ?? '')) || 'Player 1';
	// Your opponent sees it on every screen, and it goes out on the share card.
	if (containsSlur(hostName)) return fail('bad_request', "Slurs aren't allowed in names");
	const visibility = body.visibility === 'private' ? 'private' : 'public';
	const state = setup.deal([hostName, 'Player 2']);

	// Unique only among joinable rooms, so a few retries against the partial
	// unique index is plenty.
	for (let attempt = 0; attempt < 5; attempt++) {
		const { data: code } = await db.rpc('generate_room_code');
		const { data: room, error } = await db
			.from('rooms')
			.insert({
				code,
				visibility,
				category_id: config.categoryId,
				variant_id: config.variantId,
				category_label: config.categoryLabel,
				variant_label: config.variantLabel,
				budget: config.budget,
				slots: config.slots
			})
			.select('id, code')
			.single();

		if (error) {
			if (error.code === '23505') continue; // code collision — reroll
			console.error('room insert failed', error);
			return fail('server_error', 'Could not create the room');
		}

		const results = await Promise.all([
			db.from('room_players').insert({ room_id: room.id, seat: 0, name: hostName, token }),
			db.from('games').insert({ room_id: room.id, state, version: 0 }),
			db.from('game_public').insert({ room_id: room.id, payload: redact(state, 1), version: 0 })
		]);

		const failure = results.find((result) => result.error !== null)?.error;
		if (failure) {
			console.error('room setup failed', failure);
			// Cascades clean up whatever did land.
			await db.from('rooms').delete().eq('id', room.id);
			return fail('server_error', 'Could not create the room');
		}

		return json({ roomId: room.id, code: room.code, seat: 0 });
	}

	return fail('server_error', 'Could not allocate a room code');
});
