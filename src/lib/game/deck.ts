import type { Item, Position, SlotSpec, Tier } from '$lib/data/types';
import { sample, shuffle, type Rng, defaultRng } from './rng';

/**
 * Deck curation. Exactly `players x slots` items, so the rosters consume it
 * precisely. Tiers never surface in the UI. Every great, good and mid item is
 * equally likely to be dealt, so each tier's share follows the pool and nothing
 * repeats more than the pool forces. Weighting by tier instead overdealt
 * whichever tier was smallest. A `bad` card only ever comes as the closer.
 *
 * Positional categories satisfy their position multiset first, then honour the
 * curve as closely as that allows.
 */

/**
 * A `bad` card is a rare closer, not a tax spread through the deck: most drafts
 * never see one, and the deck that does gets exactly one, dealt last. Nobody
 * wants to burn a roster slot on a dud mid-draft, but a dud arriving when a
 * player is broke with a slot open is the joke landing.
 */
const BAD_CARD_CHANCE = 0.4;

/** Chance a bad-free deck still ends on a `great`. */
const GREAT_FINALE_CHANCE = 0.675;
/** Given a `great` finale, chance the second-to-last is one too. */
const GREAT_PENULTIMATE_CHANCE = 0.45;

/** Backfill preference when a tier runs dry, so shortfalls land on `mid` first. */
const BACKFILL_ORDER: Tier[] = ['mid', 'good', 'great', 'bad'];

const isGreat = (item: Item) => item.tier === 'great';

export function deckSizeFor(slots: number, players = 2): number {
	return slots * players;
}

/** A pool has to cover both rosters, so this caps the slot input on setup. */
export function maxSlotsFor(poolSize: number): number {
	return Math.floor(poolSize / 2);
}

/** One of `options`, chosen with probability proportional to `weight`. */
function weightedPick<T>(
	options: readonly T[],
	weight: (option: T) => number,
	rng: Rng
): T | undefined {
	const total = options.reduce((sum, option) => sum + weight(option), 0);
	const roll = rng() * total;
	let running = 0;
	// The last option catches float drift, and an empty list gives undefined.
	return (
		options.find((option) => {
			running += weight(option);
			return roll < running;
		}) ?? options.at(-1)
	);
}

const isPositional = (roster: SlotSpec[]) => roster.some((slot) => slot.drafts !== null);

function groupByTier(pool: readonly Item[]): Record<Tier, Item[]> {
	const groups: Record<Tier, Item[]> = { bad: [], mid: [], good: [], great: [] };
	for (const item of pool) groups[item.tier].push(item);
	return groups;
}

/** Target count per tier for a deck of `size`, before pool shortfalls. */
function targetCounts(
	size: number,
	groups: Record<Tier, readonly Item[]>,
	rng: Rng
): Record<Tier, number> {
	const bad = rng() < BAD_CARD_CHANCE ? 1 : 0;
	// Draw as if from great, good and mid pooled together, so every item has the same chance.
	const band = [...groups.great, ...groups.good, ...groups.mid];
	const counts: Record<Tier, number> = { bad, mid: 0, good: 0, great: 0 };
	for (const item of sample(band, Math.max(0, size - bad), rng)) counts[item.tier]++;
	return counts;
}

/**
 * Swaps a `great` (or, when `wantGreat` is false, ordinary) item into `target`.
 * Swapping preserves the position multiset, so positional decks are safe.
 */
function swapInto(
	deck: Item[],
	target: number,
	wantGreat: boolean,
	locked: number[],
	rng: Rng
): void {
	const qualifies = (item: Item) => isGreat(item) === wantGreat;
	if (qualifies(deck[target])) return;

	const offLimits = new Set([target, ...locked]);
	const donors = deck
		.map((item, i) => ({ item, i }))
		.filter(({ item, i }) => !offLimits.has(i) && qualifies(item));
	if (donors.length === 0) return;

	const { i } = donors[Math.floor(rng() * donors.length)];
	[deck[target], deck[i]] = [deck[i], deck[target]];
}

/**
 * Weights the tail of the draw order. Probabilistic on purpose — a guaranteed
 * big finish would be readable across plays.
 */
function weightFinale(deck: Item[], rng: Rng): void {
	const last = deck.length - 1;
	if (last < 1) return;

	if (rng() >= GREAT_FINALE_CHANCE) {
		swapInto(deck, last, false, [], rng);
		return;
	}

	swapInto(deck, last, true, [], rng);
	if (last >= 2 && rng() < GREAT_PENULTIMATE_CHANCE) {
		swapInto(deck, last - 1, true, [last], rng);
	}
}

/**
 * Moves any `bad` card to the back of the draw order, and reports whether there
 * was one. A deck should hold at most one, but a pool thin enough to force a
 * backfill can smuggle in more; the tail is still where they belong.
 */
function sinkBadToTail(deck: Item[]): boolean {
	const bad = deck.filter((item) => item.tier === 'bad');
	if (bad.length === 0) return false;

	const rest = deck.filter((item) => item.tier !== 'bad');
	deck.splice(0, deck.length, ...rest, ...bad);
	return true;
}

/** Free-form decks: sample straight off the tier curve. */
function buildOpenDeck(pool: readonly Item[], size: number, rng: Rng): Item[] {
	const groups = groupByTier(pool);
	const wanted = targetCounts(size, groups, rng);

	const picked: Item[] = [];
	const leftovers: Record<Tier, Item[]> = { bad: [], mid: [], good: [], great: [] };

	for (const tier of BACKFILL_ORDER) {
		const available = shuffle(groups[tier], rng);
		const take = Math.min(wanted[tier], available.length);
		picked.push(...available.slice(0, take));
		leftovers[tier] = available.slice(take);
	}

	// Cover any tier that came up short, biased toward mid.
	for (const tier of BACKFILL_ORDER) {
		if (picked.length >= size) break;
		picked.push(...sample(leftovers[tier], size - picked.length, rng));
	}

	return picked.slice(0, size);
}

function countByPosition(pool: readonly Item[]): Map<Position, number> {
	const counts = new Map<Position, number>();
	for (const item of pool) {
		if (item.position) counts.set(item.position, (counts.get(item.position) ?? 0) + 1);
	}
	return counts;
}

/**
 * Which positions the deck will contain: one item per slot, per player. Shapes
 * the deck only — players can still slot anyone anywhere. A flex slot picks
 * a position weighted by how many the pool can spare, so a thin one isn't over-committed.
 */
function positionDemand(
	roster: SlotSpec[],
	pool: readonly Item[],
	rng: Rng,
	players: number
): Position[] {
	const supply = countByPosition(pool);
	const need = new Map<Position, number>();
	const claim = (position: Position) => need.set(position, (need.get(position) ?? 0) + 1);
	const headroom = (position: Position) => (supply.get(position) ?? 0) - (need.get(position) ?? 0);

	const forced = roster.filter((slot) => slot.drafts?.length === 1);
	const flexible = roster.filter((slot) => (slot.drafts?.length ?? 0) > 1);

	// One roster per player, so every slot is claimed once per player.
	for (let player = 0; player < players; player++) {
		for (const slot of forced) claim(slot.drafts![0]);
	}
	for (let player = 0; player < players; player++) {
		for (const slot of flexible) {
			// Weighted by headroom, so a thin position still turns up sometimes.
			const options = slot.drafts!.filter((position) => headroom(position) > 0);
			const position = weightedPick(options, headroom, rng) ?? slot.drafts![0];
			claim(position);
		}
	}

	const demand: Position[] = [];
	for (const [position, count] of need) {
		if (count > (supply.get(position) ?? 0)) {
			throw new Error(`Pool has ${supply.get(position) ?? 0} ${position}, needs ${count}`);
		}
		for (let i = 0; i < count; i++) demand.push(position);
	}
	return demand;
}

/**
 * Positions exactly, then every non-bad player in a position equally likely.
 * Scarce positions pick first. Picking a tier first and a player second skewed
 * it: a position's lone great turned up far more often than its mids.
 */
function buildPositionalDeck(
	pool: readonly Item[],
	roster: SlotSpec[],
	size: number,
	rng: Rng,
	players: number
): Item[] {
	const demand = positionDemand(roster, pool, rng, players);
	const supply = countByPosition(pool);

	const scarcestFirst = shuffle(demand, rng).sort(
		(a, b) => (supply.get(a) ?? 0) - (supply.get(b) ?? 0)
	);

	// The closer, when this deck gets one, goes to a position that has a bad card.
	const hasBad = (position: Position) =>
		pool.some((item) => item.position === position && item.tier === 'bad');
	const badSlots = scarcestFirst.flatMap((position, i) => (hasBad(position) ? [i] : []));
	const badSlot =
		badSlots.length > 0 && rng() < BAD_CARD_CHANCE
			? badSlots[Math.floor(rng() * badSlots.length)]
			: -1;

	const used = new Set<string>();
	const picked: Item[] = [];

	scarcestFirst.forEach((position, i) => {
		const candidates = pool.filter((item) => item.position === position && !used.has(item.id));
		if (candidates.length === 0) throw new Error(`Ran out of ${position} building the deck`);

		const bad = candidates.filter((item) => item.tier === 'bad');
		const ordinary = candidates.filter((item) => item.tier !== 'bad');
		// Onto a bad card only for the closer, or when the position has nothing else.
		const from = i === badSlot && bad.length > 0 ? bad : ordinary.length > 0 ? ordinary : bad;
		const chosen = from[Math.floor(rng() * from.length)];

		used.add(chosen.id);
		picked.push(chosen);
	});

	return picked.slice(0, size);
}

/** Whether a pool can supply every position a roster template demands. */
export function poolSupportsRoster(
	pool: readonly Item[],
	roster: SlotSpec[],
	players = 2
): boolean {
	if (!isPositional(roster)) return pool.length >= roster.length * players;
	try {
		positionDemand(roster, pool, defaultRng, players);
		return true;
	} catch {
		return false;
	}
}

/** Samples `players x roster.length` items in blind draw order. Throws on a pool too thin. */
export function buildDeck(
	pool: readonly Item[],
	roster: SlotSpec[],
	rng: Rng = defaultRng,
	players = 2
): Item[] {
	const size = deckSizeFor(roster.length, players);
	if (pool.length < size) {
		throw new Error(`Pool of ${pool.length} can't fill a ${size}-item deck`);
	}

	const picked = isPositional(roster)
		? buildPositionalDeck(pool, roster, size, rng, players)
		: buildOpenDeck(pool, size, rng);

	const deck = shuffle(picked, rng);
	// A `bad` card is the finale in its own right; otherwise weight toward a `great`.
	if (!sinkBadToTail(deck)) weightFinale(deck, rng);
	return deck;
}

/**
 * The positional items a deck left behind, shuffled. The engine swaps one in when
 * a slot's last natural fit has gone elsewhere (see `rebalance` in the engine).
 */
export function buildBench(
	pool: readonly Item[],
	roster: SlotSpec[],
	deck: readonly Item[],
	rng: Rng = defaultRng
): Item[] {
	if (!isPositional(roster)) return [];
	const dealt = new Set(deck.map((item) => item.id));
	return shuffle(
		pool.filter((item) => item.position && !dealt.has(item.id)),
		rng
	);
}
