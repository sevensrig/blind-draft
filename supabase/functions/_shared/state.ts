import type { GameConfig, GameState } from './vendor/game/types.ts';
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
	/** Seats filled. In the lobby that's the players listed so far. */
	seatsTaken: number;
	/** The room's size: the lobby starts itself once this many have joined. */
	maxPlayers: number;
	/** `room_players` ids by seat, so a device finds its seat after the lobby closes up. */
	seatIds?: string[];
	/** Lobby only: orders lobby writes, see `write_lobby`. */
	lobbyRev?: number;
	/** Null while the card is face down. */
	item: ReturnType<typeof currentItem>;
}

/** Server-only extras carried in `games.state` beside the engine's fields. */
export type ServerState = GameState & { seatIds?: string[]; maxPlayers?: number };

export function redact(state: ServerState): PublicGameState {
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
		seatsTaken: state.players.length,
		maxPlayers: state.maxPlayers ?? state.players.length,
		...(state.seatIds ? { seatIds: state.seatIds } : {}),
		item: faceDown ? null : currentItem(state)
	};
}

export interface LobbySeat {
	id: string;
	seat: number;
	name: string;
}

/** A lobby as players see it: the settings and who has sat down, no deck yet. */
export function lobbyView(
	config: GameConfig,
	seats: LobbySeat[],
	maxPlayers: number,
	rev: number
): PublicGameState {
	return {
		phase: 'setup',
		config,
		players: seats.map((seat, id) => ({ id, name: seat.name, money: config.budget, roster: [] })),
		bid: null,
		freeTurn: 0,
		lastAward: null,
		history: [],
		itemNumber: 0,
		deckSize: 0,
		seatsTaken: seats.length,
		maxPlayers,
		seatIds: seats.map((seat) => seat.id),
		lobbyRev: rev,
		item: null
	};
}
