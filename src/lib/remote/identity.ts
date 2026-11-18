/**
 * Per-device identity for remote rooms. No accounts, so a seat is claimed by a
 * secret this device minted; presenting it is what gets the seat back after a
 * refresh. localStorage, not sessionStorage — that dies with the tab.
 */
import { cleanName } from '$lib/game/engine';
import { MAX_PLAYERS } from '$lib/game/types';

const TOKEN_KEY = 'blind-draft:device:v1';
/** Which seat this device holds, per room, so a rejoin can skip the round trip. */
const SEATS_KEY = 'blind-draft:seats:v1';

/** 32 hex chars from the platform CSPRNG. */
function mint(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Created on first use and stable thereafter. Still returns a usable token when
 * storage is unavailable — the game works, it just won't survive a refresh.
 */
export function deviceToken(): string {
	try {
		const existing = localStorage.getItem(TOKEN_KEY);
		if (existing && existing.length >= 16) return existing;
		const fresh = mint();
		localStorage.setItem(TOKEN_KEY, fresh);
		return fresh;
	} catch {
		return mint();
	}
}

type SeatMap = Record<string, number>;

function readSeats(): SeatMap {
	try {
		const raw = localStorage.getItem(SEATS_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === 'object' ? (parsed as SeatMap) : {};
	} catch {
		return {};
	}
}

export function rememberSeat(roomId: string, seat: number): void {
	try {
		localStorage.setItem(SEATS_KEY, JSON.stringify({ ...readSeats(), [roomId]: seat }));
	} catch {
		// Not fatal: join-room hands the seat back when asked with the token.
	}
}

export function recallSeat(roomId: string): number | null {
	const seat = readSeats()[roomId];
	return Number.isInteger(seat) && seat >= 0 && seat < MAX_PLAYERS ? seat : null;
}

/**
 * This device's `room_players` id per room. Seats close up when a lobby starts
 * after someone left it, so the id is what finds our seat in `seatIds`.
 */
const PLAYER_IDS_KEY = 'blind-draft:player-ids:v1';

function readPlayerIds(): Record<string, string> {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(PLAYER_IDS_KEY) ?? '{}');
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
	} catch {
		return {};
	}
}

export function rememberPlayerId(roomId: string, id: string): void {
	try {
		localStorage.setItem(PLAYER_IDS_KEY, JSON.stringify({ ...readPlayerIds(), [roomId]: id }));
	} catch {
		// Not fatal: the stored seat still works unless the lobby closes up.
	}
}

export function recallPlayerId(roomId: string): string | null {
	const id = readPlayerIds()[roomId];
	return typeof id === 'string' ? id : null;
}

export function forgetSeat(roomId: string): void {
	try {
		const seats = readSeats();
		delete seats[roomId];
		localStorage.setItem(SEATS_KEY, JSON.stringify(seats));
		const ids = readPlayerIds();
		delete ids[roomId];
		localStorage.setItem(PLAYER_IDS_KEY, JSON.stringify(ids));
	} catch {
		// Nothing to do.
	}
}

/**
 * The display name this device plays under. Cosmetic, not identity, but it lives
 * here because every way into a room needs it — without it the rooms browser and
 * invite links joined anonymously and the server named the guest "Player 2".
 */
const NAME_KEY = 'blind-draft:name:v1';

export function rememberName(name: string): void {
	try {
		const trimmed = cleanName(name);
		if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
		else localStorage.removeItem(NAME_KEY);
	} catch {
		// Storage off: applies to this game, just not the next one.
	}
}

export function recallName(): string {
	try {
		return cleanName(localStorage.getItem(NAME_KEY) ?? '');
	} catch {
		return '';
	}
}
