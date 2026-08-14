import { SITE_URL } from '$lib/site';

/** One route, so one entry. Prerendered alongside the page itself. */
export const prerender = true;

export function GET(): Response {
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
	<url>
		<loc>${SITE_URL}</loc>
		<changefreq>monthly</changefreq>
		<priority>1.0</priority>
	</url>
</urlset>
`;
	return new Response(body, { headers: { 'content-type': 'application/xml' } });
}
