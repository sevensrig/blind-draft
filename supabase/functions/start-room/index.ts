import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';
import { startLobby } from '../_shared/lobby.ts';

/** The host starts the draft with whoever is in the lobby, two players or more. */
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

	if (!(await withinRateLimit(db, actorOf(req, token), 'start_room', 20, 60))) {
		return fail('rate_limited', 'Slow down a moment.');
	}

	const { data: player } = await db
		.from('room_players')
		.select('seat')
		.eq('room_id', roomId)
		.eq('token', token)
		.maybeSingle();
	if (!player) return fail('forbidden', 'You are not a player in this room');
	if (player.seat !== 0) return fail('forbidden', 'Only the host can start the draft');

	const started = await startLobby(db, roomId);
	if (!started.ok) return fail('illegal_action', started.message);
	return json({ ok: true, players: started.players });
});
