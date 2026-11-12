import { describe, expect, it } from 'vitest';
import { getCategory } from '$lib/data';
import { placeTable, ratingTable } from '$lib/data/stats';
import { type Item, openRoster, type Tier } from '$lib/data/types';
import { defaultConfig, initialState } from './engine';
import { STEAL_CAP, scoreGame, TIER_POINTS } from './score';
import type { GameConfig, GameState, Player, RosterEntry } from './types';

type Pick = [Tier | Item, number];

const toItem = (tier: Tier | Item, i: number): Item =>
	typeof tier === 'string' ? { id: `i${i}`, name: `Item ${i}`, tier } : tier;

/** Scoring reads only config and rosters, so the state is built directly. */
function finished(a: Pick[], b: Pick[], config: Partial<GameConfig> = {}): GameState {
	const slots = a.length;
	const entries = (picks: Pick[], offset: number): RosterEntry[] =>
		picks.map(([tier, price], i) => ({
			item: toItem(tier, offset + i),
			price,
			free: price === 0,
			slotId: `slot-${i + 1}`
		}));
	const base = initialState();
	const players = [
		{ ...base.players[0], roster: entries(a, 0) },
		{ ...base.players[1], roster: entries(b, slots) }
	] as [Player, Player];
	return {
		...base,
		phase: 'results',
		players,
		config: {
			...defaultConfig(),
			budget: 20,
			slots,
			roster: openRoster(slots),
			categoryId: 'foods',
			variantId: 'foods',
			...config
		}
	};
}

describe('scoreGame', () => {
	it('scores tiers plus a bonus for buying under the fair price', () => {
		// Per slot $10; average base 55, so a great is "worth" $18.18.
		const board = scoreGame(
			finished(
				[
					['great', 10],
					['bad', 0]
				],
				[
					['mid', 5],
					['good', 5]
				]
			)
		);
		const [a, b] = board!.players;
		expect(a.picks.map((p) => [p.base, p.steal])).toEqual([
			[100, 16],
			[10, 4]
		]);
		expect(b.picks.map((p) => [p.base, p.steal])).toEqual([
			[40, 5],
			[70, 15]
		]);
		expect([a.total, b.total]).toEqual([130, 130]);
		expect(board!.winner).toBeNull();
	});

	it('caps the penalty so overpaying for a star still beats a free dud', () => {
		const greats: Pick[] = [
			['great', 0],
			['great', 0],
			['great', 0]
		];
		const board = scoreGame(finished([['great', 15], ...greats.slice(1)], greats, { budget: 15 }))!;
		const [overpaid] = board.players[0].picks;
		expect(overpaid.steal).toBe(-STEAL_CAP);
		expect(overpaid.total).toBeGreaterThan(TIER_POINTS.bad + STEAL_CAP);
	});

	it('caps the bonus for a star that came free', () => {
		const duds: Pick[] = [
			['bad', 0],
			['bad', 0],
			['bad', 0]
		];
		const board = scoreGame(finished([['great', 0], ...duds], [...duds, ['bad', 0]]))!;
		expect(board.players[0].picks[0].steal).toBe(STEAL_CAP);
	});

	it('declares the higher total the winner', () => {
		const board = scoreGame(finished([['great', 5]], [['bad', 5]]))!;
		expect(board.winner).toBe(0);
	});

	it('has nothing to score for a custom list or an empty game', () => {
		expect(scoreGame(finished([['mid', 1]], [['mid', 1]], { customItems: [] }))).toBeNull();
		expect(scoreGame(finished([], []))).toBeNull();
	});

	it('scores sports picks by their stat line, not their tier', () => {
		const pool = getCategory('nba')!.variants.find((v) => v.id === 'nba-current')!.items;
		const star = pool.find((item) => item.name === 'Nikola Jokic')!;
		const sub = { ...pool.find((item) => item.tier === 'bad')!, tier: 'great' as Tier };
		const board = scoreGame(
			finished([[star, 4]], [[sub, 4]], { categoryId: 'nba', variantId: 'nba-current' })
		)!;
		const [a, b] = board.players;
		expect(a.picks[0].stat?.kind).toBe('nba');
		expect(a.picks[0].base).toBeGreaterThan(b.picks[0].base);
		expect(b.picks[0].base).toBeLessThan(TIER_POINTS.great);
	});

	it('blends 2K ratings into NBA Current, so players outside the top 100 cap out low', () => {
		const pool = getCategory('nba')!.variants.find((v) => v.id === 'nba-current')!.items;
		const ratings = ratingTable('nba-current')!;
		const unrated = pool.filter((item) => !(item.name in ratings));
		const half = Math.ceil(unrated.length / 2);
		const board = scoreGame(
			finished(
				unrated.slice(0, half).map((item): Pick => [item, 1]),
				unrated.slice(half, half * 2).map((item): Pick => [item, 1]),
				{ categoryId: 'nba', variantId: 'nba-current' }
			)
		)!;
		// Best possible stats, worst possible 2K rank: (1 + 6.5/52) / 2 of the way up.
		for (const pick of board.players.flatMap((p) => p.picks)) expect(pick.base).toBeLessThan(62);
	});

	it.each(['nba-current', 'nfl-current', 'nfl-all-time'])(
		'puts hand-placed %s players at their spot',
		(variantId) => {
			const sport = variantId.split('-')[0];
			const pool = getCategory(sport)!.variants.find((v) => v.id === variantId)!.items;
			const config = { categoryId: sport, variantId };
			const bases = pool
				.map((item) => scoreGame(finished([[item, 1]], [['mid', 1]], config))!.players[0].picks[0])
				.map((pick) => [pick.entry.item.name, pick.base] as const)
				.sort((a, b) => b[1] - a[1]);
			for (const [name, at] of Object.entries(placeTable(variantId)!))
				expect(bases.find(([n]) => n === name)![1]).toBe(bases[at - 1][1]);
		}
	);

	it('scores soccer by the Fox Sports rank', () => {
		const pool = getCategory('soccer')!.variants[0].items;
		const named = (name: string) => pool.find((item) => item.name === name)!;
		const config = { categoryId: 'soccer', variantId: 'soccer-current' };
		const base = (item: Item) =>
			scoreGame(finished([[item, 1]], [['mid', 1]], config))!.players[0].picks[0].base;
		expect(base(named('Lamine Yamal'))).toBe(100);
		expect(base(named('Pervis Estupiñán'))).toBe(10);
		expect(base(named('Harry Kane'))).toBeGreaterThan(base(named('Phil Foden')));
	});

	it('falls back to the tier when a sports item has no stat line', () => {
		const ghost: Item = { id: 'x', name: 'Not A Player', tier: 'good' };
		const board = scoreGame(
			finished([[ghost, 1]], [['mid', 1]], { categoryId: 'nba', variantId: 'nba-current' })
		)!;
		expect(board.players[0].picks[0]).toMatchObject({ base: TIER_POINTS.good, stat: null });
	});
});
