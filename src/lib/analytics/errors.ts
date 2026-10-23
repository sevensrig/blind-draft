import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { scrubDeep, scrubText } from './events';

const SENTRY_DSN = env.PUBLIC_SENTRY_DSN;

export const errorTrackingEnabled = !!SENTRY_DSN;

let sentry: Promise<typeof import('@sentry/svelte') | null> | null = null;

export function initErrorTracking(): void {
	if (!browser || !errorTrackingEnabled || sentry) return;
	const origin = location.origin;
	const scrub = <T>(value: T): T =>
		typeof value === 'string' ? (scrubText(value, origin) as T) : value;
	sentry = import('@sentry/svelte')
		.then((Sentry) => {
			Sentry.init({
				dsn: SENTRY_DSN,
				environment: env.PUBLIC_SENTRY_ENVIRONMENT || 'production',
				// v11 collects user info, headers and query strings unless told not to.
				dataCollection: {
					userInfo: false,
					cookies: false,
					httpHeaders: false,
					httpBodies: [],
					urlQueryParams: false
				},
				// Default integrations only, which means errors without tracing or replay.
				beforeSend(event) {
					if (event.request?.url) event.request.url = scrub(event.request.url);
					event.message = scrub(event.message);
					for (const value of event.exception?.values ?? []) value.value = scrub(value.value);
					return event;
				},
				// Navigation, fetch and console breadcrumbs can all carry a room URL.
				beforeBreadcrumb(crumb) {
					crumb.message = scrub(crumb.message);
					if (crumb.data) crumb.data = scrubDeep(crumb.data, origin) as typeof crumb.data;
					return crumb;
				}
			});
			return Sentry;
		})
		.catch((error) => {
			console.warn('[blind-draft] error tracking failed to load', error);
			return null;
		});
}

export function reportError(error: unknown): void {
	void sentry?.then((Sentry) => Sentry?.captureException(error));
}
