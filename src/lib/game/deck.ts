import type { Item, Position, SlotSpec, Tier } from '$lib/data/types';
import { between, sample, shuffle, type Rng, defaultRng } from './rng';

/**
 * Deck curation. Exactly `2 x slots` items, so the two rosters consume it
 * precisely. Tiers never surface in the UI — they only shape the curve:
 * ~15-20% great, ~60-70% mid+good (mid dominant), ~15-20% bad, re-rolled inside
 * those bands every game so repeat decks don't feel stamped from one mould.
 *
 * Positional categories satisfy their position multiset first, then honour the
 * curve as closely as that allows.
 */

/** `good`'s share of the mid+good band. Mid keeps the majority either way. */
const GOOD_SHARE_OF_MIDDLE = [0.25, 0.35] as const;
const GREAT_BAND = [0.15, 0.2] as const;
const BAD_BAND = [0.15, 0.2] as const;

/** Chance the final item is a polarising one (a `great` or a `bad`). */
const POLARISED_FINALE_CHANCE = 0.675;
/** Given a polarised finale, chance the second-to-last is polarised too. */
const POLARISED_PENULTIMATE_CHANCE = 0.45;

/** Backfill preference when a tier runs dry, so shortfalls land on `mid` first. */
const BACKFILL_ORDER: Tier[] = ['mid', 'good', 'great', 'bad'];

const isPolarised = (item: Item) => item.tier === 'great' || item.tier === 'bad';

export function deckSizeFor(slots: number): number {
	return slots * 2;
}

/** A pool has to cover both rosters, so this caps the slot input on setup. */
export function maxSlotsFor(poolSize: number): number {
	return Math.floor(poolSize / 2);
}

const isPositional = (roster: SlotSpec[]) => roster.some((slot) => slot.drafts !== null);

function groupByTier(pool: readonly Item[]): Record<Tier, Item[]> {
	const groups: Record<Tier, Item[]> = { bad: [], mid: [], good: [], great: [] };
	for (const item of pool) groups[item.tier].push(item);
	return groups;
}

/** Target count per tier for a deck of `size`, before pool shortfalls. */
function targetCounts(size: number, rng: Rng): Record<Tier, number> {
	const great = Math.max(1, Math.round(size * between(GREAT_BAND[0], GREAT_BAND[1], rng)));
	const bad = Math.max(1, Math.round(size * between(BAD_BAND[0], BAD_BAND[1], rng)));
	const middle = Math.max(0, size - great - bad);
	// Below two slots there's no room to split the band; mid wins outright.
	const good =
		middle < 2
			? 0
			: Math.round(middle * between(GOOD_SHARE_OF_MIDDLE[0], GOOD_SHARE_OF_MIDDLE[1], rng));
	return { great, good, mid: middle - good, bad };
}

/**
 * Swaps a polarised (or, when `wantPolarised` is false, ordinary) item into
 * `target`. Swapping preserves the position multiset, so positional decks are safe.
 */
function swapInto(
	deck: Item[],
	target: number,
	wantPolarised: boolean,
	locked: number[],
	rng: Rng
): void {
	const qualifies = (item: Item) => isPolarised(item) === wantPolarised;
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

	if (rng() >= POLARISED_FINALE_CHANCE) {
		swapInto(deck, last, false, [], rng);
		return;
	}

	swapInto(deck, last, true, [], rng);
	if (last >= 2 && rng() < POLARISED_PENULTIMATE_CHANCE) {
		swapInto(deck, last - 1, true, [last], rng);
	}
}

/** Free-form decks: sample straight off the tier curve. */
function buildOpenDeck(pool: readonly Item[], size: number, rng: Rng): Item[] {
	const groups = groupByTier(pool);
	const wanted = targetCounts(size, rng);

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
 * whichever position the pool can best afford, so a thin one isn't over-committed.
 */
function positionDemand(roster: SlotSpec[], pool: readonly Item[], rng: Rng): Position[] {
	const supply = countByPosition(pool);
	const need = new Map<Position, number>();
	const claim = (position: Position) => need.set(position, (need.get(position) ?? 0) + 1);
	const headroom = (position: Position) => (supply.get(position) ?? 0) - (need.get(position) ?? 0);

	const forced = roster.filter((slot) => slot.drafts?.length === 1);
	const flexible = roster.filter((slot) => (slot.drafts?.length ?? 0) > 1);

	// One roster per player, so every slot is claimed twice.
	for (let player = 0; player < 2; player++) {
		for (const slot of forced) claim(slot.drafts![0]);
	}
	for (let player = 0; player < 2; player++) {
		for (const slot of flexible) {
			const options = slot.drafts!;
			const best = Math.max(...options.map(headroom));
			const roomiest = options.filter((position) => headroom(position) === best);
			claim(roomiest[Math.floor(rng() * roomiest.length)]);
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

/** Positions exactly, then the tier curve. Scarce positions pick first. */
function buildPositionalDeck(
	pool: readonly Item[],
	roster: SlotSpec[],
	size: number,
	rng: Rng
): Item[] {
	const demand = positionDemand(roster, pool, rng);
	const supply = countByPosition(pool);
	const quota = targetCounts(size, rng);

	const scarcestFirst = shuffle(demand, rng).sort(
		(a, b) => (supply.get(a) ?? 0) - (supply.get(b) ?? 0)
	);

	const used = new Set<string>();
	const picked: Item[] = [];

	for (const position of scarcestFirst) {
		const candidates = pool.filter((item) => item.position === position && !used.has(item.id));
		if (candidates.length === 0) throw new Error(`Ran out of ${position} building the deck`);

		// Spend the biggest outstanding tier quota first; that keeps mid dominant.
		const byDemand = BACKFILL_ORDER.filter((tier) => quota[tier] > 0).sort(
			(a, b) => quota[b] - quota[a]
		);

		let chosen: Item | undefined;
		for (const tier of byDemand) {
			const inTier = candidates.filter((item) => item.tier === tier);
			if (inTier.length > 0) {
				chosen = inTier[Math.floor(rng() * inTier.length)];
				break;
			}
		}
		// No candidate in any wanted tier, so the curve bends to the position.
		chosen ??= candidates[Math.floor(rng() * candidates.length)];

		used.add(chosen.id);
		quota[chosen.tier] = Math.max(0, quota[chosen.tier] - 1);
		picked.push(chosen);
	}

	return picked;
}

/** Whether a pool can supply every position a roster template demands. */
export function poolSupportsRoster(pool: readonly Item[], roster: SlotSpec[]): boolean {
	if (!isPositional(roster)) return pool.length >= roster.length * 2;
	try {
		positionDemand(roster, pool, defaultRng);
		return true;
	} catch {
		return false;
	}
}

/** Samples `2 x roster.length` items in blind draw order. Throws on a pool too thin. */
export function buildDeck(
	pool: readonly Item[],
	roster: SlotSpec[],
	rng: Rng = defaultRng
): Item[] {
	const size = deckSizeFor(roster.length);
	if (pool.length < size) {
		throw new Error(`Pool of ${pool.length} can't fill a ${size}-item deck`);
	}

	const picked = isPositional(roster)
		? buildPositionalDeck(pool, roster, size, rng)
		: buildOpenDeck(pool, size, rng);

	const deck = shuffle(picked, rng);
	weightFinale(deck, rng);
	return deck;
}
