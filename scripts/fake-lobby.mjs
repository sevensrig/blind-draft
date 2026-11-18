#!/usr/bin/env node
/**
 * Fills an online lobby with fake players, for testing 3–4 player rooms alone
 * against the LOCAL Supabase stack. The fakes then play the draft: they bid,
 * pass, take free picks, and turn cards over if you sit idle.
 *
 *   npm run fake-lobby -- 123456          # 2 fakes join your room (code 123456)
 *   npm run fake-lobby -- 123456 3        # 3 fakes join
 *   npm run fake-lobby -- --host 4 2      # a fake hosts a 4-player room with 1 more
 *                                         # fake in it; you join as a guest and the
 *                                         # fake host starts 8s after you arrive
 *
 * Ctrl+C makes every fake leave. Needs `npx supabase start` and
 * `npx supabase functions serve --no-verify-jwt` running, and `.env` pointing at
 * http://127.0.0.1:54321. It refuses any other URL so it never touches production.
 */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
	itemMode,
	maxBid,
	minBid,
	solventPlayer,
	stillToAnswer
} from '../supabase/functions/_shared/vendor/game/engine.ts';

const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split('\n')
		.map((line) => line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?/))
		.filter(Boolean)
		.map((match) => [match[1], match[2]])
);
const BASE = process.env.PUBLIC_SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL;
const KEY = process.env.PUBLIC_SUPABASE_ANON_KEY ?? env.PUBLIC_SUPABASE_ANON_KEY;
if (!BASE || !KEY) throw new Error('PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY missing from .env');
if (!/^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.|10\.)/.test(BASE)) {
	throw new Error(`Refusing to run against ${BASE}: local Supabase only.`);
}

const NAMES = ['Maya', 'Jordan', 'Priya', 'Leo', 'Sam', 'Ivy'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function headers(token) {
	return {
		'content-type': 'application/json',
		apikey: KEY,
		authorization: `Bearer ${KEY}`,
		...(token ? { 'x-player-token': token } : {}),
		// Its own address per fake, so the per-IP rate limit treats them as separate phones.
		'x-forwarded-for': `10.77.${between(1, 250)}.${between(1, 250)}`
	};
}

async function call(fn, body) {
	const res = await fetch(`${BASE}/functions/v1/${fn}`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify(body)
	});
	return { status: res.status, body: await res.json().catch(() => ({})) };
}

class Fake {
	constructor(name) {
		this.name = name;
		this.token = randomBytes(24).toString('hex');
		this.seat = null;
		this.roomId = null;
		/** What this fake will pay for the current card, picked fresh per card. */
		this.values = new Map();
	}

	async view() {
		const res = await fetch(
			`${BASE}/rest/v1/game_public?room_id=eq.${this.roomId}&select=payload,version`,
			{ headers: headers(this.token) }
		);
		const [row] = await res.json();
		return row;
	}

	async act(action, version) {
		const res = await call('room-action', {
			token: this.token,
			roomId: this.roomId,
			action,
			version
		});
		if (res.status === 200) log(`${this.name}: ${describe(action)}`);
		return res;
	}

	valueFor(state) {
		const key = `${state.itemNumber}:${state.item?.id}`;
		if (!this.values.has(key)) {
			const fair = state.config.budget / state.config.slots;
			this.values.set(key, between(1, Math.ceil(fair * 1.8)));
		}
		return this.values.get(key);
	}
}

const log = (line) => console.log(`${new Date().toLocaleTimeString()}  ${line}`);
const describe = (action) =>
	({
		bid: `bids $${action.amount}`,
		sold: 'passes',
		buy: `names a price, $${action.amount}`,
		decline: 'declines, so it goes free',
		claim: 'hands out the free pick',
		reveal: 'turns the card over',
		next: 'moves to the next card'
	})[action.type] ?? action.type;

/** The public projection is enough for the engine's read-only helpers. */
const asState = (view) => ({ ...view, deck: view.item ? [view.item] : [], index: 0 });

/** One decision per fake per state version, after a human-ish pause. */
async function play(fakes, { hostFake }) {
	let seenVersion = -1;
	let seenAt = Date.now();
	let lobbyNames = '';
	let humanJoinedAt = null;
	const done = new Set();

	for (;;) {
		await sleep(600);
		const row = await fakes[0].view().catch(() => null);
		if (!row) continue;
		const view = row.payload;
		if (row.version !== seenVersion) {
			seenVersion = row.version;
			seenAt = Date.now();
			done.clear();
		}
		const idle = Date.now() - seenAt;

		// Seats close up when the lobby starts, so look ourselves up again.
		for (const fake of fakes) {
			const seat = view.seatIds?.indexOf(fake.playerId);
			if (seat !== undefined && seat >= 0) fake.seat = seat;
		}

		if (view.phase === 'setup') {
			const names = view.players.map((player) => player.name).join(', ');
			if (names !== lobbyNames) {
				lobbyNames = names;
				log(`lobby ${view.seatsTaken}/${view.maxPlayers}: ${names}`);
			}
			const humans = view.players.length - fakes.length;
			if (hostFake && humans > 0) {
				humanJoinedAt ??= Date.now();
				if (Date.now() - humanJoinedAt > 8000) {
					const res = await call('start-room', { token: hostFake.token, roomId: hostFake.roomId });
					log(`${hostFake.name} starts the draft (${res.status})`);
					humanJoinedAt = Infinity;
				}
			}
			continue;
		}

		if (view.phase === 'results') {
			log('draft finished. Fakes stay seated; Ctrl+C to make them leave.');
			return;
		}

		const state = asState(view);
		// Housekeeping no one is waiting on a fake for: only after you've sat idle.
		const housekeeper = fakes[0];
		if (view.phase === 'reveal' && idle > 5000) {
			await housekeeper.act({ type: 'reveal' }, row.version);
			continue;
		}
		if (view.phase === 'award' && idle > 5000) {
			await housekeeper.act({ type: 'next' }, row.version);
			continue;
		}
		if (view.phase !== 'resolve') continue;

		const mode = itemMode(state);
		if (mode === 'alternate' || mode === 'forced') {
			if (idle > 3500) await housekeeper.act({ type: 'claim' }, row.version);
			continue;
		}

		for (const fake of fakes) {
			if (fake.seat === null || done.has(fake)) continue;
			const pause = between(1200, 2600);
			if (idle < pause) continue;

			if (mode === 'solo') {
				if (solventPlayer(state) !== fake.seat) continue;
				done.add(fake);
				const action =
					Math.random() < 0.6
						? { type: 'buy', player: fake.seat, amount: 1 }
						: { type: 'decline', player: fake.seat };
				await fake.act(action, row.version);
				break;
			}

			// Contest: only a fake still in on this card has a say.
			if (!stillToAnswer(state).includes(fake.seat)) continue;
			const floor = minBid(state);
			const ceiling = Math.min(maxBid(state, fake.seat), fake.valueFor(view));
			if (!view.bid) {
				// Opening is mandatory, but give you first go at it.
				if (idle < 4500) continue;
				done.add(fake);
				await fake.act(
					{ type: 'bid', player: fake.seat, amount: Math.max(1, Math.min(ceiling, floor)) },
					row.version
				);
				break;
			}
			done.add(fake);
			if (floor <= ceiling) {
				const amount = Math.min(ceiling, floor + (Math.random() < 0.25 ? 1 : 0));
				await fake.act({ type: 'bid', player: fake.seat, amount }, row.version);
			} else {
				await fake.act({ type: 'sold', player: fake.seat }, row.version);
			}
			// One move per version: anything else is stale now.
			break;
		}
	}
}

async function main() {
	const args = process.argv.slice(2);
	const hosting = args[0] === '--host';
	const fakes = [];
	let hostFake = null;
	let code;

	if (hosting) {
		const size = Number(args[1] ?? 4);
		const count = Number(args[2] ?? 2);
		hostFake = new Fake(NAMES[0]);
		const created = await call('create-room', {
			token: hostFake.token,
			name: hostFake.name,
			categoryId: 'celebrities',
			variantId: '',
			budget: 20,
			slots: 3,
			maxPlayers: size,
			visibility: 'private'
		});
		if (created.status !== 200) throw new Error(`create-room: ${JSON.stringify(created.body)}`);
		hostFake.roomId = created.body.roomId;
		hostFake.playerId = created.body.playerId;
		hostFake.seat = 0;
		code = created.body.code;
		fakes.push(hostFake);
		log(`${hostFake.name} hosts a ${size}-player room. Join with code ${code}`);
		for (let i = 1; i < count; i++) fakes.push(new Fake(NAMES[i]));
	} else {
		code = args[0];
		if (!/^\d{4,6}$/.test(code ?? '')) {
			console.error('Usage: npm run fake-lobby -- <room code> [fakes]   |   npm run fake-lobby -- --host [size] [fakes]');
			process.exit(1);
		}
		const count = Number(args[1] ?? 2);
		for (let i = 0; i < count; i++) fakes.push(new Fake(NAMES[i]));
	}

	// One at a time, so you can watch the lobby fill.
	for (const fake of fakes) {
		if (fake === hostFake) continue;
		await sleep(1500);
		const res = await call('join-room', { token: fake.token, code, name: fake.name });
		if (res.status !== 200) {
			log(`${fake.name} could not join: ${res.body.message ?? res.status}`);
			fakes.splice(fakes.indexOf(fake), 1);
			continue;
		}
		Object.assign(fake, { roomId: res.body.roomId, seat: res.body.seat, playerId: res.body.playerId });
		log(`${fake.name} joined seat ${fake.seat + 1}`);
	}
	if (fakes.length === 0) process.exit(1);

	// Sit on the room's presence channel like a real phone, or the room reports them away.
	// One client each: channels for the same room on one client collide, and only one shows up.
	for (const fake of fakes) {
		const realtime = createClient(BASE, KEY, { auth: { persistSession: false } });
		const channel = realtime.channel(`room:${fake.roomId}`, {
			config: { presence: { key: fake.playerId } }
		});
		channel.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') await channel.track({ seat: fake.seat, at: Date.now() });
		});
	}

	const leave = async () => {
		log('fakes leaving…');
		await Promise.all(fakes.map((fake) => call('leave-room', { token: fake.token, roomId: fake.roomId })));
		process.exit(0);
	};
	process.on('SIGINT', leave);

	await play(fakes, { hostFake });
	// Stay seated until Ctrl+C.
	setInterval(() => {}, 60_000);
}

main().catch((error) => {
	console.error(error.message ?? error);
	process.exit(1);
});
