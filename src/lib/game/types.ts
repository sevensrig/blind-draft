import type { Item, SlotSpec } from '$lib/data/types';

export type PlayerId = 0 | 1;

export interface RosterEntry {
	item: Item;
	price: number;
	/** Awarded without money changing hands (fallback rules 7, 8, or a full roster). */
	free: boolean;
	/** Which `config.roster` slot this filled. */
	slotId: string;
}

export interface Player {
	id: PlayerId;
	name: string;
	money: number;
	roster: RosterEntry[];
}

export interface GameConfig {
	budget: number;
	/** Always equals `roster.length`; kept for readouts. */
	slots: number;
	/**
	 * The slot template both players fill. Positional categories supply their
	 * own; the rest get generated open slots, so there is only one code path.
	 */
	roster: SlotSpec[];
	/** True when slots are position-gated, which locks the roster size. */
	positional: boolean;
	categoryId: string;
	variantId: string;
	/** Denormalised so the results card renders without a content lookup. */
	categoryLabel: string;
	/** Null when the category has no sub-modes. */
	variantLabel: string | null;
}

export type Phase = 'setup' | 'reveal' | 'resolve' | 'award' | 'results';

/**
 * How the current item has to be resolved. Always derived from state via
 * `itemMode()` — never stored, so it can't drift out of sync.
 *
 * - `contest`   both solvent and both need slots: free-for-all bidding, no turn order
 * - `solo`      one player is at $0: the solvent one names a price or passes
 * - `alternate` both at $0: awarded free, strictly alternating
 * - `forced`    one roster is already full: the other player takes the rest free
 */
export type ItemMode = 'contest' | 'solo' | 'alternate' | 'forced';

export interface Bid {
	amount: number;
	holder: PlayerId;
}

export interface Award {
	playerId: PlayerId;
	item: Item;
	price: number;
	free: boolean;
	mode: ItemMode;
	/** The solvent player passed, so the broke player got it for nothing. */
	declined: boolean;
	slotId: string;
	/** Denormalised so the award banner doesn't need a template lookup. */
	slotLabel: string;
}

export interface GameState {
	phase: Phase;
	config: GameConfig;
	players: [Player, Player];
	deck: Item[];
	/** Index into `deck` of the item currently in play. */
	index: number;
	bid: Bid | null;
	/** Alternation pointer for the both-broke endgame (rule 8). */
	freeTurn: PlayerId;
	/** The award being celebrated during the `award` phase. */
	lastAward: Award | null;
	history: Award[];
}

/**
 * Every mutation the game supports. Actions are plain serialisable data on
 * purpose: Tier 2 can ship these over a Supabase channel unchanged.
 */
export type Action =
	| { type: 'start'; config: GameConfig; names: [string, string]; deck: Item[] }
	| { type: 'reveal' }
	/** Opens the bidding, or raises a standing bid. */
	| { type: 'bid'; player: PlayerId; amount: number }
	/** Nobody raises — the standing bid wins. */
	| { type: 'sold' }
	/** `solo` mode: the solvent player names a price and takes it. */
	| { type: 'buy'; player: PlayerId; amount: number }
	/** `solo` mode: the solvent player passes, broke player gets it free. */
	| { type: 'decline'; player: PlayerId }
	/** `alternate` / `forced` mode: confirm the free award. */
	| { type: 'claim' }
	/** Move the just-won item into a different open slot (e.g. Shaq at PG). */
	| { type: 'assign'; slotId: string }
	/** Leave the award celebration and reveal the next item (or finish). */
	| { type: 'next' }
	| { type: 'reset' };
