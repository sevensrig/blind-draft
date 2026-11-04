import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { getCategory, getVariant } from '$lib/data';
import { totalSpent } from '$lib/game/engine';
import { scoreGame } from '$lib/game/score';
import { game } from '$lib/game/store.svelte';
import type { Player } from '$lib/game/types';
import { shareCaption, shareText } from '$lib/share/text';
import { FEEDBACK_URL } from '$lib/site';
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

		await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Sri', exact: true })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Alex', exact: true })).toBeVisible();

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
			await expect
				.element(page.getByText(`$${spent} spent · $${player.money} left`).first())
				.toBeVisible();
			// Money is conserved, which is what the sheet is claiming.
			expect(spent + player.money).toBe(20);
		}
	});

	it('scores both rosters and names the winner', async () => {
		const finished = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
		game.replace(finished);
		render(ResultsScreen);

		const board = scoreGame(finished)!;
		for (const player of finished.players) {
			const total = board.players[player.id].total;
			await expect.element(page.getByText(`${total} pts`, { exact: true }).first()).toBeVisible();
		}
		const title =
			board.winner === null ? 'Dead even' : `${finished.players[board.winner].name} wins`;
		await expect.element(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	});

	it('crowns the winner and shows only roster totals outside sports', async () => {
		const finished = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
		game.replace(finished);
		render(ResultsScreen);

		await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();
		const winner = scoreGame(finished)!.winner;
		expect(document.querySelectorAll('.crown')).toHaveLength(winner === null ? 0 : 1);
		expect(document.querySelectorAll('.pick__pts, .pick__steal')).toHaveLength(0);
	});

	it('itemises sports picks with points and an unnumbered steal tag, but no stat line', async () => {
		const finished = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
		const deck = getVariant(getCategory('nba')!, 'nba-current').items.slice(0, 6);
		const swap = (player: Player): Player => ({
			...player,
			roster: player.roster.map((entry, i) => ({ ...entry, item: deck[player.id * 3 + i] }))
		});
		game.replace({
			...finished,
			config: { ...finished.config, categoryId: 'nba', variantId: 'nba-current' },
			players: [swap(finished.players[0]), swap(finished.players[1])]
		});
		render(ResultsScreen);

		await expect.element(page.getByText(/real stats and expert opinions/)).toBeVisible();
		await expect.element(page.getByText(/ REB /)).not.toBeInTheDocument();
		expect(document.querySelectorAll('.pick__pts')).toHaveLength(6);
		for (const tag of document.querySelectorAll('.pick__steal')) {
			expect(tag.textContent?.trim()).toMatch(/^(\+ steal|− overpay)$/);
		}
	});

	it('keeps the argue-about-it sheet for a custom list', async () => {
		const finished = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
		game.replace({ ...finished, config: { ...finished.config, customItems: finished.deck } });
		render(ResultsScreen);

		await expect.element(page.getByRole('heading', { name: 'Rosters are full' })).toBeVisible();
		await expect.element(page.getByText(/argue about who won/)).toBeVisible();
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

	it('asks for feedback in a new tab', async () => {
		game.replace(finishedGame({ slots: 3 }));
		render(ResultsScreen);

		const link = page.getByRole('link', { name: 'Send feedback' });
		await expect.element(link).toHaveAttribute('href', FEEDBACK_URL);
		await expect.element(link).toHaveAttribute('target', '_blank');
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

		it('shares the card image with just the verdict and link when files are supported', async () => {
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
			expect(data.text).toBe(shareCaption(finished));
			expect(data.files).toHaveLength(1);
			expect(data.files[0].type).toBe('image/png');
		});

		it('falls back to the full rosters as text when the device can share but not files', async () => {
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
