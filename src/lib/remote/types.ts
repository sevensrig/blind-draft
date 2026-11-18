import type { GameState } from '$lib/game/types';
import type { EmoteId } from './emotes';

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
	/** Seats filled: the lobby so far, or everyone playing. */
	seatsTaken: number;
	/** The room's size. Absent from rooms made before lobbies, which held two. */
	maxPlayers?: number;
	/** `room_players` ids by seat, so a device can find its seat after the lobby closes up. */
	seatIds?: string[];
	lobbyRev?: number;
	/** Null while the card is face down. */
	item: GameState['deck'][number] | null;
}

/** A pending rematch, as `game_public.rematch` shows it. */
export interface RematchOffer {
	by: number;
	categoryId: string;
	variantId: string;
	categoryLabel: string;
	variantLabel: string | null;
	budget: number;
	slots: number;
}

/** What a player picks for a new room or a rematch. */
export interface RoomSettings {
	categoryId: string;
	variantId: string;
	budget: number;
	slots: number;
	customName?: string;
	customItems?: string[];
}

export interface RoomListing {
	room_id: string;
	category_label: string;
	variant_label: string | null;
	budget: number;
	slots: number;
	/** Absent on the rooms browser's fake room. */
	max_players?: number;
	players?: number;
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

/** A row of `chat_messages`, as a player may read it. */
export interface ChatMessage {
	id: number;
	seat: number;
	body: string;
}

export interface EmoteEvent {
	key: number;
	seat: number;
	emote: EmoteId;
}
