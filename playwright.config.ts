import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against `build` + `preview`, never `vite dev`. The nastiest bug this
 * project has had was a hydration crash visible only in built output: the HTML
 * rendered fine and every control was dead.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'dot' : 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			// The game is phone-first, so every journey runs at a phone viewport.
			use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } }
		}
	],
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173 --strictPort',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
