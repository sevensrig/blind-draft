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
		a: "The $20 draft game is a free two-player party game. You each get a $20 budget and bid against each other for items revealed one at a time — NBA players, movies, snacks, childhood throwbacks — until both rosters are full. Nobody knows what's coming next, which is the whole game."
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
 * Hand-written per category. The temptation here is one template with the label
 * slotted in, which produces seventeen pages that are identical to a crawler and
 * reads as doorway pages. `seo.test.ts` pins that every category has an entry.
 */
export const CATEGORY_COPY: Record<string, CategoryCopy> = {
	nba: {
		title: 'NBA $20 Draft — build a starting five',
		description:
			'Play the $20 draft game with NBA players. Bid blind on a starting five, current rosters or all-time legends, two players and $20 each. Free in your browser.',
		intro:
			"The NBA draft stocks a full starting five — point guard through centre — and the deck is built so a sensible lineup is always there if you can afford it. Any player can fill any open slot, so paying up for a second centre is your problem, not the game's."
	},
	nfl: {
		title: 'NFL $20 Draft — QB, RB, two WR, flex',
		description:
			'Play the $20 draft game with NFL players. Draft a QB, running back, two receivers and a flex on a $20 budget. Current stars or all-time greats. Free, two players.',
		intro:
			'The NFL draft fills a fantasy-style offence: quarterback, running back, two receivers and a flex. The pools are offence-only, because there is no defensive slot to draft into and a linebacker nobody can start is a dead card.'
	},
	mlb: {
		title: 'MLB $20 Draft — bid on baseball players',
		description:
			'Play the $20 draft game with MLB players. Two players, $20 each, bidding blind on current stars or all-time greats. Free in your browser, no account needed.',
		intro:
			'The MLB pools lean on the names that carry a room rather than the best players by WAR, because a card nobody recognises kills the bidding. Current and all-time are separate decks.'
	},
	nhl: {
		title: 'NHL $20 Draft — bid on hockey players',
		description:
			'Play the $20 draft game with NHL players. Two players, $20 each, bidding blind on current stars or all-time greats. Free in your browser, no account needed.',
		intro:
			'Hockey is the hardest of the four sports to draft this way, so the pools stay tight and stick to players whose names land outside a rink. Current and all-time run as separate decks.'
	},
	celebrities: {
		title: 'Celebrity $20 Draft — assemble an entourage',
		description:
			'Play the $20 draft game with celebrities. Bid blind on who joins your entourage, two players and $20 each. Free in your browser, nothing to download.',
		intro:
			'An entourage draft, where the argument is never really about who is more famous. Expect to spend eleven dollars on someone you cannot defend out loud and feel good about it.'
	},
	cartoons: {
		title: 'Childhood Cartoons $20 Draft',
		description:
			'Play the $20 draft game with childhood cartoons. Bid blind on the Saturday-morning block, two players and $20 each. Free in your browser, no sign-up.',
		intro:
			'The cartoon block, drafted. This is the category where the bidding tells you exactly how old everyone at the table is, usually within about three years.'
	},
	'tv-shows': {
		title: 'Childhood TV Shows $20 Draft',
		description:
			'Play the $20 draft game with the TV shows you grew up on. Two players, $20 each, bidding blind. Free in your browser, no account needed.',
		intro:
			'Childhood prime time, with a budget. Separate from the cartoons pool on purpose — live-action and animation pull up completely different memories, and mixing them made both weaker.'
	},
	nostalgia: {
		title: 'Childhood Nostalgia $20 Draft — toys, snacks and trends',
		description:
			'Play the $20 draft game with childhood nostalgia — toys, snacks, trends and the internet you grew up on. Two players, $20 each. Free in your browser.',
		intro:
			"Toys, snacks, playground trends and the YouTubers nobody admits to having watched. This category exists because the show-only pools could never produce a lineup of fidget spinners and Dippin' Dots, which turned out to be the single best thing to bid on."
	},
	duos: {
		title: 'Fictional Duos $20 Draft — two for one',
		description:
			'Play the $20 draft game with fictional duos. Every card is a pair, so you are bidding on two characters at once. Two players, $20 each, free in your browser.',
		intro:
			'Every card here is a pair, so a single bid buys you two characters and the relationship between them. It changes how the money moves: one duo can carry a roster in a way one person never does.'
	},
	movies: {
		title: 'Movies $20 Draft — draft the marquee',
		description:
			'Play the $20 draft game with iconic movies. Bid blind on the marquee, two players and $20 each. Free in your browser, nothing to install.',
		intro:
			'Draft the marquee. The pool is built around films people can argue about without having to explain the plot first, which rules out a lot of genuinely better movies.'
	},
	foods: {
		title: 'Food $20 Draft — bid on what you eat',
		description:
			'Play the $20 draft game with foods. Two players, $20 each, bidding blind on what makes the better plate. Free in your browser, no account.',
		intro:
			'Bidding on food turns out to be the purest version of this game, because everyone has an immediate and unreasonable opinion. No research required, no sports knowledge, no shared childhood.'
	},
	drinks: {
		title: 'Drinks $20 Draft — bid on what you are having',
		description:
			'Play the $20 draft game with drinks. Two players, $20 each, bidding blind on the better lineup. Free in your browser, nothing to download.',
		intro:
			'Something to wash it down with. A small category by design — the recognisable drink names run out faster than the food ones, and padding it with obscurities made the rounds fall flat.'
	},
	desserts: {
		title: 'Desserts $20 Draft — save room for this',
		description:
			'Play the $20 draft game with desserts. Two players, $20 each, bidding blind on the better spread. Free in your browser, no sign-up needed.',
		intro:
			'Save room. Desserts split from the food pool because they lose every head-to-head against a main course, which made them worthless cards until they got a deck of their own.'
	},
	'pizza-toppings': {
		title: 'Pizza Toppings $20 Draft — yes, pineapple is in there',
		description:
			'Play the $20 draft game with pizza toppings. Build the better pizza on a $20 budget, two players, bidding blind. Free in your browser.',
		intro:
			'Build the better pizza, one topping at a time, with no way to know what is still coming. Pineapple is in the deck deliberately and it is worth exactly what the two of you decide it is worth.'
	},
	'trader-joes': {
		title: "Trader Joe's $20 Draft — fill the cart",
		description:
			"Play the $20 draft game with Trader Joe's products. Fill the cart on a $20 budget, two players, bidding blind. Free in your browser, no account.",
		intro:
			"Fill the cart. A twenty-dollar budget is close enough to a real Trader Joe's run that the bidding starts to feel like genuine grocery regret, which is the joke."
	},
	'perfect-life': {
		title: 'Perfect Life $20 Draft — the life you always wanted',
		description:
			'Play the $20 draft game with Perfect Life. Bid blind on the pieces of the life you want, two players and $20 each. Free in your browser.',
		intro:
			'Abstract rather than concrete: you are bidding on the pieces of a life instead of on things. It plays slower and the arguments run longer, which is either the appeal or the problem.'
	},
	'summer-day': {
		title: 'Perfect Summer Day $20 Draft',
		description:
			'Play the $20 draft game with Summer Day. Assemble the perfect day on a $20 budget, two players, bidding blind. Free in your browser, no download.',
		intro:
			'Assemble one perfect day out of whatever the deck offers. The cards are scenarios rather than objects, so the roster reads as a plan by the end instead of a shopping list.'
	}
};
