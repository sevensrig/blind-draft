import { execSync } from 'node:child_process';
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * Which build this is, stamped on every analytics event so an insight can be
 * split by release instead of read off a date axis. Vercel sets the SHA for us;
 * a local `vite build` falls back to git, and anything without git says `dev`.
 */
function appVersion(): string {
	const sha = process.env.VERCEL_GIT_COMMIT_SHA;
	if (sha) return sha.slice(0, 7);
	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return 'dev';
	}
}

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(appVersion())
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes everywhere except node_modules. Removable in Svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	]
});
