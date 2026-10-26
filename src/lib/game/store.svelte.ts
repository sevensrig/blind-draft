import { browser } from '$app/environment';
import { localMode, trackTransition } from '$lib/analytics';
import { botAction } from './bot';
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
	#botTimer: ReturnType<typeof setTimeout> | undefined;
	/** Bids on the card on the block, so the bot can feel a bidding war. Lost on reload. */
	#raises = 0;

	get state(): GameState {
		return this.#state;
	}

	dispatch(action: Action): void {
		const next = applyAction(this.#state, action);
		if (next.index !== this.#state.index || next.phase !== 'resolve') this.#raises = 0;
		else if (action.type === 'bid' && next !== this.#state) this.#raises++;
		this.#commit(next);
	}

	/** Entry point for state that came from somewhere else (the server, a test). */
	replace(next: GameState): void {
		this.#raises = 0;
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
			this.#scheduleBot();
		} catch (error) {
			console.warn('[blind-draft] discarding unreadable saved game', error);
			clearState();
			this.#state = initialState();
		}
	}

	#commit(next: GameState): void {
		// Both sides: a quit lands on setup, which has no bot in its config.
		trackTransition(this.#state, next, localMode(this.#state.config, next.config));
		this.#state = next;
		if (!browser) return;
		if (next.phase === 'setup') clearState();
		else saveState(next);
		this.#scheduleBot();
	}

	/** Any new state cancels the pending move and asks again. */
	#scheduleBot(): void {
		clearTimeout(this.#botTimer);
		const seat = this.#state.config.bot;
		if (seat === undefined) return;
		const move = botAction(this.#state, seat, { raises: this.#raises });
		if (move) this.#botTimer = setTimeout(() => this.dispatch(move.action), move.delay);
	}
}

export const game = new GameStore();
