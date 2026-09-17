/**
 * Site metadata. Open Graph and canonical links need absolute URLs, and a
 * prerendered build can't discover its own origin, so it's declared here once.
 * Everything else reads from it.
 *
 * `www` is deliberate: Vercel serves the site there and 308s the apex across, so
 * a canonical on the bare domain would point at a redirect.
 */
export const SITE_URL = 'https://www.20dollardraftgame.com';

/**
 * The searched-for name, not the on-screen one. People type "$20 draft game",
 * so that goes in titles and structured data; the wordmark stays shorter. Both
 * are declared so a crawler treats them as one game.
 */
export const SITE_NAME = '$20 Draft Game';

/**
 * The on-screen wordmark first, then the name this shipped under. Emitted as
 * `alternateName` so old links and screenshots still resolve to one entity.
 */
export const SITE_ALT_NAMES = ['$20 Draft', '$20 Blind Draft'];

/**
 * Quotable rather than clever: answer engines lift "X is a Y that does Z". Kept
 * under ~160 characters so Google shows all of it rather than cutting the last
 * third; the on-page rules block carries the long explanation.
 */
export const SITE_DESCRIPTION =
	'$20 Draft Game is a free two-player party game — the viral $20 draft, playable in any browser. You each get $20 and bid blind on what comes next.';

/** Short form for the social card, where long copy gets truncated anyway. */
export const SITE_TAGLINE = 'The viral $20 draft game. Two players, $20 each, bidding blind.';

export const OG_IMAGE = `${SITE_URL}/og.png`;
export const OG_IMAGE_ALT =
	'$20 Draft Game — a two-player blind bidding party game played in a browser.';
