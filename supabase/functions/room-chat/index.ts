import { CHAT_MAX, censorSwears, containsSlur } from '../_shared/vendor/data/moderation.ts';
import { serviceClient, withinRateLimit } from '../_shared/db.ts';
import { CORS, actorOf, fail, json } from '../_shared/http.ts';

/**
 * Posts a chat message. Only once the draft has finished — mid-game talk is
 * what emotes are for — and never with a slur, which is the check that counts;
 * the client's is only a warning. Swearing goes through with its vowels starred.
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
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (!token || !roomId) return fail('bad_request', 'roomId and token are required');
	if (!text) return fail('bad_request', 'Say something first');
	if (text.length > CHAT_MAX) return fail('bad_request', `Keep it under ${CHAT_MAX} characters`);
	if (containsSlur(text)) return fail('bad_request', "Slurs aren't allowed in chat");

	const db = serviceClient();

	if (!(await withinRateLimit(db, actorOf(req, token), 'room_chat', 20, 60))) {
		return fail('rate_limited', 'Slow down a moment.');
	}

	const { data: player } = await db
		.from('room_players')
		.select('seat')
		.eq('room_id', roomId)
		.eq('token', token)
		.maybeSingle();
	if (!player) return fail('forbidden', 'You are not a player in this room');

	const [{ data: room }, { data: shown }] = await Promise.all([
		db.from('rooms').select('status').eq('id', roomId).maybeSingle(),
		db.from('game_public').select('left_by').eq('room_id', roomId).maybeSingle()
	]);
	if (room?.status !== 'finished') return fail('forbidden', 'Chat opens when the draft ends');
	// Nobody is left to read it.
	if (shown?.left_by != null) return fail('forbidden', 'Your opponent has left the room');

	const { error } = await db
		.from('chat_messages')
		.insert({ room_id: roomId, seat: player.seat, body: censorSwears(text) });
	if (error) {
		console.error('chat insert failed', error);
		return fail('server_error', 'Could not send that');
	}

	return json({ ok: true });
});
