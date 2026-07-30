import { variant, type Category, type SlotSpec, type Variant } from './types';

/** A starting five. Slots suggest a position but accept anyone. */
const NBA_ROSTER: SlotSpec[] = [
	{ id: 'pg', label: 'PG', drafts: ['PG'] },
	{ id: 'sg', label: 'SG', drafts: ['SG'] },
	{ id: 'sf', label: 'SF', drafts: ['SF'] },
	{ id: 'pf', label: 'PF', drafts: ['PF'] },
	{ id: 'c', label: 'C', drafts: ['C'] }
];

/** Fantasy-style offence. Slot labels are a shape, not a restriction. */
const NFL_ROSTER: SlotSpec[] = [
	{ id: 'qb', label: 'QB', drafts: ['QB'] },
	{ id: 'rb', label: 'RB', drafts: ['RB'] },
	{ id: 'wr1', label: 'WR', drafts: ['WR'] },
	{ id: 'wr2', label: 'WR', drafts: ['WR'] },
	{ id: 'flex', label: 'FLEX', drafts: ['RB', 'WR', 'TE'] }
];

export { openRoster, slotSuits } from './types';

import { NBA_CURRENT, NBA_ALL_TIME } from './nba';
import { NFL_CURRENT, NFL_ALL_TIME } from './nfl';
import { MLB_CURRENT, MLB_ALL_TIME } from './mlb';
import { NHL_CURRENT, NHL_ALL_TIME } from './nhl';
import { CELEBRITIES } from './celebrities';
import { CARTOONS } from './cartoons';
import { TV_SHOWS } from './tv-shows';
import { NOSTALGIA } from './nostalgia';
import { DUOS } from './duos';
import { MOVIES } from './movies';
import { FOODS } from './foods';
import { DRINKS } from './drinks';
import { PERFECT_LIFE } from './perfect-life';
import { SUMMER_DAY } from './summer-day';

/**
 * The content registry. Everything ships in the bundle — no runtime fetches.
 *
 * Sports categories carry two variants and render a Current / All-Time toggle;
 * a single-variant category renders no toggle at all.
 */
export const CATEGORIES: Category[] = [
	{
		id: 'nba',
		label: 'NBA Players',
		emoji: '🏀',
		blurb: 'Build a starting five.',
		roster: NBA_ROSTER,
		variants: [
			variant('nba-current', 'Current', NBA_CURRENT),
			variant('nba-all-time', 'All-Time', NBA_ALL_TIME)
		]
	},
	{
		id: 'nfl',
		label: 'NFL Players',
		emoji: '🏈',
		blurb: 'QB, RB, two WR, flex.',
		roster: NFL_ROSTER,
		variants: [
			variant('nfl-current', 'Current', NFL_CURRENT),
			variant('nfl-all-time', 'All-Time', NFL_ALL_TIME)
		]
	},
	{
		id: 'mlb',
		label: 'MLB Players',
		emoji: '⚾',
		blurb: 'Nine innings of regret.',
		variants: [
			variant('mlb-current', 'Current', MLB_CURRENT),
			variant('mlb-all-time', 'All-Time', MLB_ALL_TIME)
		]
	},
	{
		id: 'nhl',
		label: 'NHL Players',
		emoji: '🏒',
		blurb: 'Drop the puck.',
		variants: [
			variant('nhl-current', 'Current', NHL_CURRENT),
			variant('nhl-all-time', 'All-Time', NHL_ALL_TIME)
		]
	},
	{
		id: 'celebrities',
		label: 'Celebrities',
		emoji: '🌟',
		blurb: 'Assemble an entourage.',
		variants: [variant('celebrities', 'Celebrities', CELEBRITIES)]
	},
	{
		id: 'cartoons',
		label: 'Childhood Cartoons',
		emoji: '📺',
		blurb: 'The Cartoon Network block.',
		variants: [variant('cartoons', 'Cartoons', CARTOONS)]
	},
	{
		id: 'tv-shows',
		label: 'Childhood TV Shows',
		emoji: '🛋️',
		blurb: 'Disney Channel prime time.',
		variants: [variant('tv-shows', 'TV Shows', TV_SHOWS)]
	},
	{
		id: 'nostalgia',
		label: 'Childhood Nostalgia',
		emoji: '🎒',
		blurb: 'Your whole childhood, going once.',
		variants: [variant('nostalgia', 'Nostalgia', NOSTALGIA)]
	},
	{
		id: 'duos',
		label: 'Fictional Duos',
		emoji: '👯',
		blurb: 'Two for one.',
		variants: [variant('duos', 'Duos', DUOS)]
	},
	{
		id: 'movies',
		label: 'Iconic Movies',
		emoji: '🎬',
		blurb: 'Draft the marquee.',
		variants: [variant('movies', 'Movies', MOVIES)]
	},
	{
		id: 'foods',
		label: 'Foods',
		emoji: '🍕',
		blurb: 'Bid hungry, lose money.',
		variants: [variant('foods', 'Foods', FOODS)]
	},
	{
		id: 'drinks',
		label: 'Drinks',
		emoji: '🥤',
		blurb: 'Something to wash it down.',
		variants: [variant('drinks', 'Drinks', DRINKS)]
	},
	{
		id: 'perfect-life',
		label: 'Perfect Life',
		emoji: '✨',
		blurb: 'Wishes, going once.',
		variants: [variant('perfect-life', 'Perfect Life', PERFECT_LIFE)]
	},
	{
		id: 'summer-day',
		label: 'Summer Day',
		emoji: '🌊',
		blurb: 'Assemble one perfect day.',
		variants: [variant('summer-day', 'Summer Day', SUMMER_DAY)]
	}
];

export function getCategory(id: string): Category | undefined {
	return CATEGORIES.find((category) => category.id === id);
}

/** Falls back to the first variant, so a stale variant id can't break setup. */
export function getVariant(category: Category, variantId: string): Variant {
	return category.variants.find((v) => v.id === variantId) ?? category.variants[0];
}

export const hasVariants = (category: Category): boolean => category.variants.length > 1;

export type { Category, Item, ItemSeed, Position, SlotSpec, Tier, Variant } from './types';
