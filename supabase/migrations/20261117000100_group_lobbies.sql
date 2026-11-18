-- Rooms for up to four. A room now waits in a lobby until it fills or its host
-- starts it, and the deck is dealt at that point, for however many sat down.

alter table rooms
	add column max_players smallint not null default 2 check (max_players between 2 and 4),
	-- What `readSettings` validated, custom list included, so the deal can wait
	-- for the start. Server-only, like everything on `rooms`.
	add column settings jsonb,
	-- Bumped under the row lock on every seat change, so a lobby payload built
	-- from an older seat list can't overwrite a newer one.
	add column lobby_rev integer not null default 0;

alter table room_players drop constraint room_players_seat_check;
alter table room_players add constraint room_players_seat_check check (seat between 0 and 3);

alter table chat_messages drop constraint chat_messages_seat_check;
alter table chat_messages add constraint chat_messages_seat_check check (seat between 0 and 3);

alter table game_public drop constraint game_public_abandoned_by_check;
alter table game_public
	add constraint game_public_abandoned_by_check
	check (abandoned_by is null or abandoned_by between 0 and 3);

alter table game_public drop constraint game_public_left_by_check;
alter table game_public
	add constraint game_public_left_by_check check (left_by is null or left_by between 0 and 3);

-- The browser shows "2/4", never names.
alter table public_room_listings
	add column max_players smallint not null default 2,
	add column players smallint not null default 1;

create or replace function sync_public_room_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if new.visibility = 'public' and new.status = 'open' then
		insert into public_room_listings
			(room_id, category_label, variant_label, budget, slots, max_players, created_at)
		values
			(new.id, new.category_label, new.variant_label, new.budget, new.slots, new.max_players, new.created_at)
		on conflict (room_id) do update
			set category_label = excluded.category_label,
				variant_label = excluded.variant_label,
				budget = excluded.budget,
				slots = excluded.slots,
				max_players = excluded.max_players;
	else
		delete from public_room_listings where room_id = new.id;
	end if;
	return new;
end;
$$;

-- Seats in order, as the lobby shows them.
create or replace function lobby_seats(p_room_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
	select coalesce(
		jsonb_agg(jsonb_build_object('id', id, 'seat', seat, 'name', name) order by seat),
		'[]'::jsonb
	)
	from room_players
	where room_id = p_room_id;
$$;

/*
 * Takes the lowest free seat in an open lobby. The row lock on `rooms` is what
 * serialises this against other joins and against the host starting: a start
 * flips `status` under the same lock, so a seat is either taken before the deal
 * or refused.
 */
create or replace function take_lobby_seat(p_room_id uuid, p_token text, p_name text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
	v_room rooms%rowtype;
	v_seat smallint;
	v_id uuid;
begin
	select * into v_room from rooms where id = p_room_id for update;
	if not found then
		return jsonb_build_object('error', 'not_found');
	end if;
	if v_room.status <> 'open' then
		return jsonb_build_object('error', 'started');
	end if;

	select min(s) into v_seat
	from generate_series(0, v_room.max_players - 1) as s
	where s not in (select seat from room_players where room_id = p_room_id);
	if v_seat is null then
		return jsonb_build_object('error', 'room_full');
	end if;

	insert into room_players (room_id, seat, name, token)
	values (p_room_id, v_seat, p_name, p_token)
	returning id into v_id;

	update rooms
		set lobby_rev = lobby_rev + 1, last_active_at = now()
		where id = p_room_id
		returning * into v_room;

	update public_room_listings
		set players = (select count(*) from room_players where room_id = p_room_id)
		where room_id = p_room_id;

	return jsonb_build_object(
		'seat', v_seat,
		'id', v_id,
		'rev', v_room.lobby_rev,
		'max', v_room.max_players,
		'seats', lobby_seats(p_room_id)
	);
end;
$$;

-- A guest walking out of a lobby gives the seat back instead of ending the room.
create or replace function leave_lobby_seat(p_room_id uuid, p_token text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
	v_room rooms%rowtype;
begin
	select * into v_room from rooms where id = p_room_id for update;
	if not found or v_room.status <> 'open' then
		return jsonb_build_object('error', 'started');
	end if;

	delete from room_players where room_id = p_room_id and token = p_token and seat <> 0;

	update rooms
		set lobby_rev = lobby_rev + 1, last_active_at = now()
		where id = p_room_id
		returning * into v_room;

	update public_room_listings
		set players = (select count(*) from room_players where room_id = p_room_id)
		where room_id = p_room_id;

	return jsonb_build_object(
		'rev', v_room.lobby_rev,
		'max', v_room.max_players,
		'seats', lobby_seats(p_room_id)
	);
end;
$$;

/*
 * Closes the lobby: `open` to `playing` under the row lock, then closes up any
 * gap a departed guest left, so seats match the engine's player indices.
 * Returns the final seat list, or null when the room wasn't open.
 */
create or replace function close_lobby(p_room_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
	v_player record;
	v_next smallint := 0;
begin
	update rooms set status = 'playing', last_active_at = now()
		where id = p_room_id and status = 'open';
	if not found then
		return null;
	end if;

	-- Ascending, so every target seat is already free.
	for v_player in select id, seat from room_players where room_id = p_room_id order by seat loop
		if v_player.seat <> v_next then
			update room_players set seat = v_next where id = v_player.id;
		end if;
		v_next := v_next + 1;
	end loop;

	return lobby_seats(p_room_id);
end;
$$;

-- Writes a lobby payload only while the room is still a lobby and only if it's
-- newer than the one there, so a slow join can't undo a deal or a later join.
create or replace function write_lobby(p_room_id uuid, p_payload jsonb, p_rev integer)
returns void
language sql
set search_path = public
as $$
	update game_public
		set payload = p_payload, updated_at = now()
		where room_id = p_room_id
			and payload->>'phase' = 'setup'
			and coalesce((payload->>'lobbyRev')::integer, -1) < p_rev;
$$;

revoke execute on function lobby_seats(uuid) from anon, authenticated, public;
revoke execute on function take_lobby_seat(uuid, text, text) from anon, authenticated, public;
revoke execute on function leave_lobby_seat(uuid, text) from anon, authenticated, public;
revoke execute on function close_lobby(uuid) from anon, authenticated, public;
revoke execute on function write_lobby(uuid, jsonb, integer) from anon, authenticated, public;

grant execute on function lobby_seats(uuid) to service_role;
grant execute on function take_lobby_seat(uuid, text, text) to service_role;
grant execute on function leave_lobby_seat(uuid, text) to service_role;
grant execute on function close_lobby(uuid) to service_role;
grant execute on function write_lobby(uuid, jsonb, integer) to service_role;
