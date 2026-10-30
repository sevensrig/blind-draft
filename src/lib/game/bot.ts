import type { Item, Tier } from '$lib/data/types';
import { slotSuits } from '$lib/data/types';
import {
	currentItem,
	itemMode,
	maxBid,
	openSlots,
	other,
	slotsLeft,
	solventPlayer
} from './engine';
import type { Action, GameState, PlayerId } from './types';

/**
 * The single-player opponent, as a pure function of the state: what would the bot
 * do right now and how long it sits on it first, or null to wait. The human still paces the game (reveal, next,
 * claim); the bot only bids, concedes, buys and passes for its own seat.
 *
 * It sees what a seasoned player would: the current card's tier, every card
 * already revealed, both wallets and rosters, and the rough deck curve. It never
 * reads `deck` past `index` — that would be reading the blind order.
 */

const TIER_WEIGHT: Record<Tier, number> = { bad: 0.35, mid: 0.9, good: 1.35, great: 2.2 };

/** `deck.ts`'s curve on average: ~17.5% great, at most one bad, good ~30% of the rest. */
function expectedCounts(size: number): Record<Tier, number> {
	const great = 0.175 * size;
	const bad = 0.25;
	const good = 0.3 * (size - great - bad);
	return { great, bad, good, mid: size - great - bad - good };
}

/** A card that would sit out of position is still worth having, just less. */
const OUT_OF_POSITION = 0.8;
/** How often a card sends the bot wild, and how far past its limit it goes. */
const WILD_ODDS = 0.12;
const WILD_BOOST = [1.3, 2] as const;
/** Per raise past the second, on good and great cards only; capped. Doesn't stack with wild. */
const HEAT_PER_RAISE = 0.08;
const HEAT_CAP = 1.3;

/**
 * Chance of opening instantly, after 2s, after 5s, or never (leaving it to the
 * human). Better cards get opened sooner.
 */
const OPENING_ODDS: Record<Tier, readonly [number, number, number, number]> = {
	great: [0.4, 0.3, 0.2, 0.1],
	good: [0.3, 0.3, 0.25, 0.15],
	mid: [0.25, 0.25, 0.25, 0.25],
	bad: [0.1, 0.15, 0.25, 0.5]
};
const OPENING_DELAYS = [300, 2000, 5000] as const;
/** For everything that isn't an opening bid: a beat of "thinking". */
const THINKING = [700, 1300] as const;

export interface BotMove {
	action: Action;
	/** Milliseconds to hold the move, so the bot reads as a player, not a reflex. */
	delay: number;
}

/** What the store tracks for the card on the block, which `GameState` doesn't. */
export interface BotContext {
	/** Bids placed on the current card so far, by either seat. */
	raises: number;
}

/** Stable 0..1 noise, so a re-render or a reload can't change the bot's mind. */
function noise(...parts: (string | number)[]): number {
	let h = 2166136261;
	for (const ch of parts.join('|')) {
		h ^= ch.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0) / 0xffffffff;
}

/** The first card is revealed before the bot ever acts, so it's fair game as a seed. */
const gameSeed = (state: GameState) => state.deck[0]?.id ?? '';

/**
 * How the current card compares to what's probably still to come. Expected tier
 * counts for this deck size, minus what's been revealed: if the greats are gone,
 * a good card is the best left and worth more.
 */
function relativeWorth(state: GameState, item: Item): number {
	const seen: Record<Tier, number> = { bad: 0, mid: 0, good: 0, great: 0 };
	for (const card of state.deck.slice(0, state.index + 1)) seen[card.tier]++;

	const expected = expectedCounts(state.deck.length);
	let count = 0;
	let weight = 0;
	for (const tier of Object.keys(expected) as Tier[]) {
		const left = Math.max(0, expected[tier] - seen[tier]);
		count += left;
		weight += left * TIER_WEIGHT[tier];
	}
	const average = count > 0 ? weight / count : TIER_WEIGHT.mid;
	return TIER_WEIGHT[item.tier] / average;
}

function fitsPosition(state: GameState, seat: PlayerId, item: Item): boolean {
	if (!state.config.positional) return true;
	return openSlots(state, seat).some((slot) => slotSuits(slot, item));
}

export function isWild(state: GameState, item: Item): boolean {
	return item.tier !== 'bad' && noise(item.id, gameSeed(state), 'wild') < WILD_ODDS;
}

/**
 * The most the bot will pay. Money is worth nothing once the roster is full, so it
 * starts from an even split across its open slots and scales from there.
 */
export function botLimit(
	state: GameState,
	seat: PlayerId,
	item: Item,
	context: BotContext = { raises: 0 }
): number {
	const perSlot = state.players[seat].money / Math.max(1, slotsLeft(state, seat));
	const taste = 1.1 + 0.4 * noise(item.id, gameSeed(state));
	let value = perSlot * relativeWorth(state, item) * taste;

	if (!fitsPosition(state, seat, item)) value *= OUT_OF_POSITION;

	if (isWild(state, item)) {
		const [low, high] = WILD_BOOST;
		value *= low + (high - low) * noise(item.id, gameSeed(state), 'boost');
	} else if (item.tier === 'good' || item.tier === 'great') {
		// A war over a card it already rates means it's worth fighting for. A war over
		// a mid card is the human overpaying, and the bot lets them.
		value *= Math.min(HEAT_CAP, 1 + HEAT_PER_RAISE * Math.max(0, context.raises - 2));
	}

	return Math.min(maxBid(state, seat), Math.round(value));
}

/** How long the bot waits before opening this card, or null if it never will. */
export function openingDelay(state: GameState, item: Item): number | null {
	if (isWild(state, item)) return OPENING_DELAYS[0];
	const roll = noise(item.id, gameSeed(state), 'open');
	let edge = 0;
	for (const [i, odds] of OPENING_ODDS[item.tier].entries()) {
		edge += odds;
		if (roll < edge) return OPENING_DELAYS[i] ?? null;
	}
	return null;
}

export function botAction(
	state: GameState,
	seat: PlayerId,
	context: BotContext = { raises: 0 }
): BotMove | null {
	if (state.phase !== 'resolve') return null;
	const item = currentItem(state);
	if (!item) return null;

	const mode = itemMode(state);

	if (mode === 'solo') {
		if (solventPlayer(state) !== seat) return null;
		// The opponent is broke, so anything passed now just fills their roster and
		// pushes the leftovers to the bot for free. Only pay for the good stuff.
		return think(
			item,
			item.tier === 'good' || item.tier === 'great'
				? { type: 'buy', player: seat, amount: 1 }
				: { type: 'decline', player: seat }
		);
	}

	if (mode !== 'contest') return null;

	const bid = state.bid;
	if (bid?.holder === seat) return null;

	const limit = botLimit(state, seat, item, context);
	// Past this, the opponent can't answer — anything more is money thrown away.
	const unbeatable = state.players[other(seat)].money + 1;

	if (!bid) {
		// Not worth a dollar, or not one it fancies opening: the human has to.
		const delay = openingDelay(state, item);
		if (limit < 1 || delay === null) return null;
		const opening = isWild(state, item) ? 0.7 : 0.4;
		const amount = Math.min(Math.max(1, Math.round(limit * opening)), unbeatable);
		return { action: { type: 'bid', player: seat, amount }, delay };
	}

	const sold = think(item, { type: 'sold', player: seat }, bid.amount);
	if (bid.amount + 1 > limit) return sold;

	// The closer the price gets to its limit, the likelier it lets go early instead
	// of answering every raise. Wild cards it fights for all the way.
	const headroom = (limit - bid.amount) / limit;
	if (!isWild(state, item) && noise(item.id, bid.amount, 'stay') > 0.7 + 0.3 * headroom) {
		return sold;
	}

	// Mostly +$1, sometimes a jump.
	const jump = noise(item.id, bid.amount) < 0.3 ? 2 : 1;
	const amount = Math.min(bid.amount + jump, limit, unbeatable);
	return think(item, { type: 'bid', player: seat, amount }, bid.amount);
}

function think(item: Item, action: Action, salt: string | number = ''): BotMove {
	const [low, high] = THINKING;
	return { action, delay: low + (high - low) * noise(item.id, salt, 'think') };
}
