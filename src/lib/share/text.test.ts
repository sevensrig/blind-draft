import { describe, expect, it } from 'vitest';
import { finishedGame } from '$lib/testing/fixtures';
import { SHARE_HOST, orderedPicks, shareText } from './text';

describe('shareText', () => {
	it('headlines the category and budget, then one line per player, then the link', () => {
		const state = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
		const lines = shareText(state).split('\n');

		expect(lines[0]).toBe('$20 Draft · Foods · $20 each');
		expect(lines[1].startsWith('Sri: ')).toBe(true);
		expect(lines[2].startsWith('Alex: ')).toBe(true);
		expect(lines[3]).toBe(`Who won? Play: ${SHARE_HOST}`);
	});

	it('lists every pick with its price in roster order', () => {
		const state = finishedGame({ slots: 3, names: ['Sri', 'Alex'] });
		const text = shareText(state);

		for (const player of state.players) {
			const expected = orderedPicks(state, player.id)
				.map((entry) => `${entry.item.name} ${entry.free ? 'Free' : `$${entry.price}`}`)
				.join(', ');
			expect(text).toContain(`${player.name}: ${expected}`);
		}
	});

	it('says Free rather than $0', () => {
		const [, ...rosters] = shareText(finishedGame({ slots: 2, budget: 0 })).split('\n');
		expect(rosters.join('\n')).toContain('Free');
		expect(rosters.join('\n')).not.toContain('$0');
	});

	it('names the variant when there is one', () => {
		const state = finishedGame({ slots: 3 });
		state.config = { ...state.config, categoryLabel: 'NBA', variantLabel: 'All-Time' };
		expect(shareText(state)).toMatch(/^\$20 Draft · NBA \(All-Time\) · \$20 each/);
	});

	it('links the bare domain, never a room', () => {
		expect(SHARE_HOST).toBe('20dollardraftgame.com');
	});
});
