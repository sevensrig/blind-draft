import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { game } from '$lib/game/store.svelte';
import { expectNoViolations } from '$lib/testing/axe';
import { THEMES } from '$lib/theme';
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
import ThemePicker from './ThemePicker.svelte';

/**
 * Component-level accessibility scans.
 *
 * These run axe against each component in isolation, so a violation points at
 * the component that owns it instead of surfacing only once a whole route is
 * assembled. The Playwright suite covers the same screens as full pages, where
 * document-level rules (landmarks, headings, page title) actually apply.
 *
 * Contrast states get their own cases on purpose: this palette is high-contrast
 * black-on-colour by design, but the disabled and inverted variants are exactly
 * where that can quietly break.
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

	/*
	 * The disabled/inverted button states are the ones worth scanning: a standing
	 * bid disables the holder's button and inverts it to black-on-cream, which is a
	 * classic spot for a contrast regression to hide.
	 */
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

		await page.getByRole('button', { name: /Sold to/ }).click();
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

/**
 * Every preset, not just the default.
 *
 * A "swap two custom properties" feature makes it very easy to ship one accent
 * that quietly fails contrast, because the one you build against is the only one
 * you ever look at. These scans run the same axe engine over each preset in turn,
 * on the screens where `--main` and the surface tones actually carry text: the
 * bid controls, the award stamp and the results sheet.
 *
 * `data-theme` on <html> is exactly what the picker sets, so this exercises the
 * real mechanism rather than a stand-in.
 */
describe('every theme preset is accessible', () => {
	beforeEach(() => {
		localStorage.clear();
		game.dispatch({ type: 'reset' });
	});

	afterEach(() => {
		delete document.documentElement.dataset.theme;
	});

	it('the picker itself is clean', async () => {
		render(ThemePicker);
		await expect.element(page.getByRole('radio', { name: 'Gold' })).toBeVisible();
		await expectNoViolations();
	});

	for (const theme of THEMES) {
		it(`${theme.label}: setup screen`, async () => {
			document.documentElement.dataset.theme = theme.id;
			render(SetupScreen);
			await page.getByRole('button', { name: /NBA Players/ }).click();
			await expect.element(page.getByRole('button', { name: /Start the draft/ })).toBeVisible();
			await expectNoViolations();
		});

		it(`${theme.label}: bid controls with a standing bid`, async () => {
			document.documentElement.dataset.theme = theme.id;
			game.replace(withStandingBid(contested({ names: ['Sri', 'Alex'] }), 0, 4));
			render(BidScreen);
			await expect.element(page.getByText('Sri leads')).toBeVisible();
			await expectNoViolations();
		});

		it(`${theme.label}: award stamp`, async () => {
			document.documentElement.dataset.theme = theme.id;
			game.replace(withStandingBid(contested({ names: ['Sri', 'Alex'] }), 0, 4));
			render(BidScreen);
			await page.getByRole('button', { name: /^Sold to/ }).click();
			await expect.element(page.getByText(/to Sri/)).toBeVisible();
			await expectNoViolations();
		});

		it(`${theme.label}: results sheet`, async () => {
			document.documentElement.dataset.theme = theme.id;
			game.replace(finishedGame({ slots: 3, names: ['Sri', 'Alex'] }));
			render(ResultsScreen);
			await expect.element(page.getByText('Rosters are full')).toBeVisible();
			await expectNoViolations();
		});
	}
});
