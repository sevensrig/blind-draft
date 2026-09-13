/**
 * Site metadata. Open Graph and canonical links need absolute URLs, and a
 * prerendered build can't discover its own origin, so it's declared here once.
 * Change `SITE_URL` when the real domain is set; everything else reads from it.
 */
export const SITE_URL = 'https://blind-draft.vercel.app';

/**
 * The searched-for name, not the on-screen one. People type "$20 budget draft",
 * so that goes in titles and structured data; the wordmark stays as it is. Both
 * are declared so a crawler treats them as one game.
 */
export const SITE_NAME = '$20 Budget Draft';

/** The on-screen wordmark. Emitted as `alternateName` so the two names link up. */
export const SITE_ALT_NAME = '$20 Blind Draft';

/**
 * Quotable rather than clever: answer engines lift "X is a Y that does Z". Kept
 * under ~160 characters so Google shows all of it rather than cutting the last
 * third; the on-page rules block carries the long explanation.
 */
export const SITE_DESCRIPTION =
	'$20 Budget Draft is a free two-player party game — the viral budget drafting game, playable in a browser. You each get $20 and bid blind on what comes next.';

/** Short form for the social card, where long copy gets truncated anyway. */
export const SITE_TAGLINE = 'The viral budget drafting game. Two players, $20 each, bidding blind.';

export const OG_IMAGE = `${SITE_URL}/og.png`;
export const OG_IMAGE_ALT =
	'$20 Budget Draft — a two-player blind bidding party game played in a browser.';
