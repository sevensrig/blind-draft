import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { game } from '$lib/game/store.svelte';
import {
	bothBrokeFallback,
	brokeFallback,
	contested,
	startedGame,
	withStandingBid
} from '$lib/testing/fixtures';
import BidScreen from './BidScreen.svelte';

/**
 * BidScreen reads the shared store, so each test seeds a state through
 * `game.replace` — the same seam Tier 2 would use for server-pushed state.
 */
describe('BidScreen', () => {
	beforeEach(() => {
		localStorage.clear();
		game.dispatch({ type: 'reset' });
	});

	it('keeps the card face down until it is tapped', async () => {
		game.replace(startedGame());
		render(BidScreen);

		await expect.element(page.getByText('Tap to reveal')).toBeVisible();
		// The item name must not leak before the reveal.
		expect(page.getByText('Item 1', { exact: true }).elements()).toHaveLength(0);

		await page.getByRole('button', { name: /Tap to reveal/ }).click();
		await expect.element(page.getByText('On the block')).toBeVisible();
		expect(game.state.phase).toBe('resolve');
	});

	it('records an opening bid and shows who leads', async () => {
		game.replace(contested({ names: ['Sri', 'Alex'] }));
		render(BidScreen);

		await expect.element(page.getByText('No bids · anyone can open')).toBeVisible();

		await page.getByRole('button', { name: /Sri/ }).click();

		await expect.element(page.getByText('Sri leads')).toBeVisible();
		expect(game.state.bid).toEqual({ amount: 1, holder: 0 });
	});

	it('raises to the dial amount and blocks the holder from bidding again', async () => {
		game.replace(withStandingBid(contested({ names: ['Sri', 'Alex'] }), 0, 4));
		render(BidScreen);

		// Dial snaps to the minimum legal raise.
		await expect.element(page.getByText('$5', { exact: true })).toBeVisible();
		await expect.element(page.getByText('raise to')).toBeVisible();

		// Sri holds the bid, so their button reads as leading and is unavailable.
		await expect.element(page.getByRole('button', { name: /Sri.*holding \$4/s })).toBeDisabled();

		await page.getByRole('button', { name: /\+2/ }).click();
		await page.getByRole('button', { name: /Alex/ }).click();

		expect(game.state.bid).toEqual({ amount: 7, holder: 1 });
	});

	it('sells to the standing bidder and charges them', async () => {
		game.replace(withStandingBid(contested({ names: ['Sri', 'Alex'] }), 1, 6));
		render(BidScreen);

		await page.getByRole('button', { name: /Sold to Alex/ }).click();

		await expect.element(page.getByText('to Alex')).toBeVisible();
		expect(game.state.phase).toBe('award');
		expect(game.state.players[1].money).toBe(14);
		expect(game.state.players[1].roster).toHaveLength(1);
		expect(game.state.players[0].money).toBe(20);
	});

	it('cannot be sold before anyone opens', async () => {
		game.replace(contested());
		render(BidScreen);

		await expect.element(page.getByRole('button', { name: /Nobody has opened/ })).toBeDisabled();
		expect(game.state.phase).toBe('resolve');
	});

	it('renders the broke-player fallback and lets the solvent player buy', async () => {
		game.replace(brokeFallback({ names: ['Sri', 'Alex'] }));
		render(BidScreen);

		await expect.element(page.getByText('Broke')).toBeVisible();
		await expect.element(page.getByText(/Alex.*is out of money/s)).toBeVisible();
		await expect.element(page.getByText('name your price')).toBeVisible();

		await page.getByRole('button', { name: /Sri takes it for \$1/ }).click();

		expect(game.state.players[0].money).toBe(19);
		expect(game.state.players[0].roster).toHaveLength(1);
		expect(game.state.lastAward?.free).toBe(false);
	});

	it('hands the item to the broke player free when the solvent one passes', async () => {
		game.replace(brokeFallback({ names: ['Sri', 'Alex'] }));
		render(BidScreen);

		await page.getByRole('button', { name: /Pass/ }).click();

		expect(game.state.players[1].roster).toHaveLength(1);
		expect(game.state.players[1].roster[0].free).toBe(true);
		// The solvent player keeps every dollar.
		expect(game.state.players[0].money).toBe(20);
		expect(game.state.lastAward?.declined).toBe(true);
	});

	it('awards free and alternating once both are broke', async () => {
		game.replace(bothBrokeFallback({ names: ['Sri', 'Alex'] }));
		render(BidScreen);

		await expect.element(page.getByText(/Both wallets are empty/)).toBeVisible();
		await page.getByRole('button', { name: /Sri takes it/ }).click();

		expect(game.state.lastAward).toMatchObject({ playerId: 0, free: true, price: 0 });
		// Alternation pointer moves to the other player.
		expect(game.state.freeTurn).toBe(1);
	});

	it('lets the winner re-slot a positional pick', async () => {
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
		game.replace(withStandingBid(contested({ roster, deck, names: ['Sri', 'Alex'] }), 0, 3));
		render(BidScreen);

		await page.getByRole('button', { name: /Sold to Sri/ }).click();
		// Lands at centre, the slot Shaq suits.
		expect(game.state.lastAward?.slotLabel).toBe('C');

		await page.getByRole('button', { name: 'PG', exact: true }).click();

		expect(game.state.lastAward?.slotId).toBe('pg');
		expect(game.state.players[0].roster[0].slotId).toBe('pg');
	});
});
