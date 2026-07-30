import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { totalSpent } from '$lib/game/engine';
import { game } from '$lib/game/store.svelte';
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

		// Every drafted item appears somewhere on the sheet. Scoped with `.first()`
		// because a name can legitimately show twice — once in the roster list and
		// again in the "Top price" stat.
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
});
