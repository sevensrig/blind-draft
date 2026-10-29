import { openRoster } from '$lib/data/types';
import type { Item } from '$lib/data/types';
import { applyAction, initialState } from '$lib/game/engine';
import type { Action, GameState } from '$lib/game/types';

/**
 * A fixed four-card draft that teaches the rules by playing three bids for real.
 * The deck is hand-picked rather than built, so every step's copy can name the card.
 */

export const TUTOR = 'Coach';

const DECK: Item[] = [
	{ id: 'tut-pizza', name: 'Pizza', tier: 'great' },
	{ id: 'tut-rice', name: 'Plain Rice', tier: 'bad' },
	{ id: 'tut-sushi', name: 'Sushi', tier: 'good' },
	{ id: 'tut-hotdog', name: 'Hot Dog', tier: 'mid' }
];

export const START: Action = {
	type: 'start',
	names: ['You', TUTOR],
	deck: DECK,
	config: {
		budget: 20,
		slots: 2,
		roster: openRoster(2),
		positional: false,
		categoryId: 'tutorial',
		variantId: 'tutorial',
		categoryLabel: 'Tutorial',
		variantLabel: null
	}
};

/** `data-tour` values on the bid screen. Several targets light up as one box. */
export type Target =
	| 'players'
	| 'track'
	| 'card'
	| 'standing'
	| 'dial'
	| 'bid-0'
	| 'bid-1'
	| 'sold'
	| 'stamp'
	| 'next'
	| 'banner'
	| 'claim';

export type Step =
	/** Explains something; the player taps "Got it". */
	| { kind: 'info'; title: string; body: string; target?: Target[] }
	/** Waits for the player to make exactly this move. */
	| { kind: 'do'; title: string; body: string; target: Target[]; expect: Action; hint?: string }
	/** Coach's move, played after a short beat. */
	| { kind: 'tutor'; action: Action };

const bid = (player: 0 | 1, amount: number): Action => ({ type: 'bid', player, amount });

export const STEPS: Step[] = [
	{
		kind: 'info',
		title: 'Welcome to the $20 Draft',
		body: `You and ${TUTOR} each get $20 to fill 2 roster slots. Items come up one at a time, and nobody knows what's next. Let's play a quick one.`
	},
	{
		kind: 'info',
		title: 'Your wallets',
		body: 'Purple is you, yellow is Coach. The big number is money left; the blocks underneath are your roster slots.',
		target: ['players']
	},
	{
		kind: 'info',
		title: 'The deck',
		body: 'Each block is one item. Four items, two slots each — so every item ends up on somebody’s roster.',
		target: ['track']
	},
	{
		kind: 'do',
		title: 'Reveal the first item',
		body: 'Tap the card to flip it.',
		target: ['card'],
		expect: { type: 'reveal' }
	},
	{
		kind: 'info',
		title: 'Pizza is up',
		body: 'No bids yet. There are no turns — whoever wants it can open.',
		target: ['standing']
	},
	{
		kind: 'do',
		title: 'Open the bidding',
		body: 'The dial sets your bid. Tap + twice to make it $3, then tap your button to bid.',
		target: ['dial', 'bid-0'],
		expect: bid(0, 3),
		hint: 'Set the dial to $3 first, then tap “You”.'
	},
	{ kind: 'tutor', action: bid(1, 4) },
	{
		kind: 'info',
		title: 'Coach raised to $4',
		body: 'Coach leads now. Raises go up by at least $1, back and forth, until someone stops.',
		target: ['standing']
	},
	{
		kind: 'do',
		title: 'Raise back',
		body: 'The dial already jumped to $5, the minimum raise. Tap your button.',
		target: ['bid-0'],
		expect: bid(0, 5),
		hint: 'Leave the dial at $5 and tap “You”.'
	},
	{ kind: 'tutor', action: { type: 'sold', player: 1 } },
	{
		kind: 'info',
		title: 'Sold to you for $5',
		body: 'Coach stopped raising and handed it over. $5 came out of your wallet and Pizza filled a slot.',
		target: ['stamp', 'players']
	},
	{
		kind: 'do',
		title: 'Next item',
		body: 'Tap to move on.',
		target: ['next'],
		expect: { type: 'next' }
	},
	{
		kind: 'do',
		title: 'Flip it',
		body: 'Tap the card.',
		target: ['card'],
		expect: { type: 'reveal' }
	},
	{ kind: 'tutor', action: bid(1, 2) },
	{
		kind: 'info',
		title: 'Coach opened at $2',
		body: 'On Plain Rice. Not everything is worth fighting for — money you save now buys something better later.',
		target: ['standing']
	},
	{
		kind: 'do',
		title: 'Let it go',
		body: 'Stop raising and hand it to Coach.',
		target: ['sold'],
		expect: { type: 'sold', player: 0 }
	},
	{
		kind: 'info',
		title: 'That’s the whole game',
		body: 'Spend big now, or save for what might come next. You never know what’s left in the deck.',
		target: ['players']
	},
	{
		kind: 'do',
		title: 'Next item',
		body: 'Tap to move on.',
		target: ['next'],
		expect: { type: 'next' }
	},
	{
		kind: 'do',
		title: 'Flip it',
		body: 'Tap the card.',
		target: ['card'],
		expect: { type: 'reveal' }
	},
	{
		kind: 'do',
		title: 'Sushi — go get it',
		body: 'The chips jump the dial. Tap +5 to make it $6, then bid. “All in” bets everything — there’s no minimum you have to keep.',
		target: ['dial', 'bid-0'],
		expect: bid(0, 6),
		hint: 'Set the dial to $6 (tap +5), then tap “You”.'
	},
	{ kind: 'tutor', action: { type: 'sold', player: 1 } },
	{
		kind: 'info',
		title: 'Your roster is full',
		body: 'Coach let it go for $6. Both your slots are filled with $9 to spare.',
		target: ['stamp', 'players']
	},
	{
		kind: 'do',
		title: 'Last item',
		body: 'Tap to move on.',
		target: ['next'],
		expect: { type: 'next' }
	},
	{
		kind: 'do',
		title: 'Flip it',
		body: 'Tap the card.',
		target: ['card'],
		expect: { type: 'reveal' }
	},
	{
		kind: 'info',
		title: 'No contest',
		body: 'Your roster is full, so Coach gets the rest free. Same if someone goes broke: the other names the price on everything after.',
		target: ['banner']
	},
	{
		kind: 'do',
		title: 'Hand it over',
		body: 'Tap to give Coach the Hot Dog.',
		target: ['claim'],
		expect: { type: 'claim' }
	},
	{
		kind: 'do',
		title: 'Finish the draft',
		body: 'Tap to see the results.',
		target: ['next'],
		expect: { type: 'next' }
	}
];

export function sameAction(a: Action, b: Action): boolean {
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
	return [...keys].every((key) => left[key] === right[key]);
}

/** Every move the script makes, in order, for the test that the draft plays out. */
export function scriptedMoves(): Action[] {
	return STEPS.flatMap((step) =>
		step.kind === 'do' ? [step.expect] : step.kind === 'tutor' ? [step.action] : []
	);
}

export function initialTutorial(): GameState {
	return applyAction(initialState(), START);
}
