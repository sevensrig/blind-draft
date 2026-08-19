import type { Action } from '$lib/game/types';
import { RemoteError, callFunction, supabase } from './client';
import { deviceToken, forgetSeat, rememberSeat } from './identity';
import type { ConnectionStatus, PublicGameState } from './types';

/**
 * The remote counterpart to `$lib/game/store.svelte.ts`.
 *
 * This is the seam Tier 1 was designed around. The local store applies actions
 * to a pure reducer in memory; this one posts the same action objects to an Edge
 * Function and waits to be told what happened. The reducer, the rules and the
 * screens are shared — only the transport differs.
 *
 * Two behaviours matter more than the plumbing:
 *
 * - **Resync beats replay.** On connect it *fetches* current state rather than
 *   only subscribing, so a device reconnecting mid-bid sees the live standing
 *   bid instead of whatever it remembered before the tunnel.
 * - **The server always wins.** A rejected bid doesn't leave an optimistic value
 *   on screen; the rejection carries the real state and it is applied verbatim.
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

	/**
	 * True once both seats are taken.
	 *
	 * Reads the server's count rather than inspecting names: a fresh game is seeded
	 * with a placeholder name for player two, so a name-based check reported the
	 * room full before anyone had joined and skipped the lobby entirely.
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
	 * Attaches to a room: fetch, then subscribe.
	 *
	 * Order is deliberate. Subscribing first and waiting for a change event would
	 * leave a reconnecting player staring at nothing until the opponent moved.
	 */
	async connect(roomId: string, seat: 0 | 1): Promise<void> {
		this.disconnect();
		this.#roomId = roomId;
		this.#seat = seat;
		this.#status = 'connecting';
		this.#message = null;

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
			 * Broadcast, not Postgres Changes.
			 *
			 * The read policy on `game_public` checks the `x-player-token` header,
			 * which Realtime doesn't send — so row-level subscriptions were silently
			 * denied and nobody was ever notified. A Postgres trigger broadcasts the
			 * new version instead, and we re-fetch over REST where the token is
			 * actually checked. The nudge carries no state, so nothing leaks.
			 */
			.on('broadcast', { event: 'state' }, () => {
				/*
				 * Always re-fetch. The nudge means "something changed", not "the
				 * version went up" — a second player joining rewrites the payload
				 * without advancing the version, since no game action happened. Gating
				 * on a version increase left the host waiting in the lobby while their
				 * opponent was already sitting in the room.
				 */
				void this.#pull();
			})
			.on('presence', { event: 'sync' }, () => {
				const seats = Object.keys(this.#channel?.presenceState() ?? {});
				const opponentHere = seats.some((key) => key !== String(seat));
				// Only downgrade once the game is live; a lobby waiting for a second
				// player isn't an abandoned game.
				if (this.#status === 'live' || this.#status === 'opponent-away') {
					this.#status = opponentHere ? 'live' : 'opponent-away';
				}
			});

		await this.#channel.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				await this.#channel?.track({ seat, at: Date.now() });
				this.#status = this.bothSeated ? 'live' : 'waiting';
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
				// `stale` and `illegal_action` both carry the corrected state, which is
				// the point: the loser of a race sees reality immediately rather than a
				// bid that never landed.
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

	/** Leaves for good, so a stale seat isn't recalled on the next visit. */
	leave(): void {
		if (this.#roomId) forgetSeat(this.#roomId);
		this.disconnect();
		this.#roomId = null;
		this.#seat = null;
		this.#state = null;
		this.#version = 0;
	}

	async #pull(): Promise<void> {
		const { data, error } = await supabase()
			.from('game_public')
			.select('payload, version')
			.eq('room_id', this.#roomId!)
			.maybeSingle();

		if (error) throw new Error(error.message);
		// Empty means RLS refused us: the token doesn't hold a seat in this room.
		if (!data) throw new Error('That room is not available to this device');

		this.#apply(data.payload as PublicGameState, data.version as number);
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
