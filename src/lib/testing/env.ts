/**
 * Stand-in for `$env/dynamic/public` in component tests, aliased in
 * `vitest.config.ts`. SvelteKit compiles that import to a global the
 * server-rendered shell defines, which browser-mode vitest has no server for —
 * so the real module throws on import and takes out every test reaching
 * `SetupScreen`.
 *
 * Empty on purpose: `remoteEnabled` is false and components render their
 * local-only shape. The configured path is covered by the remote E2E specs.
 */
export const env: Record<string, string | undefined> = {};
