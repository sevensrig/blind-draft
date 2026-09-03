import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Action } from '$lib/game/types';
import { game } from '$lib/game/store.svelte';
import {
	bothBrokeFallback,
	brokeFallback,
	contested,
	startedGame,
	withStandingBid
} from '$lib/testing/fixtures';
import BidScreen from './BidScreen.svelte';

/** BidScreen reads the shared store, so each test seeds state via `game.replace`. */
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

		await page.getByRole('button', { name: /Sell to Alex/ }).click();

		await expect.element(page.getByText('to Alex')).toBeVisible();
		expect(game.state.phase).toBe('award');
		expect(game.state.players[1].money).toBe(14);
		expect(game.state.players[1].roster).toHaveLength(1);
		expect(game.state.players[0].money).toBe(20);
	});

	// The standing bidder used to be able to accept their own bid. Fine locally,
	// where one device speaks for both seats; remotely it was a self-serve win.
	describe('accepting a bid', () => {
		it('lets one device end the bidding for either player', async () => {
			game.replace(withStandingBid(contested({ names: ['Sri', 'Alex'] }), 0, 3));
			render(BidScreen);

			// No seat, so the button is live even though Sri is the one leading.
			const sell = page.getByRole('button', { name: /Sell to Sri/ });
			await expect.element(sell).toBeEnabled();
			await sell.click();

			expect(game.state.phase).toBe('award');
			expect(game.state.lastAward).toMatchObject({ playerId: 0, price: 3 });
		});

		it('makes the opponent accept it in remote play', async () => {
			const dispatched: Action[] = [];
			const view = withStandingBid(contested({ names: ['Sri', 'Alex'] }), 0, 3);

			// Sri's device: Sri is holding the bid, so accepting is not theirs.
			render(BidScreen, { view, seat: 0, dispatch: (a: Action) => dispatched.push(a) });

			const waiting = page.getByRole('button', { name: /Waiting on Alex/ });
			await expect.element(waiting).toBeDisabled();
			expect(page.getByRole('button', { name: /Sell to/ }).elements()).toHaveLength(0);

			// A disabled button dispatches nothing even if something taps it.
			await waiting.click({ force: true });
			expect(dispatched).toEqual([]);
		});

		it('sends the conceding seat, not the winning one', async () => {
			const dispatched: Action[] = [];
			const view = withStandingBid(contested({ names: ['Sri', 'Alex'] }), 0, 3);

			// Alex's device: Alex is the one who has to let it go.
			render(BidScreen, { view, seat: 1, dispatch: (a: Action) => dispatched.push(a) });

			await page.getByRole('button', { name: /Sell to Sri/ }).click();

			// Seat 1 concedes; the server hands the item to the holder, seat 0.
			expect(dispatched).toEqual([{ type: 'sold', player: 1 }]);
		});
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

	// Quit is shared, and the two modes mean different things by it. Locally it
	// resets; remotely `reset` is a legal engine action, so it wrote a blank
	// `initialState()` to the server and wiped the opponent's game too.
	describe('quitting', () => {
		it('resets the local game once the quit is confirmed', async () => {
			game.replace(contested({ names: ['Sri', 'Alex'] }));
			render(BidScreen);

			// First tap only arms it — a stray tap must not end a live draft.
			await page.getByRole('button', { name: 'Quit', exact: true }).click();
			expect(game.state.phase).not.toBe('setup');

			await page.getByRole('button', { name: /End it\?/ }).click();
			expect(game.state.phase).toBe('setup');
		});

		it('calls onQuit instead of dispatching when a handler is given', async () => {
			const dispatched: Action[] = [];
			let quits = 0;

			game.replace(contested({ names: ['Sri', 'Alex'] }));
			render(BidScreen, {
				view: contested({ names: ['Sri', 'Alex'] }),
				seat: 0,
				dispatch: (action: Action) => dispatched.push(action),
				onQuit: () => (quits += 1)
			});

			await page.getByRole('button', { name: 'Quit', exact: true }).click();
			expect(quits).toBe(0);

			await page.getByRole('button', { name: /End it\?/ }).click();

			expect(quits).toBe(1);
			// The bug: `reset` reaching the server as an authoritative state write.
			expect(dispatched).toEqual([]);
			// And the local store is untouched, since remote play doesn't own it.
			expect(game.state.phase).not.toBe('setup');
		});
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

		await page.getByRole('button', { name: /Sell to Sri/ }).click();
		// Lands at centre, the slot Shaq suits.
		expect(game.state.lastAward?.slotLabel).toBe('C');

		await page.getByRole('button', { name: 'PG', exact: true }).click();

		expect(game.state.lastAward?.slotId).toBe('pg');
		expect(game.state.players[0].roster[0].slotId).toBe('pg');
	});
});
