import type { SupabaseClient } from '@supabase/supabase-js';
import { readSettings } from './setup.ts';
import { type LobbySeat, type ServerState, lobbyView, redact } from './state.ts';

/** Repaints the lobby for everyone in it. Best effort: the seat list on `room_players` is the truth. */
export async function writeLobby(
	db: SupabaseClient,
	roomId: string,
	seats: LobbySeat[],
	maxPlayers: number,
	rev: number
): Promise<void> {
	const { data: game } = await db.from('games').select('state').eq('room_id', roomId).single();
	if (!game) return;
	const config = (game.state as ServerState).config;
	const { error } = await db.rpc('write_lobby', {
		p_room_id: roomId,
		p_payload: lobbyView(config, seats, maxPlayers, rev),
		p_rev: rev
	});
	if (error) console.error('lobby write failed', error);
}

export type StartResult = { ok: true; players: number } | { ok: false; message: string };

/**
 * Deals for whoever is seated and opens the draft. `close_lobby` flips the room
 * to `playing` under its row lock, so no seat can be taken after the names are read.
 */
export async function startLobby(db: SupabaseClient, roomId: string): Promise<StartResult> {
	const { data: room } = await db
		.from('rooms')
		.select('settings, category_id, variant_id, budget, slots, max_players')
		.eq('id', roomId)
		.single();
	if (!room) return { ok: false, message: 'No room with that id' };

	const { count } = await db
		.from('room_players')
		.select('id', { count: 'exact', head: true })
		.eq('room_id', roomId);
	if ((count ?? 0) < 2) return { ok: false, message: 'Wait for at least one more player' };

	// Rooms made before lobbies kept no settings; their columns still deal a fixed category.
	const settings = (room.settings as Record<string, unknown> | null) ?? {
		categoryId: room.category_id,
		variantId: room.variant_id,
		budget: room.budget,
		slots: room.slots
	};

	const { data: seats, error: closeError } = await db.rpc('close_lobby', { p_room_id: roomId });
	if (closeError) {
		console.error('lobby close failed', closeError);
		return { ok: false, message: 'Could not start the draft' };
	}
	if (!seats) return { ok: false, message: 'That draft has already started' };

	// Reopened on any failure past here, or the lobby would be stuck closed with no game.
	const reopen = () => db.from('rooms').update({ status: 'open' }).eq('id', roomId);

	const seated = seats as LobbySeat[];
	const setup = readSettings(settings, seated.length);
	if (!setup.ok) {
		await reopen();
		return { ok: false, message: setup.message };
	}

	const state: ServerState = {
		...setup.deal(seated.map((seat) => seat.name)),
		seatIds: seated.map((seat) => seat.id),
		maxPlayers: room.max_players
	};

	const { data: game } = await db.from('games').select('version').eq('room_id', roomId).single();
	const { data: commit, error } = await db.rpc('commit_room_action', {
		p_room_id: roomId,
		p_expected: game?.version ?? 0,
		p_state: state,
		p_public: redact(state),
		p_finished: false
	});
	if (error || !commit?.ok) {
		console.error('deal write failed', error ?? commit);
		await reopen();
		return { ok: false, message: 'Could not start the draft' };
	}
	return { ok: true, players: seated.length };
}
