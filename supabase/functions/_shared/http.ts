/** Shared HTTP plumbing for the room endpoints. */

export const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-player-token',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...CORS, 'content-type': 'application/json' }
	});
}

/**
 * `code` matters more than `message`: `stale` tells the client to take the state
 * in the response rather than showing what the player just tried.
 */
export type ErrorCode =
	| 'bad_request'
	| 'rate_limited'
	| 'not_found'
	| 'room_full'
	| 'forbidden'
	| 'stale'
	| 'illegal_action'
	| 'server_error';

export function fail(code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
	const status =
		code === 'rate_limited' ? 429
		: code === 'not_found' ? 404
		: code === 'forbidden' ? 403
		: code === 'room_full' || code === 'stale' || code === 'illegal_action' ? 409
		: code === 'server_error' ? 500
		: 400;
	return json({ error: code, message, ...extra }, status);
}

/**
 * Best-effort caller identity for rate limiting. Behind Supabase's proxy the
 * real address is in x-forwarded-for; the token is the fallback.
 */
export function actorOf(req: Request, token?: string | null): string {
	const forwarded = req.headers.get('x-forwarded-for');
	const ip = forwarded?.split(',')[0]?.trim();
	return ip || token || 'unknown';
}
