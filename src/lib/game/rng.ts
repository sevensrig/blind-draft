/** Injectable so deck building is testable without stubbing globals. */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** Fisher-Yates on a copy. */
export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
	const out = items.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Up to `n` distinct members, chosen uniformly. Returns fewer if the pool is short. */
export function sample<T>(items: readonly T[], n: number, rng: Rng = defaultRng): T[] {
	if (n <= 0) return [];
	return shuffle(items, rng).slice(0, n);
}

/** Uniform float in [min, max). */
export function between(min: number, max: number, rng: Rng = defaultRng): number {
	return min + rng() * (max - min);
}
