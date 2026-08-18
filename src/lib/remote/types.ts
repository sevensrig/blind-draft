import type { GameState } from '$lib/game/types';

/**
 * What the server is willing to tell a client about a game.
 *
 * Mirrors `redact()` in `supabase/functions/_shared/state.ts`. The absence of a
 * `deck` field here is the whole point: the shuffled order stays on the server,
 * so `item` is the only card a client ever knows about, and only once it has
 * been turned over.
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
	| 'opponent-away'
	| 'error';
