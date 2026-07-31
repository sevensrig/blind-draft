import type { GameConfig, GameState, Player } from './types';

/**
 * Survives an accidental refresh mid-game, which matters when the whole game
 * lives on one phone. Deliberately dumb: one key, whole-state snapshot.
 *
 * The key is versioned, and `looksLikeGameState` validates the shape properly.
 * Both matter: a snapshot written by an older build once got restored into a
 * newer one, whose components then read fields that didn't exist yet. That threw
 * during hydration, which left the prerendered HTML on screen with no event
 * handlers attached — the page looked fine but nothing was clickable. A stale
 * save must never be able to do that, so anything we can't fully vouch for is
 * dropped.
 */
const KEY = 'blind-draft:state:v2';
/** Older keys, cleared on load so they don't linger. */
const LEGACY_KEYS = ['blind-draft:state:v1'];

function isPlayer(value: unknown, slotIds: Set<string>): value is Player {
	if (!value || typeof value !== 'object') return false;
	const player = value as Partial<Player>;
	if (typeof player.name !== 'string' || typeof player.money !== 'number') return false;
	if (!Array.isArray(player.roster)) return false;
	// Every pick must name a slot that exists in this game's template.
	return player.roster.every(
		(entry) => !!entry && typeof entry.slotId === 'string' && slotIds.has(entry.slotId)
	);
}

function isConfig(value: unknown): value is GameConfig {
	if (!value || typeof value !== 'object') return false;
	const config = value as Partial<GameConfig>;
	if (typeof config.budget !== 'number' || typeof config.slots !== 'number') return false;
	if (!Array.isArray(config.roster) || config.roster.length === 0) return false;
	return config.roster.every((slot) => !!slot && typeof slot.id === 'string');
}

function looksLikeGameState(value: unknown): value is GameState {
	if (!value || typeof value !== 'object') return false;
	const state = value as Partial<GameState>;

	if (typeof state.phase !== 'string') return false;
	if (!Array.isArray(state.deck) || typeof state.index !== 'number') return false;
	if (!Array.isArray(state.players) || state.players.length !== 2) return false;
	if (!isConfig(state.config)) return false;

	const slotIds = new Set(state.config.roster.map((slot) => slot.id));
	return state.players.every((player) => isPlayer(player, slotIds));
}

export function saveState(state: GameState): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(state));
	} catch {
		// Private mode or a full quota: the game still plays, it just won't resume.
	}
}

export function loadState(): GameState | null {
	try {
		for (const stale of LEGACY_KEYS) localStorage.removeItem(stale);
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (looksLikeGameState(parsed)) return parsed;
		// Unrecognisable: bin it rather than leave it to fail again next load.
		localStorage.removeItem(KEY);
		return null;
	} catch {
		return null;
	}
}

export function clearState(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing to do — see saveState.
	}
}

/* ------------------------------------------------------------------ *
 * The custom category's typed list
 *
 * Kept under its own key and outside the game snapshot. Someone who has just
 * typed twenty items should not lose them to a refresh, a finished game, or a
 * schema bump on the save format — none of which have anything to do with the
 * list itself.
 * ------------------------------------------------------------------ */

const CUSTOM_KEY = 'blind-draft:custom:v1';

export interface CustomDraft {
	name: string;
	/** Raw textarea contents, one item per line, kept verbatim so the caret behaves. */
	text: string;
}

export function saveCustomDraft(draft: CustomDraft): void {
	try {
		localStorage.setItem(CUSTOM_KEY, JSON.stringify(draft));
	} catch {
		// See saveState — losing the convenience is fine, breaking play is not.
	}
}

export function loadCustomDraft(): CustomDraft | null {
	try {
		const raw = localStorage.getItem(CUSTOM_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		const draft = parsed as Partial<CustomDraft>;
		if (typeof draft.name !== 'string' || typeof draft.text !== 'string') return null;
		return { name: draft.name, text: draft.text };
	} catch {
		return null;
	}
}
