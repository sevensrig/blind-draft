import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '$lib/data';
import { placeTable, ratingTable, statTable, statValue } from '.';

const sports = CATEGORIES.flatMap((category) => category.variants).filter((v) => statTable(v.id));

describe('stat tables', () => {
	it('cover all four sports, both sub-modes', () => {
		expect(sports.map((v) => v.id).sort()).toEqual(
			['mlb', 'nba', 'nfl', 'nhl'].flatMap((s) => [`${s}-all-time`, `${s}-current`])
		);
	});

	it.each(sports.map((v) => [v.id, v] as const))('%s has a line for every player', (_, v) => {
		const table = statTable(v.id)!;
		const missing = v.items.filter((item) => !table[item.name]).map((item) => item.name);
		expect(missing).toEqual([]);
		for (const line of Object.values(table)) expect(Number.isFinite(statValue(line))).toBe(true);
	});

	it.each(['nba-current', 'nba-all-time', 'nfl-current', 'nfl-all-time'])(
		'%s only rates players in the pool',
		(id) => {
			const pool = new Set(sports.find((v) => v.id === id)!.items.map((i) => i.name));
			const rated = Object.keys(ratingTable(id)!);
			expect(rated.length).toBeGreaterThan(20);
			expect(rated.filter((name) => !pool.has(name))).toEqual([]);
			expect(ratingTable('mlb-current')).toBeNull();
		}
	);

	it('ranks the whole Fox Sports top 100, every one in the soccer pool', () => {
		const pool = new Set(
			CATEGORIES.find((c) => c.id === 'soccer')!.variants[0].items.map((i) => i.name)
		);
		const ratings = ratingTable('soccer-current')!;
		expect(Object.keys(ratings)).toHaveLength(100);
		expect(Object.keys(ratings).filter((name) => !pool.has(name))).toEqual([]);
		expect(new Set(Object.values(ratings)).size).toBe(100);
		expect(ratings['Lamine Yamal']).toBeGreaterThan(ratings['Kylian Mbappé']);
	});

	it('flips the NFL Top 100 so No. 1 rates highest', () => {
		const nfl = ratingTable('nfl-current')!;
		expect(nfl['Josh Allen']).toBeGreaterThan(nfl['Brock Purdy']);
	});

	it.each(['nba-current', 'nfl-current', 'nfl-all-time'])(
		'%s only hand-places pool players, one per spot',
		(id) => {
			const pool = new Set(sports.find((v) => v.id === id)!.items.map((i) => i.name));
			const places = placeTable(id)!;
			expect(Object.keys(places).filter((name) => !pool.has(name))).toEqual([]);
			expect(new Set(Object.values(places)).size).toBe(Object.keys(places).length);
		}
	);
});
