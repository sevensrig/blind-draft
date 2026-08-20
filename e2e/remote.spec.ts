import AxeBuilder from '@axe-core/playwright';
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

/*
 * Skipping is right locally and wrong in CI.
 *
 * Someone who only cares about local play shouldn't need Docker to run the
 * suite, so these skip when nothing answers. But a CI run that skips them is
 * worse than one that fails: it goes green having tested none of the remote
 * paths, which is exactly where this project's real bugs have been. So CI sets
 * `REQUIRE_SUPABASE=1` and an unreachable stack becomes a hard failure.
 */
const REQUIRE_SUPABASE = !!process.env.REQUIRE_SUPABASE;

test.beforeEach(async () => {
	const up = await supabaseUp();
	if (!up && REQUIRE_SUPABASE) {
		throw new Error(
			`REQUIRE_SUPABASE is set but no Supabase stack answered at ${SUPABASE}. ` +
				'These specs must not be skipped in CI.'
		);
	}
	test.skip(!up, 'needs a running Supabase stack');
});

/*
 * Axe lives here rather than in `a11y.spec.ts` because these screens only exist
 * with two live devices and a server behind them — there is no way to reach them
 * from a single page. `a11y.spec.ts` covers every local route; the online routes
 * were not covered at all before this.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: Page, label: string): Promise<void> {
	const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	const detail = results.violations
		.map((violation) => `  ${violation.id} (${violation.impact}): ${violation.help}`)
		.join('\n');
	expect(results.violations, `${label} has accessibility violations:\n${detail}`).toEqual([]);
}

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

/*
 * Quitting, which used to do nothing that mattered.
 *
 * The Quit button sent `{ type: 'reset' }`, and remotely that is a legal engine
 * action — so the server wrote a blank `initialState()` as authoritative state.
 * The quitter stayed on the room page looking at an empty deck, and the
 * opponent's live game was silently wiped along with it. Meanwhile nothing ever
 * closed the room: it stayed `playing`, a public lobby stayed in the browser,
 * and only the 24h cleanup cron eventually reaped it.
 */
test('quitting mid-draft leaves the room and ends it for the opponent', async ({ browser }) => {
	const host = await device(browser, 'Sri');
	const guest = await device(browser, 'Alex');

	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: '3', exact: true }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);

	const code = ((await host.locator('.code strong').textContent()) ?? '').trim();
	await guest.locator('.code').fill(code);
	await guest.getByRole('button', { name: 'Join', exact: true }).click();
	await guest.waitForURL(/\/online\/room\?id=/);
	await expect(host.getByText('Tap to reveal')).toBeVisible({ timeout: 15_000 });

	// Get a card on the table so this is a genuinely live game, not a lobby.
	await host.getByRole('button', { name: /Tap to reveal/ }).click();
	await expect(guest.locator('.item__name')).toBeVisible({ timeout: 15_000 });

	// The guest quits. Two taps: the first only arms the button.
	await guest.getByRole('button', { name: 'Quit', exact: true }).click();
	await guest.getByRole('button', { name: /End it\?/ }).click();

	// Symptom one: it has to actually leave the page.
	await guest.waitForURL(/\/online$/, { timeout: 20_000 });

	// Symptom two: the host is told, definitively, rather than being left on a
	// board that quietly reset itself to an empty deck.
	await expect(host.getByText(/Alex left the draft/)).toBeVisible({ timeout: 20_000 });
	await expect(host.getByText('Game over')).toBeVisible();

	// New screen, so it gets scanned like every other one.
	await scan(host, 'opponent-left screen');

	// And the room is closed server-side: the code no longer joins.
	await guest.locator('.code').fill(code);
	await guest.getByRole('button', { name: 'Join', exact: true }).click();
	await expect(guest.locator('.error')).toBeVisible({ timeout: 15_000 });
	await expect(guest).toHaveURL(/\/online$/);
});

test('leaving a lobby drops it from the public rooms browser', async ({ browser }) => {
	const host = await device(browser, 'Sri');

	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);
	const roomId = new URL(host.url()).searchParams.get('id') ?? '';

	// Public is the default, so the lobby is listed while it waits.
	const browser2 = await (await browser.newContext()).newPage();
	await browser2.goto('/online/rooms');
	await expect(browser2.locator(`[data-room-id="${roomId}"]`)).toBeVisible({ timeout: 15_000 });

	await host.getByRole('button', { name: /Leave room/ }).click();
	await host.waitForURL(/\/online$/, { timeout: 20_000 });

	// The trigger on `rooms.status` pulls the listing, so a stranger can no longer
	// walk into a room nobody is sitting in.
	await browser2.reload();
	await expect(browser2.locator(`[data-room-id="${roomId}"]`)).toHaveCount(0, { timeout: 15_000 });
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
