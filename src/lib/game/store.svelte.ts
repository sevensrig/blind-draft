import { browser } from '$app/environment';
import { localMode, trackTransition } from '$lib/analytics';
import { botAction } from './bot';
import { applyAction, initialState } from './engine';
import { clearState, isExpired, loadSave, saveState, tabId } from './persist';
import type { Save } from './persist';
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
	/** When the game on screen last saved. Null while nothing is saved. */
	#savedAt: number | null = null;
	/** A saved game found in a freshly opened tab, waiting on Resume or New game. */
	#pending = $state<Save | null>(null);

	get state(): GameState {
		return this.#state;
	}

	get pending(): GameState | null {
		return this.#pending?.state ?? null;
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
	hydrate({ ask = true }: { ask?: boolean } = {}): void {
		if (!browser) return;
		try {
			const save = loadSave();
			if (save && save.state.phase !== 'setup') {
				// This tab's own game picks straight back up. One left by another tab
				// asks first: it may not be the game this person meant to come back to.
				const tab = tabId();
				const ours = tab === null || save.tab === tab;
				if (ours || !ask) {
					this.#state = save.state;
					this.#savedAt = save.savedAt;
				} else {
					this.#pending = save;
				}
			}
			this.#scheduleBot();
		} catch (error) {
			console.warn('[blind-draft] discarding unreadable saved game', error);
			clearState();
			this.#state = initialState();
		}
	}

	/** Takes up the game the reopened tab offered. */
	resume(): void {
		const save = this.#pending;
		if (!save) return;
		this.#pending = null;
		this.#raises = 0;
		// Not through #commit: setup → mid-game would read as a new game starting.
		this.#state = save.state;
		this.#savedAt = Date.now();
		saveState(save.state, this.#savedAt);
		this.#scheduleBot();
	}

	/** Turns the offered game down. Counts as quitting it. */
	discard(): void {
		const save = this.#pending;
		if (!save) return;
		this.#pending = null;
		clearState();
		trackTransition(save.state, initialState(), localMode(save.state.config));
	}

	/**
	 * Drops a game nobody has touched in hours. For a tab left open overnight,
	 * which wakes up without reloading, so `hydrate`'s check never runs.
	 */
	expireIfStale(now = Date.now()): void {
		if (this.#pending && isExpired(this.#pending.savedAt, now)) {
			this.#pending = null;
			clearState();
		}
		if (this.#savedAt === null || !isExpired(this.#savedAt, now)) return;
		clearTimeout(this.#botTimer);
		clearState();
		this.#savedAt = null;
		this.#raises = 0;
		this.#state = initialState();
	}

	#commit(next: GameState): void {
		// Both sides: a quit lands on setup, which has no bot in its config.
		trackTransition(this.#state, next, localMode(this.#state.config, next.config));
		this.#state = next;
		if (!browser) return;
		// Playing on makes the offered game moot; it was the same save anyway.
		this.#pending = null;
		if (next.phase === 'setup') {
			clearState();
			this.#savedAt = null;
		} else {
			this.#savedAt = Date.now();
			saveState(next, this.#savedAt);
		}
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
