import { expect, type Page } from '@playwright/test';

/**
 * Shared driving helpers. Visible controls only — no reaching into localStorage
 * or the store; if a journey needs a shortcut to pass, that's a finding.
 */

/**
 * Blocks until the client bundle has taken over. The page is prerendered, so
 * buttons are clickable well before Svelte attaches handlers and a tap in that
 * window is silently swallowed.
 */
export async function waitForHydration(page: Page): Promise<void> {
	await page.waitForSelector('html[data-hydrated="true"]', { timeout: 15_000 });
}

export interface SetupOptions {
	names?: [string, string];
	/** Preset chip label, e.g. '$10'. */
	budget?: '$10' | '$20' | '$50';
	/** Slot chip label. Ignored by positional categories. */
	slots?: '3' | '4' | '5' | '6' | '7' | '8';
	category?: string;
	variant?: 'Current' | 'All-Time';
	/** Fills in the custom category editor. Implies category 'Make Your Own'. */
	custom?: { name?: string; items: string[] };
}

export async function setUpGame(page: Page, options: SetupOptions = {}): Promise<void> {
	const { names = ['Sri', 'Alex'], budget, slots, variant, custom } = options;
	const category = custom ? 'Make Your Own' : (options.category ?? 'Foods');

	await page.goto('/');
	await waitForHydration(page);

	await page.getByPlaceholder('Player 1').fill(names[0]);
	await page.getByPlaceholder('Player 2').fill(names[1]);

	if (budget) await page.getByRole('button', { name: budget, exact: true }).click();

	await page.getByRole('button', { name: new RegExp(category) }).click();
	if (variant) await page.getByRole('button', { name: variant, exact: true }).click();

	// Typing the pool changes the slot ceiling, so it has to happen before slots.
	if (custom) {
		if (custom.name) await page.getByPlaceholder('Custom Draft').fill(custom.name);
		await page.getByRole('textbox', { name: /one per line/i }).fill(custom.items.join('\n'));
	}

	if (slots) await page.getByRole('button', { name: slots, exact: true }).click();

	await page.getByRole('button', { name: /Start the draft/ }).click();
	await expect(page.getByText('Tap to reveal')).toBeVisible();
}

/** Which rule is governing the item currently on screen. */
export type Mode = 'contest' | 'solo' | 'alternate' | 'forced';

async function currentMode(page: Page): Promise<Mode> {
	if (await page.getByText(/Both wallets are empty/).isVisible()) return 'alternate';
	if (await page.getByText(/names the price/).isVisible()) return 'solo';
	if (await page.getByText(/Nobody to bid against/).isVisible()) return 'forced';
	return 'contest';
}

export interface RoundOptions {
	/** Who should end up with the item when it's contested. */
	winner?: string;
	/** Spend everything, to drive a player broke on purpose. */
	allIn?: boolean;
	/** In `solo`, hand it to the broke player for free instead of buying. */
	pass?: boolean;
}

/** Resolves exactly one item, whichever rule applies, then advances. */
export async function playRound(page: Page, options: RoundOptions = {}): Promise<Mode> {
	const { winner, allIn = false, pass = false } = options;

	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	const mode = await currentMode(page);

	if (mode === 'contest') {
		if (allIn) await page.getByRole('button', { name: /All in/ }).click();
		const bidder = winner ?? 'Sri';
		await page.getByRole('button', { name: new RegExp(`${bidder}[\\s\\S]*bid \\$`) }).click();
		await page.getByRole('button', { name: /^Sell to/ }).click();
	} else if (mode === 'solo') {
		if (pass) {
			await page.getByRole('button', { name: /^Pass/ }).click();
		} else {
			if (allIn) await page.getByRole('button', { name: /All in/ }).click();
			await page.getByRole('button', { name: /takes it for \$/ }).click();
		}
	} else {
		await page.getByRole('button', { name: /takes it/ }).click();
	}

	// Award celebration, then on to the next card (or the results sheet).
	await page.getByRole('button', { name: /Next item|See the results/ }).click();
	return mode;
}

/** Plays whatever is left of the draft, returning every mode encountered. */
export async function playToResults(page: Page, options: RoundOptions = {}): Promise<Mode[]> {
	const modes: Mode[] = [];
	for (let guard = 0; guard < 30; guard++) {
		if (await page.getByText('Rosters are full').isVisible()) break;
		modes.push(await playRound(page, options));
	}
	await expect(page.getByText('Rosters are full')).toBeVisible();
	return modes;
}
