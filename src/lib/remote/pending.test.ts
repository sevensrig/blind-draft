import { describe, expect, it } from 'vitest';
import { currentItem } from '$lib/game/engine';
import type { GameState } from '$lib/game/types';
import { contested, finishedGame, withStandingBid } from '$lib/testing/fixtures';
import {
	alreadyDone,
	believable,
	landed,
	readAnnouncement,
	readRevealAnnouncement,
	withBid
} from './pending';
import type { PublicGameState } from './types';

/** What a client is sent: `redact()` in the Edge Functions, minus the deck. */
function publicView(state: GameState): PublicGameState {
	return {
		phase: state.phase,
		config: state.config,
		players: state.players,
		bid: state.bid,
		freeTurn: state.freeTurn,
		lastAward: state.lastAward,
		history: state.history,
		itemNumber: state.index + 1,
		deckSize: state.deck.length,
		seatsTaken: 2,
		item: currentItem(state)
	};
}

describe('readAnnouncement', () => {
	it('reads a well-formed announcement', () => {
		expect(readAnnouncement({ player: 1, amount: 3, version: 7 })).toEqual({
			player: 1,
			amount: 3,
			base: 7
		});
	});

	it('refuses anything else, since any browser in the room can send one', () => {
		for (const junk of [
			null,
			'bid',
			{ player: 2, amount: 3, version: 7 },
			{ player: '1', amount: 3, version: 7 },
			{ player: 1, amount: 2.5, version: 7 },
			{ player: 1, amount: 3 },
			{ player: 1, amount: 3, version: '7' }
		]) {
			expect(readAnnouncement(junk)).toBeNull();
		}
	});
});

describe('believable', () => {
	const view = publicView(contested());

	it('takes a legal bid from the other seat on the state we see', () => {
		expect(believable(view, 4, 0, { player: 1, amount: 3, base: 4 })).toBe(true);
	});

	it('ignores our own seat: we already show our bids', () => {
		expect(believable(view, 4, 0, { player: 0, amount: 3, base: 4 })).toBe(false);
	});

	it('ignores a bid placed on a state we have moved past, or not reached', () => {
		expect(believable(view, 4, 0, { player: 1, amount: 3, base: 3 })).toBe(false);
		expect(believable(view, 4, 0, { player: 1, amount: 3, base: 5 })).toBe(false);
	});

	it('ignores a bid the rules would refuse', () => {
		const standing = publicView(withStandingBid(contested(), 0, 5));
		// Not above the standing bid.
		expect(believable(standing, 4, 0, { player: 1, amount: 5, base: 4 })).toBe(false);
		// More than they have.
		expect(believable(view, 4, 0, { player: 1, amount: 999, base: 4 })).toBe(false);
		// Not an auction any more.
		expect(believable(publicView(finishedGame()), 4, 0, { player: 1, amount: 1, base: 4 })).toBe(
			false
		);
	});
});

describe('withBid', () => {
	it('draws the bid as standing', () => {
		const view = publicView(contested());
		expect(withBid(view, { player: 1, amount: 3, base: 4 }).bid).toEqual({ amount: 3, holder: 1 });
		// The confirmed state underneath is left alone.
		expect(view.bid).toBeNull();
	});

	it('leaves a state alone once the auction is over', () => {
		const done = publicView(finishedGame());
		expect(withBid(done, { player: 1, amount: 3, base: 4 })).toBe(done);
	});
});

describe('landed', () => {
	const bid = { player: 1 as const, amount: 3, base: 4 };

	it('is true only when the server shows exactly that bid standing', () => {
		expect(landed(publicView(withStandingBid(contested(), 1, 3)), bid)).toBe(true);
		expect(landed(publicView(withStandingBid(contested(), 1, 4)), bid)).toBe(false);
		expect(landed(publicView(withStandingBid(contested(), 0, 3)), bid)).toBe(false);
		expect(landed(publicView(contested()), bid)).toBe(false);
		expect(landed(null, bid)).toBe(false);
	});
});

describe('readRevealAnnouncement', () => {
	it('reads the version and refuses anything else', () => {
		expect(readRevealAnnouncement({ version: 7 })).toBe(7);
		for (const junk of [null, 7, {}, { version: '7' }, { version: 7.5 }]) {
			expect(readRevealAnnouncement(junk)).toBeNull();
		}
	});
});

describe('alreadyDone', () => {
	const live = contested();
	const facedown = publicView({ ...live, phase: 'reveal', bid: null });
	const faceUp = publicView(live);
	const nextCard = publicView({ ...live, phase: 'reveal', index: live.index + 1, bid: null });

	it('counts a reveal beaten by the other tap as done', () => {
		expect(alreadyDone({ type: 'reveal' }, facedown, faceUp)).toBe(true);
	});

	it('still reports a reveal that lost to something else', () => {
		// The card is still face down: whatever won, it wasn't a reveal.
		expect(alreadyDone({ type: 'reveal' }, facedown, facedown)).toBe(false);
		// A different card: this tap was for one that's gone.
		expect(alreadyDone({ type: 'reveal' }, faceUp, nextCard)).toBe(false);
	});

	it('counts a "next" beaten by the other tap as done', () => {
		expect(alreadyDone({ type: 'next' }, faceUp, nextCard)).toBe(true);
		expect(alreadyDone({ type: 'next' }, faceUp, publicView(finishedGame()))).toBe(true);
		expect(alreadyDone({ type: 'next' }, faceUp, faceUp)).toBe(false);
	});

	it('never hides a lost bid', () => {
		expect(alreadyDone({ type: 'bid', player: 0, amount: 2 }, faceUp, faceUp)).toBe(false);
		expect(alreadyDone({ type: 'reveal' }, null, faceUp)).toBe(false);
	});
});
