import { expect, test } from '@playwright/test';
import { waitForHydration } from './helpers';

test('plays a full draft against the bot', async ({ page }) => {
	test.setTimeout(90_000);
	await page.goto('/');
	await waitForHydration(page);
	await page.getByRole('button', { name: 'Vs. the bot' }).click();
	await page.getByPlaceholder('Player 1').fill('Sri');
	await page.getByRole('button', { name: /Foods/ }).click();
	await page.getByRole('button', { name: '3', exact: true }).click();
	await page.getByRole('button', { name: /Start the draft/ }).click();

	const button = (name: RegExp) => page.getByRole('button', { name });
	// `isEnabled` waits for the element to exist, so check it's there first.
	const ready = async (name: RegExp) =>
		(await button(name).isVisible()) && (await button(name).isEnabled());
	const results = page.getByRole('heading', { name: 'Bot' });

	// A plain human: opens when nobody has, lets the bot have anything it raises on.
	for (let step = 0; step < 400 && !(await results.isVisible()); step++) {
		if (await ready(/Tap to reveal/)) await button(/Tap to reveal/).click();
		else if (await ready(/Next item|See the results/))
			await button(/Next item|See the results/).click();
		else if (await ready(/takes it\s*free/)) await button(/takes it\s*free/).click();
		else if (await ready(/Sri takes it for/)) await button(/Sri takes it for/).click();
		else if (await ready(/Sell to Bot/)) await button(/Sell to Bot/).click();
		else if ((await page.getByText('No bids').isVisible()) && (await ready(/^Sri/))) {
			// Gives the bot first refusal, so both openers get exercised.
			await page.waitForTimeout(1500);
			if (await page.getByText('No bids').isVisible()) await button(/^Sri/).click();
		} else await page.waitForTimeout(150);

		// The bot's controls are never this device's to press.
		if (await button(/^Bot\b/).isVisible()) await expect(button(/^Bot\b/)).toBeDisabled();
	}

	await expect(results).toBeVisible();
	await expect(page.locator('.pick__price')).toHaveCount(6);
});
