import { entryInSlot } from '$lib/game/engine';
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

/** Plain text for chats that drop the image: one line per player. */
export function shareText(state: GameState): string {
	const lines = state.players.map((player) => {
		const picks = orderedPicks(state, player.id).map(
			(entry) => `${entry.item.name} ${priceLabel(entry)}`
		);
		return `${player.name}: ${picks.join(', ')}`;
	});
	return [`$20 Draft · ${headline(state)}`, ...lines, `Who won? Play: ${SHARE_HOST}`].join('\n');
}
