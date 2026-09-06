import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '$lib/data';
import { openRoster } from '$lib/data/types';
import type { Item, Position, SlotSpec, Tier } from '$lib/data/types';
import { buildDeck } from './deck';
import {
	applyAction,
	canReceive,
	canSell,
	defaultConfig,
	defaultSlotFor,
	initialState,
	itemMode,
	maxBid,
	minBid,
	openSlots,
	other,
	solventPlayer,
	totalSpent
} from './engine';
import type { GameState, Player, PlayerId } from './types';

function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const items = (n: number, tier: Tier = 'mid'): Item[] =>
	Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, tier }));

const NBA_ROSTER: SlotSpec[] = [
	{ id: 'pg', label: 'PG', drafts: ['PG'] },
	{ id: 'sg', label: 'SG', drafts: ['SG'] },
	{ id: 'sf', label: 'SF', drafts: ['SF'] },
	{ id: 'pf', label: 'PF', drafts: ['PF'] },
	{ id: 'c', label: 'C', drafts: ['C'] }
];

const NFL_ROSTER: SlotSpec[] = [
	{ id: 'qb', label: 'QB', drafts: ['QB'] },
	{ id: 'rb', label: 'RB', drafts: ['RB'] },
	{ id: 'wr1', label: 'WR', drafts: ['WR'] },
	{ id: 'wr2', label: 'WR', drafts: ['WR'] },
	{ id: 'flex', label: 'FLEX', drafts: ['RB', 'WR', 'TE'] }
];

/** Deck from an explicit position list, so awkward orders can be reproduced. */
const deckOf = (positions: Position[]): Item[] =>
	positions.map((position, i) => ({
		id: `${position}-${i}`,
		name: `${position} ${i}`,
		tier: 'mid' as Tier,
		position
	}));

function startGame(
	deck: Item[],
	roster: SlotSpec[] = openRoster(deck.length / 2),
	budget = 20
): GameState {
	return applyAction(initialState(), {
		type: 'start',
		deck,
		names: ['Ann', 'Bo'],
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

/** Forces wallets to a specific state so the fallback rules can be reached directly. */
function withMoney(state: GameState, money: [number, number]): GameState {
	const players = state.players.map((player, i) => ({ ...player, money: money[i] })) as [
		Player,
		Player
	];
	return { ...state, players };
}

const reveal = (state: GameState) => applyAction(state, { type: 'reveal' });

/** Wins the current item for `player` at `amount` and moves to the next reveal. */
function winItem(state: GameState, player: PlayerId, amount = 1): GameState {
	let next = reveal(state);
	next = applyAction(next, { type: 'bid', player, amount });
	next = applyAction(next, { type: 'sold', player: other(player) });
	return applyAction(next, { type: 'next' });
}

describe('bidding (rule 4, 5, 6)', () => {
	it('needs someone to open before anything can be sold', () => {
		const open = reveal(startGame(items(4)));
		expect(itemMode(open)).toBe('contest');

		// No standing bid, so "sold" is a no-op: every item must find an owner.
		expect(applyAction(open, { type: 'sold', player: 0 })).toBe(open);

		const bid = applyAction(open, { type: 'bid', player: 1, amount: 3 });
		const done = applyAction(bid, { type: 'sold', player: 0 });
		expect(done.phase).toBe('award');
		expect(done.players[1].roster).toHaveLength(1);
		expect(done.players[1].money).toBe(17);
	});

	/*
	 * `sold` used to take no player, so the bidder could accept their own bid.
	 * Harmless on one device; across two it was a self-serve win button. Hence the
	 * action naming who is conceding, which the server checks against the seat.
	 */
	it('will not let the standing bidder accept their own bid', () => {
		const open = reveal(startGame(items(4)));
		const bid = applyAction(open, { type: 'bid', player: 1, amount: 3 });

		expect(canSell(bid, 1)).toBe(false);
		expect(applyAction(bid, { type: 'sold', player: 1 })).toBe(bid);
		// Still on the table, still theirs to lose.
		expect(bid.phase).toBe('resolve');

		// The other player conceding is what ends it.
		expect(canSell(bid, 0)).toBe(true);
		expect(applyAction(bid, { type: 'sold', player: 0 }).phase).toBe('award');
	});

	it('has nothing to concede before anyone opens, or outside a contest', () => {
		const open = reveal(startGame(items(4)));
		// No standing bid: neither seat can end an auction that never started.
		expect(canSell(open, 0)).toBe(false);
		expect(canSell(open, 1)).toBe(false);

		// Face-down, so the wrong phase entirely.
		expect(canSell(startGame(items(4)), 0)).toBe(false);

		// A broke opponent means `solo`, which resolves with buy/decline instead.
		const solo = reveal(withMoney(startGame(items(4)), [20, 0]));
		expect(itemMode(solo)).toBe('solo');
		expect(canSell(solo, 0)).toBe(false);
	});

	it('lets either player open — there is no turn order', () => {
		const open = reveal(startGame(items(4)));
		for (const opener of [0, 1] as PlayerId[]) {
			const bid = applyAction(open, { type: 'bid', player: opener, amount: 1 });
			expect(bid.bid).toEqual({ amount: 1, holder: opener });
		}
	});

	it('requires a raise of at least $1 and blocks self-raises', () => {
		let state = reveal(startGame(items(4)));
		state = applyAction(state, { type: 'bid', player: 0, amount: 5 });

		expect(minBid(state)).toBe(6);
		// Matching the standing bid is not a raise.
		expect(applyAction(state, { type: 'bid', player: 1, amount: 5 })).toBe(state);
		// You cannot bid against yourself.
		expect(applyAction(state, { type: 'bid', player: 0, amount: 9 })).toBe(state);

		const raised = applyAction(state, { type: 'bid', player: 1, amount: 6 });
		expect(raised.bid).toEqual({ amount: 6, holder: 1 });
	});

	it('allows an all-in bid down to $0 with slots still empty (no safety net)', () => {
		let state = reveal(startGame(items(10)));
		expect(maxBid(state, 0)).toBe(20);

		state = applyAction(state, { type: 'bid', player: 0, amount: 20 });
		state = applyAction(state, { type: 'sold', player: 1 });

		expect(state.players[0].money).toBe(0);
		expect(state.players[0].roster).toHaveLength(1);
		// Four slots still to fill and nothing left to spend.
		expect(itemMode(applyAction(state, { type: 'next' }))).toBe('solo');
	});

	it('rejects a bid larger than the bidder can pay', () => {
		const state = reveal(withMoney(startGame(items(4)), [3, 20]));
		expect(applyAction(state, { type: 'bid', player: 0, amount: 4 })).toBe(state);
		expect(applyAction(state, { type: 'bid', player: 0, amount: 3 }).bid).toEqual({
			amount: 3,
			holder: 0
		});
	});
});

describe('broke-player fallback (rule 7)', () => {
	it('lets the solvent player name any price they can afford', () => {
		const state = reveal(withMoney(startGame(items(4)), [0, 20]));
		expect(itemMode(state)).toBe('solo');
		expect(solventPlayer(state)).toBe(1);

		const bought = applyAction(state, { type: 'buy', player: 1, amount: 4 });
		expect(bought.players[1].money).toBe(16);
		expect(bought.players[1].roster[0].price).toBe(4);
		expect(bought.lastAward?.free).toBe(false);
	});

	it('hands the item to the broke player for free when the solvent one passes', () => {
		const state = reveal(withMoney(startGame(items(4)), [0, 20]));
		const passed = applyAction(state, { type: 'decline', player: 1 });

		expect(passed.players[0].roster).toHaveLength(1);
		expect(passed.players[0].roster[0]).toMatchObject({ price: 0, free: true });
		expect(passed.players[1].money).toBe(20);
		expect(passed.lastAward?.declined).toBe(true);
	});

	it('does not let the broke player buy or pass', () => {
		const state = reveal(withMoney(startGame(items(4)), [0, 20]));
		expect(applyAction(state, { type: 'buy', player: 0, amount: 1 })).toBe(state);
		expect(applyAction(state, { type: 'decline', player: 0 })).toBe(state);
	});
});

describe('both-broke fallback (rule 8)', () => {
	it('awards the rest free, strictly alternating from player 1', () => {
		let state = reveal(withMoney(startGame(items(4)), [0, 0]));
		expect(itemMode(state)).toBe('alternate');

		const winners: PlayerId[] = [];
		while (state.phase !== 'results') {
			if (state.phase === 'reveal') state = reveal(state);
			else if (state.phase === 'award') state = applyAction(state, { type: 'next' });
			else {
				state = applyAction(state, { type: 'claim' });
				if (state.lastAward) winners.push(state.lastAward.playerId);
			}
		}

		expect(winners).toEqual([0, 1, 0, 1]);
		expect(state.players.every((player) => player.roster.every((entry) => entry.free))).toBe(true);
	});
});

describe('one roster full', () => {
	it('gives every remaining item to the player with slots left, for free', () => {
		// Ann buys both her slots, so Bo has to take the rest.
		let state = startGame(items(4));
		for (let i = 0; i < 2; i++) state = winItem(state, 0, 1);

		expect(state.players[0].roster).toHaveLength(2);
		expect(itemMode(reveal(state))).toBe('forced');

		state = applyAction(reveal(state), { type: 'claim' });
		expect(state.lastAward).toMatchObject({ playerId: 1, free: true, price: 0 });
		// Bo still has his full budget — nothing was left to compete over.
		expect(state.players[1].money).toBe(20);
	});
});

/* ------------------------------------------------------------------ *
 * Positional rosters
 * ------------------------------------------------------------------ */

describe('positional rosters', () => {
	it('defaults a pick into the slot its position suits', () => {
		const deck = deckOf(['C', 'PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF']);
		const state = winItem(startGame(deck, NBA_ROSTER), 0, 2);

		expect(state.players[0].roster[0].slotId).toBe('c');
		expect(state.history[0].slotLabel).toBe('C');
	});

	it('lets you start a centre at point guard', () => {
		const deck = deckOf(['C', 'PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF']);
		let state = reveal(startGame(deck, NBA_ROSTER));
		state = applyAction(state, { type: 'bid', player: 0, amount: 4 });
		state = applyAction(state, { type: 'sold', player: 1 });
		// Lands at centre by default...
		expect(state.lastAward?.slotId).toBe('c');

		// ...but the winner can move them anywhere still open.
		const moved = applyAction(state, { type: 'assign', slotId: 'pg' });
		expect(moved.lastAward).toMatchObject({ slotId: 'pg', slotLabel: 'PG' });
		expect(moved.players[0].roster[0].slotId).toBe('pg');
		// The history entry moves too, so the results sheet stays truthful.
		expect(moved.history.at(-1)?.slotId).toBe('pg');
		// Money and item are untouched by a re-slot.
		expect(moved.players[0].money).toBe(16);
		expect(moved.players[0].roster).toHaveLength(1);
	});

	it('refuses to stack two players in one slot', () => {
		const deck = deckOf(['C', 'C', 'PG', 'SG', 'SF', 'PF', 'PG', 'SG', 'SF', 'PF']);
		// Ann puts the first centre at PG, then wins the second centre.
		let state = reveal(startGame(deck, NBA_ROSTER));
		state = applyAction(state, { type: 'bid', player: 0, amount: 1 });
		state = applyAction(state, { type: 'sold', player: 1 });
		state = applyAction(state, { type: 'assign', slotId: 'pg' });
		state = applyAction(state, { type: 'next' });

		state = reveal(state);
		state = applyAction(state, { type: 'bid', player: 0, amount: 1 });
		state = applyAction(state, { type: 'sold', player: 1 });
		// PG is taken, so the second centre defaults to the centre slot.
		expect(state.lastAward?.slotId).toBe('c');
		// And it cannot be shoved into the occupied slot.
		expect(applyAction(state, { type: 'assign', slotId: 'pg' })).toBe(state);
	});

	it('keeps both players bidding on a position one of them has already filled', () => {
		const deck = deckOf(['C', 'C', 'PG', 'SG', 'SF', 'PF', 'PG', 'SG', 'SF', 'PF']);
		const state = reveal(winItem(startGame(deck, NBA_ROSTER), 0, 3));

		// Ann has her centre, but she can still use another one elsewhere.
		expect(canReceive(state, 0, state.deck[1])).toBe(true);
		expect(canReceive(state, 1, state.deck[1])).toBe(true);
		expect(itemMode(state)).toBe('contest');
	});

	it('falls back to any open slot once the suited one is gone', () => {
		const deck = deckOf(['QB', 'QB', 'RB', 'WR', 'WR', 'TE', 'RB', 'WR', 'WR', 'TE']);
		const state = reveal(winItem(startGame(deck, NFL_ROSTER), 0, 1));

		// Ann's QB slot is filled, so a second quarterback lands somewhere open.
		const slot = defaultSlotFor(state, 0, state.deck[1]);
		expect(slot).not.toBeNull();
		expect(slot!.id).not.toBe('qb');
		expect(openSlots(state, 0).map((sl) => sl.id)).toContain(slot!.id);
	});
});

/* ------------------------------------------------------------------ *
 * Whole-game fuzz: no line of play may strand an unfillable roster.
 * ------------------------------------------------------------------ */

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
			const challenger: PlayerId = state.bid ? other(state.bid.holder) : rng() < 0.5 ? 0 : 1;
			const floor = minBid(state);
			const ceiling = maxBid(state, challenger);
			const keenToRaise = !state.bid || rng() < aggression;

			if (keenToRaise && floor <= ceiling) {
				const amount = floor + Math.floor(rng() * (ceiling - floor + 1));
				state = applyAction(state, { type: 'bid', player: challenger, amount });
			} else if (state.bid) {
				// `challenger` is the non-holder, which is exactly who may concede.
				state = applyAction(state, { type: 'sold', player: challenger });
			} else {
				// Opening is mandatory, so the other player has to step up.
				const opener = other(challenger);
				state = applyAction(state, { type: 'bid', player: opener, amount: floor });
			}
			continue;
		}

		if (mode === 'solo') {
			const seller = solventPlayer(state);
			if (rng() < 0.5) {
				const amount = 1 + Math.floor(rng() * maxBid(state, seller));
				state = applyAction(state, { type: 'buy', player: seller, amount });
			} else {
				state = applyAction(state, { type: 'decline', player: seller });
			}
			continue;
		}

		state = applyAction(state, { type: 'claim' });
	}

	return state;
}

describe('full games across every category', () => {
	const variants = CATEGORIES.flatMap((category) =>
		category.variants.map((variant) => ({
			label: `${category.label} / ${variant.label}`,
			variant,
			roster: category.roster ?? null
		}))
	)
		// The custom category ships empty on purpose; the spec below covers it.
		.filter(({ variant }) => variant.items.length > 0);

	it.each(variants)('$label always reaches a complete draft', ({ variant, roster }) => {
		const rng = seeded(variant.items.length);

		for (let run = 0; run < 40; run++) {
			// Positional categories lock their roster; the rest vary the shape.
			const template = roster ?? openRoster(2 + Math.floor(rng() * 7));
			const budget = 5 + Math.floor(rng() * 40);
			// Sweep from timid to reckless so solo/alternate endings get exercised.
			const aggression = run / 40;

			const deck = buildDeck(variant.items, template, rng);
			const end = autoPlay(startGame(deck, template, budget), rng, aggression);

			expect(end.phase).toBe('results');
			expect(end.history).toHaveLength(deck.length);

			for (const player of end.players) {
				expect(player.roster).toHaveLength(template.length);
				expect(player.money).toBeGreaterThanOrEqual(0);
				// Money is only ever moved, never created.
				expect(totalSpent(player) + player.money).toBe(budget);

				// Every slot filled exactly once.
				const usedSlots = player.roster.map((entry) => entry.slotId);
				expect(new Set(usedSlots).size).toBe(template.length);
				for (const entry of player.roster) {
					expect(template.some((slot) => slot.id === entry.slotId)).toBe(true);
				}
			}

			// Every dealt item ends up owned exactly once.
			const owned = end.players.flatMap((player) => player.roster.map((entry) => entry.item.id));
			expect(new Set(owned).size).toBe(deck.length);
			expect(new Set(owned)).toEqual(new Set(deck.map((item) => item.id)));
		}
	});

	/**
	 * A typed pool is all one tier, so the curve and the finale weighting have
	 * nothing to work with. Both should degrade quietly rather than throw.
	 */
	it('plays a player-typed custom pool through to a full draft', () => {
		const rng = seeded(4242);
		const typed = (n: number): Item[] =>
			Array.from({ length: n }, (_, i) => ({
				id: `custom-thing-${i}`,
				name: `Thing ${i}`,
				tier: 'mid' as Tier
			}));

		for (let run = 0; run < 40; run++) {
			const slots = 3 + Math.floor(rng() * 6);
			// Sometimes exactly 2xN items typed, sometimes a surplus to sample from.
			const pool = typed(slots * 2 + Math.floor(rng() * 20));
			const template = openRoster(slots);
			const budget = 5 + Math.floor(rng() * 40);

			const deck = buildDeck(pool, template, rng);
			expect(deck).toHaveLength(slots * 2);

			const end = autoPlay(startGame(deck, template, budget), rng, run / 40);
			expect(end.phase).toBe('results');
			for (const player of end.players) {
				expect(player.roster).toHaveLength(slots);
				expect(totalSpent(player) + player.money).toBe(budget);
			}
			const owned = end.players.flatMap((p) => p.roster.map((e) => e.item.id));
			expect(new Set(owned).size).toBe(deck.length);
		}
	});

	it('never lets a tier leak into the visible item data', () => {
		// The "hidden tier" rule at the data level: every item has a tier, and
		// nothing in the pool carries a price.
		for (const { variant } of variants) {
			for (const item of variant.items) {
				expect(['bad', 'mid', 'good', 'great']).toContain(item.tier);
				expect(item).not.toHaveProperty('price');
				expect(item.name.length).toBeGreaterThan(0);
			}
		}
	});

	it('gives every item in a positional pool a position', () => {
		for (const { variant, roster } of variants) {
			if (!roster) continue;
			for (const item of variant.items) {
				expect(item.position, `${item.name} needs a position`).toBeDefined();
			}
		}
	});
});
