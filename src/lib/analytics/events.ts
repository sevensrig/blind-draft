import type { GameConfig, Phase } from '$lib/game/types';
import type { ShareMethod } from '$lib/share';

export type PlayMode = 'local' | 'bot' | 'online';

/** The slice of local and remote state the events read. */
export interface GameSnapshot {
	phase: Phase;
	config: GameConfig;
	history: readonly unknown[];
}

export type GameEventName =
	| 'game_started'
	| 'game_finished'
	| 'game_quit'
	| 'results_shared'
	| 'category_landing_start'
	| 'bot_suggestion_shown'
	| 'bot_suggestion_clicked'
	| 'bot_wait_interrupted'
	| 'bot_wait_resolved';

export interface GameEvent {
	name: GameEventName;
	props: Record<string, string | number | boolean | null>;
}

/** Single-device games, split by whether the second seat is a bot. */
export function localMode(...configs: GameConfig[]): PlayMode {
	return configs.some((config) => config.bot !== undefined) ? 'bot' : 'local';
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

/**
 * The CTA on a category landing page. Separate from `game_started` on purpose:
 * pairing the two is what says whether the SEO pages actually send anyone into a
 * draft, which is the only reason those pages exist.
 */
export function categoryLandingEvent(categoryId: string): GameEvent {
	return { name: 'category_landing_start', props: { category: categoryId } };
}

/** Where the "play the bot instead" nudge appeared. */
export type BotSuggestionSource = 'waiting_room' | 'empty_lobby';

/**
 * The nudge toward the bot, shown and tapped. Clicked over shown is the take-up
 * rate; a `game_started` with mode `bot` soon after says it became a real game.
 * `waited_seconds` is how long a host sat alone, so a later tap reads as
 * patience running out rather than an instant bail.
 */
export function botSuggestionEvent(
	name: 'bot_suggestion_shown' | 'bot_suggestion_clicked',
	source: BotSuggestionSource,
	category: string | null,
	waitedSeconds: number | null = null
): GameEvent {
	return { name, props: { source, category, waited_seconds: waitedSeconds } };
}

/** What a host playing the bot in their lobby did when somebody joined. */
export type BotWaitChoice = 'room' | 'bot';

/**
 * Someone joined while the host was playing the bot. Interrupted without a
 * resolved means the tab closed on the modal; `room` over `bot` says whether
 * waiting with the bot actually delivers people to a human game.
 */
export function botWaitEvent(
	name: 'bot_wait_interrupted' | 'bot_wait_resolved',
	category: string | null,
	botItemsPlayed: number,
	choice: BotWaitChoice | null = null
): GameEvent {
	return { name, props: { category, bot_items_played: botItemsPlayed, choice } };
}

export function shareEvent(state: GameSnapshot, mode: PlayMode, method: ShareMethod): GameEvent {
	const event = gameEvent('results_shared', state, mode);
	return { ...event, props: { ...event.props, method } };
}

/** Maps a state change to the event it represents, if any. */
export function transitionEvent(
	prev: GameSnapshot,
	next: GameSnapshot,
	mode: PlayMode
): GameEvent | null {
	if (prev.phase === next.phase) return null;
	// From results straight into a deal is "run it back" or an online rematch.
	if (prev.phase === 'setup' || (prev.phase === 'results' && next.phase !== 'setup')) {
		return gameEvent('game_started', next, mode);
	}
	if (next.phase === 'results') return gameEvent('game_finished', next, mode);
	// Back to setup from a live game is a quit; from results it's "play again".
	if (next.phase === 'setup' && prev.phase !== 'results') {
		return gameEvent('game_quit', prev, mode);
	}
	return null;
}

/** ISO 8601 week, e.g. `2026-W43`, in UTC so a week boundary doesn't depend on time zone. */
export function isoWeek(date: Date): string {
	const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	// The ISO week belongs to the year of its Thursday.
	day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
	const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
	const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
	return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
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
		// Keys too: some payloads, like heatmap data, are keyed by URL.
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [scrubText(k, origin), scrubDeep(v, origin)])
		);
	}
	return value;
}
