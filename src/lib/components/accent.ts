import type { PlayerId } from '$lib/game/types';

/** Each seat's identity colour, `--p1` to `--p4` in `app.css`. */
export const playerAccent = (id: PlayerId): string => `var(--p${id + 1})`;

/** Alternating tilts, per the style's "slightly rotated cards". */
export const playerTilt = (id: PlayerId, degrees = 1): string =>
	`${id % 2 === 0 ? -degrees : degrees}deg`;
