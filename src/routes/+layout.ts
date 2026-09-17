import { dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

// Safe above `prerender` because injectAnalytics guards on `browser` internally.
// Pageviews carry the pathname only, so a room id stays out of the dashboard.
injectAnalytics({ mode: dev ? 'development' : 'production' });

// Everything runs in the browser, so the shell is a static file: adapter-auto
// stays at zero config and play time makes no server round-trips beyond the
// analytics pageview.
export const prerender = true;
