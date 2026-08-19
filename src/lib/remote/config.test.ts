import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards a build failure that reached Vercel.
 *
 * `$env/static/public` compiles each variable into a named export, so building
 * without one set fails with "not exported" — the whole deploy dies rather than
 * remote play quietly switching off. `$env/dynamic/public` returns an object, so
 * a missing key is just undefined and `remoteEnabled` can do its job.
 *
 * This is a source check rather than a behavioural one on purpose: the failure
 * happens at build time, so by the time a test could run the damage is done.
 */
describe('remote configuration', () => {
	const source = readFileSync(join(process.cwd(), 'src/lib/remote/client.ts'), 'utf8');

	it('reads env dynamically so an unset variable cannot break the build', () => {
		expect(source).toContain("from '$env/dynamic/public'");
		expect(
			source,
			'static env imports fail the build when a variable is missing'
		).not.toContain("from '$env/static/public'");
	});

	it('still gates remote play on both variables being present', () => {
		expect(source).toMatch(/remoteEnabled\s*=\s*!!SUPABASE_URL\s*&&\s*!!SUPABASE_ANON_KEY/);
	});

	it('never reaches for the service role key', () => {
		// It exists in the Vercel environment. It must never reach a client bundle.
		expect(source).not.toContain('SERVICE_ROLE');
	});
});
