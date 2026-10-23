import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { PostHog } from 'posthog-js';
import {
	type GameEvent,
	type GameSnapshot,
	type PlayMode,
	isoWeek,
	scrubDeep,
	transitionEvent
} from './events';

export { gameEvent } from './events';

// Dynamic for the same reason as `$lib/remote/client.ts`: an unset key switches
// analytics off instead of failing the build. Unset in tests and local dev.
const POSTHOG_KEY = env.PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export const analyticsEnabled = !!POSTHOG_KEY;

// Lazy so a deploy without a key ships none of the SDK.
let client: Promise<PostHog | null> | null = null;

export function initAnalytics(): void {
	if (!browser || !analyticsEnabled || client) return;
	const origin = location.origin;
	// The exception extension is bundled rather than fetched from PostHog's CDN at
	// runtime; importing it registers it for `capture_exceptions`.
	client = Promise.all([import('posthog-js'), import('posthog-js/dist/exception-autocapture')])
		.then(([{ default: posthog }]) => {
			posthog.init(POSTHOG_KEY as string, {
				api_host: POSTHOG_HOST,
				defaults: '2026-08-30',
				// No cookies or storage, so no consent banner. PostHog hashes visitors
				// server-side instead, which only works once cookieless mode is enabled in
				// the project settings; until then these events are dropped.
				cookieless_mode: 'always',
				person_profiles: 'identified_only',
				autocapture: false,
				disable_session_recording: true,
				capture_pageview: 'history_change',
				capture_pageleave: true,
				// The flags request carries the initial URL as a person property, and no
				// feature flags are used.
				advanced_disable_flags: true,
				// Uncaught errors and rejections, sent as `$exception` events.
				capture_exceptions: true,
				// Deep because exception stacks and messages nest URLs, and the initial-URL
				// person properties ride outside `properties`.
				before_send: (event) => {
					if (!event) return event;
					event.properties = scrubDeep(event.properties, origin) as typeof event.properties;
					if (event.$set) event.$set = scrubDeep(event.$set, origin) as typeof event.$set;
					if (event.$set_once) {
						event.$set_once = scrubDeep(event.$set_once, origin) as typeof event.$set_once;
					}
					return event;
				}
			});
			markWeeklyVisit(posthog);
			return posthog;
		})
		.catch((error) => {
			console.warn('[blind-draft] analytics failed to load', error);
			return null;
		});
}

const WEEK_KEY = 'blind-draft:visit-week:v1';

/**
 * Cookieless hashing resets daily, so weekly uniques come from this instead: one
 * `weekly_visitor` per device per ISO week. Only the week label is stored, never
 * an id, so weeks can't be linked to each other.
 */
function markWeeklyVisit(posthog: PostHog): void {
	const week = isoWeek(new Date());
	try {
		if (localStorage.getItem(WEEK_KEY) === week) return;
		localStorage.setItem(WEEK_KEY, week);
	} catch {
		// Storage blocked (some private modes): skip rather than count every load.
		return;
	}
	posthog.capture('weekly_visitor', { week });
}

/** Never throws into game code: a blocked or failed SDK just drops the event. */
export function track(event: GameEvent | null): void {
	if (!client || !event) return;
	void client.then((posthog) => posthog?.capture(event.name, event.props));
}

/** For errors SvelteKit catches itself, which never reach the global handlers. */
export function reportError(error: unknown): void {
	void client?.then((posthog) => posthog?.captureException(error));
}

export function trackTransition(prev: GameSnapshot, next: GameSnapshot, mode: PlayMode): void {
	if (client) track(transitionEvent(prev, next, mode));
}
