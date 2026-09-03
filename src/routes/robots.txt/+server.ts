import { SITE_URL } from '$lib/site';

/**
 * A route, not a static file, so the sitemap URL stays tied to `SITE_URL` — a
 * hardcoded domain in `static/` rots silently after a domain change.
 *
 * Nothing is disallowed, AI crawlers included: being readable by them is how
 * this app gets cited at all.
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
