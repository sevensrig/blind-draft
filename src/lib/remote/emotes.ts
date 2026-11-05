import type { IconName } from '$lib/icons';

/** The only things a player can say mid-draft. A fixed set needs no moderation. */
export const EMOTES = [
	{ id: 'bid', icon: 'hand-point-right', label: 'Bid!' },
	{ id: 'mad', icon: 'face-angry', label: 'Ugh' },
	{ id: 'happy', icon: 'face-grin-beam', label: 'Yes!' },
	{ id: 'laugh', icon: 'face-grin-squint-tears', label: 'LOL' }
] as const satisfies readonly { id: string; icon: IconName; label: string }[];

export type EmoteId = (typeof EMOTES)[number]['id'];

export function emoteById(id: unknown) {
	return EMOTES.find((emote) => emote.id === id) ?? null;
}
