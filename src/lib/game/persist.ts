import type { GameConfig, GameState, Player } from './types';

/**
 * Survives a refresh mid-game. Deliberately dumb: one key, whole-state snapshot.
 *
 * Bump the key if the state shape changes. A save from an older build once threw
 * during hydration, leaving prerendered HTML on screen with dead handlers — hence
 * the versioned key and the real shape check below. Anything unvouched is dropped.
 */
const KEY = 'blind-draft:state:v3';
/** Older keys, cleared on load so they don't linger. v2 had no timestamp. */
const LEGACY_KEYS = ['blind-draft:state:v1', 'blind-draft:state:v2'];

/**
 * How long an untouched game survives. Long enough for a break mid-draft, short
 * enough that nobody opens the app the next morning still in last night's game.
 */
export const SAVE_TTL_MS = 6 * 60 * 60 * 1000;

/** A saved game, when its last move was made, and which tab made it. */
export interface Save {
	state: GameState;
	savedAt: number;
	tab: string | null;
}

export function isExpired(savedAt: number, now = Date.now()): boolean {
	return now - savedAt > SAVE_TTL_MS;
}

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
	if (!Array.isArray(state.players) || state.players.length < 2 || state.players.length > 4)
		return false;
	if (!isConfig(state.config)) return false;

	const slotIds = new Set(state.config.roster.map((slot) => slot.id));
	return state.players.every((player) => isPlayer(player, slotIds));
}

export function saveState(state: GameState, now = Date.now()): void {
	try {
		const save: Save = { state, savedAt: now, tab: tabId() };
		localStorage.setItem(KEY, JSON.stringify(save));
	} catch {
		// Private mode or full quota: the game plays, it just won't resume.
	}
}

/** The saved game with its timestamp, or null if there's none, it's unreadable or it's expired. */
export function loadSave(now = Date.now()): Save | null {
	try {
		for (const stale of LEGACY_KEYS) localStorage.removeItem(stale);
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<Save> | null;
		const savedAt = parsed?.savedAt;
		if (
			typeof savedAt === 'number' &&
			looksLikeGameState(parsed?.state) &&
			!isExpired(savedAt, now)
		) {
			return {
				state: parsed.state,
				savedAt,
				tab: typeof parsed.tab === 'string' ? parsed.tab : null
			};
		}
		// Unrecognisable or too old: bin it rather than meet it again next load.
		localStorage.removeItem(KEY);
		return null;
	} catch {
		return null;
	}
}

export function loadState(now = Date.now()): GameState | null {
	return loadSave(now)?.state ?? null;
}

export function clearState(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing to do — see saveState.
	}
}

/* ------------------------------------------------------------------ *
 * Which tab wrote the save
 *
 * A save from this tab (a reload, or a hop back from the rooms pages) resumes
 * silently; one from another tab asks first. sessionStorage survives a reload
 * and dies with the tab, so an id kept there names the tab.
 * ------------------------------------------------------------------ */

const TAB_KEY = 'blind-draft:tab:v1';

/** This tab's id, minted on first use. Null when sessionStorage is blocked. */
export function tabId(): string | null {
	try {
		const existing = sessionStorage.getItem(TAB_KEY);
		if (existing) return existing;
		const fresh = crypto.randomUUID();
		sessionStorage.setItem(TAB_KEY, fresh);
		return fresh;
	} catch {
		return null;
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
