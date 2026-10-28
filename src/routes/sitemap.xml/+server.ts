import { CATEGORIES } from '$lib/data';
import { CATEGORY_COPY } from '$lib/seo';
import { SITE_URL } from '$lib/site';

export const prerender = true;

/**
 * Only pages with their own content. `/online/room` and `/online/rooms` are left
 * out *and* served `X-Robots-Tag: noindex` from `vercel.json` — leaving a URL out
 * of a sitemap has never stopped anything being indexed.
 *
 * No `<priority>` or `<changefreq>`: Google ignores both. `<lastmod>` is the one
 * field it reads, and it is omitted deliberately rather than wired to build time,
 * which would claim every page changed on every deploy and get the field ignored
 * too.
 */
const paths = [
	'/',
	'/faq',
	'/online',
	...CATEGORIES.filter((entry) => CATEGORY_COPY[entry.id]).map((entry) => `/${entry.id}`)
];

export function GET(): Response {
	const urls = paths
		.map((path) => `\t<url>\n\t\t<loc>${path === '/' ? SITE_URL : SITE_URL + path}</loc>\n\t</url>`)
		.join('\n');

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
	return new Response(body, { headers: { 'content-type': 'application/xml' } });
}
