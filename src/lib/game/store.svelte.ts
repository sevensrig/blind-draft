import { browser } from '$app/environment';
import { applyAction, initialState } from './engine';
import { clearState, loadState, saveState } from './persist';
import type { Action, GameState } from './types';

/**
 * The only seam between the UI and the rulebook. Components never mutate state —
 * they read `game.state` and dispatch actions. `$lib/remote/room.svelte.ts` is
 * the same seam over the wire.
 */
class GameStore {
	#state = $state<GameState>(initialState());

	get state(): GameState {
		return this.#state;
	}

	dispatch(action: Action): void {
		this.#commit(applyAction(this.#state, action));
	}

	/** Entry point for state that came from somewhere else (the server, a test). */
	replace(next: GameState): void {
		this.#commit(next);
	}

	/**
	 * Restores an in-progress game after a refresh. Safe to call on the server.
	 *
	 * Wrapped because this runs during hydration, where a throw kills the client
	 * bundle and leaves a page that looks fine and ignores every tap.
	 */
	hydrate(): void {
		if (!browser) return;
		try {
			const saved = loadState();
			if (saved && saved.phase !== 'setup') this.#state = saved;
		} catch (error) {
			console.warn('[blind-draft] discarding unreadable saved game', error);
			clearState();
			this.#state = initialState();
		}
	}

	#commit(next: GameState): void {
		this.#state = next;
		if (!browser) return;
		if (next.phase === 'setup') clearState();
		else saveState(next);
	}
}

export const game = new GameStore();
