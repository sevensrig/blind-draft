import { gameEvent, track, trackTransition } from '$lib/analytics';
import { canBid, other } from '$lib/game/engine';
import type { Action } from '$lib/game/types';
import { toGameState } from './adapt';
import { emoteById, type EmoteId } from './emotes';
import { LOBBY_HOSTS, RemoteError, callFunction, supabase } from './client';
import { deviceToken, forgetSeat, rememberSeat } from './identity';
import type { ChatMessage, ConnectionStatus, EmoteEvent, PublicGameState } from './types';

/** How long an emote bubble stays up. */
const EMOTE_MS = 2500;
/** Typing pings go out at most this often while someone types. */
const TYPING_PING_MS = 2000;
/** Idle this long and the typer's device says it stopped. */
const TYPING_IDLE_MS = 3000;
/** Dots drop on their own after this, in case the "stopped" ping never arrives. */
const TYPING_FALLBACK_MS = 6000;

/**
 * The remote counterpart to `$lib/game/store.svelte.ts`: same actions, posted to
 * an Edge Function instead of a local reducer. Two rules run through it —
 * connect *fetches* before subscribing, and the server always wins.
 */
class RemoteRoom {
	#roomId = $state<string | null>(null);
	#seat = $state<0 | 1 | null>(null);
	#state = $state<PublicGameState | null>(null);
	#version = $state(0);
	#status = $state<ConnectionStatus>('idle');
	/* Room metadata, not game state — the server never puts it in game_public. */
	#code = $state<string | null>(null);
	#message = $state<string | null>(null);
	/** Set when a move was refused, so the UI can say why without inventing state. */
	#lastRejection = $state<string | null>(null);
	/** Seat that quit. Null while the game is live. */
	#abandonedBy = $state<0 | 1 | null>(null);
	#emotes = $state<EmoteEvent[]>([]);
	#chat = $state<ChatMessage[]>([]);
	#emoteKey = 0;
	#opponentTyping = $state(false);
	#typingTimer: ReturnType<typeof setTimeout> | undefined;
	#idleTimer: ReturnType<typeof setTimeout> | undefined;
	#lastTypingPing = 0;

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
		return this.#state;
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
	get opponentTyping() {
		return this.#opponentTyping;
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

	async create(options: {
		categoryId: string;
		variantId: string;
		budget: number;
		slots: number;
		visibility: 'public' | 'private';
		name: string;
		customName?: string;
		customItems?: string[];
	}): Promise<{ roomId: string; code: string }> {
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
		this.#emotes = [];
		this.#chat = [];
		this.#setOpponentTyping(false);

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
			// `self` is off, so anything arriving here came from the other seat.
			.on('broadcast', { event: 'emote' }, ({ payload }) => {
				const emote = emoteById(payload?.emote);
				if (emote) this.#showEmote(other(seat), emote.id);
			})
			.on('broadcast', { event: 'chat' }, () => {
				// Their message landing is what ends their typing.
				this.#setOpponentTyping(false);
				void this.#pullChat();
			})
			// Contentless, like the state nudge: it only says "they're typing".
			.on('broadcast', { event: 'typing' }, ({ payload }) =>
				this.#setOpponentTyping(payload?.stopped !== true)
			)
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

	/** Called per keystroke; throttled here so a fast typist sends a ping every couple of seconds. */
	typing(): void {
		if (!this.#channel) return;
		// Only this device knows when the typing really stopped, so it says so.
		clearTimeout(this.#idleTimer);
		this.#idleTimer = setTimeout(() => this.#stoppedTyping(), TYPING_IDLE_MS);
		if (Date.now() - this.#lastTypingPing < TYPING_PING_MS) return;
		this.#lastTypingPing = Date.now();
		void this.#channel.send({ type: 'broadcast', event: 'typing', payload: {} });
	}

	#stoppedTyping(): void {
		clearTimeout(this.#idleTimer);
		this.#lastTypingPing = 0;
		void this.#channel?.send({ type: 'broadcast', event: 'typing', payload: { stopped: true } });
	}

	/** Throws `RemoteError` when refused, so the form can keep the text and say why. */
	async say(text: string): Promise<void> {
		if (!this.#roomId) return;
		await callFunction('room-chat', { roomId: this.#roomId, token: deviceToken(), text });
		// The message landing ends the dots over there; no "stopped" ping needed.
		clearTimeout(this.#idleTimer);
		this.#lastTypingPing = 0;
		await this.#pullChat();
	}

	/** Sends an action and takes whatever the server says the truth is. */
	async dispatch(action: Action): Promise<void> {
		if (!this.#roomId) return;
		this.#lastRejection = null;
		const optimistic = this.#optimistic(action);

		try {
			const result = await callFunction<{ state: PublicGameState; version: number }>(
				'room-action',
				{ roomId: this.#roomId, token: deviceToken(), action, version: this.#version }
			);
			this.#apply(result.state, result.version);
		} catch (error) {
			// Nothing below replaced the guess (no state came back), so take it back.
			if (optimistic && this.#state === optimistic.guess) this.#state = optimistic.prior;
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
		}
	}

	disconnect(): void {
		clearTimeout(this.#idleTimer);
		this.#unadvertise();
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
		this.#abandonedBy = null;
		this.#lastRejection = null;
		this.#emotes = [];
		this.#chat = [];
		this.#setOpponentTyping(false);
	}

	#setOpponentTyping(on: boolean): void {
		clearTimeout(this.#typingTimer);
		this.#opponentTyping = on;
		if (on)
			this.#typingTimer = setTimeout(() => (this.#opponentTyping = false), TYPING_FALLBACK_MS);
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
	 * touches `bid`. The version stays put, so the server's reply always replaces it.
	 */
	#optimistic(action: Action): { prior: PublicGameState; guess: PublicGameState } | null {
		const prior = this.#state;
		if (action.type !== 'bid' || !prior || action.player !== this.#seat) return null;
		if (!canBid(toGameState(prior), action.player, action.amount)) return null;
		this.#state = { ...prior, bid: { amount: action.amount, holder: action.player } };
		// Read back: `$state` stores a proxy, and the revert compares by identity.
		return { prior, guess: this.#state };
	}

	async #pull(): Promise<void> {
		// Pinned: broadcast handlers fire `#pull` unawaited, so a nudge landing just
		// before `leave()` could repopulate a room the player already walked out of.
		const roomId = this.#roomId;
		if (!roomId) return;

		const { data, error } = await supabase()
			.from('game_public')
			.select('payload, version, abandoned_by')
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
	}

	#apply(state: PublicGameState, version: number): void {
		if (version < this.#version) return;
		this.#trackApply(this.#state, state);
		this.#state = state;
		this.#version = version;
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
