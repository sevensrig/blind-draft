import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { playRound, playToResults, setUpGame, waitForHydration } from './helpers';

/**
 * Page-level accessibility scans.
 *
 * The component suite scans components in isolation; this scans the real assembled
 * routes, where document-scoped rules (landmarks, headings, page title, tab order)
 * actually apply. Both run the same axe engine in the same browser.
 *
 * Dynamic states get their own scans deliberately: the bid controls enable and
 * disable as bids land and wallets empty, and that churn is where a11y regressions
 * tend to hide.
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
	await expect(page.getByText(/An item is revealed/)).toBeVisible();
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
