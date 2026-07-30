import { browser } from '$app/environment';
import { applyAction, initialState } from './engine';
import { clearState, loadState, saveState } from './persist';
import type { Action, GameState } from './types';

/**
 * The only seam between the UI and the rulebook.
 *
 * Components never mutate state directly — they read `game.state` and call
 * `game.dispatch(action)`. Because actions are plain serialisable data and the
 * reducer is pure, Tier 2 (real-time 2-device play over Supabase) replaces the
 * body of `dispatch` with "broadcast the action / persist the row" and adds a
 * subscription that calls `replace()` with authoritative state from the server.
 * No component has to change.
 */
class GameStore {
	#state = $state<GameState>(initialState());

	get state(): GameState {
		return this.#state;
	}

	dispatch(action: Action): void {
		this.#commit(applyAction(this.#state, action));
	}

	/** Entry point for state that came from somewhere else (Tier 2: the server). */
	replace(next: GameState): void {
		this.#commit(next);
	}

	/**
	 * Restores an in-progress game after a refresh. Safe to call on the server.
	 *
	 * Wrapped because this runs during hydration: anything thrown here kills the
	 * whole client bundle, leaving the prerendered HTML on screen with no event
	 * handlers — a page that looks fine and ignores every tap. A save we can't
	 * use is never worth that, so it gets dropped and the game starts fresh.
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
