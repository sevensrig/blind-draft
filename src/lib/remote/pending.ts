import { canBid } from '$lib/game/engine';
import type { Action, PlayerId } from '$lib/game/types';
import { toGameState } from './adapt';
import type { PublicGameState } from './types';

/**
 * A bid the server hasn't confirmed yet: ours in flight, or the opponent's,
 * announced on the room channel the moment they clicked. `base` is the version
 * it was placed on.
 */
export type PendingBid = { player: PlayerId; amount: number; base: number };

/** Draws a pending bid onto a confirmed state. Only a live auction takes one. */
export function withBid(state: PublicGameState, bid: PendingBid): PublicGameState {
	if (state.phase !== 'resolve') return state;
	return { ...state, bid: { amount: bid.amount, holder: bid.player } };
}

/** Reads an announcement off the wire. Anyone in the room can send one, so trust nothing. */
export function readAnnouncement(payload: unknown): PendingBid | null {
	if (!payload || typeof payload !== 'object') return null;
	const { player, amount, version } = payload as Record<string, unknown>;
	if (player !== 0 && player !== 1) return null;
	if (typeof amount !== 'number' || !Number.isInteger(amount)) return null;
	if (typeof version !== 'number' || !Number.isInteger(version)) return null;
	return { player, amount, base: version };
}

/**
 * Whether an announced bid is worth showing: from the other seat, placed on the
 * state we're looking at, and legal there. It's still only a guess — the server
 * replaces it either way.
 */
export function believable(
	state: PublicGameState,
	version: number,
	seat: PlayerId,
	bid: PendingBid
): boolean {
	if (bid.player === seat || bid.base !== version) return false;
	return canBid(toGameState(state), bid.player, bid.amount);
}

/** Whether the server's state shows this bid standing, i.e. it really landed. */
export function landed(state: PublicGameState | null, bid: PendingBid): boolean {
	return state?.bid?.holder === bid.player && state.bid.amount === bid.amount;
}

/** Reads a reveal announcement: just the version the card was turned over on. */
export function readRevealAnnouncement(payload: unknown): number | null {
	if (!payload || typeof payload !== 'object') return null;
	const { version } = payload as Record<string, unknown>;
	return typeof version === 'number' && Number.isInteger(version) ? version : null;
}

/**
 * Whether a move that lost a race wanted what already happened. Either player
 * may turn the card over or move on, so a second tap that arrives late isn't a
 * refusal worth showing — the first one did the job.
 */
export function alreadyDone(
	action: Action,
	before: PublicGameState | null,
	after: PublicGameState | null
): boolean {
	if (!before || !after) return false;
	if (action.type === 'reveal') {
		return after.itemNumber === before.itemNumber && after.phase !== 'reveal';
	}
	if (action.type === 'next') {
		return after.itemNumber > before.itemNumber || after.phase === 'results';
	}
	return false;
}
