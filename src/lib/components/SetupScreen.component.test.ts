import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { game } from '$lib/game/store.svelte';
import SetupScreen from './SetupScreen.svelte';

/**
 * The setup screen's job is to turn taps into a valid `start` action, so these
 * assert on the resulting game state rather than on internal component state.
 */
describe('SetupScreen', () => {
	beforeEach(() => {
		localStorage.clear();
		game.dispatch({ type: 'reset' });
	});

	it('carries names, budget and roster size into the started game', async () => {
		render(SetupScreen);

		await page.getByPlaceholder('Player 1').fill('Sri');
		await page.getByPlaceholder('Player 2').fill('Alex');
		await page.getByRole('button', { name: '$10', exact: true }).click();
		await page.getByRole('button', { name: '4', exact: true }).click();
		await page.getByRole('button', { name: /Foods/ }).click();
		await page.getByRole('button', { name: /Start the draft/ }).click();

		const state = game.state;
		expect(state.phase).toBe('reveal');
		expect(state.players.map((player) => player.name)).toEqual(['Sri', 'Alex']);
		expect(state.config.budget).toBe(10);
		expect(state.players.map((player) => player.money)).toEqual([10, 10]);
		expect(state.config.slots).toBe(4);
		// Deck is always two items per slot.
		expect(state.deck).toHaveLength(8);
		expect(state.config.categoryId).toBe('foods');
	});

	it('falls back to default names when the fields are left empty', async () => {
		render(SetupScreen);

		await page.getByRole('button', { name: /Drinks/ }).click();
		await page.getByRole('button', { name: /Start the draft/ }).click();

		expect(game.state.players.map((player) => player.name)).toEqual(['Player 1', 'Player 2']);
		expect(game.state.config.budget).toBe(20);
		expect(game.state.config.slots).toBe(5);
	});

	it('cannot start until a category is chosen', async () => {
		render(SetupScreen);

		// No start control at all until there's something to start.
		await expect.element(page.getByText('Pick a category to start')).toBeVisible();
		expect(page.getByRole('button', { name: /Start the draft/ }).elements()).toHaveLength(0);
		expect(game.state.phase).toBe('setup');

		await page.getByRole('button', { name: /Celebrities/ }).click();
		await expect.element(page.getByRole('button', { name: /Start the draft/ })).toBeVisible();
	});

	it('offers a Current / All-Time toggle for sports and honours the choice', async () => {
		render(SetupScreen);

		await page.getByRole('button', { name: /NBA Players/ }).click();
		await expect.element(page.getByText('NBA Players pool')).toBeVisible();

		await page.getByRole('button', { name: 'All-Time', exact: true }).click();
		await page.getByRole('button', { name: /Start the draft/ }).click();

		expect(game.state.config.variantId).toBe('nba-all-time');
		expect(game.state.config.variantLabel).toBe('All-Time');
	});

	it('locks the roster to a starting five for NBA', async () => {
		render(SetupScreen);

		await page.getByRole('button', { name: /NBA Players/ }).click();
		await expect.element(page.getByText('NBA Players roster (locked)')).toBeVisible();

		await page.getByRole('button', { name: /Start the draft/ }).click();

		expect(game.state.config.positional).toBe(true);
		expect(game.state.config.slots).toBe(5);
		expect(game.state.config.roster.map((slot) => slot.label)).toEqual([
			'PG',
			'SG',
			'SF',
			'PF',
			'C'
		]);
		// Every player in a positional deck must carry a position.
		expect(game.state.deck.every((item) => !!item.position)).toBe(true);
	});

	it('shows the adjustable size picker for non-positional categories', async () => {
		render(SetupScreen);

		await page.getByRole('button', { name: /Perfect Life/ }).click();
		await expect.element(page.getByText('Roster slots each')).toBeVisible();

		await page.getByRole('button', { name: '7', exact: true }).click();
		await page.getByRole('button', { name: /Start the draft/ }).click();

		expect(game.state.config.positional).toBe(false);
		expect(game.state.config.slots).toBe(7);
		expect(game.state.deck).toHaveLength(14);
	});

	it('nudges the budget in five-dollar steps within bounds', async () => {
		render(SetupScreen);

		await page.getByRole('button', { name: 'Raise budget by five' }).click();
		await page.getByRole('button', { name: 'Raise budget by five' }).click();
		await page.getByRole('button', { name: /Foods/ }).click();
		await page.getByRole('button', { name: /Start the draft/ }).click();

		expect(game.state.config.budget).toBe(30);
	});
});
