import type { StatTable } from './types';

/** 2025 regular season totals. */
export const NFL_CURRENT_STATS: StatTable = {
	// Great
	'Patrick Mahomes': { kind: 'nfl-qb', g: 14, passYds: 3587, passTd: 22, int: 11, rushYds: 422 },
	'Josh Allen': { kind: 'nfl-qb', g: 17, passYds: 3668, passTd: 25, int: 10, rushYds: 579 },
	'Lamar Jackson': { kind: 'nfl-qb', g: 13, passYds: 2549, passTd: 21, int: 7, rushYds: 349 },
	'Justin Jefferson': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 7,
		rushTd: 0,
		rec: 84,
		recYds: 1048,
		recTd: 2
	},
	"Ja'Marr Chase": {
		kind: 'nfl-skill',
		g: 16,
		rushYds: 14,
		rushTd: 0,
		rec: 125,
		recYds: 1412,
		recTd: 8
	},
	'Brock Bowers': {
		kind: 'nfl-skill',
		g: 12,
		rushYds: 2,
		rushTd: 0,
		rec: 64,
		recYds: 680,
		recTd: 7
	},
	'Tyreek Hill': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 53,
		rushTd: 0,
		rec: 81,
		recYds: 959,
		recTd: 6
	}, // 2024
	'Saquon Barkley': {
		kind: 'nfl-skill',
		g: 16,
		rushYds: 1140,
		rushTd: 7,
		rec: 37,
		recYds: 273,
		recTd: 2
	},
	'Joe Burrow': { kind: 'nfl-qb', g: 17, passYds: 4918, passTd: 43, int: 9, rushYds: 201 }, // 2024
	'Jalen Hurts': { kind: 'nfl-qb', g: 16, passYds: 3224, passTd: 25, int: 6, rushYds: 421 },

	// Good
	'CeeDee Lamb': {
		kind: 'nfl-skill',
		g: 14,
		rushYds: 2,
		rushTd: 0,
		rec: 75,
		recYds: 1077,
		recTd: 3
	},
	'A.J. Brown': {
		kind: 'nfl-skill',
		g: 15,
		rushYds: 0,
		rushTd: 0,
		rec: 78,
		recYds: 1003,
		recTd: 7
	},
	'Amon-Ra St. Brown': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 9,
		rushTd: 0,
		rec: 117,
		recYds: 1401,
		recTd: 11
	},
	'Travis Kelce': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1,
		rushTd: 0,
		rec: 76,
		recYds: 851,
		recTd: 5
	},
	'Derrick Henry': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1595,
		rushTd: 16,
		rec: 15,
		recYds: 150,
		recTd: 0
	},
	'George Kittle': {
		kind: 'nfl-skill',
		g: 11,
		rushYds: -3,
		rushTd: 0,
		rec: 57,
		recYds: 628,
		recTd: 7
	},
	'Malik Nabers': {
		kind: 'nfl-skill',
		g: 15,
		rushYds: 2,
		rushTd: 0,
		rec: 109,
		recYds: 1204,
		recTd: 7
	}, // 2024
	'Christian McCaffrey': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1202,
		rushTd: 10,
		rec: 102,
		recYds: 924,
		recTd: 7
	},
	'Puka Nacua': {
		kind: 'nfl-skill',
		g: 16,
		rushYds: 105,
		rushTd: 1,
		rec: 129,
		recYds: 1715,
		recTd: 10
	},
	'Jahmyr Gibbs': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1223,
		rushTd: 13,
		rec: 77,
		recYds: 616,
		recTd: 5
	},
	'Jayden Daniels': { kind: 'nfl-qb', g: 17, passYds: 3568, passTd: 25, int: 9, rushYds: 891 }, // 2024
	'Bijan Robinson': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1478,
		rushTd: 7,
		rec: 79,
		recYds: 820,
		recTd: 4
	},

	// Mid
	'Brock Purdy': { kind: 'nfl-qb', g: 9, passYds: 2167, passTd: 20, int: 10, rushYds: 147 },
	'Dak Prescott': { kind: 'nfl-qb', g: 17, passYds: 4552, passTd: 30, int: 10, rushYds: 177 },
	'Kyler Murray': { kind: 'nfl-qb', g: 17, passYds: 3851, passTd: 21, int: 11, rushYds: 572 }, // 2024
	'Tua Tagovailoa': { kind: 'nfl-qb', g: 14, passYds: 2660, passTd: 20, int: 15, rushYds: 43 },
	'Jared Goff': { kind: 'nfl-qb', g: 17, passYds: 4564, passTd: 34, int: 8, rushYds: 45 },
	'Baker Mayfield': { kind: 'nfl-qb', g: 17, passYds: 3693, passTd: 26, int: 11, rushYds: 382 },
	'C.J. Stroud': { kind: 'nfl-qb', g: 14, passYds: 3041, passTd: 19, int: 8, rushYds: 209 },
	'DK Metcalf': {
		kind: 'nfl-skill',
		g: 15,
		rushYds: 12,
		rushTd: 1,
		rec: 59,
		recYds: 850,
		recTd: 6
	},
	'Mike Evans': {
		kind: 'nfl-skill',
		g: 14,
		rushYds: 0,
		rushTd: 0,
		rec: 74,
		recYds: 1004,
		recTd: 11
	}, // 2024
	'Travis Hunter': {
		kind: 'nfl-skill',
		g: 7,
		rushYds: 0,
		rushTd: 0,
		rec: 28,
		recYds: 298,
		recTd: 1
	},
	'Drake London': {
		kind: 'nfl-skill',
		g: 12,
		rushYds: 0,
		rushTd: 0,
		rec: 68,
		recYds: 919,
		recTd: 7
	},
	'Davante Adams': {
		kind: 'nfl-skill',
		g: 14,
		rushYds: 0,
		rushTd: 0,
		rec: 60,
		recYds: 789,
		recTd: 14
	},
	'Garrett Wilson': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 5,
		rushTd: 0,
		rec: 101,
		recYds: 1104,
		recTd: 7
	}, // 2024
	'Nico Collins': {
		kind: 'nfl-skill',
		g: 15,
		rushYds: 15,
		rushTd: 1,
		rec: 71,
		recYds: 1117,
		recTd: 6
	},
	'Josh Jacobs': {
		kind: 'nfl-skill',
		g: 15,
		rushYds: 929,
		rushTd: 13,
		rec: 36,
		recYds: 282,
		recTd: 1
	},
	'James Cook': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1621,
		rushTd: 12,
		rec: 33,
		recYds: 291,
		recTd: 2
	},
	"De'Von Achane": {
		kind: 'nfl-skill',
		g: 16,
		rushYds: 1350,
		rushTd: 8,
		rec: 67,
		recYds: 488,
		recTd: 4
	},
	'Breece Hall': {
		kind: 'nfl-skill',
		g: 16,
		rushYds: 1065,
		rushTd: 4,
		rec: 36,
		recYds: 350,
		recTd: 1
	},
	'Sam LaPorta': { kind: 'nfl-skill', g: 9, rushYds: 0, rushTd: 0, rec: 40, recYds: 489, recTd: 3 },
	'Trey McBride': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 0,
		rushTd: 0,
		rec: 126,
		recYds: 1239,
		recTd: 11
	},
	'Mark Andrews': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 48,
		rushTd: 1,
		rec: 48,
		recYds: 422,
		recTd: 5
	},

	// Bad
	'Zach Wilson': { kind: 'nfl-qb', g: 12, passYds: 2271, passTd: 8, int: 7, rushYds: 211 }, // 2023
	'Trey Lance': { kind: 'nfl-qb', g: 4, passYds: 226, passTd: 0, int: 1, rushYds: 85 },
	'Daniel Jones': { kind: 'nfl-qb', g: 13, passYds: 3101, passTd: 19, int: 8, rushYds: 164 },
	'Justin Fields': { kind: 'nfl-qb', g: 9, passYds: 1259, passTd: 7, int: 1, rushYds: 383 },
	'Anthony Richardson': { kind: 'nfl-qb', g: 11, passYds: 1814, passTd: 8, int: 12, rushYds: 499 }, // 2024
	'Cooper Kupp': {
		kind: 'nfl-skill',
		g: 16,
		rushYds: 0,
		rushTd: 0,
		rec: 47,
		recYds: 593,
		recTd: 2
	},
	'Jerry Jeudy': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 5,
		rushTd: 0,
		rec: 50,
		recYds: 602,
		recTd: 2
	},
	'Ezekiel Elliott': {
		kind: 'nfl-skill',
		g: 15,
		rushYds: 226,
		rushTd: 3,
		rec: 12,
		recYds: 69,
		recTd: 0
	}, // 2024
	'Najee Harris': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1043,
		rushTd: 6,
		rec: 36,
		recYds: 283,
		recTd: 0
	}, // 2024
	'Kyle Pitts': { kind: 'nfl-skill', g: 17, rushYds: 0, rushTd: 0, rec: 88, recYds: 928, recTd: 5 },
	'Jaxon Smith-Njigba': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 36,
		rushTd: 0,
		rec: 119,
		recYds: 1793,
		recTd: 10
	},
	'Matthew Stafford': { kind: 'nfl-qb', g: 17, passYds: 4707, passTd: 46, int: 8, rushYds: 1 },
	'Drake Maye': { kind: 'nfl-qb', g: 17, passYds: 4394, passTd: 31, int: 8, rushYds: 450 },
	'Jonathan Taylor': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1585,
		rushTd: 18,
		rec: 46,
		recYds: 378,
		recTd: 2
	},
	'George Pickens': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 0,
		rushTd: 0,
		rec: 93,
		recYds: 1429,
		recTd: 9
	},
	'Justin Herbert': { kind: 'nfl-qb', g: 16, passYds: 3727, passTd: 26, int: 13, rushYds: 498 },
	'Bo Nix': { kind: 'nfl-qb', g: 17, passYds: 3931, passTd: 25, int: 11, rushYds: 356 },
	'Caleb Williams': { kind: 'nfl-qb', g: 17, passYds: 3942, passTd: 27, int: 7, rushYds: 388 },
	'Zay Flowers': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 62,
		rushTd: 1,
		rec: 86,
		recYds: 1211,
		recTd: 5
	},
	'Tetairoa McMillan': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 0,
		rushTd: 0,
		rec: 70,
		recYds: 1014,
		recTd: 7
	},
	'Kyren Williams': {
		kind: 'nfl-skill',
		g: 17,
		rushYds: 1252,
		rushTd: 10,
		rec: 36,
		recYds: 281,
		recTd: 3
	},
	'Luther Burden': {
		kind: 'nfl-skill',
		g: 15,
		rushYds: 37,
		rushTd: 0,
		rec: 47,
		recYds: 652,
		recTd: 2
	},
	'Bryce Young': { kind: 'nfl-qb', g: 16, passYds: 3011, passTd: 23, int: 11, rushYds: 216 }
};

/** Career regular season totals. */
export const NFL_ALL_TIME_STATS: StatTable = {
	// Great
	'Tom Brady': { kind: 'nfl-qb', g: 335, passYds: 89214, passTd: 649, int: 212, rushYds: 1123 },
	'Jerry Rice': {
		kind: 'nfl-skill',
		g: 303,
		rushYds: 645,
		rushTd: 10,
		rec: 1549,
		recYds: 22895,
		recTd: 197
	},
	'Peyton Manning': { kind: 'nfl-qb', g: 266, passYds: 71940, passTd: 539, int: 251, rushYds: 667 },
	'Joe Montana': { kind: 'nfl-qb', g: 192, passYds: 40551, passTd: 273, int: 139, rushYds: 1676 },
	'Barry Sanders': {
		kind: 'nfl-skill',
		g: 153,
		rushYds: 15269,
		rushTd: 99,
		rec: 352,
		recYds: 2921,
		recTd: 10
	},
	'Walter Payton': {
		kind: 'nfl-skill',
		g: 190,
		rushYds: 16726,
		rushTd: 110,
		rec: 492,
		recYds: 4538,
		recTd: 15
	},
	'Jim Brown': {
		kind: 'nfl-skill',
		g: 118,
		rushYds: 12312,
		rushTd: 106,
		rec: 262,
		recYds: 2499,
		recTd: 20
	},
	'Travis Kelce': {
		kind: 'nfl-skill',
		g: 192,
		rushYds: 16,
		rushTd: 2,
		rec: 1080,
		recYds: 13002,
		recTd: 82
	},
	'Randy Moss': {
		kind: 'nfl-skill',
		g: 218,
		rushYds: 159,
		rushTd: 0,
		rec: 982,
		recYds: 15292,
		recTd: 156
	},
	'Marvin Harrison': {
		kind: 'nfl-skill',
		g: 190,
		rushYds: 28,
		rushTd: 0,
		rec: 1102,
		recYds: 14580,
		recTd: 128
	},
	'Emmitt Smith': {
		kind: 'nfl-skill',
		g: 226,
		rushYds: 18355,
		rushTd: 164,
		rec: 515,
		recYds: 3224,
		recTd: 11
	},
	'Rob Gronkowski': {
		kind: 'nfl-skill',
		g: 143,
		rushYds: 2,
		rushTd: 1,
		rec: 621,
		recYds: 9286,
		recTd: 92
	},
	'Aaron Rodgers': { kind: 'nfl-qb', g: 264, passYds: 66274, passTd: 527, int: 123, rushYds: 3622 },
	'Patrick Mahomes': {
		kind: 'nfl-qb',
		g: 126,
		passYds: 35939,
		passTd: 267,
		int: 85,
		rushYds: 2665
	},

	// Good
	'Brett Favre': { kind: 'nfl-qb', g: 302, passYds: 71838, passTd: 508, int: 336, rushYds: 1844 },
	'Dan Marino': { kind: 'nfl-qb', g: 242, passYds: 61361, passTd: 420, int: 252, rushYds: 87 },
	'John Elway': { kind: 'nfl-qb', g: 234, passYds: 51475, passTd: 300, int: 226, rushYds: 3407 },
	'Tony Gonzalez': {
		kind: 'nfl-skill',
		g: 270,
		rushYds: 0,
		rushTd: 0,
		rec: 1325,
		recYds: 15127,
		recTd: 111
	},
	'Shannon Sharpe': {
		kind: 'nfl-skill',
		g: 204,
		rushYds: 0,
		rushTd: 0,
		rec: 815,
		recYds: 10060,
		recTd: 62
	},
	'Terrell Owens': {
		kind: 'nfl-skill',
		g: 219,
		rushYds: 251,
		rushTd: 3,
		rec: 1078,
		recYds: 15934,
		recTd: 153
	},
	'Steve Smith Sr.': {
		kind: 'nfl-skill',
		g: 219,
		rushYds: 387,
		rushTd: 2,
		rec: 1031,
		recYds: 14731,
		recTd: 81
	},
	'Drew Brees': { kind: 'nfl-qb', g: 287, passYds: 80358, passTd: 571, int: 243, rushYds: 752 },
	'Marshawn Lynch': {
		kind: 'nfl-skill',
		g: 149,
		rushYds: 10413,
		rushTd: 85,
		rec: 287,
		recYds: 2214,
		recTd: 9
	},
	'Adrian Peterson': {
		kind: 'nfl-skill',
		g: 184,
		rushYds: 14918,
		rushTd: 120,
		rec: 305,
		recYds: 2474,
		recTd: 6
	},
	'Calvin Johnson': {
		kind: 'nfl-skill',
		g: 135,
		rushYds: 167,
		rushTd: 1,
		rec: 731,
		recYds: 11619,
		recTd: 83
	},
	'Larry Fitzgerald': {
		kind: 'nfl-skill',
		g: 263,
		rushYds: 73,
		rushTd: 0,
		rec: 1432,
		recYds: 17492,
		recTd: 121
	},
	'Michael Vick': { kind: 'nfl-qb', g: 143, passYds: 22464, passTd: 133, int: 88, rushYds: 6109 },
	'Andre Johnson': {
		kind: 'nfl-skill',
		g: 193,
		rushYds: 54,
		rushTd: 0,
		rec: 1062,
		recYds: 14185,
		recTd: 70
	},
	'LaDainian Tomlinson': {
		kind: 'nfl-skill',
		g: 170,
		rushYds: 13684,
		rushTd: 145,
		rec: 624,
		recYds: 4772,
		recTd: 17
	},

	// Mid
	'Eli Manning': { kind: 'nfl-qb', g: 236, passYds: 57023, passTd: 366, int: 244, rushYds: 567 },
	'Ben Roethlisberger': {
		kind: 'nfl-qb',
		g: 249,
		passYds: 64088,
		passTd: 418,
		int: 211,
		rushYds: 1370
	},
	'Cam Newton': { kind: 'nfl-qb', g: 148, passYds: 32382, passTd: 194, int: 123, rushYds: 5628 },
	'Tony Romo': { kind: 'nfl-qb', g: 156, passYds: 34183, passTd: 248, int: 117, rushYds: 622 },
	'Chad Johnson': {
		kind: 'nfl-skill',
		g: 166,
		rushYds: 175,
		rushTd: 0,
		rec: 766,
		recYds: 11059,
		recTd: 67
	},
	'Antonio Brown': {
		kind: 'nfl-skill',
		g: 146,
		rushYds: 128,
		rushTd: 0,
		rec: 928,
		recYds: 12291,
		recTd: 83
	},
	'Julio Jones': {
		kind: 'nfl-skill',
		g: 166,
		rushYds: 163,
		rushTd: 0,
		rec: 914,
		recYds: 13703,
		recTd: 66
	},
	'Odell Beckham Jr.': {
		kind: 'nfl-skill',
		g: 119,
		rushYds: 170,
		rushTd: 1,
		rec: 575,
		recYds: 7987,
		recTd: 59
	},
	'Dez Bryant': {
		kind: 'nfl-skill',
		g: 119,
		rushYds: -3,
		rushTd: 0,
		rec: 537,
		recYds: 7506,
		recTd: 75
	},
	'Reggie Wayne': {
		kind: 'nfl-skill',
		g: 211,
		rushYds: 0,
		rushTd: 0,
		rec: 1070,
		recYds: 14345,
		recTd: 82
	},
	'Torry Holt': {
		kind: 'nfl-skill',
		g: 173,
		rushYds: 57,
		rushTd: 0,
		rec: 920,
		recYds: 13382,
		recTd: 74
	},
	'Eric Dickerson': {
		kind: 'nfl-skill',
		g: 146,
		rushYds: 13259,
		rushTd: 90,
		rec: 281,
		recYds: 2137,
		recTd: 6
	},
	'Frank Gore': {
		kind: 'nfl-skill',
		g: 241,
		rushYds: 16000,
		rushTd: 81,
		rec: 484,
		recYds: 3985,
		recTd: 18
	},
	"Le'Veon Bell": {
		kind: 'nfl-skill',
		g: 96,
		rushYds: 6554,
		rushTd: 42,
		rec: 399,
		recYds: 3289,
		recTd: 9
	},
	'Antonio Gates': {
		kind: 'nfl-skill',
		g: 236,
		rushYds: 0,
		rushTd: 0,
		rec: 955,
		recYds: 11841,
		recTd: 116
	},
	'Jason Witten': {
		kind: 'nfl-skill',
		g: 271,
		rushYds: 0,
		rushTd: 0,
		rec: 1228,
		recYds: 13046,
		recTd: 74
	},

	// Bad
	'Johnny Manziel': { kind: 'nfl-qb', g: 14, passYds: 1675, passTd: 7, int: 7, rushYds: 259 },
	'Tim Tebow': { kind: 'nfl-qb', g: 35, passYds: 2422, passTd: 17, int: 9, rushYds: 989 },
	'JaMarcus Russell': { kind: 'nfl-qb', g: 31, passYds: 4083, passTd: 18, int: 23, rushYds: 176 },
	'Ryan Leaf': { kind: 'nfl-qb', g: 25, passYds: 3666, passTd: 14, int: 36, rushYds: 127 },
	'Blake Bortles': { kind: 'nfl-qb', g: 78, passYds: 17649, passTd: 103, int: 75, rushYds: 1766 },
	'Mark Sanchez': { kind: 'nfl-qb', g: 79, passYds: 15357, passTd: 86, int: 89, rushYds: 457 },
	'Robert Griffin III': {
		kind: 'nfl-qb',
		g: 56,
		passYds: 9271,
		passTd: 43,
		int: 30,
		rushYds: 1809
	},
	'Trent Richardson': {
		kind: 'nfl-skill',
		g: 46,
		rushYds: 2032,
		rushTd: 17,
		rec: 113,
		recYds: 912,
		recTd: 2
	},
	'Sammy Watkins': {
		kind: 'nfl-skill',
		g: 111,
		rushYds: 76,
		rushTd: 0,
		rec: 364,
		recYds: 5384,
		recTd: 34
	},
	'Jimmy Graham': {
		kind: 'nfl-skill',
		g: 197,
		rushYds: 3,
		rushTd: 0,
		rec: 719,
		recYds: 8545,
		recTd: 89
	}
};

/** NFL Top 100 Players of 2026 rank (players' vote, nfl.com). Lower is better; absent = unranked. */
export const NFL_CURRENT_TOP100: Record<string, number> = {
	'Josh Allen': 2,
	'Bijan Robinson': 3,
	'Christian McCaffrey': 6,
	'Puka Nacua': 7,
	'Jahmyr Gibbs': 9,
	'Trey McBride': 13,
	'Derrick Henry': 15,
	"Ja'Marr Chase": 16,
	'Patrick Mahomes': 18,
	'Justin Jefferson': 19,
	'James Cook': 20,
	'Amon-Ra St. Brown': 22,
	"De'Von Achane": 26,
	'Dak Prescott': 31,
	'Jared Goff': 33,
	'Saquon Barkley': 34,
	'Joe Burrow': 44,
	'George Kittle': 46,
	'Davante Adams': 53,
	'CeeDee Lamb': 55,
	'Jalen Hurts': 56,
	'Nico Collins': 58,
	'Brock Bowers': 60,
	'Drake London': 66,
	'Lamar Jackson': 69,
	'Josh Jacobs': 74,
	'Baker Mayfield': 77,
	'Travis Kelce': 79,
	'A.J. Brown': 80,
	'Brock Purdy': 85,
	'Jaxon Smith-Njigba': 5,
	'Matthew Stafford': 4,
	'Drake Maye': 11,
	'Jonathan Taylor': 17,
	'George Pickens': 36,
	'Justin Herbert': 39,
	'Bo Nix': 59,
	'Caleb Williams': 51,
	'Zay Flowers': 71,
	'Tetairoa McMillan': 87,
	'Kyren Williams': 89,
	'Bryce Young': 98
};

/** CBS Sports' 100 greatest NFL players ever. Lower is better; absent = unranked. */
export const NFL_ALL_TIME_CBS: Record<string, number> = {
	'Tom Brady': 1,
	'Jerry Rice': 2,
	'Jim Brown': 3,
	'Walter Payton': 4,
	'Joe Montana': 5,
	'Peyton Manning': 6,
	'Barry Sanders': 9,
	'Dan Marino': 10,
	'Aaron Rodgers': 11,
	'Patrick Mahomes': 12,
	'Emmitt Smith': 18,
	'John Elway': 22,
	'Randy Moss': 23,
	'Brett Favre': 27,
	'Tony Gonzalez': 30,
	'Drew Brees': 33,
	'Larry Fitzgerald': 41,
	'Rob Gronkowski': 45,
	'LaDainian Tomlinson': 47,
	'Travis Kelce': 48,
	'Adrian Peterson': 49,
	'Calvin Johnson': 63,
	'Marvin Harrison': 65,
	'Eric Dickerson': 38
};

/**
 * Hand-placed spots (1 = best) in NFL Current, applied after the blend. The
 * player takes that place's score and everyone in between shifts one.
 */
export const NFL_CURRENT_PLACES: Record<string, number> = {
	'Bijan Robinson': 3,
	'Puka Nacua': 4,
	'Christian McCaffrey': 5,
	'Josh Allen': 6,
	'Matthew Stafford': 8,
	'Patrick Mahomes': 12,
	'Joe Burrow': 13,
	'Justin Jefferson': 15,
	'Trey McBride': 17,
	'Caleb Williams': 18,
	'Jared Goff': 19,
	'Lamar Jackson': 20,
	'CeeDee Lamb': 22,
	"De'Von Achane": 25,
	'Brock Bowers': 27,
	'Brock Purdy': 29,
	'Davante Adams': 32,
	'Nico Collins': 35,
	'Zay Flowers': 39,
	'Mike Evans': 42,
	'Tetairoa McMillan': 44,
	'Baker Mayfield': 45,
	'Luther Burden': 50,
	'Cooper Kupp': 53
};

/** Spots set by eye, applied after the blend, like `NFL_CURRENT_PLACES`. */
export const NFL_ALL_TIME_PLACES: Record<string, number> = {
	'Jim Brown': 2,
	'Patrick Mahomes': 10,
	'Cam Newton': 46
};
