// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {}

	/** Replaced at build time by `define` in `vite.config.ts`. */
	const __APP_VERSION__: string;
}

export {};
