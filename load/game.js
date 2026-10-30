import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

/**
 * Load test for remote play: each iteration is two players drafting one whole
 * game through the Edge Functions, refetching `game_public` after every move the
 * way a client does on a broadcast nudge.
 *
 *   k6 run load/game.js                    # local stack, CI profile
 *   PROFILE=stress k6 run load/game.js     # find where it bends
 */

const BASE = __ENV.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON = __ENV.SUPABASE_ANON_KEY || '';
const PROFILE = __ENV.PROFILE || 'ci';
// Seconds between moves. Real players take ~13s a card; this is a busy table.
const THINK = Number(__ENV.THINK ?? 0.2);

// The hosted project is a shared free tier that real people play on.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(BASE) && __ENV.ALLOW_REMOTE !== '1') {
	throw new Error(`Refusing to load-test ${BASE}. Set ALLOW_REMOTE=1 if you mean it.`);
}

const PROFILES = {
	ci: {
		executor: 'ramping-vus',
		stages: [
			{ duration: '15s', target: 10 },
			{ duration: '45s', target: 10 },
			{ duration: '10s', target: 0 }
		]
	},
	stress: {
		executor: 'ramping-vus',
		stages: [
			{ duration: '30s', target: 25 },
			{ duration: '1m', target: 50 },
			{ duration: '1m', target: 100 },
			{ duration: '30s', target: 0 }
		]
	}
};

export const options = {
	scenarios: { games: { ...PROFILES[PROFILE], gracefulRampDown: '60s' } },
	thresholds: {
		games_completed: ['rate>0.99'],
		checks: ['rate>0.99'],
		http_req_failed: ['rate<0.01'],
		illegal_moves: ['count==0'],
		'http_req_duration{endpoint:create-room}': ['p(95)<1500'],
		'http_req_duration{endpoint:join-room}': ['p(95)<1000'],
		'http_req_duration{endpoint:room-action}': ['p(95)<1000'],
		'http_req_duration{endpoint:game_public}': ['p(95)<400']
	},
	summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

// A 409 `stale` is the version check doing its job, not a failure.
http.setResponseCallback(http.expectedStatuses(200, 409));

const gamesCompleted = new Rate('games_completed');
const staleConflicts = new Counter('stale_conflicts');
const illegalMoves = new Counter('illegal_moves');
const gameDuration = new Trend('game_duration', true);

const CATEGORIES = ['foods', 'movies', 'nba', 'drinks', 'nfl', 'cartoons'];
const MAX_STEPS = 400;

const randomToken = () =>
	Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

/**
 * One fake address per seat per game. `actorOf` rate-limits by the first
 * `x-forwarded-for` hop, and real players don't share one IP.
 */
const fakeIp = (seat) => `10.${seat}.${__VU % 256}.${__ITER % 256}`;

/** A gateway error page isn't JSON, and a throw here would abort the whole game. */
function parse(res) {
	try {
		return res.json();
	} catch {
		return null;
	}
}

function call(fn, body, ip) {
	const res = http.post(`${BASE}/functions/v1/${fn}`, JSON.stringify(body), {
		headers: {
			'content-type': 'application/json',
			apikey: ANON,
			authorization: `Bearer ${ANON}`,
			'x-forwarded-for': ip
		},
		tags: { endpoint: fn }
	});
	return { res, data: parse(res) };
}

function readPublic(roomId, token) {
	const res = http.get(
		`${BASE}/rest/v1/game_public?select=payload,version,abandoned_by&room_id=eq.${roomId}`,
		{
			headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'x-player-token': token },
			tags: { endpoint: 'game_public' }
		}
	);
	const row = res.status === 200 ? parse(res)?.[0] : undefined;
	check(row, { 'game_public readable': (r) => r !== undefined });
	return row;
}

/** What the next move is, from the public state alone. Mirrors `itemMode`. */
function nextMoves(state) {
	if (state.phase === 'reveal') return [{ type: 'reveal' }];
	if (state.phase === 'award') return [{ type: 'next' }];

	const [a, b] = state.players;
	const full = (p) => p.roster.length >= state.config.slots;
	if (full(a) || full(b)) return [{ type: 'claim' }];
	if (a.money <= 0 && b.money <= 0) return [{ type: 'claim' }];
	if (a.money <= 0 || b.money <= 0) {
		const solvent = a.money > 0 ? 0 : 1;
		return Math.random() < 0.8
			? [{ type: 'buy', player: solvent, amount: 1 }]
			: [{ type: 'decline', player: solvent }];
	}

	if (!state.bid) {
		const opener = Math.random() < 0.5 ? 0 : 1;
		const amount = Math.min(state.players[opener].money, 1 + Math.floor(Math.random() * 3));
		// Sometimes both open at once, which is the race the version column settles.
		if (Math.random() < 0.3) {
			return [
				{ type: 'bid', player: 0, amount },
				{ type: 'bid', player: 1, amount }
			];
		}
		return [{ type: 'bid', player: opener, amount }];
	}

	const challenger = state.bid.holder === 0 ? 1 : 0;
	const raise = state.bid.amount + 1;
	const keepGoing = Math.random() < 0.6 && state.players[challenger].money >= raise;
	return [
		keepGoing
			? { type: 'bid', player: challenger, amount: raise }
			: { type: 'sold', player: challenger }
	];
}

/** Bid-type actions belong to a seat; the rest anyone in the room may send. */
const seatOf = (action, fallback) => action.player ?? fallback;

export default function () {
	const started = Date.now();
	const tokens = [randomToken(), randomToken()];

	const created = call(
		'create-room',
		{
			token: tokens[0],
			name: 'Load A',
			categoryId: CATEGORIES[(__VU + __ITER) % CATEGORIES.length],
			budget: 20,
			slots: 4,
			visibility: 'private'
		},
		fakeIp(0)
	);
	if (!check(created.res, { 'room created': (r) => r.status === 200 })) {
		gamesCompleted.add(false);
		return;
	}
	const { roomId } = created.data;

	const joined = call('join-room', { token: tokens[1], name: 'Load B', roomId }, fakeIp(1));
	if (!check(joined.res, { 'room joined': (r) => r.status === 200 })) {
		gamesCompleted.add(false);
		return;
	}

	const first = readPublic(roomId, tokens[0]);
	if (!first) {
		gamesCompleted.add(false);
		return;
	}
	let { payload: state, version } = first;
	let steps = 0;

	while (state.phase !== 'results' && steps++ < MAX_STEPS) {
		sleep(THINK);
		const moves = nextMoves(state);
		const requests = moves.map((action) => {
			const seat = seatOf(action, steps % 2);
			return {
				method: 'POST',
				url: `${BASE}/functions/v1/room-action`,
				body: JSON.stringify({ roomId, token: tokens[seat], action, version }),
				params: {
					headers: {
						'content-type': 'application/json',
						apikey: ANON,
						authorization: `Bearer ${ANON}`,
						'x-forwarded-for': fakeIp(seat)
					},
					tags: { endpoint: 'room-action', racing: String(moves.length > 1) }
				}
			};
		});

		const responses = http.batch(requests);
		// Whatever the server sent back, the newest wins, as in `room.svelte.ts`.
		const seen = [];
		for (const res of responses) {
			const body = parse(res);
			if (res.status === 409 && body?.error === 'stale') staleConflicts.add(1);
			else if (res.status === 409) illegalMoves.add(1, { move: moves[0].type });
			if (res.status !== 200 && body?.error !== 'stale') {
				console.warn(`${res.status} ${JSON.stringify(moves)} -> ${String(res.body).slice(0, 200)}`);
			}
			if (body?.state && Number.isInteger(body.version)) seen.push(body);
			check(res, { 'move accepted or stale': (r) => r.status === 200 || r.status === 409 });
		}
		if (moves.length > 1) {
			check(responses, {
				'exactly one racing bid wins': (rs) => rs.filter((r) => r.status === 200).length === 1
			});
		}

		// Every move nudges both players, and both refetch.
		const fresh = readPublic(roomId, tokens[0]);
		readPublic(roomId, tokens[1]);
		if (fresh) seen.push({ state: fresh.payload, version: fresh.version });

		for (const candidate of seen) {
			if (candidate.version >= version) ({ state, version } = candidate);
		}
	}

	const done = state.phase === 'results';
	gamesCompleted.add(done);
	if (done) gameDuration.add(Date.now() - started);

	const left = call('leave-room', { token: tokens[0], roomId }, fakeIp(0));
	check(left.res, { 'left room': (r) => r.status === 200 });
}
