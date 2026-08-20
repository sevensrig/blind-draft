/**
 * Stand-in for `$env/dynamic/public` in component tests.
 *
 * SvelteKit compiles that import to `export const env = __sveltekit_<hash>.env`
 * in the browser, and the global is defined by the server-rendered shell. Vitest
 * browser mode has no SvelteKit server, so the global is undefined and the module
 * throws on import — which took out every test file that reaches `SetupScreen`,
 * including the whole component-level a11y suite. It surfaced when remote play
 * merged and `SetupScreen` started importing `remoteEnabled`.
 *
 * Deliberately empty, so `remoteEnabled` is false and components render their
 * local-only shape — the same thing those tests asserted before remote play
 * existed. The configured path is covered by the remote E2E specs, which run
 * against a real stack.
 */
export const env: Record<string, string | undefined> = {};
