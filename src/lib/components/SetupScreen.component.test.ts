import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import { game } from '$lib/game/store.svelte';
import SetupScreen from './SetupScreen.svelte';

/**
 * The setup screen turns taps into a valid `start` action, so these assert on
 * the resulting game state rather than on internal component state.
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

describe('SetupScreen — custom category', () => {
	beforeEach(() => {
		localStorage.clear();
		game.dispatch({ type: 'reset' });
	});

	const SIX = 'Pizza\nSushi\nTacos\nRamen\nBurgers\nWings';

	it('drafts from a typed list and uses the typed category name', async () => {
		render(SetupScreen);

		await page.getByRole('button', { name: /Make Your Own/ }).click();
		await page.getByPlaceholder('Custom Draft').fill('Late Night Food');
		await page.getByRole('textbox', { name: /one per line/i }).fill(SIX);
		await page.getByRole('button', { name: '3', exact: true }).click();
		await page.getByRole('button', { name: /Start the draft/ }).click();

		const state = game.state;
		expect(state.phase).toBe('reveal');
		expect(state.config.categoryLabel).toBe('Late Night Food');
		expect(state.config.slots).toBe(3);
		expect(state.deck).toHaveLength(6);
		expect(state.deck.map((item) => item.name).sort()).toEqual(
			['Burgers', 'Pizza', 'Ramen', 'Sushi', 'Tacos', 'Wings'].sort()
		);
		// The pool travels with the game so "run it back" doesn't need the form.
		expect(state.config.customItems).toHaveLength(6);
	});

	it('will not start until there are enough options', async () => {
		render(SetupScreen);

		await page.getByRole('button', { name: /Make Your Own/ }).click();
		await page.getByRole('textbox', { name: /one per line/i }).fill('Pizza\nSushi');

		await expect.element(page.getByText(/2\/6 options/)).toBeVisible();
		// The dock appears but refuses — there's nothing to draft from yet.
		await expect.element(page.getByRole('button', { name: /Add more options/ })).toBeDisabled();
		expect(game.state.phase).toBe('setup');

		await page.getByRole('textbox', { name: /one per line/i }).fill(SIX);
		await page.getByRole('button', { name: /Start the draft/ }).click();
		expect(game.state.phase).toBe('reveal');
	});

	it('ignores blank lines and repeats', async () => {
		render(SetupScreen);

		await page.getByRole('button', { name: /Make Your Own/ }).click();
		await page
			.getByRole('textbox', { name: /one per line/i })
			.fill('Pizza\n\n  Sushi  \nTacos\npizza\nRamen\nBurgers\nWings\n\n');

		// Seven non-blank lines, one of which repeats 'Pizza' in another case.
		await expect.element(page.getByText(/6 options/)).toBeVisible();
		await page.getByRole('button', { name: /Start the draft/ }).click();

		const names = game.state.config.customItems?.map((item) => item.name) ?? [];
		expect(names).toContain('Sushi');
		expect(names.filter((n) => n.toLowerCase() === 'pizza')).toHaveLength(1);
	});

	it('remembers the typed list across a remount', async () => {
		render(SetupScreen);
		await page.getByRole('button', { name: /Make Your Own/ }).click();
		await page.getByPlaceholder('Custom Draft').fill('Snack Draft');
		await page.getByRole('textbox', { name: /one per line/i }).fill(SIX);
		cleanup();

		render(SetupScreen);
		await page.getByRole('button', { name: /Make Your Own/ }).click();
		await expect.element(page.getByPlaceholder('Custom Draft')).toHaveValue('Snack Draft');
		await expect.element(page.getByRole('textbox', { name: /one per line/i })).toHaveValue(SIX);
	});
});
