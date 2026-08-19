import type { Item } from '$lib/data/types';
import type { GameState } from '$lib/game/types';
import type { PublicGameState } from './types';

/**
 * Turns the server's redacted view into the shape the screens already expect.
 *
 * The screens read a `GameState`, which has a `deck`. A remote client is never
 * told the deck — that is the entire point of the server being authoritative —
 * so the deck is reconstructed as a list of the right length holding only the
 * card that has actually been turned over.
 *
 * The filler entries are never rendered: the face-down branch draws a card back
 * without reading the item, and every other screen reads `currentItem`, which
 * lands on the revealed slot. They exist so `deck.length` and `index` still mean
 * what the components think they mean, which is what lets local and remote share
 * one set of components instead of two.
 */
export function toGameState(view: PublicGameState): GameState {
	const index = Math.max(0, view.itemNumber - 1);
	/*
	 * Each filler needs its own id. The progress track is a keyed `each` over the
	 * deck, and reusing one sentinel object made every key identical, which Svelte
	 * rejects outright — the whole board failed to render.
	 */
	const deck: Item[] = Array.from({ length: view.deckSize }, (_, i) => ({
		id: `hidden-${i}`,
		name: '',
		tier: 'mid' as const
	}));
	if (view.item) deck[index] = view.item;

	return {
		phase: view.phase,
		config: view.config,
		players: view.players,
		bid: view.bid,
		freeTurn: view.freeTurn,
		lastAward: view.lastAward,
		history: view.history,
		deck,
		index
	};
}
