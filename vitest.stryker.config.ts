import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/**
 * The rulebook's tests only, for Stryker. Its own config rather than the `unit`
 * project because `vendor.test.ts` diffs the engine against its vendored copy:
 * every mutant changes the source, so that test would "kill" all of them and
 * the score would measure nothing.
 */
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		environment: 'node',
		include: ['src/lib/game/**/*.test.ts'],
		exclude: ['src/lib/game/vendor.test.ts']
	}
});
