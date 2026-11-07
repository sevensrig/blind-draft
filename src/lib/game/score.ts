import {
	placeTable,
	ratingTable,
	type StatLine,
	type StatTable,
	statTable,
	statValue
} from '$lib/data/stats';
import type { Item, Tier } from '$lib/data/types';
import type { GameState, PlayerId, RosterEntry } from './types';

/** Revealing these at the end is fine; during the draft tiers stay hidden. */
export const TIER_POINTS: Record<Tier, number> = { bad: 10, mid: 40, good: 70, great: 100 };

/** Most a pick can gain or lose for its price, so stars still decide most games. */
export const STEAL_CAP = 30;
/** Points per slot's-worth of budget saved against the fair price. */
const STEAL_RATE = 20;

export interface PickScore {
	entry: RosterEntry;
	stat: StatLine | null;
	base: number;
	steal: number;
	total: number;
}

export interface PlayerScore {
	picks: PickScore[];
	total: number;
}

export interface Scoreboard {
	players: [PlayerScore, PlayerScore];
	/** Null on a tie. */
	winner: PlayerId | null;
}

/** Each name's place among `values`, 0–1, with ties sharing the midpoint. */
function percentiles(values: [string, number][]): Map<string, number> {
	const ranks = new Map<string, number>();
	for (const [name, value] of values) {
		const below = values.filter(([, v]) => v < value).length;
		const ties = values.filter(([, v]) => v === value).length - 1;
		ranks.set(name, values.length > 1 ? (below + ties / 2) / (values.length - 1) : 1);
	}
	return ranks;
}

const cache = new Map<string, Map<string, number>>();

/**
 * Stat percentile among the pool's players of the same kind, averaged with the
 * outside-ranking percentile where the pool has one, then any hand-placed spots.
 * Ranked against the whole pool, not the deck, so a player is worth the same every game.
 */
function poolRanks(variantId: string, table: StatTable): Map<string, number> {
	const cached = cache.get(variantId);
	if (cached) return cached;

	const lines = Object.entries(table);
	const ranks = new Map<string, number>();
	for (const kind of new Set(lines.map(([, line]) => line.kind))) {
		const peers = lines.filter(([, line]) => line.kind === kind);
		const byStat = percentiles(peers.map(([name, line]) => [name, statValue(line)]));
		for (const [name, rank] of byStat) ranks.set(name, rank);
	}

	const ratings = ratingTable(variantId);
	if (ratings) {
		// Off the list ranks below everyone on it.
		const byRating = percentiles(lines.map(([name]) => [name, ratings[name] ?? 0]));
		for (const [name, rank] of ranks) ranks.set(name, (rank + (byRating.get(name) ?? 0)) / 2);
	}

	const places = placeTable(variantId);
	if (places) {
		// Scores stay with the places; the players are what move.
		const order = [...ranks].sort((a, b) => b[1] - a[1]);
		const names = order.map(([name]) => name).filter((name) => !(name in places));
		for (const [name, at] of Object.entries(places).sort((a, b) => a[1] - b[1]))
			names.splice(at - 1, 0, name);
		for (const [i, name] of names.entries()) ranks.set(name, order[i][1]);
	}

	cache.set(variantId, ranks);
	return ranks;
}

/** Same 10–100 scale as tiers, so the steal maths works for every category. */
function basePoints(item: Item, variantId: string): { base: number; stat: StatLine | null } {
	const table = statTable(variantId);
	const stat = table?.[item.name] ?? null;
	if (!table || !stat) return { base: TIER_POINTS[item.tier], stat: null };
	const rank = poolRanks(variantId, table).get(item.name) ?? 0;
	return { base: Math.round(10 + 90 * rank), stat };
}

/** A card's base points, 10–100, before any steal: what the scoreboard will pay out for it. */
export function itemPoints(item: Item, config: GameState['config']): number {
	if (config.customItems) return TIER_POINTS[item.tier];
	return basePoints(item, config.variantId).base;
}

/** Custom games have no ratings to score against, so they get no scoreboard. */
export function scoreGame(state: GameState): Scoreboard | null {
	if (state.config.customItems) return null;

	const rated = state.players.map((player) =>
		player.roster.map((entry) => ({ entry, ...basePoints(entry.item, state.config.variantId) }))
	);
	const all = rated.flat();
	if (!all.length) return null;

	const average = all.reduce((sum, pick) => sum + pick.base, 0) / all.length;
	const perSlot = state.config.budget / state.config.slots;

	const [a, b] = rated.map((picks) => {
		const scored = picks.map((pick): PickScore => {
			const fair = (perSlot * pick.base) / average;
			const raw = Math.round(((fair - pick.entry.price) / perSlot) * STEAL_RATE);
			const steal = Math.max(-STEAL_CAP, Math.min(STEAL_CAP, raw));
			return { ...pick, steal, total: pick.base + steal };
		});
		return { picks: scored, total: scored.reduce((sum, pick) => sum + pick.total, 0) };
	});

	const winner = a.total === b.total ? null : a.total > b.total ? 0 : 1;
	return { players: [a, b], winner };
}
