import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '$lib/data';
import { openRoster } from '$lib/data/types';
import type { Item, SlotSpec, Tier } from '$lib/data/types';
import { botAction, botLimit, isWild, openingDelay } from './bot';
import { buildDeck } from './deck';
import { shuffle } from './rng';
import {
	applyAction,
	currentItem,
	defaultConfig,
	initialState,
	itemMode,
	maxBid,
	minBid,
	solventPlayer
} from './engine';
import type { GameState, Player, PlayerId } from './types';

const BOT: PlayerId = 1;
const HUMAN: PlayerId = 0;

function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const deckOf = (tiers: Tier[]): Item[] =>
	tiers.map((tier, i) => ({ id: `i${i}`, name: `Item ${i}`, tier }));

function startGame(
	deck: Item[],
	roster: SlotSpec[] = openRoster(deck.length / 2),
	budget = 20
): GameState {
	return applyAction(initialState(), {
		type: 'start',
		deck,
		names: ['Ann', 'Bot'],
		config: {
			...defaultConfig(),
			slots: roster.length,
			roster,
			positional: roster.some((slot) => slot.drafts !== null),
			budget,
			categoryLabel: 'Test',
			bot: BOT
		}
	});
}

function withMoney(state: GameState, money: [number, number]): GameState {
	const players = state.players.map((player, i) => ({ ...player, money: money[i] })) as [
		Player,
		Player
	];
	return { ...state, players };
}

const revealed = (deck: Item[], budget = 20) =>
	applyAction(startGame(deck, undefined, budget), { type: 'reveal' });

/** The move alone, for tests that don't care how long the bot sits on it. */
const act = (state: GameState) => botAction(state, BOT)?.action ?? null;

const cards = (tier: Tier, n = 400): Item[] =>
	Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: 'C', tier }));

describe('the bot in a contest', () => {
	it('waits while it holds the bid, and outside the resolve phase', () => {
		const deck = deckOf(['great', 'mid', 'mid', 'mid']);
		expect(act(startGame(deck))).toBeNull();

		const holding = applyAction(revealed(deck), { type: 'bid', player: BOT, amount: 2 });
		expect(act(holding)).toBeNull();
	});

	it('leaves the open to the human on a card worth nothing to it', () => {
		const state = withMoney(revealed(deckOf(['bad', 'mid', 'mid', 'mid'])), [20, 2]);
		expect(botLimit(state, BOT, currentItem(state)!)).toBe(0);
		expect(act(state)).toBeNull();
	});

	it('never goes past its limit', () => {
		const state = revealed(deckOf(['great', 'mid', 'mid', 'mid']));
		const limit = botLimit(state, BOT, currentItem(state)!);

		for (let amount = 1; amount < limit; amount++) {
			const move = act(applyAction(state, { type: 'bid', player: HUMAN, amount }));
			if (move?.type === 'bid') expect(move.amount).toBeLessThanOrEqual(limit);
		}
		const over = applyAction(state, { type: 'bid', player: HUMAN, amount: limit });
		expect(act(over)).toEqual({ type: 'sold', player: BOT });
	});

	it('lets go more often the closer the price gets to its limit', () => {
		const state = revealed(deckOf(['mid', 'mid', 'mid', 'mid', 'mid', 'mid']), 200);
		const stays = (share: number) =>
			cards('mid').filter((card) => {
				const deck = [card, ...state.deck.slice(1)];
				const onBlock = { ...state, deck };
				const limit = botLimit(onBlock, BOT, card);
				const amount = Math.max(1, Math.floor(limit * share));
				if (isWild(onBlock, card) || amount >= limit) return false;
				const bid = applyAction(onBlock, { type: 'bid', player: HUMAN, amount });
				return act(bid)?.type === 'bid';
			}).length;

		expect(stays(0.2)).toBeGreaterThan(stays(0.8));
	});

	it('never bids more than it takes to be unbeatable', () => {
		const state = withMoney(revealed(deckOf(['great', 'mid', 'mid', 'mid'])), [3, 20]);
		const move = act(applyAction(state, { type: 'bid', player: HUMAN, amount: 3 }));
		if (move?.type === 'bid') expect(move.amount).toBe(4);
	});

	it('values a great card above a bad one', () => {
		const state = revealed(deckOf(['mid', 'mid', 'mid', 'mid', 'mid', 'mid']));
		const limit = (tier: Tier) => botLimit(state, BOT, { id: 'x', name: 'X', tier });
		expect(limit('great')).toBeGreaterThan(limit('mid'));
		expect(limit('mid')).toBeGreaterThan(limit('bad'));
	});
});

describe('when the bot opens', () => {
	const state = revealed(deckOf(['mid', 'mid', 'mid', 'mid']));
	const share = (tier: Tier, delay: number | null) =>
		cards(tier).filter((card) => !isWild(state, card) && openingDelay(state, card) === delay)
			.length / cards(tier).filter((card) => !isWild(state, card)).length;

	it('splits ordinary cards evenly across instant, 2s, 5s and never', () => {
		for (const delay of [300, 2000, 5000, null]) {
			expect(share('mid', delay)).toBeGreaterThan(0.18);
			expect(share('mid', delay)).toBeLessThan(0.32);
		}
	});

	it('is keener on better cards', () => {
		expect(share('great', 300)).toBeGreaterThan(share('mid', 300));
		expect(share('great', null)).toBeLessThan(share('mid', null));
		expect(share('bad', null)).toBeGreaterThan(share('mid', null));
	});

	it('waits out the delay it picked before placing the bid', () => {
		const opener = cards('great').find((card) => openingDelay(state, card) === 5000)!;
		// Second card, so the game's seed (the first card) stays put.
		const onBlock = { ...state, index: 1, deck: [state.deck[0], opener, ...state.deck.slice(2)] };
		expect(botAction(onBlock, BOT)).toMatchObject({
			action: { type: 'bid', player: BOT },
			delay: 5000
		});
	});

	it('opens a wild card straight away', () => {
		const wild = cards('great').find((card) => isWild(state, card))!;
		expect(openingDelay(state, wild)).toBe(300);
	});
});

describe('the bot with a broke opponent', () => {
	const broke = (tier: Tier) => withMoney(revealed(deckOf([tier, 'mid', 'mid', 'mid'])), [0, 10]);

	it('buys good cards for a dollar and passes on the rest', () => {
		expect(act(broke('great'))).toEqual({ type: 'buy', player: BOT, amount: 1 });
		expect(act(broke('bad'))).toEqual({ type: 'decline', player: BOT });
	});

	it('leaves the price to the human when the bot is the broke one', () => {
		const state = withMoney(revealed(deckOf(['great', 'mid', 'mid', 'mid'])), [10, 0]);
		expect(act(state)).toBeNull();
	});
});

describe('what the bot knows', () => {
	it('plays the same whatever order the unrevealed cards are in', () => {
		const pool = CATEGORIES.find((c) => c.id === 'foods')!.variants[0].items;
		const rng = seeded(7);

		for (let run = 0; run < 50; run++) {
			const deck = buildDeck(pool, openRoster(5), rng);
			const at = Math.floor(rng() * deck.length);
			const reordered = [...deck.slice(0, at + 1), ...shuffle(deck.slice(at + 1), rng)];

			const onBlock = (cards: Item[]) => ({ ...revealed(cards), index: at });
			expect(botAction(onBlock(reordered), BOT)).toEqual(botAction(onBlock(deck), BOT));
		}
	});

	it('pays more for a good card once the greats are gone', () => {
		// Same ids, so the bot's per-card taste is identical; only what's been seen differs.
		const deck = (first: Tier): Item[] =>
			deckOf([first, first, 'good', 'mid', 'mid', 'mid', 'mid', 'mid', 'mid', 'mid']);
		const third = (cards: Item[]) => ({ ...revealed(cards), index: 2 });

		const afterGreats = third(deck('great'));
		const afterMids = third(deck('mid'));
		expect(botLimit(afterGreats, BOT, afterGreats.deck[2])).toBeGreaterThan(
			botLimit(afterMids, BOT, afterMids.deck[2])
		);
	});
});

describe('how the bot reads the room', () => {
	const goodCard = revealed(deckOf(['good', 'mid', 'mid', 'mid', 'mid', 'mid']), 40);
	const midCard = revealed(deckOf(['mid', 'mid', 'mid', 'mid', 'mid', 'mid']), 40);

	it('fights harder in a bidding war over a card it rates', () => {
		const calm = botLimit(goodCard, BOT, goodCard.deck[0], { raises: 0 });
		const war = botLimit(goodCard, BOT, goodCard.deck[0], { raises: 8 });
		expect(war).toBeGreaterThan(calm);
	});

	it("doesn't chase an ordinary card just because the human wants it", () => {
		const calm = botLimit(midCard, BOT, midCard.deck[0], { raises: 0 });
		const war = botLimit(midCard, BOT, midCard.deck[0], { raises: 8 });
		expect(war).toBe(calm);
	});

	it('goes wild on the odd card, never a bad one', () => {
		const cards = (tier: Tier) =>
			Array.from({ length: 400 }, (_, i) => ({ id: `w${i}`, name: 'W', tier }));
		const wild = cards('great').filter((card) => isWild(goodCard, card));

		expect(wild.length).toBeGreaterThan(400 * 0.05);
		expect(wild.length).toBeLessThan(400 * 0.2);
		expect(cards('bad').some((card) => isWild(goodCard, card))).toBe(false);
		// Wild means real money: well past an even split of the budget.
		const most = Math.max(...wild.map((card) => botLimit(goodCard, BOT, card)));
		expect(most).toBeGreaterThan(40 / 3);
	});

	it("doesn't stack a bidding war on top of a wild streak", () => {
		const wild = cards('great').find((card) => isWild(goodCard, card))!;
		const calm = botLimit(goodCard, BOT, wild, { raises: 0 });
		expect(botLimit(goodCard, BOT, wild, { raises: 8 })).toBe(calm);
	});
});

describe('positional rosters', () => {
	const roster: SlotSpec[] = [
		{ id: 'pg', label: 'PG', drafts: ['PG'] },
		{ id: 'c', label: 'C', drafts: ['C'] }
	];
	const card = (id: string, position: 'PG' | 'C'): Item => ({
		id,
		name: id,
		tier: 'mid',
		position
	});

	it('pays a little less for a player who would sit out of position', () => {
		// The bot wins a centre, then a second centre and a point guard are priced.
		let state = startGame(
			[card('c1', 'C'), card('a', 'C'), card('b', 'PG'), card('d', 'PG')],
			roster
		);
		state = applyAction(state, { type: 'reveal' });
		state = applyAction(state, { type: 'bid', player: BOT, amount: 5 });
		state = applyAction(state, { type: 'sold', player: HUMAN });
		state = applyAction(applyAction(state, { type: 'next' }), { type: 'reveal' });

		const centre = botLimit(state, BOT, card('x', 'C'));
		const guard = botLimit(state, BOT, card('x', 'PG'));
		expect(centre).toBeLessThan(guard);
		expect(centre).toBeGreaterThanOrEqual(Math.floor(guard * 0.8) - 1);
	});
});

/* ------------------------------------------------------------------ *
 * Bot against a random human: every move legal, every game finishes.
 * ------------------------------------------------------------------ */

function playAgainstBot(start: GameState, rng: () => number): GameState {
	let state = start;
	let raises = 0;

	for (let guard = 0; guard < 50_000 && state.phase !== 'results'; guard++) {
		if (state.phase === 'reveal') state = applyAction(state, { type: 'reveal' });
		else if (state.phase === 'award') {
			state = applyAction(state, { type: 'next' });
			raises = 0;
		} else {
			if (state.bid) raises++;
			const move = botAction(state, BOT, { raises })?.action;
			if (move) {
				const next = applyAction(state, move);
				// A move the engine ignores would leave the bot spinning forever.
				expect(next).not.toBe(state);
				state = next;
				continue;
			}

			const mode = itemMode(state);
			if (mode === 'contest') {
				const floor = minBid(state);
				const raise = !state.bid || (floor <= maxBid(state, HUMAN) && rng() < 0.5);
				state = raise
					? applyAction(state, { type: 'bid', player: HUMAN, amount: floor })
					: applyAction(state, { type: 'sold', player: HUMAN });
			} else if (mode === 'solo' && solventPlayer(state) === HUMAN) {
				state = applyAction(state, { type: 'buy', player: HUMAN, amount: 1 });
			} else {
				state = applyAction(state, { type: 'claim' });
			}
		}
	}

	return state;
}

describe('full games against the bot', () => {
	const variants = CATEGORIES.flatMap((category) =>
		category.variants.map((variant) => ({
			label: `${category.label} / ${variant.label}`,
			variant,
			roster: category.roster ?? null
		}))
	).filter(({ variant }) => variant.items.length > 0);

	it.each(variants)('$label always reaches a complete draft', ({ variant, roster }) => {
		const rng = seeded(variant.items.length);

		for (let run = 0; run < 20; run++) {
			const template = roster ?? openRoster(2 + Math.floor(rng() * 7));
			const budget = 5 + Math.floor(rng() * 40);
			const deck = buildDeck(variant.items, template, rng);
			const end = playAgainstBot(startGame(deck, template, budget), rng);

			expect(end.phase).toBe('results');
			for (const player of end.players) expect(player.roster).toHaveLength(template.length);
		}
	});
});
