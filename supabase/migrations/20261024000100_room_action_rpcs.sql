-- `room-action` in two round trips instead of seven.
--
-- Every supabase-js call from an Edge Function is its own HTTPS request through
-- the API gateway, about 80ms each on hosted, and a move made seven of them in
-- series. The engine still runs in TypeScript between these two calls.

-- Read side: rate limit, seat, room status and game state in one call.
create or replace function room_action_context(
	p_room_id uuid,
	p_token text,
	p_actor text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
	v_seat smallint;
	v_status room_status;
	v_game games%rowtype;
begin
	if not check_rate_limit(p_actor, 'room_action', 120, interval '60 seconds') then
		return jsonb_build_object('limited', true);
	end if;

	select seat into v_seat from room_players where room_id = p_room_id and token = p_token;
	select status into v_status from rooms where id = p_room_id;
	select * into v_game from games where room_id = p_room_id;

	return jsonb_build_object(
		'limited', false,
		'seat', v_seat,
		'status', v_status,
		'state', v_game.state,
		'version', v_game.version
	);
end;
$$;

-- Write side: the version-conditional write plus both projections, in one
-- transaction, so `game_public` can no longer fall a move behind `games`.
-- A lost race returns the winner's state for the caller to redact.
create or replace function commit_room_action(
	p_room_id uuid,
	p_expected integer,
	p_state jsonb,
	p_public jsonb,
	p_finished boolean
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
	v_version integer;
	v_fresh games%rowtype;
begin
	update games
		set state = p_state, version = p_expected + 1, updated_at = now()
		where room_id = p_room_id and version = p_expected
		returning version into v_version;

	if v_version is null then
		select * into v_fresh from games where room_id = p_room_id;
		return jsonb_build_object('ok', false, 'state', v_fresh.state, 'version', v_fresh.version);
	end if;

	update game_public
		set payload = p_public, version = v_version, updated_at = now()
		where room_id = p_room_id;

	update rooms
		set last_active_at = now(),
			status = case when p_finished then 'finished'::room_status else status end
		where id = p_room_id;

	return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

revoke execute on function room_action_context(uuid, text, text) from anon, authenticated, public;
revoke execute on function commit_room_action(uuid, integer, jsonb, jsonb, boolean) from anon, authenticated, public;

grant execute on function room_action_context(uuid, text, text) to service_role;
grant execute on function commit_room_action(uuid, integer, jsonb, jsonb, boolean) to service_role;
