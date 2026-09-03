import type { Item } from '$lib/data/types';
import type { GameState } from '$lib/game/types';
import type { PublicGameState } from './types';

/**
 * Turns the server's redacted view into the `GameState` the screens expect.
 *
 * A client is never told the deck, so it's rebuilt at the right length holding
 * only the revealed card. The fillers are never rendered — they exist so
 * `deck.length` and `index` still mean what the components think they mean,
 * which is what lets local and remote share one set of components.
 */
export function toGameState(view: PublicGameState): GameState {
	const index = Math.max(0, view.itemNumber - 1);
	// Each filler needs its own id: the progress track is a keyed `each`, and
	// duplicate keys make Svelte refuse to render the board at all.
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
