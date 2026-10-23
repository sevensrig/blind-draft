import type { GameConfig, Phase } from '$lib/game/types';

export type PlayMode = 'local' | 'online';

/** The slice of local and remote state the events read. */
export interface GameSnapshot {
	phase: Phase;
	config: GameConfig;
	history: readonly unknown[];
}

export type GameEventName = 'game_started' | 'game_finished' | 'game_quit';

export interface GameEvent {
	name: GameEventName;
	props: Record<string, string | number | boolean | null>;
}

/** Category and settings only: player names and custom item text never leave the device. */
export function gameEvent(name: GameEventName, state: GameSnapshot, mode: PlayMode): GameEvent {
	const { config } = state;
	return {
		name,
		props: {
			mode,
			category: config.categoryId,
			variant: config.variantId,
			budget: config.budget,
			slots: config.slots,
			items_played: state.history.length
		}
	};
}

/** Maps a state change to the event it represents, if any. */
export function transitionEvent(
	prev: GameSnapshot,
	next: GameSnapshot,
	mode: PlayMode
): GameEvent | null {
	if (prev.phase === next.phase) return null;
	if (prev.phase === 'setup') return gameEvent('game_started', next, mode);
	if (next.phase === 'results') return gameEvent('game_finished', next, mode);
	// Back to setup from a live game is a quit; from results it's "play again".
	if (next.phase === 'setup' && prev.phase !== 'results') {
		return gameEvent('game_quit', prev, mode);
	}
	return null;
}

/** Drops query and fragment from same-site URLs, so a room id never reaches a vendor. */
export function scrubUrl(value: string, origin: string): string {
	if (!value.startsWith(origin)) return value;
	const end = value.search(/[?#]/);
	return end === -1 ? value : value.slice(0, end);
}

/** `scrubUrl` for same-site URLs embedded in free text, like console messages. */
export function scrubText(text: string, origin: string): string {
	const escaped = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return text.replace(new RegExp(`${escaped}[^\\s?#]*[?#]\\S*`, 'g'), (url) =>
		scrubUrl(url, origin)
	);
}

/** `scrubText` through nested arrays and objects, such as logged console arguments. */
export function scrubDeep(value: unknown, origin: string): unknown {
	if (typeof value === 'string') return scrubText(value, origin);
	if (Array.isArray(value)) return value.map((v) => scrubDeep(v, origin));
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v, origin)]));
	}
	return value;
}

/** `scrubUrl` over every string field one level deep, plus a nested `$set_once`. */
export function scrubProperties<T extends Record<string, unknown>>(props: T, origin: string): T {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		if (typeof value === 'string') out[key] = scrubUrl(value, origin);
		else if (key === '$set_once' && value && typeof value === 'object') {
			out[key] = scrubProperties(value as Record<string, unknown>, origin);
		} else out[key] = value;
	}
	return out as T;
}
