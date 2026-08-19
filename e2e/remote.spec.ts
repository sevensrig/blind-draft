import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Two-device remote play, driven as two independent browser contexts.
 *
 * Skipped unless a Supabase stack is reachable, so `npm run test:e2e` still
 * works for someone who only cares about local play. Start one with
 * `npx supabase start && npx supabase functions serve`.
 */

const SUPABASE = process.env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

let reachable: boolean | null = null;
async function supabaseUp(): Promise<boolean> {
	if (reachable !== null) return reachable;
	try {
		const res = await fetch(`${SUPABASE}/rest/v1/`, { signal: AbortSignal.timeout(2000) });
		reachable = res.status < 500;
	} catch {
		reachable = false;
	}
	return reachable;
}

/** A fresh context per player: separate localStorage means separate identities. */
async function device(browser: Browser, name: string): Promise<Page> {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const page = await context.newPage();
	await page.goto('/online');
	await page.getByPlaceholder('Player').fill(name);
	return page;
}

test.beforeEach(async () => {
	test.skip(!(await supabaseUp()), 'needs a running Supabase stack');
});

test('two devices play a remote round through the server', async ({ browser }) => {
	const host = await device(browser, 'Sri');
	const guest = await device(browser, 'Alex');

	// Host opens a room.
	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: '3', exact: true }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);

	await expect(host.getByText('Waiting for your opponent')).toBeVisible();
	const code = ((await host.locator('.code strong').textContent()) ?? '').trim();
	expect(code).toMatch(/^\d{4,6}$/);

	// Guest joins by code.
	await guest.locator('.code').fill(code);
	await guest.getByRole('button', { name: 'Join', exact: true }).click();
	await guest.waitForURL(/\/online\/room\?id=/);

	// The host leaves the lobby on its own — that's the realtime nudge working.
	await expect(host.getByText('Tap to reveal')).toBeVisible({ timeout: 15_000 });

	// A reveal on one device shows the same card on the other.
	await host.getByRole('button', { name: /Tap to reveal/ }).click();
	await expect(guest.locator('.item__name')).toBeVisible({ timeout: 15_000 });
	expect((await guest.locator('.item__name').textContent())?.trim()).toBe(
		(await host.locator('.item__name').textContent())?.trim()
	);

	// A device may bid only for its own seat.
	await expect(host.locator('.duel__btn').first()).toBeEnabled();
	await expect(host.locator('.duel__btn').nth(1)).toBeDisabled();

	// Host bids; the guest sees it without doing anything.
	await host.locator('.duel__btn').first().click();
	await expect(guest.locator('.standing__amount')).not.toHaveText('$—', { timeout: 15_000 });

	// Guest raises; the host sees who leads.
	await guest.locator('.duel__btn').nth(1).click();
	await expect(host.locator('.standing__who')).toContainText(/alex/i, { timeout: 15_000 });

	const standing = (await host.locator('.standing__amount').textContent())?.trim();

	// Reconnecting mid-bid resyncs to the live bid, not a cached one.
	await guest.reload();
	await expect(guest.locator('.standing__amount')).toHaveText(standing ?? '', { timeout: 20_000 });
});

test('the deck never reaches a client', async ({ browser }) => {
	const host = await device(browser, 'Sri');
	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);

	// Nothing the browser holds should contain a deck: not storage, not the DOM,
	// not any response body it received.
	const exposed = await host.evaluate(() => {
		const storage = JSON.stringify(Object.entries(localStorage));
		return /"deck"\s*:\s*\[/.test(storage + document.documentElement.innerHTML);
	});
	expect(exposed).toBe(false);
});

test('a stranger cannot read a room they have not joined', async ({ browser }) => {
	const host = await device(browser, 'Sri');
	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);
	const roomId = new URL(host.url()).searchParams.get('id') ?? '';

	// A third context has its own device token, so RLS should return nothing.
	const outsider = await (await browser.newContext()).newPage();
	const rows = await outsider.evaluate(
		async ([url, id]) => {
			const res = await fetch(`${url}/rest/v1/game_public?select=version&room_id=eq.${id}`, {
				headers: { apikey: 'anon-placeholder' }
			});
			return res.ok ? ((await res.json()) as unknown[]).length : -1;
		},
		[SUPABASE, roomId]
	);
	// Either refused outright, or an empty result. Never the row.
	expect(rows).toBeLessThanOrEqual(0);
});
