import { SITE_URL } from '$lib/site';

/**
 * Served as a route rather than a static file so the sitemap URL stays tied to
 * `SITE_URL` — a hardcoded domain in `static/` is exactly the thing that rots
 * silently after a domain change.
 *
 * Nothing is disallowed, including AI crawlers. Being readable by them is the
 * whole on-site half of getting cited by answer engines; blocking them would
 * trade away the one lever this app actually has.
 */
export const prerender = true;

export function GET(): Response {
	const body = `# Everything is crawlable, AI crawlers included.
User-agent: *
Disallow:

Sitemap: ${SITE_URL}/sitemap.xml
`;
	return new Response(body, { headers: { 'content-type': 'text/plain' } });
}
