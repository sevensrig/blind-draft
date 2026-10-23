import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';

// Opt-in per environment: CI and local builds have no token and skip the upload.
const uploadSourceMaps = !!process.env.SENTRY_AUTH_TOKEN;

export default defineConfig({
	build: {
		// Hidden: generated for Sentry, never referenced from the shipped bundle.
		sourcemap: uploadSourceMaps ? 'hidden' : false
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Runes everywhere except node_modules. Removable in Svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		}),
		uploadSourceMaps &&
			sentryVitePlugin({
				org: process.env.SENTRY_ORG,
				project: process.env.SENTRY_PROJECT,
				telemetry: false
			})
	]
});
