import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { playRound, playToResults, setUpGame, waitForHydration } from './helpers';

/**
 * Page-level accessibility scans, on real assembled routes — where the
 * document-scoped rules the component suite disables actually apply.
 *
 * Dynamic states get their own scans: the bid controls enable and disable as
 * wallets empty, and that churn is where a11y regressions hide.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: Page, label: string): Promise<void> {
	const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

	const detail = results.violations
		.map((violation) => {
			const nodes = violation.nodes
				.map((node) => `      ${node.target.join(' ')}\n        ${node.html}`)
				.join('\n');
			return `  ${violation.id} (${violation.impact}): ${violation.help}\n${nodes}`;
		})
		.join('\n');

	expect(results.violations, `${label} has accessibility violations:\n${detail}`).toEqual([]);
}

test('setup screen is accessible', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);
	await expect(page.getByText("Who's playing")).toBeVisible();
	await scan(page, 'setup screen');
});

test('the FAQ page is accessible', async ({ page }) => {
	await page.goto('/faq');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await scan(page, 'FAQ page');
});

test('the tutorial is accessible, spotlight and all', async ({ page }) => {
	await page.goto('/tutorial');
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Got it' }).click();
	await expect(page.getByRole('dialog')).toContainText('Your wallets');
	await scan(page, 'tutorial');
});

/**
 * One category page, not all seventeen — they render from one component, so a
 * second scan would re-test the template rather than the content. NBA is the
 * one with the extra roster block.
 */
test('a category landing page is accessible', async ({ page }) => {
	await page.goto('/nba');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await scan(page, 'category landing page');
});

test('the online entry page is accessible', async ({ page }) => {
	await page.goto('/online');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await scan(page, 'online entry page');
});

test('setup screen is accessible with a category and sub-mode toggle showing', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	await page.getByRole('button', { name: /NBA Players/ }).click();
	await expect(page.getByRole('button', { name: /Start the draft/ })).toBeVisible();
	await scan(page, 'setup screen with category chosen');
});

test('setup screen is accessible with the rules expanded', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	await page.getByText('How it works').click();
	// Scoped: the questions block answers the same rule in its own words.
	await expect(
		page.locator('details.rules:not(.faq)').getByText(/An item is revealed/)
	).toBeVisible();
	await scan(page, 'setup screen with rules open');
});

test('face-down reveal screen is accessible', async ({ page }) => {
	await setUpGame(page, { slots: '3' });
	await scan(page, 'reveal screen');
});

test('bid screen is accessible before and after a bid lands', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], slots: '3' });

	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	await expect(page.getByText('No bids · anyone can open')).toBeVisible();
	await scan(page, 'bid screen with no bids');

	// A standing bid disables the holder's button and inverts its colours.
	await page.getByRole('button', { name: /Sri[\s\S]*bid \$/ }).click();
	await expect(page.getByText('Sri leads')).toBeVisible();
	await scan(page, 'bid screen with a standing bid');
});

test('award screen is accessible', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], slots: '3' });

	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	await page.getByRole('button', { name: /Sri[\s\S]*bid \$/ }).click();
	await page.getByRole('button', { name: /^Sell to/ }).click();

	await expect(page.locator('.stamp')).toBeVisible();
	await scan(page, 'award screen');
});

test('broke-player fallback screen is accessible', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], budget: '$10', slots: '3' });

	// Drive Sri to $0 with slots left, then scan the uncontested UI.
	await playRound(page, { winner: 'Sri', allIn: true });
	await page.getByRole('button', { name: /Tap to reveal/ }).click();

	await expect(page.getByText('name your price')).toBeVisible();
	await expect(page.getByText('Broke')).toBeVisible();
	await scan(page, 'broke-player fallback');
});

test('both-broke fallback screen is accessible', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], budget: '$10', slots: '3' });

	await playRound(page, { winner: 'Sri', allIn: true });
	await playRound(page, { allIn: true });
	await page.getByRole('button', { name: /Tap to reveal/ }).click();

	await expect(page.getByText(/Both wallets are empty/)).toBeVisible();
	await scan(page, 'both-broke fallback');
});

test('positional roster and slot picker are accessible', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], category: 'NBA Players', variant: 'Current' });

	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	await scan(page, 'positional bid screen');

	await page.getByRole('button', { name: /Sri[\s\S]*bid \$/ }).click();
	await page.getByRole('button', { name: /^Sell to/ }).click();
	await expect(page.getByText(/pick at/)).toBeVisible();
	await scan(page, 'positional award screen with slot picker');
});

test('results sheet is accessible', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], slots: '3' });
	await playToResults(page, { winner: 'Sri' });

	await expect(page.getByText('Rosters are full')).toBeVisible();
	await scan(page, 'results sheet');
});

test('custom category editor is accessible', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	await page.getByRole('button', { name: /Make Your Own/ }).click();
	// Scan the shortfall state too: it swaps in an inverted warning chip.
	await expect(page.getByText(/0\/6 options/)).toBeVisible();
	await scan(page, 'custom editor, empty');

	await page.getByPlaceholder('Custom Draft').fill('Street Food');
	await page
		.getByRole('textbox', { name: /one per line/i })
		.fill('Pierogi\nKhinkali\nArepas\nBao\nInjera\nPoutine');
	await expect(page.getByRole('button', { name: /Start the draft/ })).toBeEnabled();
	await scan(page, 'custom editor, ready');
});
