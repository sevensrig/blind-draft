import { SITE_URL } from './site';

/** Absolute canonical for a route. The root keeps no trailing slash, like `SITE_URL`. */
export function canonical(path = '/'): string {
	return path === '/' ? SITE_URL : `${SITE_URL}${path}`;
}

export interface Faq {
	q: string;
	a: string;
}

/**
 * Rendered on the home page *and* emitted as `FAQPage` data, from one source, so
 * the markup can't drift from the visible answers — which is what Google asks for.
 *
 * Worth knowing: Google restricted FAQ rich results to government and health
 * sites in 2023, so this buys no blue-link snippet. It's here for the answer
 * engines, which do still read it.
 */
export const FAQ: Faq[] = [
	{
		q: 'What is the $20 draft game?',
		a: "The $20 draft game is a free two-player party game, also known as the 20 dollar draft game or the $20 TikTok draft game. You each get a $20 budget and bid against each other for items revealed one at a time — NBA players, movies, snacks, childhood throwbacks — until both rosters are full. Nobody knows what's coming next, which is the whole game."
	},
	{
		// The phrasing every page outranking us carries, asked the way people
		// actually type it. Answered plainly rather than claiming any affiliation.
		q: 'Is this the $20 draft game from TikTok?',
		a: 'Yes — same game. The $20 draft spread on TikTok as two people splitting a $20 budget and bidding on whatever gets named next: NBA starting fives, snacks, childhood cartoons. This is that game, free in a browser, keeping track of the money and the rosters so nobody has to argue about who has how much left.'
	},
	{
		// People search every spelling of this, and the game genuinely goes by all
		// of them. One honest question beats sprinkling variants through the copy.
		q: 'What else is this game called?',
		a: 'The $20 draft, the 20 dollar draft game, the twenty dollar draft, the $20 TikTok draft game, the TikTok $20 draft, the $20 blind draft, the $20 budget draft, the 20 dollar draft challenge, or just the $20 draft challenge. They all mean the same game: a $20 budget, two players, and blind bidding on whatever the deck turns over next.'
	},
	{
		q: 'How do you play the $20 draft game?',
		a: 'An item is revealed. Either player can open the bidding — there is no turn order — and you raise back and forth by at least $1 until one of you stops. The other wins it at the final price. Repeat until both rosters are full, then compare.'
	},
	{
		q: 'How many people can play?',
		a: 'Two. You can pass one phone back and forth, have a third person act as game master and tap in the bids, play against the bot on your own, or play on two separate phones.'
	},
	{
		q: 'Is the $20 draft game free?',
		a: 'Yes. It runs in your browser with no account, no download and no payment. Open the page and start a draft.'
	},
	{
		q: 'Can you play the $20 draft game online with a friend?',
		a: 'Yes. Create a room, send the invite link, and you each draft from your own phone with the reveals staying in sync. You can also play locally on one device.'
	},
	{
		q: 'What happens if you spend all $20 early?',
		a: 'Nothing stops you. If you go broke with roster slots still empty, your opponent names a price on everything that comes after — and anything they pass on is yours for free. Spending your last dollar on the first great card is a real way to lose, and a real way to win.'
	},
	{
		q: 'What can you draft?',
		a: 'Seventeen built-in categories, including NBA, NFL, MLB and NHL players, iconic movies, celebrities, childhood cartoons and nostalgia, foods, desserts and pizza toppings — plus a Make Your Own mode where you type the list yourself.'
	}
];

export interface CategoryCopy {
	/** Leads with the searched phrase, not the on-screen label. */
	title: string;
	description: string;
	/** Two sentences, written per category — a templated line would read as filler. */
	intro: string;
}

/**
 * A deliberate subset, not every category. Pages for `pizza-toppings` or
 * `summer-day` would be real content nobody searches for, and a pile of
 * zero-impression pages is worth less than five that earn their place. Add one
 * here when a category shows real demand — the route, sitemap, nav and FAQ list
 * all read from this record, so that is the only edit needed.
 *
 * Hand-written, never templated: pages identical but for a swapped label are
 * what a doorway page is. `seo.test.ts` pins that they stay distinct.
 */
export const CATEGORY_COPY: Record<string, CategoryCopy> = {
	nba: {
		title: 'NBA $20 Draft — build a starting five',
		description:
			'Play the $20 draft game with NBA players. Bid blind on a starting five, current rosters or all-time legends, two players and $20 each. Free in your browser.',
		intro:
			"The NBA version is the one most people picture when they hear about the $20 draft on TikTok. It stocks a full starting five — point guard through centre — and the deck is built so a sensible lineup is always there if you can afford it. Any player can fill any open slot, so paying up for a second centre is your problem, not the game's."
	},
	nfl: {
		title: 'NFL $20 Draft — QB, RB, two WR, flex',
		description:
			'Play the $20 draft game with NFL players. Draft a QB, running back, two receivers and a flex on a $20 budget. Current stars or all-time greats. Free, two players.',
		intro:
			'The NFL draft fills a fantasy-style offence: quarterback, running back, two receivers and a flex. The pools are offence-only, because there is no defensive slot to draft into and a linebacker nobody can start is a dead card.'
	},
	celebrities: {
		title: 'Celebrity $20 Draft — assemble an entourage',
		description:
			'Play the $20 draft game with celebrities. Bid blind on who joins your entourage, two players and $20 each. Free in your browser, nothing to download.',
		intro:
			'An entourage draft, where the argument is never really about who is more famous. Expect to spend eleven dollars on someone you cannot defend out loud and feel good about it.'
	},
	nostalgia: {
		title: 'Childhood Nostalgia $20 Draft — toys, snacks and trends',
		description:
			'Play the $20 draft game with childhood nostalgia — toys, snacks, trends and the internet you grew up on. Two players, $20 each. Free in your browser.',
		intro:
			"Toys, snacks, playground trends and the YouTubers nobody admits to having watched. This category exists because the show-only pools could never produce a lineup of fidget spinners and Dippin' Dots, which turned out to be the single best thing to bid on."
	},
	movies: {
		title: 'Movies $20 Draft — draft the marquee',
		description:
			'Play the $20 draft game with iconic movies. Bid blind on the marquee, two players and $20 each. Free in your browser, nothing to install.',
		intro:
			'Draft the marquee. The pool is built around films people can argue about without having to explain the plot first, which rules out a lot of genuinely better movies.'
	}
};
