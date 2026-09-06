import type { GameState } from './vendor/game/types.ts';
import { currentItem } from './vendor/game/engine.ts';

/**
 * Strips the authoritative state down to what a player may see. `GameState`
 * carries the whole shuffled deck and the game only works because nobody knows
 * what's coming, so this is what lands in `game_public` — the only game table
 * clients can read.
 *
 * The item is included only once it has actually been turned over: in `reveal`
 * the card is face down, so sending it hands the answer to anyone with dev tools.
 */
export interface PublicGameState {
	phase: GameState['phase'];
	config: GameState['config'];
	players: GameState['players'];
	bid: GameState['bid'];
	freeTurn: GameState['freeTurn'];
	lastAward: GameState['lastAward'];
	history: GameState['history'];
	/** 1-based position in the deck, for the "Item 3 of 10" readout. */
	itemNumber: number;
	deckSize: number;
	/**
	 * Can't be inferred from the state: a new game seeds a placeholder name for
	 * player two, so "has a name" is true before anyone joins.
	 */
	seatsTaken: number;
	/** Null while the card is face down. */
	item: ReturnType<typeof currentItem>;
}

export function redact(state: GameState, seatsTaken: number): PublicGameState {
	const faceDown = state.phase === 'reveal';
	return {
		phase: state.phase,
		config: state.config,
		players: state.players,
		bid: state.bid,
		freeTurn: state.freeTurn,
		lastAward: state.lastAward,
		history: state.history,
		itemNumber: Math.min(state.index + 1, state.deck.length),
		deckSize: state.deck.length,
		seatsTaken,
		item: faceDown ? null : currentItem(state)
	};
}
