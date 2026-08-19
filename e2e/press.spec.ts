import { expect, test, type Page } from '@playwright/test';
import { setUpGame, waitForHydration } from './helpers';

/**
 * The press interaction, driven by touch.
 *
 * This exists because the technique's reference implementation fires its press on
 * `hover:`, which never happens on a phone — on a mobile-first game that means the
 * single most tactile thing in the UI silently doesn't exist for most players.
 * Reading the CSS can't tell you whether it works; these tests hold a real touch
 * point down through Chromium's input pipeline and read the computed style while
 * it's held.
 *
 * `hasTouch` is set here rather than globally so the rest of the suite keeps
 * exercising the same pointer setup it always has.
 */

test.use({ hasTouch: true });

interface Pressed {
	restShadow: string;
	/** The style with a pointer resting on the element and nothing pressed. */
	hoverShadow: string;
	pressedShadow: string;
	restTranslate: string;
	hoverTranslate: string;
	pressedTranslate: string;
	/** The pointer type the element actually saw — 'touch' or nothing at all. */
	pointerType: string;
}

/**
 * Samples an element at rest, under a bare hover, and under a held touch.
 *
 * `tap()` is down-and-up in one go, over before anything can be observed, and a
 * hand-built TouchEvent doesn't drive `:active` at all — the UA only applies it
 * for genuine input. `Input.dispatchTouchEvent` turned out not to either: the
 * events arrive but Chromium's gesture recogniser never runs, so the element
 * stays at rest. `Input.emulateTouchFromMouseEvent` does go through that
 * pipeline, which is the same path a real finger takes.
 *
 * The hover sample is the part that gives the test teeth. Chromium's touch
 * emulation leaves the element hovered as well as active, so "the style changed
 * under my finger" on its own can't tell a working `:active` press from the
 * reference implementation's `hover:`-only one — a hover-only press passes that
 * check while being invisible on a real phone. Proving a bare hover changes
 * nothing means whatever moved under the touch can only have been `:active`.
 */
async function press(page: Page, selector: string): Promise<Pressed> {
	const element = page.locator(selector);
	await expect(element).toBeVisible();
	await element.scrollIntoViewIfNeeded();

	const box = await element.boundingBox();
	if (!box) throw new Error(`${selector} has no box`);
	const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };

	await page.$eval(selector, (node) => {
		node.addEventListener(
			'pointerdown',
			(event) => node.setAttribute('data-pointer-type', (event as PointerEvent).pointerType),
			{ once: true, passive: true }
		);
	});

	const read = () =>
		page.$eval(selector, (node) => {
			const style = getComputedStyle(node);
			return {
				shadow: style.boxShadow,
				translate: style.translate,
				pointerType: node.getAttribute('data-pointer-type') ?? ''
			};
		});

	// Park the pointer well clear of the element first.
	await page.mouse.move(1, 1);
	const rest = await read();

	await page.mouse.move(point.x, point.y);
	const hovered = await read();
	await page.mouse.move(1, 1);

	const cdp = await page.context().newCDPSession(page);
	const touch = (type: 'mousePressed' | 'mouseReleased') =>
		cdp.send('Input.emulateTouchFromMouseEvent', {
			type,
			x: point.x,
			y: point.y,
			button: 'left',
			clickCount: 1
		});

	await touch('mousePressed');
	let pressed = rest;
	try {
		/*
		 * Chromium withholds `:active` for a moment after a touch lands while it
		 * works out whether the gesture will become a scroll, so reading straight
		 * away catches the element still at rest. Polling waits for the state — and
		 * is itself the assertion that it arrives, since a press that never fires on
		 * touch fails right here.
		 */
		await expect.poll(async () => (await read()).shadow, { timeout: 3000 }).not.toBe(rest.shadow);
	} finally {
		pressed = await read();
		await touch('mouseReleased');
		await cdp.detach();
	}

	return {
		restShadow: rest.shadow,
		hoverShadow: hovered.shadow,
		pressedShadow: pressed.shadow,
		restTranslate: rest.translate,
		hoverTranslate: hovered.translate,
		pressedTranslate: pressed.translate,
		pointerType: pressed.pointerType
	};
}

/**
 * The assertion every case shares: a finger moved it, and a hover alone did not.
 */
function expectTouchDriven(result: Pressed): void {
	expect(result.pointerType, 'the element was not driven by a touch pointer').toBe('touch');
	expect(result.hoverShadow, 'hovering alone changed the shadow').toBe(result.restShadow);
	expect(result.hoverTranslate, 'hovering alone moved the element').toBe(result.restTranslate);
}

/** The offset the whole system shares, read from the token rather than assumed. */
async function pressDistance(page: Page): Promise<string> {
	return page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--press').trim()
	);
}

test('a touch on the reveal card presses it flat onto its own shadow', async ({ page }) => {
	await setUpGame(page, { slots: '3' });
	const offset = await pressDistance(page);

	const result = await press(page, '.item--back');

	// At rest it's raised; held down it has travelled onto the shadow and the
	// shadow is gone, so the card is sitting flat on the page.
	expectTouchDriven(result);
	expect(result.restShadow).not.toBe('none');
	expect(result.restTranslate).toBe('none');
	expect(result.pressedShadow).toBe('none');
	expect(result.pressedTranslate).toContain(offset);
});

test('a touch on the primary button presses it flat', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], slots: '3' });
	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	await page.getByRole('button', { name: /Sri[\s\S]*bid \$/ }).click();

	const offset = await pressDistance(page);
	const result = await press(page, 'button.btn--hot:not(.btn--pop)');

	expectTouchDriven(result);
	expect(result.restShadow).not.toBe('none');
	expect(result.pressedShadow).toBe('none');
	expect(result.pressedTranslate).toContain(offset);
});

test('the resolution button pops up under a touch instead of pressing down', async ({ page }) => {
	await setUpGame(page, { names: ['Sri', 'Alex'], slots: '3' });
	await page.getByRole('button', { name: /Tap to reveal/ }).click();
	await page.getByRole('button', { name: /Sri[\s\S]*bid \$/ }).click();
	await page.getByRole('button', { name: /^Sold to/ }).click();

	const result = await press(page, 'button.btn--pop');

	// The inverse of every other control: flat at rest, and it lifts on press with
	// the shadow appearing underneath — winning an item isn't a button bottoming out.
	expectTouchDriven(result);
	expect(result.restShadow).toBe('none');
	expect(result.pressedShadow).not.toBe('none');
	expect(result.pressedTranslate).toMatch(/-\d/);
});

test('the shadow offset and the press distance are the same number', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	const offset = await pressDistance(page);
	const shadow = await page.evaluate(() =>
		getComputedStyle(document.documentElement).getPropertyValue('--shadow-hard').trim()
	);

	/*
	 * They read from one token, and this is what stops that being undone by hand
	 * later: if the offset is retuned and the press isn't, an element no longer
	 * lands flush on its own shadow and the whole illusion goes.
	 */
	// Custom properties come back as authored, so this reads the tokens themselves.
	expect(shadow.startsWith(`${offset} ${offset} `)).toBe(true);
	// Zero blur, zero spread — a hard edge, not a drop shadow.
	expect(shadow).toMatch(/^4px 4px 0 0 /);
});

test('theme swatches press on touch too', async ({ page }) => {
	await page.goto('/');
	await waitForHydration(page);

	// The selected swatch is the raised one, so it's the one with a press to check.
	const offset = await pressDistance(page);
	const result = await press(page, 'input[type="radio"]:checked');

	expectTouchDriven(result);
	expect(result.restShadow).not.toBe('none');
	expect(result.pressedShadow).toBe('none');
	expect(result.pressedTranslate).toContain(offset);
});
