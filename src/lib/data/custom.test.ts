import { describe, expect, it } from 'vitest';
import { customSeeds } from './custom';

describe('customSeeds', () => {
	it('trims lines and drops blanks and case-insensitive repeats', () => {
		const seeds = customSeeds(['  Pizza ', '', 'Sushi', 'pizza', '   ', 'Tacos']);
		expect(seeds.map((seed) => seed.name)).toEqual(['Pizza', 'Sushi', 'Tacos']);
	});

	it('makes every option mid tier', () => {
		expect(customSeeds(['A', 'B']).every((seed) => seed.tier === 'mid')).toBe(true);
	});
});
