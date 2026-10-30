import { describe, expect, it } from 'vitest';
import { applyAction, itemMode } from '$lib/game/engine';
import { STEPS, initialTutorial, sameAction, scriptedMoves } from './script';

describe('tutorial script', () => {
	it('plays out as a legal draft, every move landing', () => {
		let state = initialTutorial();
		for (const move of scriptedMoves()) {
			const next = applyAction(state, move);
			expect(next, JSON.stringify(move)).not.toBe(state);
			state = next;
		}
		expect(state.phase).toBe('results');
		expect(state.players.map((player) => player.money)).toEqual([9, 18]);
	});

	it('teaches the free award by reaching a forced item', () => {
		let state = initialTutorial();
		const moves = scriptedMoves();
		for (const move of moves.slice(
			0,
			moves.findIndex((m) => m.type === 'claim')
		)) {
			state = applyAction(state, move);
		}
		expect(itemMode(state)).toBe('forced');
	});

	it('has the player do something, not just read', () => {
		expect(STEPS.filter((step) => step.kind === 'do' && step.expect.type === 'bid')).toHaveLength(
			3
		);
	});

	it('matches actions by every field', () => {
		expect(
			sameAction({ type: 'bid', player: 0, amount: 3 }, { type: 'bid', player: 0, amount: 3 })
		).toBe(true);
		expect(
			sameAction({ type: 'bid', player: 0, amount: 4 }, { type: 'bid', player: 0, amount: 3 })
		).toBe(false);
		expect(sameAction({ type: 'sold', player: 1 }, { type: 'sold', player: 0 })).toBe(false);
	});
});
