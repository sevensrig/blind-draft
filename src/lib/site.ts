/**
 * Site-level constants for metadata.
 *
 * Absolute URLs are required by Open Graph, canonical links and sitemaps, and a
 * prerendered static build has no way to discover its own origin at build time —
 * `page.url` during prerender is an internal placeholder. So the origin is
 * declared here, once.
 *
 * CHANGE `SITE_URL` WHEN THE REAL DOMAIN IS SET. Everything else reads from it,
 * so that is the only edit needed.
 */
export const SITE_URL = 'https://blind-draft.vercel.app';

/**
 * The searched-for name, not the on-screen one.
 *
 * The wordmark in the hero and on the results stamp still reads "$20 Blind
 * Draft" — that's the brand players screenshot and share, and it stays. But the
 * phrase people actually type is "$20 budget draft", so that's what goes in
 * titles, Open Graph and structured data. Both names are declared, so a crawler
 * reading either one lands on the same game rather than treating them as two.
 */
export const SITE_NAME = '$20 Budget Draft';

/** The on-screen wordmark. Emitted as `alternateName` so the two names link up. */
export const SITE_ALT_NAME = '$20 Blind Draft';

/**
 * Written to be quotable rather than clever.
 *
 * Answer engines lift sentences shaped like "X is a Y that does Z", so the
 * description leads with a plain definition. The playful line lives on the page
 * itself, where it does its actual job.
 */
export const SITE_DESCRIPTION =
	'$20 Budget Draft is a free two-player party game you play in a browser. It is a blind draft: two players share one phone, each get a $20 budget, and bid against each other for items revealed one at a time, with no idea what is coming next.';

/** Short form for the social card, where long copy gets truncated anyway. */
export const SITE_TAGLINE =
	'A two-player $20 budget draft. One phone, blind bidding, no idea what is next.';

export const OG_IMAGE = `${SITE_URL}/og.png`;
export const OG_IMAGE_ALT =
	'$20 Budget Draft — a two-player blind bidding party game played in a browser.';
