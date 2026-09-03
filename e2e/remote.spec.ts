import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Two-device remote play, driven as two independent browser contexts. Needs a
 * stack: `npx supabase start && npx supabase functions serve`.
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
 * Skipping is right locally — nobody needs Docker to test local play — and wrong
 * in CI, where a green run would have tested none of the remote paths. Hence
 * `REQUIRE_SUPABASE=1`, which turns the skip into a hard failure.
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
 * Axe lives here, not in `a11y.spec.ts`: these screens only exist with two live
 * devices and a server, so a single page can't reach them.
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

	// Accepting a bid is not a self-serve win button: Alex holds the standing bid,
	// so only Sri, by giving up, can end the auction.
	await expect(guest.getByRole('button', { name: /^Waiting on Sri/ })).toBeDisabled();
	await expect(guest.getByRole('button', { name: /^Sell to/ })).toHaveCount(0);

	/*
	 * And the server doesn't take the client's word for it. A seat check of
	 * `'player' in action` let a bare `{ type: 'sold' }` — what a cached pre-fix
	 * bundle still sends — skip the check and self-award the card. Hitting the
	 * function directly is the only way to send that.
	 *
	 * The token key is duplicated from `identity.ts` on purpose: a hostile client
	 * wouldn't be built out of the app's own helpers.
	 */
	const roomId = new URL(guest.url()).searchParams.get('id') ?? '';
	const refusals = await guest.evaluate(
		async ([url, id]) => {
			const token = localStorage.getItem('blind-draft:device:v1');
			const codes: string[] = [];
			// Every version, not the right one. The version check sits after the
			// seat check, so sweeping guarantees one call carries the live version
			// and a skipped seat check can't hide behind a `stale`.
			for (let version = 0; version <= 12; version++) {
				const res = await fetch(`${url}/functions/v1/room-action`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', apikey: 'anon-placeholder' },
					body: JSON.stringify({ roomId: id, token, version, action: { type: 'sold' } })
				});
				codes.push(((await res.json()) as { error?: string }).error ?? 'accepted');
			}
			return codes;
		},
		[SUPABASE, roomId]
	);

	// Refused for being the wrong seat every time — never `stale`, never accepted.
	expect(new Set(refusals)).toEqual(new Set(['forbidden']));
	// And nothing landed: the card is still on the table, unsold.
	await expect(guest.locator('.stamp__to')).toHaveCount(0);

	const sell = host.getByRole('button', { name: /^Sell to Alex/ });
	await expect(sell).toBeEnabled();
	await sell.click();

	// The item lands with the bidder, not with whoever tapped the button.
	await expect(host.locator('.stamp__to')).toContainText(/alex/i, { timeout: 15_000 });
	await expect(guest.locator('.stamp__to')).toContainText(/alex/i, { timeout: 15_000 });
});

/*
 * Quitting used to do nothing that mattered: the Quit button sent
 * `{ type: 'reset' }`, a legal engine action, so the server wrote a blank
 * `initialState()` and wiped the opponent's live game too — while the room
 * itself stayed `playing` until the cleanup cron reaped it.
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

	// Symptom two: the host is told, rather than left on a board that quietly
	// reset itself to an empty deck.
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

/*
 * An invite link used to take a seat the instant it opened, with no name — and
 * the server's "Player 2" fallback stuck for the whole draft. Joining by code
 * looked fine only because that path goes through the name field on `/online`.
 */
test('an invite link asks the guest who they are before seating them', async ({ browser }) => {
	const host = await device(browser, 'Sri');

	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: '3', exact: true }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);
	await expect(host.getByText('Waiting for your opponent')).toBeVisible();

	// The shared link carries the id and nothing else, on a device with no token,
	// no seat and no remembered name. That's a link recipient.
	const invite = host.url().replace(/&code=\d+/, '');
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const guest = await context.newPage();
	await guest.goto(invite);

	const field = guest.getByLabel('Your name');
	await expect(field).toBeVisible({ timeout: 15_000 });

	// Nothing is claimed until the name is submitted.
	await expect(host.getByText('Waiting for your opponent')).toBeVisible();

	// New screen, so it gets scanned like every other one.
	await scan(guest, 'invite-link name prompt');

	await field.fill('Alex');
	await guest.getByRole('button', { name: /Join the draft/ }).click();

	// Both are in, and the guest is Alex on both boards — not "Player 2".
	await expect(host.getByText('Tap to reveal')).toBeVisible({ timeout: 20_000 });
	await expect(host.getByText('Alex')).toBeVisible();
	await expect(host.getByText('Player 2')).toHaveCount(0);
	await expect(guest.getByText('Alex')).toBeVisible();
});

test('the rooms browser asks a nameless player who they are', async ({ browser }) => {
	const host = await device(browser, 'Sri');

	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: '3', exact: true }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);
	const roomId = new URL(host.url()).searchParams.get('id') ?? '';

	// A device that walked past the name field on `/online` — the common case,
	// since it's a page back from the room list.
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const guest = await context.newPage();
	await guest.goto('/online/rooms');
	await guest.locator(`[data-room-id="${roomId}"] button`).click({ timeout: 15_000 });

	// Prompted rather than seated, and nothing is claimed until it's submitted.
	const field = guest.getByLabel('Your name');
	await expect(field).toBeVisible({ timeout: 15_000 });
	await expect(guest.getByRole('button', { name: /Join the draft/ })).toBeDisabled();
	await expect(host.getByText('Waiting for your opponent')).toBeVisible();

	// New screen on a route the single-page a11y suite can't reach.
	await scan(guest, 'rooms browser name prompt');

	await field.fill('Alex');
	await guest.getByRole('button', { name: /Join the draft/ }).click();

	// Both boards say Alex, not "Player 2".
	await expect(host.getByText('Tap to reveal')).toBeVisible({ timeout: 20_000 });
	await expect(host.getByText('Alex')).toBeVisible();
	await expect(host.getByText('Player 2')).toHaveCount(0);
	await expect(guest.getByText('Alex')).toBeVisible();
});

test('a name typed on /online carries into a rooms browser join', async ({ browser }) => {
	const host = await device(browser, 'Sri');

	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: '3', exact: true }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);
	const roomId = new URL(host.url()).searchParams.get('id') ?? '';

	// `device` types the name on `/online` and the browse button banks it, so this
	// player is not asked again.
	const guest = await device(browser, 'Alex');
	await guest.getByRole('link', { name: /Browse open rooms/ }).click();
	await guest.locator(`[data-room-id="${roomId}"] button`).click({ timeout: 15_000 });

	await guest.waitForURL(/\/online\/room\?id=/, { timeout: 20_000 });
	await expect(host.getByText('Tap to reveal')).toBeVisible({ timeout: 20_000 });
	await expect(host.getByText('Alex')).toBeVisible();
	await expect(host.getByText('Player 2')).toHaveCount(0);
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

	// The trigger on `rooms.status` pulls the listing, so nobody can walk into a
	// room that's been left.
	await browser2.reload();
	await expect(browser2.locator(`[data-room-id="${roomId}"]`)).toHaveCount(0, { timeout: 15_000 });
});

test('the deck never reaches a client', async ({ browser }) => {
	const host = await device(browser, 'Sri');
	await host.getByRole('button', { name: /^Foods/ }).click();
	await host.getByRole('button', { name: /Create room/ }).click();
	await host.waitForURL(/\/online\/room\?id=/);

	// Nothing the browser holds should contain a deck: not storage, not the DOM.
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
