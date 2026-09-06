import type { Action } from '$lib/game/types';
import { RemoteError, callFunction, supabase } from './client';
import { deviceToken, forgetSeat, rememberSeat } from './identity';
import type { ConnectionStatus, PublicGameState } from './types';

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

	#channel: ReturnType<ReturnType<typeof supabase>['channel']> | null = null;

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
			}
		});
	}

	/** Sends an action and takes whatever the server says the truth is. */
	async dispatch(action: Action): Promise<void> {
		if (!this.#roomId) return;
		this.#lastRejection = null;

		try {
			const result = await callFunction<{ state: PublicGameState; version: number }>(
				'room-action',
				{ roomId: this.#roomId, token: deviceToken(), action, version: this.#version }
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
		}
	}

	disconnect(): void {
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
		this.#state = state;
		this.#version = version;
		if (this.#status === 'connecting' || this.#status === 'waiting') {
			this.#status = this.bothSeated ? 'live' : 'waiting';
		}
	}
}

export const room = new RemoteRoom();
