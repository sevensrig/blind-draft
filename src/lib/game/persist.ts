import type { GameConfig, GameState, Player } from './types';

/**
 * Survives a refresh mid-game. Deliberately dumb: one key, whole-state snapshot.
 *
 * Bump the key if the state shape changes. A save from an older build once threw
 * during hydration, leaving prerendered HTML on screen with dead handlers — hence
 * the versioned key and the real shape check below. Anything unvouched is dropped.
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
	if (config.bot !== undefined && config.bot !== 0 && config.bot !== 1) return false;
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
		// Private mode or full quota: the game plays, it just won't resume.
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
 * Its own key, outside the game snapshot: a typed list shouldn't be lost to a
 * finished game or a schema bump on the save format.
 * ------------------------------------------------------------------ */

const CUSTOM_KEY = 'blind-draft:custom:v1';

export interface CustomDraft {
	name: string;
	/** Raw textarea contents, kept verbatim so the caret behaves. */
	text: string;
}

export function saveCustomDraft(draft: CustomDraft): void {
	try {
		localStorage.setItem(CUSTOM_KEY, JSON.stringify(draft));
	} catch {
		// See saveState.
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

/* ------------------------------------------------------------------ *
 * "New setup" carry-over
 *
 * Leaving a finished local game for setup keeps who was playing and how, so
 * the next game doesn't start with retyping names. Session-scoped: it's a
 * convenience for this sitting, not a profile.
 * ------------------------------------------------------------------ */

const SETUP_KEY = 'blind-draft:setup:v1';

export interface SetupCarry {
	/** As typed; empty where the player kept the placeholder. */
	names: [string, string];
	vsBot: boolean;
}

export function saveSetupCarry(carry: SetupCarry): void {
	try {
		sessionStorage.setItem(SETUP_KEY, JSON.stringify(carry));
	} catch {
		// See saveState.
	}
}

export function loadSetupCarry(): SetupCarry | null {
	try {
		const raw = sessionStorage.getItem(SETUP_KEY);
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		const carry = parsed as Partial<SetupCarry>;
		const names = carry.names;
		if (!Array.isArray(names) || names.length !== 2) return null;
		if (!names.every((name) => typeof name === 'string')) return null;
		if (typeof carry.vsBot !== 'boolean') return null;
		return { names: [names[0], names[1]], vsBot: carry.vsBot };
	} catch {
		return null;
	}
}
