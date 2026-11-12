import { MLB_ALL_TIME_STATS, MLB_CURRENT_STATS } from './mlb';
import {
	NBA_ALL_TIME_BR,
	NBA_ALL_TIME_STATS,
	NBA_CURRENT_2K,
	NBA_CURRENT_PLACES,
	NBA_CURRENT_STATS
} from './nba';
import {
	NFL_ALL_TIME_CBS,
	NFL_ALL_TIME_PLACES,
	NFL_ALL_TIME_STATS,
	NFL_CURRENT_PLACES,
	NFL_CURRENT_STATS,
	NFL_CURRENT_TOP100
} from './nfl';
import { NHL_ALL_TIME_STATS, NHL_CURRENT_STATS } from './nhl';
import { SOCCER_CURRENT_FOX } from './soccer';
import type { StatLine, StatTable } from './types';

export type { StatLine, StatTable } from './types';

const TABLES: Record<string, StatTable> = {
	'nba-current': NBA_CURRENT_STATS,
	'nba-all-time': NBA_ALL_TIME_STATS,
	'nfl-current': NFL_CURRENT_STATS,
	'nfl-all-time': NFL_ALL_TIME_STATS,
	'mlb-current': MLB_CURRENT_STATS,
	'mlb-all-time': MLB_ALL_TIME_STATS,
	'nhl-current': NHL_CURRENT_STATS,
	'nhl-all-time': NHL_ALL_TIME_STATS
};

export function statTable(variantId: string): StatTable | null {
	return TABLES[variantId] ?? null;
}

/** A rank list flipped so higher is better, like a rating. */
const fromRanks = (ranks: Record<string, number>) =>
	Object.fromEntries(Object.entries(ranks).map(([name, rank]) => [name, 101 - rank]));

/** Outside rankings (higher is better), blended with stats where a pool has them. */
const RATINGS: Record<string, Record<string, number>> = {
	'nba-current': NBA_CURRENT_2K,
	'nba-all-time': fromRanks(NBA_ALL_TIME_BR),
	'nfl-current': fromRanks(NFL_CURRENT_TOP100),
	'nfl-all-time': fromRanks(NFL_ALL_TIME_CBS),
	// Ranking only: soccer has no stat line that compares a keeper with a striker.
	'soccer-current': fromRanks(SOCCER_CURRENT_FOX)
};

export function ratingTable(variantId: string): Record<string, number> | null {
	return RATINGS[variantId] ?? null;
}

const PLACES: Record<string, Record<string, number>> = {
	'nba-current': NBA_CURRENT_PLACES,
	'nfl-current': NFL_CURRENT_PLACES,
	'nfl-all-time': NFL_ALL_TIME_PLACES
};

export function placeTable(variantId: string): Record<string, number> | null {
	return PLACES[variantId] ?? null;
}

/** Innings are written 180.1 = 180⅓. */
const innings = (ip: number) => Math.trunc(ip) + ((ip * 10) % 10) / 3;

/**
 * One number per line, higher is better. Only compared within the same `kind`,
 * so the scales don't have to agree across positions.
 */
export function statValue(line: StatLine): number {
	switch (line.kind) {
		case 'nba':
			return line.pts + 1.2 * line.reb + 1.5 * line.ast;
		case 'nfl-qb':
			return (line.passYds / 25 + 4 * line.passTd - 2 * line.int + line.rushYds / 10) / line.g;
		case 'nfl-skill':
			return (
				(line.rushYds / 10 + 6 * line.rushTd + line.rec + line.recYds / 10 + 6 * line.recTd) /
				line.g
			);
		case 'mlb-bat':
			return line.ops;
		case 'mlb-pitch':
			return ((line.so * 9) / innings(line.ip)) * 0.25 - line.era;
		case 'nhl-skater':
			return (1.2 * line.g + line.a) / line.gp;
		case 'nhl-goalie':
			return line.svPct * 100 - line.gaa;
	}
}
