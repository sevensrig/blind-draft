import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Two projects: `unit` runs the pure rulebook in Node, fast enough to fuzz
 * hundreds of full games; `component` runs Svelte in real Chromium rather than
 * jsdom, so layout, pointer events and axe scans reflect a real browser.
 */
export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			}
		})
	],
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/lib/**/*.test.ts'],
					exclude: ['src/lib/**/*.component.test.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'component',
					include: ['src/lib/**/*.component.test.ts'],
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						instances: [{ browser: 'chromium' }]
					}
				},
				/*
				 * `$env/dynamic/public` can't resolve here: SvelteKit compiles it to a
				 * global the server-rendered shell defines, and browser-mode vitest has
				 * no SvelteKit server. An alias rather than a defined global, because
				 * the global's name is a build hash.
				 */
				resolve: {
					alias: [
						{
							find: '$env/dynamic/public',
							replacement: fileURLToPath(new URL('./src/lib/testing/env.ts', import.meta.url))
						}
					]
				}
			}
		],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			reportsDirectory: 'coverage',
			/* Scoped to the engine: a repo-wide percentage would be padded by markup
			   and config, and the rulebook is the part that has to stay covered. */
			include: ['src/lib/game/**/*.ts'],
			exclude: [
				// Types only — nothing to execute.
				'src/lib/game/types.ts',
				// The runes seam, exercised by the component and E2E suites — which
				// don't feed this Node-only coverage run.
				'src/lib/game/store.svelte.ts',
				'src/lib/**/*.test.ts'
			],
			/*
			 * Lines and functions at 100%. Statements and branches sit lower because
			 * the reducer is full of guards for unreachable states; forcing those up
			 * would test the guard rather than the game.
			 */
			thresholds: {
				'src/lib/game/engine.ts': {
					statements: 90,
					branches: 87,
					functions: 100,
					lines: 100
				},
				'src/lib/game/deck.ts': {
					statements: 97,
					branches: 85,
					functions: 100,
					lines: 100
				},
				'src/lib/game/persist.ts': {
					statements: 95,
					branches: 94,
					functions: 100,
					lines: 100
				}
			}
		}
	}
});
