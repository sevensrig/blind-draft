import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './data';
import { CATEGORY_COPY, FAQ, canonical } from './seo';
import { SITE_URL } from './site';

/** A deliberate subset — see the note on `CATEGORY_COPY`. */
const drafted = CATEGORIES.filter((entry) => CATEGORY_COPY[entry.id]);

describe('category landing copy', () => {
	it('names only categories that really exist and can be drafted', () => {
		const real = new Set(CATEGORIES.filter((entry) => !entry.custom).map((entry) => entry.id));
		// Catches a typo or a stale entry left behind after a category is renamed,
		// either of which would prerender a page whose load throws a 404.
		for (const id of Object.keys(CATEGORY_COPY)) expect(real.has(id)).toBe(true);
	});

	it('stays a subset worth writing, not one page per category', () => {
		expect(drafted.length).toBeGreaterThan(0);
		expect(drafted.length).toBeLessThan(CATEGORIES.length);
	});

	it.each(drafted.map((entry) => entry.id))('%s reads as its own page', (id) => {
		const copy = CATEGORY_COPY[id];
		// Meta descriptions get cut around 160 characters, and a title much over 60
		// loses its tail in the results page.
		expect(copy.title.length).toBeLessThanOrEqual(65);
		expect(copy.description.length).toBeLessThanOrEqual(165);
		expect(copy.description.length).toBeGreaterThan(80);
		expect(copy.intro.length).toBeGreaterThan(80);
	});

	/**
	 * The whole risk with seventeen generated pages is that they read as one page
	 * with a word swapped, which is what a doorway page is. Templated copy would
	 * pass every length check above, so this is the assertion that matters.
	 */
	it('shares no intro between two categories', () => {
		const intros = drafted.map((entry) => CATEGORY_COPY[entry.id].intro);
		expect(new Set(intros).size).toBe(intros.length);
	});

	it('shares no title or description between two categories', () => {
		const titles = drafted.map((entry) => CATEGORY_COPY[entry.id].title);
		const descriptions = drafted.map((entry) => CATEGORY_COPY[entry.id].description);
		expect(new Set(titles).size).toBe(titles.length);
		expect(new Set(descriptions).size).toBe(descriptions.length);
	});
});

describe('canonical', () => {
	it('leaves the root without a trailing slash, like SITE_URL', () => {
		expect(canonical('/')).toBe(SITE_URL);
		expect(canonical()).toBe(SITE_URL);
	});

	it('joins a route onto the origin', () => {
		expect(canonical('/nba')).toBe(`${SITE_URL}/nba`);
	});
});

describe('FAQ', () => {
	it('asks and answers something in every entry', () => {
		expect(FAQ.length).toBeGreaterThan(3);
		for (const { q, a } of FAQ) {
			expect(q.endsWith('?')).toBe(true);
			expect(a.length).toBeGreaterThan(40);
		}
	});

	it('asks nothing twice', () => {
		expect(new Set(FAQ.map((entry) => entry.q)).size).toBe(FAQ.length);
	});
});
