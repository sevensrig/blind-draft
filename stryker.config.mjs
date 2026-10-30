// @ts-check
/**
 * Mutation testing for the rulebook. Coverage says every line of the engine
 * runs; this says whether a test notices when one is wrong.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
	testRunner: 'vitest',
	vitest: { configFile: 'vitest.stryker.config.ts' },
	plugins: ['@stryker-mutator/vitest-runner'],
	mutate: [
		'src/lib/game/**/*.ts',
		'!src/lib/game/**/*.test.ts',
		// Types only — nothing to mutate.
		'!src/lib/game/types.ts',
		// The runes seam; its tests are component and E2E, which this doesn't run.
		'!src/lib/game/store.svelte.ts'
	],
	coverageAnalysis: 'perTest',
	/*
	 * `break` sits just under the first run's 79%, so CI fails on a slide rather
	 * than demanding 100: some survivors are equivalent mutants (`i >= 0` in the
	 * shuffle only swaps an element with itself) that no test can kill.
	 */
	thresholds: { high: 90, low: 80, break: 75 },
	reporters: ['clear-text', 'progress', 'html'],
	htmlReporter: { fileName: 'reports/mutation/index.html' },
	tempDirName: '.stryker-tmp'
};
