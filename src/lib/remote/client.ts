import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import { deviceToken } from './identity';

/**
 * Browser Supabase client. Reads the two projection tables and nothing else —
 * every write goes through an Edge Function, because the server owns the deck.
 * The device token rides along as `x-player-token`, which is what `game_public`'s
 * RLS policy checks.
 */

let cached: SupabaseClient | null = null;

/*
 * Dynamic, not static: `$env/static/public` makes each variable a named export,
 * so an unset one fails the whole build. Remote play is meant to switch itself
 * off when unconfigured, not take the deploy down with it.
 */
const SUPABASE_URL = env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.PUBLIC_SUPABASE_ANON_KEY;

/** True when the deploy has Supabase wired up. Remote play hides itself if not. */
export const remoteEnabled = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

export function supabase(): SupabaseClient {
	if (!remoteEnabled) {
		throw new Error('Remote play is not configured: PUBLIC_SUPABASE_URL / ANON_KEY are missing');
	}
	if (cached) return cached;
	cached = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
		auth: { persistSession: false },
		global: { headers: { 'x-player-token': deviceToken() } },
		realtime: { params: { eventsPerSecond: 20 } }
	});
	return cached;
}

/** Anything the Edge Functions can return in the `error` field. */
export type RemoteErrorCode =
	| 'bad_request'
	| 'rate_limited'
	| 'not_found'
	| 'room_full'
	| 'forbidden'
	| 'stale'
	| 'illegal_action'
	| 'server_error';

export class RemoteError extends Error {
	constructor(
		readonly code: RemoteErrorCode,
		message: string,
		/** Present on `stale` and `illegal_action`: the real state to snap back to. */
		readonly payload: Record<string, unknown> = {}
	) {
		super(message);
		this.name = 'RemoteError';
	}
}

/**
 * Calls an Edge Function, normalising failures into `RemoteError`. The body is
 * always parsed: `functions.invoke` leaves it unread, which would discard the
 * `stale` code and the corrected state.
 */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabase().functions.invoke(name, { body });

	if (error) {
		const response = (error as { context?: Response }).context;
		if (response && typeof response.json === 'function') {
			try {
				const parsed = (await response.json()) as {
					error?: RemoteErrorCode;
					message?: string;
				} & Record<string, unknown>;
				if (parsed?.error) {
					throw new RemoteError(parsed.error, parsed.message ?? 'Request failed', parsed);
				}
			} catch (parseFailure) {
				if (parseFailure instanceof RemoteError) throw parseFailure;
			}
		}
		throw new RemoteError('server_error', error.message ?? 'Request failed');
	}

	return data as T;
}
