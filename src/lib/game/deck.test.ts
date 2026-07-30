import { describe, expect, it } from 'vitest';
import { openRoster } from '$lib/data/types';
import type { Item, Position, SlotSpec, Tier } from '$lib/data/types';
import { buildDeck, deckSizeFor, maxSlotsFor, poolSupportsRoster } from './deck';

/** Deterministic RNG so a failure is reproducible. */
function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const TIERS: Tier[] = ['bad', 'mid', 'good', 'great'];

function pool(perTier: number): Item[] {
	return TIERS.flatMap((tier) =>
		Array.from({ length: perTier }, (_, i) => ({ id: `${tier}-${i}`, name: `${tier} ${i}`, tier }))
	);
}

/** A pool with `perTier` items of every listed position, in every tier. */
function positionalPool(positions: Position[], perTier: number): Item[] {
	return TIERS.flatMap((tier) =>
		positions.flatMap((position) =>
			Array.from({ length: perTier }, (_, i) => ({
				id: `${tier}-${position}-${i}`,
				name: `${tier} ${position} ${i}`,
				tier,
				position
			}))
		)
	);
}

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

const share = (deck: Item[], ...tiers: Tier[]) =>
	deck.filter((item) => tiers.includes(item.tier)).length / deck.length;

const countPositions = (deck: Item[]) => {
	const counts = new Map<Position, number>();
	for (const item of deck) {
		if (item.position) counts.set(item.position, (counts.get(item.position) ?? 0) + 1);
	}
	return counts;
};

describe('buildDeck', () => {
	it('deals exactly two items per roster slot', () => {
		const rng = seeded(1);
		for (const slots of [2, 3, 5, 8, 10]) {
			expect(buildDeck(pool(20), openRoster(slots), rng)).toHaveLength(deckSizeFor(slots));
		}
	});

	it('never repeats an item inside one deck', () => {
		const rng = seeded(7);
		for (let i = 0; i < 200; i++) {
			const deck = buildDeck(pool(12), openRoster(5), rng);
			expect(new Set(deck.map((item) => item.id)).size).toBe(deck.length);
		}
	});

	it('refuses a pool too thin to fill both rosters', () => {
		expect(() => buildDeck(pool(1), openRoster(5))).toThrow();
		expect(maxSlotsFor(9)).toBe(4);
	});

	it('holds the curve: mid+good dominates, great and bad stay minorities', () => {
		const rng = seeded(42);
		const decks = Array.from({ length: 400 }, () => buildDeck(pool(20), openRoster(5), rng));

		const avg = (fn: (deck: Item[]) => number) =>
			decks.reduce((sum, deck) => sum + fn(deck), 0) / decks.length;

		// ~15-20% great, ~15-20% bad, ~60-70% mid+good, with rounding slack.
		expect(avg((d) => share(d, 'great'))).toBeGreaterThanOrEqual(0.14);
		expect(avg((d) => share(d, 'great'))).toBeLessThanOrEqual(0.22);
		expect(avg((d) => share(d, 'bad'))).toBeGreaterThanOrEqual(0.14);
		expect(avg((d) => share(d, 'bad'))).toBeLessThanOrEqual(0.22);
		expect(avg((d) => share(d, 'mid', 'good'))).toBeGreaterThanOrEqual(0.56);
		expect(avg((d) => share(d, 'mid', 'good'))).toBeLessThanOrEqual(0.72);

		// Inside the middle band, mid is the one carrying the hesitation.
		expect(avg((d) => share(d, 'mid'))).toBeGreaterThan(avg((d) => share(d, 'good')));
	});

	it('ends on a polarising item about two thirds of the time, but not reliably', () => {
		const rng = seeded(99);
		const runs = 4000;
		let polarised = 0;

		for (let i = 0; i < runs; i++) {
			const deck = buildDeck(pool(20), openRoster(5), rng);
			const last = deck[deck.length - 1].tier;
			if (last === 'great' || last === 'bad') polarised++;
		}

		const rate = polarised / runs;
		expect(rate).toBeGreaterThan(0.6);
		expect(rate).toBeLessThan(0.75);
	});
});

describe('positional decks', () => {
	it('stocks exactly two players for every starting-five position', () => {
		const rng = seeded(3);
		const hoops = positionalPool(['PG', 'SG', 'SF', 'PF', 'C'], 3);

		for (let i = 0; i < 200; i++) {
			const deck = buildDeck(hoops, NBA_ROSTER, rng);
			expect(deck).toHaveLength(10);
			const counts = countPositions(deck);
			for (const position of ['PG', 'SG', 'SF', 'PF', 'C'] as Position[]) {
				expect(counts.get(position)).toBe(2);
			}
		}
	});

	it('covers the fixed NFL slots and stocks two more for the flex', () => {
		const rng = seeded(11);
		const gridiron = positionalPool(['QB', 'RB', 'WR', 'TE'], 4);

		for (let i = 0; i < 200; i++) {
			const deck = buildDeck(gridiron, NFL_ROSTER, rng);
			expect(deck).toHaveLength(10);
			const counts = countPositions(deck);

			// One QB and one RB per player, two WR per player, plus two flex items.
			expect(counts.get('QB')).toBe(2);
			expect(counts.get('RB')).toBeGreaterThanOrEqual(2);
			expect(counts.get('WR')).toBeGreaterThanOrEqual(4);

			const flex = counts.get('RB')! - 2 + (counts.get('WR')! - 4) + (counts.get('TE') ?? 0);
			expect(flex).toBe(2);
		}
	});

	it('still leans on the tier curve while satisfying positions', () => {
		const rng = seeded(5);
		const hoops = positionalPool(['PG', 'SG', 'SF', 'PF', 'C'], 3);
		const decks = Array.from({ length: 300 }, () => buildDeck(hoops, NBA_ROSTER, rng));

		const avg = (fn: (deck: Item[]) => number) =>
			decks.reduce((sum, deck) => sum + fn(deck), 0) / decks.length;

		expect(avg((d) => share(d, 'mid', 'good'))).toBeGreaterThan(0.5);
		expect(avg((d) => share(d, 'mid'))).toBeGreaterThan(avg((d) => share(d, 'good')));
	});

	it('bends the curve rather than failing when a pool is all one tier', () => {
		// Only mid items exist, so the great/bad quotas cannot be met and the
		// finale has no polarising item to promote. It must still deal a full deck.
		const rng = seeded(21);
		const flat: Item[] = Array.from({ length: 30 }, (_, i) => ({
			id: `m${i}`,
			name: `Mid ${i}`,
			tier: 'mid' as Tier
		}));

		for (let i = 0; i < 50; i++) {
			const deck = buildDeck(flat, openRoster(5), rng);
			expect(deck).toHaveLength(10);
			expect(deck.every((item) => item.tier === 'mid')).toBe(true);
			expect(new Set(deck.map((d) => d.id)).size).toBe(10);
		}
	});

	it('deals the smallest legal deck', () => {
		// One slot each: two items, with no room to split the middle band.
		const rng = seeded(22);
		const deck = buildDeck(pool(6), openRoster(1), rng);
		expect(deck).toHaveLength(2);
		expect(new Set(deck.map((d) => d.id)).size).toBe(2);
	});

	it('reports whether a free-form pool is big enough', () => {
		expect(poolSupportsRoster(pool(3), openRoster(5))).toBe(true);
		expect(poolSupportsRoster(pool(1), openRoster(5))).toBe(false);
	});

	it('rejects a pool missing a required position', () => {
		const noCenters = positionalPool(['PG', 'SG', 'SF', 'PF'], 6);
		expect(poolSupportsRoster(noCenters, NBA_ROSTER)).toBe(false);
		expect(() => buildDeck(noCenters, NBA_ROSTER)).toThrow();

		const oneCenter = [
			...positionalPool(['PG', 'SG', 'SF', 'PF'], 6),
			{ id: 'c-1', name: 'Only Center', tier: 'mid' as Tier, position: 'C' as Position }
		];
		// Both players need a centre, so a single one still isn't enough.
		expect(poolSupportsRoster(oneCenter, NBA_ROSTER)).toBe(false);
	});
});
