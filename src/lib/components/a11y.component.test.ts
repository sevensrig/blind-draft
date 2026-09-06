import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { game } from '$lib/game/store.svelte';
import { expectNoViolations } from '$lib/testing/axe';
import {
	bothBrokeFallback,
	brokeFallback,
	contested,
	finishedGame,
	startedGame,
	withStandingBid
} from '$lib/testing/fixtures';
import BidScreen from './BidScreen.svelte';
import ResultsScreen from './ResultsScreen.svelte';
import SetupScreen from './SetupScreen.svelte';

/**
 * Component-level accessibility scans, in isolation — so a violation points at
 * the component that owns it. The Playwright suite covers the same screens
 * assembled, where document-level rules apply.
 *
 * Contrast states get their own cases: the palette is black-on-colour by design,
 * and the disabled and inverted variants are where that quietly breaks.
 */
describe('accessibility', () => {
	beforeEach(() => {
		localStorage.clear();
		game.dispatch({ type: 'reset' });
	});

	it('setup screen is clean', async () => {
		render(SetupScreen);
		await expect.element(page.getByText("Who's playing")).toBeVisible();
		await expectNoViolations();
	});

	it('setup screen stays clean once a category is chosen', async () => {
		render(SetupScreen);
		// Selecting a category reveals the sub-mode toggle and the start bar.
		await page.getByRole('button', { name: /NBA Players/ }).click();
		await expect.element(page.getByRole('button', { name: /Start the draft/ })).toBeVisible();
		await expectNoViolations();
	});

	it('face-down reveal card is clean', async () => {
		game.replace(startedGame());
		render(BidScreen);
		await expect.element(page.getByText('Tap to reveal')).toBeVisible();
		await expectNoViolations();
	});

	it('bidding controls are clean with no standing bid', async () => {
		game.replace(contested());
		render(BidScreen);
		await expect.element(page.getByText('No bids · anyone can open')).toBeVisible();
		await expectNoViolations();
	});

	// A standing bid disables the holder's button and inverts it to
	// black-on-cream, which is where a contrast regression hides.
	it('bidding controls are clean with a standing bid and a disabled holder', async () => {
		game.replace(withStandingBid(contested({ names: ['Sri', 'Alex'] }), 0, 4));
		render(BidScreen);
		await expect.element(page.getByText('Sri leads')).toBeVisible();
		await expectNoViolations();
	});

	it('broke-player fallback is clean', async () => {
		game.replace(brokeFallback({ names: ['Sri', 'Alex'] }));
		render(BidScreen);
		await expect.element(page.getByText('name your price')).toBeVisible();
		await expectNoViolations();
	});

	it('both-broke fallback is clean', async () => {
		game.replace(bothBrokeFallback());
		render(BidScreen);
		await expect.element(page.getByText(/Both wallets are empty/)).toBeVisible();
		await expectNoViolations();
	});

	it('award state with the slot picker is clean', async () => {
		const roster = [
			{ id: 'pg', label: 'PG', drafts: ['PG' as const] },
			{ id: 'c', label: 'C', drafts: ['C' as const] }
		];
		const deck = [
			{ id: 'shaq', name: 'Shaq', tier: 'great' as const, position: 'C' as const },
			{ id: 'curry', name: 'Curry', tier: 'great' as const, position: 'PG' as const },
			{ id: 'jokic', name: 'Jokic', tier: 'great' as const, position: 'C' as const },
			{ id: 'luka', name: 'Luka', tier: 'great' as const, position: 'PG' as const }
		];
		game.replace(withStandingBid(contested({ roster, deck }), 0, 3));
		render(BidScreen);

		await page.getByRole('button', { name: /Sell to/ }).click();
		await expect.element(page.getByText(/pick at/)).toBeVisible();
		await expectNoViolations();
	});

	it('results sheet is clean', async () => {
		game.replace(finishedGame({ slots: 3, names: ['Sri', 'Alex'] }));
		render(ResultsScreen);
		await expect.element(page.getByText('Rosters are full')).toBeVisible();
		await expectNoViolations();
	});
});
