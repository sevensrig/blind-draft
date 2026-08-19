import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client. RLS is closed to everyone else by design — see the
 * policies migration — so every write in these functions runs here, and every
 * one of them is responsible for its own authorisation check.
 */
export function serviceClient(): SupabaseClient {
	const url = Deno.env.get('SUPABASE_URL');
	const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
	if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');
	return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Records the attempt and reports whether it's allowed.
 *
 * Postgres rather than Redis on purpose: the only question is "has this caller
 * done this too often just now", which a small indexed table answers fine at
 * two-player-party-game scale. Revisit if this ever sees real traffic.
 */
export async function withinRateLimit(
	db: SupabaseClient,
	actor: string,
	action: string,
	limit: number,
	windowSeconds: number
): Promise<boolean> {
	const { data, error } = await db.rpc('check_rate_limit', {
		p_actor: actor,
		p_action: action,
		p_limit: limit,
		p_window: `${windowSeconds} seconds`
	});
	// Fail open: a broken limiter shouldn't stop people playing.
	if (error) {
		console.error('rate limit check failed', error);
		return true;
	}
	return data === true;
}
