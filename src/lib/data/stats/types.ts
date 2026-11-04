/**
 * Real stat lines for sports items, keyed by item name within a variant. Kept out
 * of the item seeds so the vendored server pools and saved games stay unchanged.
 *
 * Current = the most recent completed regular season; All-Time = career regular season.
 */
export type StatLine =
	/** Per-game averages. */
	| { kind: 'nba'; pts: number; reb: number; ast: number }
	/** Totals over `g` games. */
	| { kind: 'nfl-qb'; g: number; passYds: number; passTd: number; int: number; rushYds: number }
	| {
			kind: 'nfl-skill';
			g: number;
			rushYds: number;
			rushTd: number;
			rec: number;
			recYds: number;
			recTd: number;
	  }
	| { kind: 'mlb-bat'; avg: number; hr: number; rbi: number; ops: number }
	| { kind: 'mlb-pitch'; w: number; era: number; so: number; ip: number }
	| { kind: 'nhl-skater'; gp: number; g: number; a: number }
	| { kind: 'nhl-goalie'; gp: number; w: number; svPct: number; gaa: number };

export type StatTable = Record<string, StatLine>;
