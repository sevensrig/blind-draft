import { expect, test } from '@playwright/test';

/**
 * Metadata is uniquely prone to silent rot: nothing on screen breaks when an OG
 * tag disappears or a canonical points at the wrong host, and the cost only
 * shows up as a dead link preview months later. These run against the built
 * output, so they check what a crawler or a link unfurler actually receives.
 */

const ORIGIN = 'https://blind-draft.vercel.app';

test('serves the social card and canonical metadata', async ({ page }) => {
	await page.goto('/');

	const content = async (selector: string) =>
		await page.locator(selector).first().getAttribute('content');

	await expect(page).toHaveTitle(/Blind Draft/);
	expect(await content('meta[name="description"]')).toMatch(/two-player party game/i);
	expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(ORIGIN);

	// Open Graph — what iMessage, Discord and Slack unfurl.
	expect(await content('meta[property="og:title"]')).toBeTruthy();
	expect(await content('meta[property="og:description"]')).toBeTruthy();
	expect(await content('meta[property="og:type"]')).toBe('website');
	expect(await content('meta[property="og:url"]')).toBe(ORIGIN);
	expect(await content('meta[property="og:image"]')).toBe(`${ORIGIN}/og.png`);
	expect(await content('meta[property="og:image:alt"]')).toBeTruthy();

	expect(await content('meta[name="twitter:card"]')).toBe('summary_large_image');
	expect(await content('meta[name="twitter:image"]')).toBe(`${ORIGIN}/og.png`);
});

test('the preview image is actually served at the advertised size', async ({ page, request }) => {
	await page.goto('/');
	const width = await page.locator('meta[property="og:image:width"]').getAttribute('content');
	const height = await page.locator('meta[property="og:image:height"]').getAttribute('content');
	expect([width, height]).toEqual(['1200', '630']);

	// A card that 404s is worse than no card: the unfurl shows a broken image.
	const res = await request.get('/og.png');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('image');
});

test('exposes valid structured data for answer engines', async ({ page }) => {
	await page.goto('/');
	const raw = await page.locator('script[type="application/ld+json"]').textContent();
	expect(raw).toBeTruthy();

	const schema = JSON.parse(raw ?? '{}');
	expect(schema['@type']).toBe('VideoGame');
	expect(schema.url).toBe(ORIGIN);
	expect(schema.isAccessibleForFree).toBe(true);
	expect(schema.offers.price).toBe('0');
	expect(schema.numberOfPlayers).toMatchObject({ minValue: 2, maxValue: 2 });
	expect(schema.description).toMatch(/two-player party game/i);
});

test('robots and sitemap agree on the origin and block nothing', async ({ request }) => {
	const robots = await request.get('/robots.txt');
	expect(robots.status()).toBe(200);
	const robotsBody = await robots.text();
	expect(robotsBody).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
	// No AI crawler is disallowed — that's deliberate, so pin it.
	expect(robotsBody).not.toMatch(/Disallow:\s*\//);

	const sitemap = await request.get('/sitemap.xml');
	expect(sitemap.status()).toBe(200);
	expect(await sitemap.text()).toContain(`<loc>${ORIGIN}</loc>`);
});

test('the page ships real text for crawlers that do not run javascript', async ({ request }) => {
	// Prerendered, so the shell alone must carry content. This is the property
	// that makes the app legible to AI crawlers at all.
	const html = await (await request.get('/')).text();
	const text = html
		.replace(/<script[\s\S]*?<\/script>/g, '')
		.replace(/<style[\s\S]*?<\/style>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');

	expect(text).toContain('Blind Draft');
	expect(text).toMatch(/free two-player party game/i);
	// Category names are the bulk of the indexable copy.
	for (const name of ['NBA Players', 'Childhood Nostalgia', 'Pizza Toppings']) {
		expect(text).toContain(name);
	}
});
