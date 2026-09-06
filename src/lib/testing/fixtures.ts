import { openRoster } from '$lib/data/types';
import type { Item, SlotSpec } from '$lib/data/types';
import {
	applyAction,
	canReceive,
	currentItem,
	defaultConfig,
	initialState,
	itemMode,
	other,
	solventPlayer
} from '$lib/game/engine';
import type { GameState, Player, PlayerId } from '$lib/game/types';

/**
 * Game states for component and a11y tests, built by running real actions
 * through the reducer — so a fixture can't describe an impossible state. Only
 * wallets are poked directly.
 */

const item = (id: string, name: string): Item => ({ id, name, tier: 'mid' });

export interface GameOptions {
	slots?: number;
	budget?: number;
	names?: [string, string];
	roster?: SlotSpec[];
	deck?: Item[];
}

/** A game sitting on the first face-down card. */
export function startedGame({
	slots = 3,
	budget = 20,
	names = ['Ann', 'Bo'],
	roster,
	deck
}: GameOptions = {}): GameState {
	const template = roster ?? openRoster(slots);
	const cards =
		deck ??
		Array.from({ length: template.length * 2 }, (_, i) => item(`item-${i}`, `Item ${i + 1}`));

	return applyAction(initialState(), {
		type: 'start',
		deck: cards,
		names,
		config: {
			...defaultConfig(),
			budget,
			slots: template.length,
			roster: template,
			positional: template.some((slot) => slot.drafts !== null),
			categoryId: 'foods',
			variantId: 'foods',
			categoryLabel: 'Foods',
			variantLabel: null
		}
	});
}

const reveal = (state: GameState): GameState => applyAction(state, { type: 'reveal' });

/** The only shortcut these fixtures take. */
function withMoney(state: GameState, money: [number, number]): GameState {
	const players = state.players.map((player, i) => ({ ...player, money: money[i] })) as [
		Player,
		Player
	];
	return { ...state, players };
}

/** Both players solvent, card face-up, no bids yet. */
export function contested(options?: GameOptions): GameState {
	return reveal(startedGame(options));
}

/** `holder` has a standing bid of `amount`. */
export function withStandingBid(state: GameState, holder: PlayerId, amount: number): GameState {
	return applyAction(state, { type: 'bid', player: holder, amount });
}

/** One player at $0 with slots left, so the solvent one names a price (rule 7). */
export function brokeFallback(options?: GameOptions): GameState {
	return reveal(withMoney(startedGame(options), [20, 0]));
}

/** Both at $0, so the rest go out free and alternating (rule 8). */
export function bothBrokeFallback(options?: GameOptions): GameState {
	return reveal(withMoney(startedGame(options), [0, 0]));
}

/**
 * Played through to the results screen, with a mix of paid and free picks.
 * Handles every rule, not just contested bidding — a bid-only loop stalls once a
 * wallet empties or a roster fills.
 */
export function finishedGame(options?: GameOptions): GameState {
	let state = startedGame(options);
	let turn: PlayerId = 0;

	for (let guard = 0; guard < 500 && state.phase !== 'results'; guard++) {
		if (state.phase === 'reveal') {
			state = applyAction(state, { type: 'reveal' });
			continue;
		}
		if (state.phase === 'award') {
			state = applyAction(state, { type: 'next' });
			continue;
		}

		const mode = itemMode(state);
		if (mode === 'contest') {
			// Alternate winners at differing prices so totals are worth asserting on.
			const bidder = canReceive(state, turn, currentItem(state)!) ? turn : other(turn);
			state = applyAction(state, { type: 'bid', player: bidder, amount: bidder === 0 ? 3 : 2 });
			state = applyAction(state, { type: 'sold', player: other(bidder) });
			turn = other(bidder);
		} else if (mode === 'solo') {
			// Buy some, pass on others, so the sheet shows both paid and free picks.
			const seller = solventPlayer(state);
			state =
				guard % 2 === 0
					? applyAction(state, { type: 'buy', player: seller, amount: 1 })
					: applyAction(state, { type: 'decline', player: seller });
		} else {
			state = applyAction(state, { type: 'claim' });
		}
	}

	if (state.phase !== 'results') throw new Error('fixture never reached the results screen');
	return state;
}
