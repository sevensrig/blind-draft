import type { GameState } from '$lib/game/types';

/**
 * Mirrors `redact()` in `supabase/functions/_shared/state.ts`. The missing `deck`
 * field is the point: `item` is the only card a client ever knows about.
 */
export interface PublicGameState {
	phase: GameState['phase'];
	config: GameState['config'];
	players: GameState['players'];
	bid: GameState['bid'];
	freeTurn: GameState['freeTurn'];
	lastAward: GameState['lastAward'];
	history: GameState['history'];
	itemNumber: number;
	deckSize: number;
	/** 1 while waiting in the lobby, 2 once the game is on. */
	seatsTaken: number;
	/** Null while the card is face down. */
	item: GameState['deck'][number] | null;
}

export interface RoomListing {
	room_id: string;
	category_label: string;
	variant_label: string | null;
	budget: number;
	slots: number;
	created_at: string;
}

export type ConnectionStatus =
	| 'idle'
	| 'connecting'
	| 'waiting'
	| 'live'
	/** Presence dropped: probably a tunnel, possibly a quit. Recoverable. */
	| 'opponent-away'
	/** Someone pressed quit. Terminal — the server has closed the room. */
	| 'ended'
	| 'error';
