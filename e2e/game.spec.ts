import { expect, test } from '@playwright/test';
import { playRound, playToResults, setUpGame } from './helpers';

/**
 * Full journeys through the assembled app, driven only through visible controls.
 *
 * These run against `build` + `preview`, so they also stand in as the guard
 * against the hydration failure this app has shipped before: if the client bundle
 * dies, every one of these fails at the first tap.
 */

test('plays a complete two-player draft through to the results sheet', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], budget: '$20', slots: '3' });

	await expect(page.getByText('Item 1')).toBeVisible();
	await expect(page.getByText('of 6')).toBeVisible();

	// Alternate winners so both rosters fill from real bidding.
	await playRound(page, { winner: 'Sri' });
	await playRound(page, { winner: 'Alex' });
	await playRound(page, { winner: 'Sri' });
	await playToResults(page, { winner: 'Alex' });

	await expect(page.getByRole('heading', { name: 'Sri' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Alex' })).toBeVisible();

	// Three picks each, and money that adds up.
	const prices = page.locator('.pick__price');
	await expect(prices).toHaveCount(6);
	await expect(page.getByText('Top price')).toBeVisible();
	await expect(page.getByText('of 6 items')).toBeVisible();
});

test('drops into the broke-player fallback when someone spends everything', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], budget: '$10', slots: '3' });

	// Sri goes all-in on the very first card with two slots still empty.
	await playRound(page, { winner: 'Sri', allIn: true });

	await expect(page.getByText('Broke')).toBeVisible();
	await expect(page.getByRole('button', { name: /Tap to reveal/ })).toBeVisible();

	// Next card is uncontested: Alex names a price, and passing gifts it to Sri.
	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	await expect(page.getByText(/Sri.*is out of money/s)).toBeVisible();
	await expect(page.getByText('name your price')).toBeVisible();

	await page.getByRole('button', { name: /^Pass/ }).click();
	// Scoped to the award stamp: "free" also appears on roster chips.
	const stamp = page.locator('.stamp');
	await expect(stamp).toContainText('Free');
	await expect(stamp).toContainText('to Sri');
	await page.getByRole('button', { name: /Next item/ }).click();

	const modes = await playToResults(page, { winner: 'Alex' });
	expect(modes.some((mode) => mode === 'solo' || mode === 'forced')).toBe(true);

	// Sri never had money after the first card, so a free pickup is on the sheet.
	await expect(page.locator('.pick__price--free').first()).toBeVisible();
});

test('hands out the rest free and alternating once both players are broke', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], budget: '$10', slots: '3' });

	// Sri all-in first, then Alex spends the lot naming a price of $10.
	await playRound(page, { winner: 'Sri', allIn: true });
	await playRound(page, { allIn: true });

	// Both wallets are now empty with slots still to fill.
	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	await expect(page.getByText(/Both wallets are empty/)).toBeVisible();
	await expect(page.getByText('Broke')).toHaveCount(2);

	await page.getByRole('button', { name: /takes it/ }).click();
	await expect(page.locator('.stamp')).toContainText('Free');
	await page.getByRole('button', { name: /Next item|See the results/ }).click();

	await playToResults(page);

	// Everything after the two paid cards was a freebie.
	await expect(page.locator('.pick__price--free')).toHaveCount(4);
	await expect(page.getByText('of 6 items')).toBeVisible();
});

test('setup choices change the shape of the game', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], budget: '$50', slots: '4' });

	// Four slots each means eight cards, and $50 wallets.
	await expect(page.getByText('of 8')).toBeVisible();
	await expect(page.getByText('$50')).toHaveCount(2);

	await playToResults(page, { winner: 'Sri' });
	await expect(page.locator('.pick__price')).toHaveCount(8);
});

test('a positional category drafts a labelled starting five', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], category: 'NBA Players', variant: 'Current' });

	// Roster size is locked at five regardless of the slot chips.
	await expect(page.getByText('of 10')).toBeVisible();
	for (const label of ['PG', 'SG', 'SF', 'PF', 'C']) {
		await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
	}

	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	// The revealed player carries a position badge.
	await expect(page.locator('.item__tag--pos')).toBeVisible();
});

test('resumes an in-progress draft after a reload', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], budget: '$20', slots: '3' });
	await playRound(page, { winner: 'Sri' });

	await page.reload();

	// Back on the same card, with the first pick still recorded.
	await expect(page.getByText('Item 2')).toBeVisible();
	await expect(page.getByText('Sri')).toBeVisible();
	// And the app is still alive: the next tap works.
	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	await expect(page.getByText('On the block')).toBeVisible();
});

test('quitting twice abandons the draft and returns to setup', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], slots: '3' });

	await page.getByRole('button', { name: 'Quit' }).click();
	await page.getByRole('button', { name: /End it\?/ }).click();

	await expect(page.getByText("Who's playing")).toBeVisible();
	await expect(page.getByText('Pick a category to start')).toBeVisible();
});

test('drafts a category the player typed themselves', async ({ page }) => {
	const items = ['Pierogi', 'Khinkali', 'Arepas', 'Bao', 'Injera', 'Poutine'];
	await setUpGame(page, {
		names: ['Sri', 'Alex'],
		custom: { name: 'Street Food', items },
		slots: '3'
	});

	// Six typed options and three slots each, so the whole list gets drafted.
	await expect(page.getByText('of 6')).toBeVisible();
	await expect(page.getByText('Street Food')).toBeVisible();

	await playToResults(page, { winner: 'Sri' });

	// The typed name headlines the results sheet, not "Make Your Own".
	await expect(page.getByText(/Street Food/)).toBeVisible();
	await expect(page.locator('.pick__price')).toHaveCount(6);

	// The roster renders uppercase, so compare on case-folded names.
	const drafted = await page.locator('.pick__name').allInnerTexts();
	expect(drafted.map((t) => t.trim().toLowerCase()).sort()).toEqual(
		items.map((i) => i.toLowerCase()).sort()
	);
});

test('run it back reshuffles a typed category instead of emptying it', async ({ page }) => {
	await setUpGame(page, {
		custom: {
			name: 'Snacks',
			items: ['Pretzels', 'Popcorn', 'Olives', 'Hummus', 'Crisps', 'Nuts']
		},
		slots: '3'
	});
	await playToResults(page, { winner: 'Sri' });

	// The pool lives in the game config, so this must not rebuild from nothing.
	await page.getByRole('button', { name: /Run it back/ }).click();
	await expect(page.getByText('Tap to reveal')).toBeVisible();
	await expect(page.getByText('of 6')).toBeVisible();
	await expect(page.getByText('Snacks')).toBeVisible();
});
