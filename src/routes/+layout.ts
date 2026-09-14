import { dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

injectAnalytics({ mode: dev ? 'development' : 'production' });

// Everything runs in the browser, so the shell is a static file: adapter-auto
// stays at zero config and play time makes no server round-trips.
export const prerender = true;
