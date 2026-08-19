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

export const SITE_NAME = '$20 Blind Draft';

/**
 * Written to be quotable rather than clever.
 *
 * Answer engines lift sentences shaped like "X is a Y that does Z", so the
 * description leads with a plain definition. The playful line lives on the page
 * itself, where it does its actual job.
 */
export const SITE_DESCRIPTION =
	'$20 Blind Draft is a free two-player party game you play in a browser. Two players share one phone and bid against each other for items revealed one at a time, building a roster on a $20 budget without knowing what is coming next.';

/** Short form for the social card, where long copy gets truncated anyway. */
export const SITE_TAGLINE =
	'A two-player blind bidding draft. One phone, $20, no idea what is next.';

export const OG_IMAGE = `${SITE_URL}/og.png`;
export const OG_IMAGE_ALT =
	'$20 Blind Draft — a two-player blind bidding party game played in a browser.';
