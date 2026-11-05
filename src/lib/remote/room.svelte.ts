import { gameEvent, track, trackTransition } from '$lib/analytics';
import { canBid, other } from '$lib/game/engine';
import type { Action } from '$lib/game/types';
import { toGameState } from './adapt';
import { emoteById, type EmoteId } from './emotes';
import { LOBBY_HOSTS, RemoteError, callFunction, supabase } from './client';
import { deviceToken, forgetSeat, rememberSeat } from './identity';
import { type PendingBid, believable, landed, readAnnouncement, withBid } from './pending';
import type {
	ChatMessage,
	ConnectionStatus,
	EmoteEvent,
	PublicGameState,
	RematchOffer,
	RoomSettings
} from './types';

/** How long an emote bubble stays up. */
const EMOTE_MS = 2500;

/**
 * How long an announced bid may stand without the server backing it. Long enough
 * for a cold function start; a dropped or forged one is gone after this.
 */
const ANNOUNCED_BID_TTL_MS = 4000;

/**
 * The remote counterpart to `$lib/game/store.svelte.ts`: same actions, posted to
 * an Edge Function instead of a local reducer. Two rules run through it —
 * connect *fetches* before subscribing, and the server always wins.
 */
class RemoteRoom {
	#roomId = $state<string | null>(null);
	#seat = $state<0 | 1 | null>(null);
	/** The server's word. Only `#apply` writes it, so analytics never sees a guess. */
	#state = $state<PublicGameState | null>(null);
	#version = $state(0);
	/*
	 * Bids on screen before the server has them. Raw so the identity checks that
	 * clear them compare against what was stored, not a proxy of it.
	 */
	#mine = $state.raw<PendingBid | null>(null);
	#theirs = $state.raw<PendingBid | null>(null);
	/** What the screen shows: the server's state with any pending bids drawn on. */
	#view = $derived.by(() => {
		let view = this.#state;
		if (!view) return null;
		if (this.#theirs?.base === this.#version) view = withBid(view, this.#theirs);
		if (this.#mine) view = withBid(view, this.#mine);
		return view;
	});
	#theirsTimer: ReturnType<typeof setTimeout> | null = null;
	/** Moves waiting for the opponent's announced bid to land or lapse. */
	#waiting: (() => void)[] = [];
	#status = $state<ConnectionStatus>('idle');
	/* Room metadata, not game state — the server never puts it in game_public. */
	#code = $state<string | null>(null);
	#message = $state<string | null>(null);
	/** Set when a move was refused, so the UI can say why without inventing state. */
	#lastRejection = $state<string | null>(null);
	/** Seat that quit. Null while the game is live. */
	#abandonedBy = $state<0 | 1 | null>(null);
	/** Pending rematch offer, and the seat that walked away from the results. */
	#rematch = $state<RematchOffer | null>(null);
	#leftBy = $state<0 | 1 | null>(null);
	#emotes = $state<EmoteEvent[]>([]);
	#chat = $state<ChatMessage[]>([]);
	#emoteKey = 0;

	#channel: ReturnType<ReturnType<typeof supabase>['channel']> | null = null;
	/** Our presence on `LOBBY_HOSTS`, held only while a public lobby waits. */
	#lobby: ReturnType<ReturnType<typeof supabase>['channel']> | null = null;

	get roomId() {
		return this.#roomId;
	}
	get seat() {
		return this.#seat;
	}
	get state() {
		return this.#view;
	}
	get version() {
		return this.#version;
	}
	get status() {
		return this.#status;
	}
	get code() {
		return this.#code;
	}
	get message() {
		return this.#message;
	}
	get lastRejection() {
		return this.#lastRejection;
	}
	get abandonedBy() {
		return this.#abandonedBy;
	}
	/** Emotes still on screen, oldest first. */
	get emotes() {
		return this.#emotes;
	}
	get chat() {
		return this.#chat;
	}

	get rematch() {
		return this.#rematch;
	}

	/** The other player left the results sheet, so no rematch is coming. */
	get opponentGone() {
		return this.#leftBy !== null && this.#leftBy !== this.#seat;
	}

	/** The *other* player quit. A server fact, so unlike `opponent-away` it never clears. */
	get opponentLeft() {
		return this.#abandonedBy !== null && this.#abandonedBy !== this.#seat;
	}

	/**
	 * The server's count, not a name check — a fresh game seeds a placeholder name
	 * for player two, so "has a name" reports the room full before anyone joins.
	 */
	get bothSeated() {
		return (this.#state?.seatsTaken ?? 0) >= 2;
	}

	async create(
		options: RoomSettings & { visibility: 'public' | 'private'; name: string }
	): Promise<{ roomId: string; code: string }> {
		const result = await callFunction<{ roomId: string; code: string; seat: 0 }>('create-room', {
			...options,
			token: deviceToken()
		});
		rememberSeat(result.roomId, result.seat);
		this.#code = result.code;
		return result;
	}

	/** Join by id or code. Also the rejoin path — the token decides which. */
	async join(target: {
		roomId?: string;
		code?: string;
		name?: string;
	}): Promise<{ roomId: string; seat: 0 | 1 }> {
		const result = await callFunction<{ roomId: string; seat: 0 | 1 }>('join-room', {
			...target,
			token: deviceToken()
		});
		rememberSeat(result.roomId, result.seat);
		return result;
	}

	/**
	 * Attaches to a room: fetch, then subscribe. Subscribe-first would leave a
	 * reconnecting player staring at nothing until the opponent moved.
	 */
	async connect(roomId: string, seat: 0 | 1): Promise<void> {
		this.disconnect();
		this.#roomId = roomId;
		this.#seat = seat;
		this.#status = 'connecting';
		this.#message = null;
		this.#abandonedBy = null;
		this.#rematch = null;
		this.#leftBy = null;
		this.#emotes = [];
		this.#chat = [];

		try {
			await this.#pull();
		} catch (error) {
			this.#status = 'error';
			this.#message = error instanceof Error ? error.message : 'Could not load that room';
			return;
		}

		const client = supabase();
		this.#channel = client
			.channel(`room:${roomId}`, { config: { presence: { key: String(seat) } } })
			/*
			 * Broadcast, not Postgres Changes: `game_public`'s policy checks the
			 * `x-player-token` header, which Realtime doesn't send, so row
			 * subscriptions were silently denied. A trigger nudges instead and we
			 * re-fetch over REST, where the token is checked.
			 *
			 * Always re-fetch: the nudge means "something changed", not "the version
			 * went up" — a second player joining rewrites the payload without a game
			 * action, and gating on the version left the host stuck in the lobby.
			 */
			.on('broadcast', { event: 'state' }, () => void this.#pull())
			/*
			 * The opponent's bid, sent straight from their browser while their
			 * request is still on its way. Drawn as a guess; the nudge above brings
			 * the truth a few hundred milliseconds later.
			 */
			.on('broadcast', { event: 'bid' }, ({ payload }) => this.#hear(payload))
			// `self` is off, so anything arriving here came from the other seat.
			.on('broadcast', { event: 'emote' }, ({ payload }) => {
				const emote = emoteById(payload?.emote);
				if (emote) this.#showEmote(other(seat), emote.id);
			})
			.on('broadcast', { event: 'chat' }, () => void this.#pullChat())
			.on('presence', { event: 'sync' }, () => {
				const seats = Object.keys(this.#channel?.presenceState() ?? {});
				const opponentHere = seats.some((key) => key !== String(seat));
				// Only while the game is live: a lobby isn't an abandoned game, and
				// 'ended' is excluded because a quitter also drops presence — that
				// would downgrade a closed game to "maybe reconnecting".
				if (this.#status === 'live' || this.#status === 'opponent-away') {
					this.#status = opponentHere ? 'live' : 'opponent-away';
				}
			});

		await this.#channel.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				await this.#channel?.track({ seat, at: Date.now() });
				// The pull above may already have found a closed room; don't undo it.
				if (this.#status !== 'ended') {
					this.#status = this.bothSeated ? 'live' : 'waiting';
				}
				if (this.#status === 'waiting') void this.#advertise(roomId);
			}
		});
		void this.#pullChat();
	}

	/** Fire and forget: an emote that doesn't arrive isn't worth an error. */
	emote(id: EmoteId): void {
		if (!this.#channel || this.#seat === null) return;
		this.#showEmote(this.#seat, id);
		void this.#channel.send({ type: 'broadcast', event: 'emote', payload: { emote: id } });
	}

	/** Throws `RemoteError` when refused, so the form can keep the text and say why. */
	async say(text: string): Promise<void> {
		if (!this.#roomId) return;
		await callFunction('room-chat', { roomId: this.#roomId, token: deviceToken(), text });
		await this.#pullChat();
	}

	/** Sends an action and takes whatever the server says the truth is. */
	async dispatch(action: Action): Promise<void> {
		const roomId = this.#roomId;
		if (!roomId) return;
		this.#lastRejection = null;
		const mine = this.#guess(action);

		try {
			/*
			 * A move made while the opponent's bid is still a guess answers that
			 * guess. Sent now it would carry the version from before their bid, and
			 * lose to it as `stale` — so it waits, and goes out only if what it
			 * answered really landed. Your own screen already shows it.
			 */
			const answering = this.#theirs;
			if (answering) {
				await this.#settled();
				if (this.#roomId !== roomId) return;
				if (!landed(this.#state, answering)) {
					this.#lastRejection = "Your opponent's bid didn't go through.";
					return;
				}
			}
			if (mine) this.#announce({ ...mine, base: this.#version });

			const result = await callFunction<{ state: PublicGameState; version: number }>(
				'room-action',
				{ roomId, token: deviceToken(), action, version: this.#version }
			);
			this.#apply(result.state, result.version);
		} catch (error) {
			if (error instanceof RemoteError) {
				// `stale` and `illegal_action` carry the corrected state, so the loser
				// of a race sees reality rather than a bid that never landed.
				const state = error.payload.state as PublicGameState | null | undefined;
				const version = error.payload.version as number | null | undefined;
				if (state && typeof version === 'number') this.#apply(state, version);

				this.#lastRejection =
					error.code === 'stale'
						? 'Your opponent got there first.'
						: error.code === 'illegal_action'
							? 'That move is not legal right now.'
							: error.message;
				return;
			}
			this.#lastRejection = 'Something went wrong. Try that again.';
		} finally {
			// Whatever came back (or didn't) is now the truth on screen.
			if (mine && this.#mine === mine) this.#mine = null;
		}
	}

	/** Offers a rematch on these settings, replacing any offer on the table. */
	async proposeRematch(settings: RoomSettings): Promise<void> {
		await this.#rematchCall({ op: 'propose', ...settings });
	}

	/** Takes the opponent's offer. The server deals and both screens follow. */
	async acceptRematch(): Promise<void> {
		const result = await this.#rematchCall<{ state: PublicGameState; version: number }>({
			op: 'accept'
		});
		if (result) {
			this.#rematch = null;
			this.#apply(result.state, result.version);
		}
	}

	/** Withdraws our offer or turns down theirs. */
	async cancelRematch(): Promise<void> {
		await this.#rematchCall({ op: 'cancel' });
	}

	async #rematchCall<T>(body: Record<string, unknown>): Promise<T | null> {
		if (!this.#roomId) return null;
		this.#lastRejection = null;
		try {
			const result = await callFunction<T>('rematch', {
				...body,
				roomId: this.#roomId,
				token: deviceToken()
			});
			await this.#pull();
			return result;
		} catch (error) {
			this.#lastRejection =
				error instanceof RemoteError ? error.message : 'Something went wrong. Try that again.';
			// The offer may have changed under us; show what's really there.
			await this.#pull().catch(() => {});
			return null;
		}
	}

	disconnect(): void {
		this.#unadvertise();
		this.#dropTheirs();
		if (this.#channel) {
			void supabase().removeChannel(this.#channel);
			this.#channel = null;
		}
		this.#status = 'idle';
	}

	/**
	 * Quits for real: closes the room on the server, then clears this device. A
	 * local-only leave left the room `open`/`playing` and the opponent untold.
	 *
	 * The server call is awaited but never allowed to fail the leave — stranding a
	 * quitter on a dropped request would be worse. Cleanup closes it eventually.
	 */
	async leave(): Promise<void> {
		const roomId = this.#roomId;
		const state = this.#state;
		if (state && this.#abandonedBy === null && state.seatsTaken >= 2) {
			trackTransition(state, { ...state, phase: 'setup' }, 'online');
		}
		if (roomId) {
			try {
				await callFunction('leave-room', { roomId, token: deviceToken() });
			} catch (error) {
				console.error('leave-room failed', error);
			}
			forgetSeat(roomId);
		}
		this.disconnect();
		this.#roomId = null;
		this.#seat = null;
		this.#state = null;
		this.#version = 0;
		this.#mine = null;
		this.#abandonedBy = null;
		this.#rematch = null;
		this.#leftBy = null;
		this.#lastRejection = null;
		this.#emotes = [];
		this.#chat = [];
	}

	#showEmote(seat: 0 | 1, emote: EmoteId): void {
		const key = ++this.#emoteKey;
		// Capped so a spammer can't pile bubbles up the screen.
		this.#emotes = [...this.#emotes.slice(-3), { key, seat, emote }];
		setTimeout(() => {
			this.#emotes = this.#emotes.filter((entry) => entry.key !== key);
		}, EMOTE_MS);
	}

	async #pullChat(): Promise<void> {
		const roomId = this.#roomId;
		if (!roomId) return;
		const { data, error } = await supabase()
			.from('chat_messages')
			.select('id, seat, body')
			.eq('room_id', roomId)
			.order('id');
		if (this.#roomId !== roomId || error || !data) return;
		this.#chat = data as ChatMessage[];
	}

	/**
	 * Shows the caller's own bid before the server confirms it, since a bid only
	 * touches `bid`. Checked against what's on screen, which may include the
	 * opponent's announced bid — that's the bid being answered.
	 */
	#guess(action: Action): PendingBid | null {
		const view = this.#view;
		if (action.type !== 'bid' || !view || action.player !== this.#seat) return null;
		if (!canBid(toGameState(view), action.player, action.amount)) return null;
		const mine = { player: action.player, amount: action.amount, base: this.#version };
		this.#mine = mine;
		return mine;
	}

	/** Tells the opponent about our bid now, rather than after the server round trip. */
	#announce(bid: PendingBid): void {
		void this.#channel?.send({
			type: 'broadcast',
			event: 'bid',
			payload: { player: bid.player, amount: bid.amount, version: bid.base }
		});
	}

	#hear(payload: unknown): void {
		const bid = readAnnouncement(payload);
		const state = this.#state;
		if (!bid || !state || this.#seat === null) return;
		if (!believable(state, this.#version, this.#seat, bid)) return;

		this.#dropTheirs();
		this.#theirs = bid;
		// Unbacked after this long, it's probably not coming: a failed request, or a
		// forged message. Ask the server before giving up on it — a slow bid that
		// did land clears itself in `#apply`, and a raise waiting on it still goes.
		this.#theirsTimer = setTimeout(() => {
			if (this.#theirs !== bid) return;
			void this.#pull()
				.catch(() => {})
				.finally(() => {
					if (this.#theirs === bid) this.#dropTheirs();
				});
		}, ANNOUNCED_BID_TTL_MS);
	}

	/** Clears the opponent's announced bid and lets any move waiting on it go. */
	#dropTheirs(): void {
		if (this.#theirsTimer) clearTimeout(this.#theirsTimer);
		this.#theirsTimer = null;
		this.#theirs = null;
		const waiting = this.#waiting;
		this.#waiting = [];
		for (const resolve of waiting) resolve();
	}

	/** Resolves once the opponent's announced bid has landed or lapsed. */
	#settled(): Promise<void> {
		if (!this.#theirs) return Promise.resolve();
		return new Promise((resolve) => this.#waiting.push(resolve));
	}

	async #pull(): Promise<void> {
		// Pinned: broadcast handlers fire `#pull` unawaited, so a nudge landing just
		// before `leave()` could repopulate a room the player already walked out of.
		const roomId = this.#roomId;
		if (!roomId) return;

		const { data, error } = await supabase()
			.from('game_public')
			.select('payload, version, abandoned_by, rematch, left_by')
			.eq('room_id', roomId)
			.maybeSingle();

		if (this.#roomId !== roomId) return;
		if (error) throw new Error(error.message);
		// Empty means RLS refused us: the token doesn't hold a seat in this room.
		if (!data) throw new Error('That room is not available to this device');

		this.#apply(data.payload as PublicGameState, data.version as number);

		// Outside `#apply`'s version guard: quitting is no game action, so it bumps
		// no version and a guarded update would drop it.
		const abandonedBy = data.abandoned_by as number | null;
		this.#abandonedBy = abandonedBy === 0 || abandonedBy === 1 ? abandonedBy : null;
		if (this.#abandonedBy !== null) this.#status = 'ended';
		// Same reason: an offer or a departure changes the row, not the version.
		this.#rematch = (data.rematch as RematchOffer | null) ?? null;
		const leftBy = data.left_by as number | null;
		this.#leftBy = leftBy === 0 || leftBy === 1 ? leftBy : null;
	}

	#apply(state: PublicGameState, version: number): void {
		if (version < this.#version) return;
		this.#trackApply(this.#state, state);
		this.#state = state;
		this.#version = version;
		// The server has moved past the state their bid was placed on: it either
		// landed (and is in `state`) or lost a race. Either way it's no guess now.
		if (this.#theirs && version > this.#theirs.base) this.#dropTheirs();
		if (this.#status === 'connecting' || this.#status === 'waiting') {
			this.#status = this.bothSeated ? 'live' : 'waiting';
		}
		if (this.bothSeated) this.#unadvertise();
	}

	/**
	 * Tells the rooms browser somebody is really in this lobby. Presence rather
	 * than a heartbeat write: the socket closing is what takes us off, so a closed
	 * tab or a dead connection drops the room without anyone having to say so.
	 */
	async #advertise(roomId: string): Promise<void> {
		if (this.#lobby) return;
		// Only a public room has a listing. A private room's id is its invite, so
		// it must never go out on a channel anyone can listen to.
		const { data } = await supabase()
			.from('public_room_listings')
			.select('room_id')
			.eq('room_id', roomId)
			.maybeSingle();
		if (!data || this.#lobby || this.#roomId !== roomId || this.#status !== 'waiting') return;

		const lobby = supabase().channel(LOBBY_HOSTS, { config: { presence: { key: roomId } } });
		this.#lobby = lobby;
		// Also fires on every reconnect, which is what puts a host back on the list.
		lobby.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') await lobby.track({ at: Date.now() });
		});
	}

	#unadvertise(): void {
		if (!this.#lobby) return;
		void supabase().removeChannel(this.#lobby);
		this.#lobby = null;
	}

	/**
	 * The server deals the deck before anyone joins, so an online game "starts"
	 * when the second seat fills. An empty history keeps a mid-game reload from
	 * counting it twice.
	 */
	#trackApply(prev: PublicGameState | null, next: PublicGameState): void {
		if (next.seatsTaken < 2) return;
		if (!prev || prev.seatsTaken < 2) {
			if (next.history.length === 0) track(gameEvent('game_started', next, 'online'));
			return;
		}
		trackTransition(prev, next, 'online');
	}
}

export const room = new RemoteRoom();
