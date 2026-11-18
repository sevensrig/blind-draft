import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '$lib/data';
import type { Item, SlotSpec } from '$lib/data/types';
import { openRoster } from '$lib/data/types';
import { buildBench, buildDeck, poolSupportsRoster } from './deck';
import {
	applyAction,
	bidders,
	canBid,
	canSell,
	defaultConfig,
	freeRecipient,
	initialState,
	itemMode,
	maxBid,
	minBid,
	solventPlayer,
	stillToAnswer,
	totalSpent
} from './engine';
import { scoreGame } from './score';
import type { GameState, PlayerId } from './types';

/** Three- and four-player rooms: online only, but the same rulebook. */

function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const items = (n: number): Item[] =>
	Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, tier: 'mid' }));

function startGame(
	names: string[],
	deck: Item[],
	roster: SlotSpec[] = openRoster(deck.length / names.length),
	budget = 20,
	bench: Item[] = []
): GameState {
	return applyAction(initialState(), {
		type: 'start',
		deck,
		bench,
		names,
		config: {
			...defaultConfig(),
			slots: roster.length,
			roster,
			positional: roster.some((slot) => slot.drafts !== null),
			budget,
			categoryLabel: 'Test'
		}
	});
}

const reveal = (state: GameState) => applyAction(state, { type: 'reveal' });
const bid = (state: GameState, player: PlayerId, amount: number) =>
	applyAction(state, { type: 'bid', player, amount });
const pass = (state: GameState, player: PlayerId) => applyAction(state, { type: 'sold', player });

function withMoney(state: GameState, money: number[]): GameState {
	return { ...state, players: state.players.map((player, i) => ({ ...player, money: money[i] })) };
}

describe('three or four players', () => {
	it('seats everyone named, with their own wallet', () => {
		const state = startGame(['Ann', 'Bo', 'Cy', 'Di'], items(8));
		expect(state.players.map((player) => player.name)).toEqual(['Ann', 'Bo', 'Cy', 'Di']);
		expect(state.players.map((player) => player.id)).toEqual([0, 1, 2, 3]);
		expect(state.players.every((player) => player.money === 20)).toBe(true);
	});

	it('sells only once every other bidder has passed', () => {
		let state = reveal(startGame(['Ann', 'Bo', 'Cy'], items(6)));
		state = bid(state, 0, 3);
		expect(stillToAnswer(state)).toEqual([1, 2]);

		state = pass(state, 1);
		expect(state.phase).toBe('resolve');
		expect(state.bid).toEqual({ amount: 3, holder: 0, passed: [1] });
		expect(stillToAnswer(state)).toEqual([2]);

		state = pass(state, 2);
		expect(state.phase).toBe('award');
		expect(state.lastAward).toMatchObject({ playerId: 0, price: 3 });
	});

	it('keeps a player who passed out of the item, even after a raise', () => {
		let state = reveal(startGame(['Ann', 'Bo', 'Cy'], items(6)));
		state = bid(state, 0, 2);
		state = pass(state, 1);
		state = bid(state, 2, 4);

		expect(canBid(state, 1, 5)).toBe(false);
		expect(canSell(state, 1)).toBe(false);
		// Only the opener is left to answer the raise.
		expect(stillToAnswer(state)).toEqual([0]);
		state = pass(state, 0);
		expect(state.lastAward).toMatchObject({ playerId: 2, price: 4 });
	});

	it('will not let the holder pass on their own bid', () => {
		let state = reveal(startGame(['Ann', 'Bo', 'Cy'], items(6)));
		state = bid(state, 1, 2);
		expect(canSell(state, 1)).toBe(false);
		expect(pass(state, 1)).toBe(state);
	});

	it('sits a broke player out of the auction while two others can still bid', () => {
		let state = reveal(withMoney(startGame(['Ann', 'Bo', 'Cy'], items(6)), [0, 10, 10]));
		expect(itemMode(state)).toBe('contest');
		expect(bidders(state)).toEqual([1, 2]);
		expect(canBid(state, 0, 1)).toBe(false);

		state = bid(state, 1, 1);
		// Ann is broke, so Cy passing is enough.
		state = pass(state, 2);
		expect(state.lastAward?.playerId).toBe(1);
	});

	it('lets the last solvent player name a price, and a pass goes to the broke in turn', () => {
		let state = reveal(withMoney(startGame(['Ann', 'Bo', 'Cy'], items(6)), [0, 0, 10]));
		expect(itemMode(state)).toBe('solo');
		expect(solventPlayer(state)).toBe(2);
		expect(freeRecipient(state)).toBe(0);

		state = applyAction(state, { type: 'decline', player: 2 });
		expect(state.lastAward).toMatchObject({ playerId: 0, free: true, declined: true });
		state = reveal(applyAction(state, { type: 'next' }));
		// The freebies take turns rather than all landing on seat 0.
		expect(freeRecipient(state)).toBe(1);
	});

	it('hands out the rest in turn once every wallet is empty', () => {
		let state = withMoney(startGame(['Ann', 'Bo', 'Cy'], items(6)), [0, 0, 0]);
		const order: PlayerId[] = [];
		for (let i = 0; i < 3; i++) {
			state = reveal(state);
			expect(itemMode(state)).toBe('alternate');
			state = applyAction(state, { type: 'claim' });
			order.push(state.lastAward!.playerId);
			state = applyAction(state, { type: 'next' });
		}
		expect(order).toEqual([0, 1, 2]);
	});

	it('scores every roster and crowns a single winner', () => {
		const state = startGame(['Ann', 'Bo', 'Cy'], items(6));
		const won = {
			...state,
			players: state.players.map((player, i) => ({
				...player,
				roster: [
					{
						item: {
							id: `x${i}`,
							name: `X${i}`,
							tier: i === 2 ? ('great' as const) : ('bad' as const)
						},
						price: 1,
						free: false,
						slotId: state.config.roster[0].id
					}
				]
			}))
		};
		const board = scoreGame(won)!;
		expect(board.players).toHaveLength(3);
		expect(board.winner).toBe(2);
	});

	it('deals a deck sized for the table', () => {
		const pool = items(40);
		expect(buildDeck(pool, openRoster(5), undefined, 4)).toHaveLength(20);
		expect(poolSupportsRoster(pool, openRoster(10), 4)).toBe(true);
		expect(poolSupportsRoster(pool, openRoster(11), 4)).toBe(false);
	});
});

/** Random play for any table size, bidding and passing until the draft is full. */
function autoPlay(start: GameState, rng: () => number, aggression: number): GameState {
	let state = start;
	for (let guard = 0; guard < 50_000 && state.phase !== 'results'; guard++) {
		if (state.phase === 'reveal') {
			state = reveal(state);
			continue;
		}
		if (state.phase === 'award') {
			state = applyAction(state, { type: 'next' });
			continue;
		}

		const mode = itemMode(state);
		if (mode === 'contest') {
			const waiting = stillToAnswer(state);
			const actor = waiting[Math.floor(rng() * waiting.length)];
			const floor = minBid(state);
			const ceiling = maxBid(state, actor);
			if ((!state.bid || rng() < aggression) && floor <= ceiling) {
				state = bid(state, actor, floor + Math.floor(rng() * (ceiling - floor + 1)));
			} else if (state.bid) {
				state = pass(state, actor);
			} else {
				state = bid(state, actor, floor);
			}
			continue;
		}
		if (mode === 'solo') {
			const seller = solventPlayer(state);
			state =
				rng() < 0.5
					? applyAction(state, {
							type: 'buy',
							player: seller,
							amount: 1 + Math.floor(rng() * maxBid(state, seller))
						})
					: applyAction(state, { type: 'decline', player: seller });
			continue;
		}
		state = applyAction(state, { type: 'claim' });
	}
	return state;
}

describe('full group games across every category', () => {
	const variants = CATEGORIES.flatMap((category) =>
		category.variants.map((variant) => ({
			label: `${category.label} / ${variant.label}`,
			variant,
			roster: category.roster ?? null
		}))
	).filter(({ variant }) => variant.items.length > 0);

	it.each(variants)(
		'$label reaches a complete draft with 3 and 4 players',
		({ variant, roster }) => {
			const rng = seeded(variant.items.length * 7);
			for (const players of [3, 4]) {
				const names = ['Ann', 'Bo', 'Cy', 'Di'].slice(0, players);
				for (let run = 0; run < 15; run++) {
					const template = roster ?? openRoster(2 + Math.floor(rng() * 4));
					if (!poolSupportsRoster(variant.items, template, players)) continue;
					const budget = 5 + Math.floor(rng() * 40);
					const deck = buildDeck(variant.items, template, rng, players);
					const bench = buildBench(variant.items, template, deck, rng);
					const end = autoPlay(startGame(names, deck, template, budget, bench), rng, run / 15);

					expect(end.phase).toBe('results');
					expect(end.history).toHaveLength(deck.length);
					for (const player of end.players) {
						expect(player.roster).toHaveLength(template.length);
						expect(totalSpent(player) + player.money).toBe(budget);
					}
				}
			}
		}
	);
});
