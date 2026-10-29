import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

test('the tutorial walks a new player through three bids to the end', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);
	await page.getByRole('link', { name: /tutorial/i }).click();
	await waitForHydration(page);

	const tip = page.getByRole('dialog');
	const gotIt = () => tip.getByRole('button', { name: 'Got it' }).click();
	const button = (name: RegExp) => page.getByRole('button', { name });

	await gotIt();
	await gotIt();
	await gotIt();
	await button(/Tap to reveal/).click();
	await gotIt();

	// The wrong amount is refused with a hint rather than silently ignored.
	await button(/^You/).click();
	await expect(tip.getByRole('alert')).toContainText('$3');
	await button(/Increase by one/).click();
	await button(/Increase by one/).click();
	await button(/^You/).click();

	await expect(tip).toContainText('Coach raised to $4');
	await gotIt();
	await button(/^You/).click();
	await expect(tip).toContainText('Sold to you for $5');
	await gotIt();
	await button(/Next item/).click();

	await button(/Tap to reveal/).click();
	await expect(tip).toContainText('Coach opened at $2');
	await gotIt();
	await button(/Sell to Coach/).click();
	await gotIt();
	await button(/Next item/).click();

	await button(/Tap to reveal/).click();
	await page.getByRole('button', { name: '+5', exact: true }).click();
	await button(/^You/).click();
	await expect(tip).toContainText('Your roster is full');
	await gotIt();
	await button(/Next item/).click();

	await button(/Tap to reveal/).click();
	await gotIt();
	await button(/Coach takes it/).click();
	await button(/See the results/).click();

	await expect(page.getByRole('heading', { name: "You're ready" })).toBeVisible();
	await page.getByRole('link', { name: 'Play for real' }).click();
	await expect(page).toHaveURL(/\/$/);
});

test('the spotlight swallows taps outside the highlighted control', async ({ page }) => {
	await page.goto('/tutorial');
	await waitForHydration(page);
	// The card is under the scrim on the first step, so a click there lands on the scrim.
	await page.getByRole('button', { name: /Tap to reveal/ }).click({ force: true });
	await expect(page.getByRole('button', { name: /Tap to reveal/ })).toBeVisible();
	await expect(page.getByRole('dialog')).toContainText('Welcome');
});
