import { containsSlur } from '../_shared/vendor/data/moderation.ts';
import { cleanName, initialState } from '../_shared/vendor/game/engine.ts';
import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';
import { readSettings } from '../_shared/setup.ts';
import { type ServerState, lobbyView } from '../_shared/state.ts';

/**
 * Opens a lobby. The deck is dealt server-side when the lobby starts (see
 * `startLobby`), because the creator is also a player.
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

	const maxPlayers = Number(body.maxPlayers ?? 2);
	if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
		return fail('bad_request', 'A room holds 2 to 4 players');
	}
	// Checked at the room's full size, so a start with fewer can't fail on the pool.
	const setup = readSettings(body, maxPlayers);
	if (!setup.ok) return fail('bad_request', setup.message);
	const { config } = setup;

	const hostName = cleanName(String(body.name ?? '')) || 'Player 1';
	// Your opponent sees it on every screen, and it goes out on the share card.
	if (containsSlur(hostName)) return fail('bad_request', "Slurs aren't allowed in names");
	const visibility = body.visibility === 'private' ? 'private' : 'public';
	// The engine's setup state, holding only the config until the deal.
	const state: ServerState = { ...initialState(), config, maxPlayers };

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
				slots: config.slots,
				max_players: maxPlayers,
				settings: setup.settings
			})
			.select('id, code')
			.single();

		if (error) {
			if (error.code === '23505') continue; // code collision — reroll
			console.error('room insert failed', error);
			return fail('server_error', 'Could not create the room');
		}

		const { data: host, error: hostError } = await db
			.from('room_players')
			.insert({ room_id: room.id, seat: 0, name: hostName, token })
			.select('id')
			.single();
		const seats = host ? [{ id: host.id as string, seat: 0, name: hostName }] : [];
		const results = [
			{ error: hostError },
			...(await Promise.all([
				db.from('games').insert({ room_id: room.id, state, version: 0 }),
				db.from('game_public').insert({
					room_id: room.id,
					payload: lobbyView(config, seats, maxPlayers, 0),
					version: 0
				})
			]))
		];

		const failure = results.find((result) => result.error !== null)?.error;
		if (failure) {
			console.error('room setup failed', failure);
			// Cascades clean up whatever did land.
			await db.from('rooms').delete().eq('id', room.id);
			return fail('server_error', 'Could not create the room');
		}

		return json({ roomId: room.id, code: room.code, seat: 0, playerId: host?.id });
	}

	return fail('server_error', 'Could not allocate a room code');
});
