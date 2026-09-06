import { describe, expect, it } from 'vitest';
import { openRoster } from '$lib/data/types';
import type { Item, Tier } from '$lib/data/types';
import {
	applyAction,
	currentItem,
	defaultConfig,
	entryInSlot,
	initialState,
	isBroke,
	isGameOver,
	itemMode,
	itemNumber,
	minBid,
	other,
	rosterFull,
	slotsLeft,
	solventPlayer,
	totalSpent
} from './engine';
import type { Action, GameState, PlayerId } from './types';

const items = (n: number): Item[] =>
	Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, tier: 'mid' as Tier }));

function startGame(deck: Item[], budget = 20): GameState {
	const roster = openRoster(deck.length / 2);
	return applyAction(initialState(), {
		type: 'start',
		deck,
		names: ['Ann', 'Bo'],
		config: { ...defaultConfig(), slots: roster.length, roster, budget, categoryLabel: 'Test' }
	});
}

/** Wins the current item and advances past the award. */
function win(state: GameState, player: PlayerId, amount = 1): GameState {
	let next = applyAction(state, { type: 'reveal' });
	next = applyAction(next, { type: 'bid', player, amount });
	// Conceding is the other player's move — the bidder can't sell to themselves.
	next = applyAction(next, { type: 'sold', player: other(player) });
	return applyAction(next, { type: 'next' });
}

/** To the results screen, guarded so a rule change can't hang the run. */
function playToEnd(state: GameState, opener: PlayerId = 0): GameState {
	let current = state;
	for (let guard = 0; guard < 500 && current.phase !== 'results'; guard++) {
		if (current.phase === 'reveal') {
			current = applyAction(current, { type: 'reveal' });
		} else if (current.phase === 'award') {
			current = applyAction(current, { type: 'next' });
		} else if (itemMode(current) === 'contest') {
			current = applyAction(current, { type: 'bid', player: opener, amount: 1 });
			current = applyAction(current, { type: 'sold', player: other(opener) });
		} else if (itemMode(current) === 'solo') {
			current = applyAction(current, { type: 'decline', player: solventPlayer(current) });
		} else {
			current = applyAction(current, { type: 'claim' });
		}
	}
	if (current.phase !== 'results') throw new Error('game did not finish');
	return current;
}

describe('selectors', () => {
	it('reports slots, fullness and game-over as the draft fills up', () => {
		let state = startGame(items(4));
		expect(slotsLeft(state, 0)).toBe(2);
		expect(rosterFull(state, 0)).toBe(false);
		expect(isGameOver(state)).toBe(false);

		state = win(state, 0);
		expect(slotsLeft(state, 0)).toBe(1);

		state = win(state, 0);
		expect(rosterFull(state, 0)).toBe(true);
		// Bo still has both slots, so the game isn't over.
		expect(isGameOver(state)).toBe(false);

		state = playToEnd(state);

		expect(isGameOver(state)).toBe(true);
		expect(state.phase).toBe('results');
	});

	it('counts the item number and stops at the deck size once exhausted', () => {
		let state = startGame(items(4));
		expect(itemNumber(state)).toBe(1);

		state = win(state, 0);
		expect(itemNumber(state)).toBe(2);

		// Play out the rest; the readout must not run past the deck.
		state = playToEnd(state);
		expect(itemNumber(state)).toBe(4);
		// Deck exhausted, so there is nothing left on the block.
		expect(currentItem(state)).toBeNull();
	});

	it('finds the entry filling a given slot', () => {
		const state = win(startGame(items(4)), 1, 5);
		const slotId = state.config.roster[0].id;

		expect(entryInSlot(state, 1, slotId)?.price).toBe(5);
		expect(entryInSlot(state, 0, slotId)).toBeUndefined();
		expect(entryInSlot(state, 1, 'not-a-slot')).toBeUndefined();
	});

	it('tracks spend, remaining money and brokeness together', () => {
		const state = win(startGame(items(4)), 0, 20);

		expect(totalSpent(state.players[0])).toBe(20);
		expect(state.players[0].money).toBe(0);
		expect(isBroke(state, 0)).toBe(true);
		expect(isBroke(state, 1)).toBe(false);
		expect(totalSpent(state.players[1])).toBe(0);
	});

	it('opens at $1 and requires a dollar over any standing bid', () => {
		const open = applyAction(startGame(items(4)), { type: 'reveal' });
		expect(minBid(open)).toBe(1);
		expect(minBid(applyAction(open, { type: 'bid', player: 0, amount: 7 }))).toBe(8);
	});
});

describe('reducer guards', () => {
	it('reset returns a fresh setup state', () => {
		const played = win(startGame(items(4)), 0, 9);
		const reset = applyAction(played, { type: 'reset' });

		expect(reset).toEqual(initialState());
		expect(reset.phase).toBe('setup');
		expect(reset.players[0].roster).toHaveLength(0);
	});

	it('ignores an action it does not recognise', () => {
		const state = startGame(items(4));
		// Simulates a stale client sending something this build doesn't know.
		const unknown = { type: 'teleport' } as unknown as Action;
		expect(applyAction(state, unknown)).toBe(state);
	});

	it('ignores actions fired in the wrong phase', () => {
		const state = startGame(items(4));
		// Still face-down: nothing to bid on or advance past yet.
		expect(applyAction(state, { type: 'sold', player: 1 })).toBe(state);
		expect(applyAction(state, { type: 'next' })).toBe(state);
		expect(applyAction(state, { type: 'claim' })).toBe(state);
		expect(applyAction(state, { type: 'assign', slotId: 'slot-1' })).toBe(state);

		// Revealing twice is a no-op rather than a double advance.
		const revealed = applyAction(state, { type: 'reveal' });
		expect(applyAction(revealed, { type: 'reveal' })).toBe(revealed);
	});

	it('ignores an assign that names a slot the template does not have', () => {
		let state = applyAction(startGame(items(4)), { type: 'reveal' });
		state = applyAction(state, { type: 'bid', player: 0, amount: 2 });
		state = applyAction(state, { type: 'sold', player: 1 });

		expect(state.phase).toBe('award');
		expect(applyAction(state, { type: 'assign', slotId: 'nonsense' })).toBe(state);
		// Assigning to the slot it already occupies is also a no-op.
		expect(applyAction(state, { type: 'assign', slotId: state.lastAward!.slotId })).toBe(state);
	});
});
