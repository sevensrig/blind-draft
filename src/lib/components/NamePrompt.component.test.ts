import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { expectNoViolations } from '$lib/testing/axe';
import NamePrompt from './NamePrompt.svelte';

/**
 * The join-a-room name prompt. Tested here because both callers reach it from a
 * live server, so E2E only sees it with two devices and Supabase up.
 */
describe('NamePrompt', () => {
	const props = {
		eyebrow: "You're invited",
		heading: "Who's playing?",
		sub: 'Your opponent sees this name on the board.'
	};

	beforeEach(() => {
		localStorage.clear();
	});

	it('refuses to submit an empty name', async () => {
		const submit = vi.fn();
		render(NamePrompt, { ...props, value: '', submit });

		const button = page.getByRole('button', { name: /Join the draft/ });
		await expect.element(button).toBeDisabled();
		expect(submit).not.toHaveBeenCalled();
	});

	/* Whitespace is the same nothing as an empty field — the server would fall
	   back to naming the seat "Player 2" either way. */
	it('treats a whitespace name as empty', async () => {
		const submit = vi.fn();
		render(NamePrompt, { ...props, value: '   ', submit });

		await expect.element(page.getByRole('button', { name: /Join the draft/ })).toBeDisabled();
		expect(submit).not.toHaveBeenCalled();
	});

	it('submits once a name is typed', async () => {
		const submit = vi.fn();
		render(NamePrompt, { ...props, value: '', submit });

		await page.getByLabelText('Your name').fill('Alex');
		await page.getByRole('button', { name: /Join the draft/ }).click();

		expect(submit).toHaveBeenCalledTimes(1);
	});

	it('holds the typed name and shows the failure when a join is refused', async () => {
		render(NamePrompt, {
			...props,
			value: 'Alex',
			error: 'Someone took that seat first.',
			submit: () => {}
		});

		await expect.element(page.getByRole('alert')).toHaveTextContent(/took that seat first/);
		// The name survives a failed attempt, so a lost race costs one tap.
		await expect.element(page.getByLabelText('Your name')).toHaveValue('Alex');
	});

	it('blocks a second submit while the first is in flight', async () => {
		const submit = vi.fn();
		render(NamePrompt, { ...props, value: 'Alex', busy: true, submit });

		await expect.element(page.getByRole('button', { name: /Joining/ })).toBeDisabled();
		expect(submit).not.toHaveBeenCalled();
	});

	it('is accessible', async () => {
		render(NamePrompt, { ...props, value: '', submit: () => {} });
		await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expectNoViolations();
	});
});
