import type { GameState } from './vendor/game/types.ts';
import { currentItem } from './vendor/game/engine.ts';

/**
 * Strips the authoritative state down to what a player is allowed to see.
 *
 * This is the single most important function in the remote build. `GameState`
 * carries the whole shuffled deck, and the game only works because nobody knows
 * what is coming — so the deck never leaves the server. Everything a client
 * needs is derived here, and the result is what lands in `game_public`, which
 * is the only game table clients can read or subscribe to.
 *
 * The revealed item is included only once it has actually been turned over. In
 * the `reveal` phase the card is still face down, so sending it would hand the
 * answer to anyone with dev tools open.
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
	 * How many seats are filled, 1 or 2.
	 *
	 * Can't be inferred from the state: a new game is seeded with a placeholder
	 * name for player two, so "has a name" is true before anyone has joined. The
	 * client needs the real occupancy to know whether to show a lobby.
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
