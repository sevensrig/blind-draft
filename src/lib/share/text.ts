import { entryInSlot } from '$lib/game/engine';
import { type Scoreboard, scoreGame } from '$lib/game/score';
import type { GameState, RosterEntry } from '$lib/game/types';
import { SITE_URL } from '$lib/site';

/** The site without its scheme, as people would type it. */
export const SHARE_HOST = SITE_URL.replace(/^https?:\/\/(www\.)?/, '');

export function headline(state: GameState): string {
	const { config } = state;
	const variant = config.variantLabel ? ` (${config.variantLabel})` : '';
	return `${config.categoryLabel}${variant} · $${config.budget} each`;
}

/** Roster order, so positional rosters read PG, SG, SF, PF, C. */
export function orderedPicks(state: GameState, id: 0 | 1): RosterEntry[] {
	return state.config.roster
		.map((slot) => entryInSlot(state, id, slot.id))
		.filter((entry): entry is RosterEntry => !!entry);
}

export const priceLabel = (entry: RosterEntry) => (entry.free ? 'Free' : `$${entry.price}`);

/** Direction only: the exact swing is noise next to the stat line. */
export const stealLabel = (steal: number) => (steal > 0 ? '+ steal' : '− overpay');

/** The results title: who won, or the plain one for unscored games. */
export function verdict(state: GameState, board: Scoreboard | null): string {
	if (!board) return 'Rosters are full';
	if (board.winner === null) return 'Dead even';
	return `${state.players[board.winner].name} wins`;
}

/** Plain text for chats that drop the image: one line per player. */
export function shareText(state: GameState): string {
	const board = scoreGame(state);
	const lines = state.players.map((player) => {
		const picks = orderedPicks(state, player.id).map(
			(entry) => `${entry.item.name} ${priceLabel(entry)}`
		);
		const score = board ? ` (${board.players[player.id].total} pts)` : '';
		return `${player.name}${score}: ${picks.join(', ')}`;
	});
	const close = board
		? `${verdict(state, board)}. Play: ${SHARE_HOST}`
		: `Who won? Play: ${SHARE_HOST}`;
	return [`$20 Draft · ${headline(state)}`, ...lines, close].join('\n');
}
