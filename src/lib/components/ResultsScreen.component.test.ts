import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { totalSpent } from '$lib/game/engine';
import { game } from '$lib/game/store.svelte';
import { shareText } from '$lib/share/text';
import { finishedGame } from '$lib/testing/fixtures';
import ResultsScreen from './ResultsScreen.svelte';

describe('ResultsScreen', () => {
	beforeEach(() => {
		localStorage.clear();
		game.dispatch({ type: 'reset' });
	});

	it('lists every pick with its price for both players', async () => {
		const finished = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
		game.replace(finished);
		render(ResultsScreen);

		await expect.element(page.getByText('Rosters are full')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Sri' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Alex' })).toBeVisible();

		// `.first()` because a name can legitimately show twice: once in the roster
		// list and again in the "Top price" stat.
		for (const player of finished.players) {
			for (const entry of player.roster) {
				await expect
					.element(page.getByText(entry.item.name, { exact: true }).first())
					.toBeVisible();
				const price = entry.free ? 'Free' : `$${entry.price}`;
				await expect.element(page.getByText(price, { exact: true }).first()).toBeVisible();
			}
		}
	});

	it('shows what each player spent and has left', async () => {
		const finished = finishedGame({ slots: 3, budget: 20, names: ['Sri', 'Alex'] });
		game.replace(finished);
		render(ResultsScreen);

		for (const player of finished.players) {
			const spent = totalSpent(player);
			await expect.element(page.getByText(`$${spent}`, { exact: true }).first()).toBeVisible();
			await expect.element(page.getByText(`$${player.money} left`)).toBeVisible();
			// Money is conserved, which is what the sheet is claiming.
			expect(spent + player.money).toBe(20);
		}
	});

	it('reports the top price paid across the draft', async () => {
		const finished = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
		game.replace(finished);
		render(ResultsScreen);

		const priciest = finished.history.reduce((top, award) =>
			award.price > top.price ? award : top
		);

		await expect.element(page.getByText('Top price')).toBeVisible();
		await expect.element(page.getByText(priciest.item.name, { exact: true }).first()).toBeVisible();
	});

	it('labels free pickups rather than showing $0', async () => {
		// Both broke from the start, so every item is handed out free.
		let state = finishedGame({ slots: 2, budget: 0, names: ['Sri', 'Alex'] });
		state = { ...state };
		game.replace(state);
		render(ResultsScreen);

		const freebies = state.history.filter((award) => award.free).length;
		expect(freebies).toBeGreaterThan(0);
		await expect.element(page.getByText('Free').first()).toBeVisible();
		await expect.element(page.getByText(`of ${state.history.length} items`)).toBeVisible();
	});

	it('deals a brand new deck when running it back', async () => {
		game.replace(finishedGame({ slots: 3, names: ['Sri', 'Alex'] }));
		render(ResultsScreen);

		await page.getByRole('button', { name: /Run it back/ }).click();

		expect(game.state.phase).toBe('reveal');
		// Same players and settings, empty rosters.
		expect(game.state.players.map((player) => player.name)).toEqual(['Sri', 'Alex']);
		expect(game.state.players.every((player) => player.roster.length === 0)).toBe(true);
		expect(game.state.players.every((player) => player.money === 20)).toBe(true);
	});

	it('returns to setup for a new game', async () => {
		game.replace(finishedGame({ slots: 3 }));
		render(ResultsScreen);

		await page.getByRole('button', { name: /New setup/ }).click();
		expect(game.state.phase).toBe('setup');
	});

	describe('sharing', () => {
		const stubs: string[] = [];

		/** Navigator's share APIs are read-only getters, so they're redefined per test. */
		function stub(name: 'share' | 'canShare' | 'clipboard', value: unknown) {
			Object.defineProperty(navigator, name, { value, configurable: true });
			stubs.push(name);
		}

		/** Resolves once the card PNG exists, so the image path is the one taken. */
		function cardRendered(): Promise<void> {
			const original = HTMLCanvasElement.prototype.toBlob;
			return new Promise((resolve) => {
				vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
					this: HTMLCanvasElement,
					callback,
					...rest
				) {
					original.call(this, (blob) => (callback(blob), resolve()), ...rest);
				});
			});
		}

		afterEach(() => {
			for (const name of stubs.splice(0))
				delete (navigator as unknown as Record<string, unknown>)[name];
			vi.restoreAllMocks();
		});

		it('shares the card image and text through the share sheet when files are supported', async () => {
			const share = vi.fn().mockResolvedValue(undefined);
			stub('share', share);
			stub('canShare', () => true);
			const rendered = cardRendered();
			const finished = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
			game.replace(finished);
			render(ResultsScreen);
			await rendered;

			await page.getByRole('button', { name: /Share results/ }).click();

			expect(share).toHaveBeenCalledOnce();
			const [data] = share.mock.calls[0];
			expect(data.text).toBe(shareText(finished));
			expect(data.files).toHaveLength(1);
			expect(data.files[0].type).toBe('image/png');
		});

		it('falls back to text when the device can share but not files', async () => {
			const share = vi.fn().mockResolvedValue(undefined);
			stub('share', share);
			stub('canShare', () => false);
			const finished = finishedGame({ slots: 3 });
			game.replace(finished);
			render(ResultsScreen);

			await page.getByRole('button', { name: /Share results/ }).click();

			expect(share).toHaveBeenCalledWith({ text: shareText(finished) });
		});

		it('copies to the clipboard when there is no share sheet', async () => {
			const writeText = vi.fn().mockResolvedValue(undefined);
			stub('share', undefined);
			stub('clipboard', { writeText });
			const finished = finishedGame({ slots: 3 });
			game.replace(finished);
			render(ResultsScreen);

			await page.getByRole('button', { name: /Share results/ }).click();

			expect(writeText).toHaveBeenCalledWith(shareText(finished));
			await expect.element(page.getByText(/Copied/)).toBeVisible();
		});

		it('treats a dismissed share sheet as a choice, not a failure', async () => {
			const writeText = vi.fn().mockResolvedValue(undefined);
			stub('share', vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError')));
			stub('clipboard', { writeText });
			game.replace(finishedGame({ slots: 3 }));
			render(ResultsScreen);

			await page.getByRole('button', { name: /Share results/ }).click();

			expect(writeText).not.toHaveBeenCalled();
			await expect.element(page.getByText(/Copied/)).not.toBeInTheDocument();
		});
	});
});
