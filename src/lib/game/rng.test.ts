import { describe, expect, it } from 'vitest';
import { between, sample, shuffle } from './rng';

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

const source = [1, 2, 3, 4, 5, 6, 7, 8];

describe('shuffle', () => {
	it('keeps every member and leaves the input alone', () => {
		const input = source.slice();
		const out = shuffle(input, seeded(1));

		expect(out).toHaveLength(input.length);
		expect([...out].sort((a, b) => a - b)).toEqual(source);
		// Non-mutating: the caller's array is untouched.
		expect(input).toEqual(source);
	});

	it('actually reorders across runs rather than returning the input order', () => {
		const rng = seeded(4);
		const orders = new Set(Array.from({ length: 40 }, () => shuffle(source, rng).join(',')));
		expect(orders.size).toBeGreaterThan(1);
	});

	it('handles empty and single-item inputs', () => {
		expect(shuffle([], seeded(1))).toEqual([]);
		expect(shuffle([9], seeded(1))).toEqual([9]);
	});
});

describe('sample', () => {
	it('takes n distinct members', () => {
		const out = sample(source, 3, seeded(2));
		expect(out).toHaveLength(3);
		expect(new Set(out).size).toBe(3);
		for (const value of out) expect(source).toContain(value);
	});

	it('returns everything when asked for more than exists', () => {
		expect(sample(source, 99, seeded(3)).sort((a, b) => a - b)).toEqual(source);
	});

	it('returns nothing for a non-positive n', () => {
		expect(sample(source, 0, seeded(3))).toEqual([]);
		expect(sample(source, -5, seeded(3))).toEqual([]);
	});
});

describe('between', () => {
	it('stays inside the half-open range', () => {
		const rng = seeded(5);
		for (let i = 0; i < 500; i++) {
			const value = between(0.15, 0.2, rng);
			expect(value).toBeGreaterThanOrEqual(0.15);
			expect(value).toBeLessThan(0.2);
		}
	});

	it('collapses to the bound when min equals max', () => {
		expect(between(0.3, 0.3, seeded(6))).toBe(0.3);
	});
});
