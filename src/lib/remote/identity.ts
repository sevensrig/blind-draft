/**
 * Per-device identity for remote rooms.
 *
 * There are no accounts, so a room seat is claimed by a secret this device
 * generated and kept. Presenting it is what proves "I am Player 1 in this room"
 * after a refresh, a locked phone, or a dropped connection.
 *
 * localStorage rather than sessionStorage on purpose: sessionStorage dies with
 * the tab, which is exactly when someone most needs their seat back.
 */

const TOKEN_KEY = 'blind-draft:device:v1';
/** Which seat this device holds, per room, so a rejoin can skip the round trip. */
const SEATS_KEY = 'blind-draft:seats:v1';

/** 32 hex chars from the platform CSPRNG. Long enough not to be guessable. */
function mint(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The device's token, created on first use and stable thereafter.
 *
 * If storage is unavailable (private mode, quota) this still returns a usable
 * token — the game works, it just won't survive a refresh, which beats refusing
 * to play at all.
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

type SeatMap = Record<string, 0 | 1>;

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

export function rememberSeat(roomId: string, seat: 0 | 1): void {
	try {
		localStorage.setItem(SEATS_KEY, JSON.stringify({ ...readSeats(), [roomId]: seat }));
	} catch {
		// Not fatal: join-room hands the seat back when asked with the token.
	}
}

export function recallSeat(roomId: string): 0 | 1 | null {
	const seat = readSeats()[roomId];
	return seat === 0 || seat === 1 ? seat : null;
}

export function forgetSeat(roomId: string): void {
	try {
		const seats = readSeats();
		delete seats[roomId];
		localStorage.setItem(SEATS_KEY, JSON.stringify(seats));
	} catch {
		// Nothing to do.
	}
}

/**
 * The display name this device plays under.
 *
 * Not identity — the token is — but it belongs with it: a name is typed on
 * `/online` and then needed again by every other way into a room. Without it
 * the rooms browser and an invite link both had to join anonymously, and the
 * server fell back to naming the joiner "Player 2".
 *
 * Per-device and cosmetic, like the saved seat: never sent anywhere but a join.
 */
const NAME_KEY = 'blind-draft:name:v1';

export function rememberName(name: string): void {
	try {
		const trimmed = name.trim().slice(0, 14);
		if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
		else localStorage.removeItem(NAME_KEY);
	} catch {
		// Storage off. The name still applies to this game, it just won't be
		// remembered for the next one.
	}
}

export function recallName(): string {
	try {
		return (localStorage.getItem(NAME_KEY) ?? '').trim().slice(0, 14);
	} catch {
		return '';
	}
}
