import { expect, test, type Page } from '@playwright/test';
import { THEMES } from '../src/lib/theme';
import { waitForHydration } from './helpers';

/**
 * The theme picker, end to end.
 *
 * Two things here are worth more than the rest: that switching re-skins the page
 * with no reload (the whole point of driving it from custom properties), and that
 * a stored theme is already on the document before hydration — otherwise every
 * visit flashes the default accent first.
 */

const STORAGE_KEY = 'blind-draft:theme:v1';

/** The accent the page has actually resolved, read off the document. */
function accent(page: Page): Promise<string> {
	return page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--main').trim()
	);
}

function canvas(page: Page): Promise<string> {
	return page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
	);
}

test('the default theme needs nothing in storage', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	await expect(page.locator('html')).toHaveAttribute('data-theme', THEMES[0].id);
	await expect(page.getByRole('radio', { name: THEMES[0].label })).toBeChecked();
});

test('a stored theme is applied with the client bundle blocked', async ({ page }) => {
	/*
	 * The no-flash guarantee, proved rather than assumed.
	 *
	 * Asserting "the attribute is set before hydration" against a live page can't
	 * work: the expectation retries, so it only ever observes the state after the
	 * bundle has run. Blocking the scripts outright removes hydration from the
	 * picture, leaving the inline snippet in app.html as the only thing that could
	 * have applied the theme. If it lands here, it lands before first paint.
	 */
	await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
		STORAGE_KEY,
		'gold'
	] as const);
	await page.route('**/*.js', (route) => route.abort());

	await page.goto('/');

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'gold');
	// No hydration marker: nothing but the inline snippet ran.
	await expect(page.locator('html')).not.toHaveAttribute('data-hydrated', /./);
	// And the accent genuinely resolved, so the stylesheet matched the attribute.
	expect(await accent(page)).toBe('#ffc233');
});

test('picking a theme re-skins the page immediately, with no reload', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	const before = await accent(page);
	const beforeCanvas = await canvas(page);

	await page.getByRole('radio', { name: 'Cyan' }).check();

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'cyan');
	expect(await accent(page)).not.toBe(before);
	expect(await canvas(page)).not.toBe(beforeCanvas);

	// The game itself is untouched — this is a cosmetic preference, not state.
	await expect(page.getByText("Who's playing")).toBeVisible();
});

test('the border and shadow colour survive every theme', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	const read = () =>
		page.evaluate(() => {
			const style = getComputedStyle(document.documentElement);
			return {
				border: style.getPropertyValue('--border').trim(),
				shadow: style.getPropertyValue('--shadow').trim(),
				foreground: style.getPropertyValue('--foreground').trim()
			};
		});

	const baseline = await read();

	for (const theme of THEMES) {
		await page.getByRole('radio', { name: theme.label }).check();
		// This is the invariant that keeps the style intact regardless of accent:
		// a near-black edge, the shadow painted in the same value, black ink.
		expect(await read(), `theme ${theme.id}`).toEqual(baseline);
	}
});

test('each preset resolves to a distinct accent', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	const seen = new Set<string>();
	for (const theme of THEMES) {
		await page.getByRole('radio', { name: theme.label }).check();
		const value = await accent(page);
		expect(value, `theme ${theme.id} resolved to nothing`).not.toBe('');
		expect(seen.has(value), `theme ${theme.id} duplicates another preset`).toBe(false);
		seen.add(value);
	}
});

test('a chosen theme survives a reload', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	await page.getByRole('radio', { name: 'Lilac' }).check();
	const picked = await accent(page);
	expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('lilac');

	await page.reload();
	await waitForHydration(page);

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'lilac');
	expect(await accent(page)).toBe(picked);
	await expect(page.getByRole('radio', { name: 'Lilac' })).toBeChecked();
});

test('an unrecognised stored theme falls back to the default', async ({ page }) => {
	await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
		STORAGE_KEY,
		'chartreuse'
	] as const);

	await page.goto('/');
	await waitForHydration(page);

	/*
	 * 'chartreuse' passes the shape guard in app.html, which deliberately doesn't
	 * carry a copy of the preset list — so it does reach the attribute, matches no
	 * rule, and the default accent stands. The client then corrects the attribute,
	 * so the document and the picker never disagree about what's active.
	 */
	await expect(page.locator('html')).toHaveAttribute('data-theme', THEMES[0].id);
	await expect(page.getByRole('radio', { name: THEMES[0].label })).toBeChecked();
});

test('the browser chrome follows the chosen canvas', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	await page.getByRole('radio', { name: 'Gold' }).check();

	const meta = page.locator('meta[name="theme-color"]');
	await expect(meta).toHaveAttribute('content', await canvas(page));
});

test('the picker is keyboard operable', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	const first = page.getByRole('radio', { name: THEMES[0].label });
	await first.focus();
	// Native radio group semantics: arrows move and select in one keystroke.
	await page.keyboard.press('ArrowRight');

	await expect(page.getByRole('radio', { name: THEMES[1].label })).toBeChecked();
	await expect(page.locator('html')).toHaveAttribute('data-theme', THEMES[1].id);
});
