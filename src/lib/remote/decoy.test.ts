import { describe, expect, it } from 'vitest';
import { getCategory, getVariant } from '$lib/data';
import { applyAction, initialState } from '$lib/game/engine';
import type { Award } from '$lib/game/types';
import {
	awardEmote,
	DECOY_MODES,
	DECOY_NAMES,
	decoyDeal,
	decoySettings,
	isDecoy,
	makeDecoy,
	offerFor,
	replyEmote,
	settingsOf
} from './decoy';

describe('decoy rooms', () => {
	it('only offers modes and variants that exist', () => {
		for (const mode of DECOY_MODES) {
			const category = getCategory(mode.categoryId);
			expect(category, mode.categoryId).toBeDefined();
			for (const id of mode.variantIds) expect(getVariant(category!, id).id).toBe(id);
		}
	});

	it('lists like a default $20 room under a generic name', () => {
		for (let i = 0; i < 50; i++) {
			const decoy = makeDecoy();
			expect(isDecoy(decoy.listing)).toBe(true);
			expect(decoy.listing.budget).toBe(20);
			expect(decoy.listing.slots).toBe(5);
			expect(DECOY_NAMES).toContain(decoy.hostName);
			expect(DECOY_MODES.map((mode) => mode.categoryId)).toContain(decoy.categoryId);
		}
	});

	it('starts a disguised bot game with the host name on the bot seat', () => {
		for (const mode of DECOY_MODES) {
			for (const variantId of mode.variantIds) {
				const decoy = { ...makeDecoy(), categoryId: mode.categoryId, variantId };
				const state = applyAction(
					initialState(),
					decoyDeal(decoySettings(decoy), ['Sam', decoy.hostName])
				);
				expect(state.phase).toBe('reveal');
				expect(state.players.map((player) => player.name)).toEqual(['Sam', decoy.hostName]);
				expect(state.config).toMatchObject({ bot: 1, disguised: true, budget: 20, slots: 5 });
				expect(state.config.variantId).toBe(variantId);
			}
		}
	});

	it('replaces a room with a different category and host', () => {
		for (let i = 0; i < 50; i++) {
			const first = makeDecoy();
			const next = makeDecoy(Math.random, first);
			expect(next.categoryId).not.toBe(first.categoryId);
			expect(next.hostName).not.toBe(first.hostName);
		}
	});

	it('rematches on the same settings, or on a custom list the player picks', () => {
		const first = applyAction(
			initialState(),
			decoyDeal({ categoryId: 'nba', variantId: 'nba-all-time', budget: 20, slots: 5 }, [
				'Sam',
				'Mike'
			])
		);
		expect(offerFor(settingsOf(first.config), 1)).toMatchObject({
			by: 1,
			categoryId: 'nba',
			variantId: 'nba-all-time',
			variantLabel: 'All-Time'
		});

		const lines = ['Tacos', 'Pizza', 'Sushi', 'Ramen', 'Burgers', 'Pho', 'Curry', 'Pasta'];
		const settings = {
			categoryId: 'custom',
			variantId: 'custom',
			budget: 15,
			slots: 3,
			customName: 'Dinner',
			customItems: lines
		};
		const custom = applyAction(initialState(), decoyDeal(settings, ['Sam', 'Mike']));
		expect(custom.config).toMatchObject({
			categoryLabel: 'Dinner',
			budget: 15,
			slots: 3,
			disguised: true
		});
		expect(custom.deck).toHaveLength(6);
		expect(settingsOf(custom.config).customItems).toEqual(expect.arrayContaining(['Tacos']));
	});

	describe('bot emotes', () => {
		const award = (over: Partial<Award>): Award => ({
			playerId: 1,
			item: { id: 'x', name: 'X', tier: 'great' },
			price: 4,
			free: false,
			mode: 'contest',
			declined: false,
			slotId: 'slot-1',
			slotLabel: '1',
			...over
		});
		const always = () => 0;
		const never = () => 0.99;

		it('gloats over a good card it bought and sulks when the player takes one', () => {
			expect(awardEmote(award({}), 1, always)).toBe('happy');
			expect(awardEmote(award({ playerId: 0 }), 1, always)).toBe('mad');
		});

		it('laughs at the player overpaying for a dud, and says nothing about free cards', () => {
			const dud = { id: 'y', name: 'Y', tier: 'bad' as const };
			expect(awardEmote(award({ playerId: 0, item: dud, price: 8 }), 1, always)).toBe('laugh');
			expect(awardEmote(award({ playerId: 0, item: dud, price: 2 }), 1, always)).toBeNull();
			expect(awardEmote(award({ free: true }), 1, always)).toBeNull();
		});

		it('keeps quiet most of the time', () => {
			expect(awardEmote(award({}), 1, never)).toBeNull();
			expect(replyEmote('laugh', never)).toBeNull();
			expect(replyEmote('laugh', always)).toBe('laugh');
			expect(replyEmote('bid', always)).toBeNull();
		});
	});
});
