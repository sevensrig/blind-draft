import { expect, test } from '@playwright/test';

/**
 * Metadata rots silently — nothing on screen breaks when an OG tag disappears,
 * and the cost shows up as a dead link preview months later. These run against
 * the built output, so they check what a crawler actually receives.
 */

const ORIGIN = 'https://www.20dollardraftgame.com';

test('serves the social card and canonical metadata', async ({ page }) => {
	await page.goto('/');

	const content = async (selector: string) =>
		await page.locator(selector).first().getAttribute('content');

	// "$20 draft game" is the searched phrase, so the title leads with it.
	await expect(page).toHaveTitle(/\$20 Draft Game/);
	expect(await content('meta[name="description"]')).toMatch(/two-player party game/i);
	expect(await content('meta[name="description"]')).toMatch(/\$20 draft/i);
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

/** The layout's site-wide block plus whatever the route added. */
async function schemas(page: import('@playwright/test').Page) {
	const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
	return raw.map((text) => JSON.parse(text));
}

test('exposes valid structured data for answer engines', async ({ page }) => {
	await page.goto('/');
	const all = await schemas(page);
	const schema = all.find((entry) => entry['@type'] === 'VideoGame');
	expect(schema).toBeTruthy();
	expect(schema['@type']).toBe('VideoGame');
	// Every name, so the searched one and the screenshotted one are one entity.
	expect(schema.name).toBe('$20 Draft Game');
	expect(schema.alternateName).toEqual(['$20 Draft', '$20 Blind Draft']);
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
	// Prerendered, so the shell alone must carry content — that's what makes the
	// app legible to a crawler at all.
	const html = await (await request.get('/')).text();
	const text = html
		.replace(/<script[\s\S]*?<\/script>/g, '')
		.replace(/<style[\s\S]*?<\/style>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ');

	// Both names have to survive into the static HTML, so a crawler can connect
	// what a player sees with what they'd search for.
	expect(text).toMatch(/\$20\s*Draft/i);
	expect(text).toMatch(/\$20 Draft Game is a free two-player party game/i);
	// Category names are the bulk of the indexable copy.
	for (const name of ['NBA Players', 'Childhood Nostalgia', 'Pizza Toppings']) {
		expect(text).toContain(name);
	}
});

test('serves the tab icon in every form the browsers ask for', async ({ page, request }) => {
	await page.goto('/');

	// The Svelte template's logo used to live here; make sure it stays gone. Read
	// as pathnames, since the DOM resolves hrefs against the origin.
	const paths = await page
		.locator('link[rel="icon"], link[rel="apple-touch-icon"]')
		.evaluateAll((links) =>
			links.map((l) => new URL(l.getAttribute('href') ?? '', location.href).pathname)
		);
	expect(paths).toEqual(['/favicon.svg', '/favicon-96.png', '/apple-touch-icon.png']);

	for (const [path, type] of [
		['/favicon.svg', 'svg'],
		['/favicon-96.png', 'png'],
		['/apple-touch-icon.png', 'png']
	]) {
		const res = await request.get(path);
		expect(res.status(), `${path} should be served`).toBe(200);
		expect(res.headers()['content-type']).toContain(type);
	}
});

test('the FAQ page answers in markup exactly what it answers on the page', async ({ page }) => {
	await page.goto('/faq');

	const faq = (await schemas(page)).find((entry) => entry['@type'] === 'FAQPage');
	expect(faq).toBeTruthy();
	expect(faq.mainEntity.length).toBeGreaterThan(3);

	// Google asks that FAQ markup match what a visitor can read, so every answer
	// in the data has to be really on the page.
	const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
	for (const entry of faq.mainEntity) {
		expect(entry['@type']).toBe('Question');
		expect(body).toContain(entry.name);
		expect(body).toContain(entry.acceptedAnswer.text.slice(0, 60));
	}

	// One FAQPage block on the site: two pages claiming the same Q&A is the
	// duplicate-content version of this, which is why the home page dropped it.
	await page.goto('/');
	expect((await schemas(page)).find((entry) => entry['@type'] === 'FAQPage')).toBeUndefined();
});

test('every category has a landing page the home page links to', async ({ page, request }) => {
	await page.goto('/');

	const hrefs = await page
		.locator('nav[aria-label="Category guides"] a')
		.evaluateAll((links) => links.map((l) => l.getAttribute('href') ?? ''));
	expect(hrefs.length).toBeGreaterThan(10);

	// Orphaned pages rank on nothing however good the copy is, so the link from
	// here is the point of the nav — and every link has to actually resolve.
	const sitemap = await (await request.get('/sitemap.xml')).text();
	for (const href of hrefs) {
		expect(sitemap, `${href} should be in the sitemap`).toContain(
			`<loc>https://www.20dollardraftgame.com${href}</loc>`
		);
	}
});

test('a category page stands on its own content', async ({ page }) => {
	await page.goto('/nba');

	await expect(page).toHaveTitle(/NBA/);
	expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${ORIGIN}/nba`);
	// Its own Open Graph pair, so a shared category link doesn't unfurl as the home page.
	expect(await page.locator('meta[property="og:url"]').getAttribute('content')).toBe(
		`${ORIGIN}/nba`
	);

	const crumbs = (await schemas(page)).find((entry) => entry['@type'] === 'BreadcrumbList');
	expect(crumbs.itemListElement.at(-1).item).toBe(`${ORIGIN}/nba`);

	const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
	// Real pool names are what stop this being a templated doorway page.
	expect(body).toMatch(/PG|SG|SF|PF/);
	expect(body.length).toBeGreaterThan(600);

	// And it has to lead somewhere: the CTA preselects the category on setup.
	await page.getByRole('link', { name: /Draft NBA/i }).click();
	await expect(page).toHaveURL(/\?category=nba/);
	await page.waitForSelector('html[data-hydrated="true"]');
	await expect(page.getByRole('button', { name: /Start the draft/ })).toBeVisible();
});

test('two category pages do not read as the same page', async ({ request }) => {
	const read = async (path: string) => {
		const html = await (await request.get(path)).text();
		return (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? '';
	};
	const [nba, pizza] = await Promise.all([read('/nba'), read('/pizza-toppings')]);
	expect(nba).toBeTruthy();
	expect(pizza).toBeTruthy();
	expect(nba).not.toBe(pizza);
});

test('the online page is indexable and the live room pages are not', async ({ page, request }) => {
	await page.goto('/online');
	await expect(page).toHaveTitle(/online/i);
	expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(`${ORIGIN}/online`);
	// It used to prerender as an empty shell with no head tags at all.
	expect((await page.locator('body').innerText()).length).toBeGreaterThan(200);

	// A room page can never be a useful landing page. It stays out of the sitemap,
	// which is not what keeps it unindexed — `vercel.json` sends X-Robots-Tag, and
	// that header can only be checked against a real deploy.
	const sitemap = await (await request.get('/sitemap.xml')).text();
	expect(sitemap).not.toContain('/online/room');
	expect(sitemap).not.toContain('/online/rooms');
});
