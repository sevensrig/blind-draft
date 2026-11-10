/** Shared HTTP plumbing for the room endpoints. */

export const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-player-token',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	// Without it browsers re-preflight every few seconds, and each preflight is a
	// full function invocation (~230ms hosted).
	'Access-Control-Max-Age': '86400'
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
 * Best-effort caller identity for rate limiting.
 *
 * `cf-connecting-ip` comes first: Cloudflare sits in front of hosted functions
 * and overwrites it, so a client can't choose it. The leftmost x-forwarded-for
 * entry is whatever the client sent, so trusting it first let anyone dodge every
 * limit (and guess private room codes) with a fresh fake IP per request. It
 * stays as the fallback for local dev, where there's no Cloudflare; the token
 * is last.
 */
export function actorOf(req: Request, token?: string | null): string {
	const edge = req.headers.get('cf-connecting-ip')?.trim();
	if (edge) return edge;
	const forwarded = req.headers.get('x-forwarded-for');
	const ip = forwarded?.split(',')[0]?.trim();
	return ip || token || 'unknown';
}
