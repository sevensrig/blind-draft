import { sveltekit } from '@sveltejs/kit/vite';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Two projects, because the game splits cleanly in half:
 *
 * - `unit` runs the pure rulebook in Node. No DOM needed, so it's fast enough to
 *   fuzz hundreds of full games per run.
 * - `component` runs Svelte components in real Chromium via Playwright rather
 *   than jsdom, so layout, pointer events and axe scans reflect a real browser.
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
				 * `$env/dynamic/public` can't resolve here.
				 *
				 * SvelteKit compiles it to `export const env = __sveltekit_<hash>.env`
				 * for the browser and relies on the server-rendered shell to define
				 * that global. There is no SvelteKit server in browser-mode vitest, so
				 * the import threw and took every file that reaches `SetupScreen` with
				 * it — the component a11y suite included. An alias rather than a
				 * defined global because the global's name is a build hash.
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
			/*
			 * Scoped to the game engine on purpose. A repo-wide percentage would be
			 * padded by markup and config; what matters is that the rulebook — the
			 * part with money, slots and fallback rules in it — stays covered.
			 */
			include: ['src/lib/game/**/*.ts'],
			exclude: [
				// Types only — nothing to execute.
				'src/lib/game/types.ts',
				// The runes seam. Exercised by the component and E2E suites, which
				// don't feed this Node-only coverage run.
				'src/lib/game/store.svelte.ts',
				'src/lib/**/*.test.ts'
			],
			/*
			 * Lines and functions are held at 100%: every function in the rulebook is
			 * executed by the suite. Statements and branches sit slightly lower
			 * because the reducer is full of defensive guards for states it cannot
			 * actually reach (`if (!item) return state`, charging more than a wallet
			 * holds). Forcing those to 100 would mean asserting against impossible
			 * inputs, which tests the guard rather than the game.
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
