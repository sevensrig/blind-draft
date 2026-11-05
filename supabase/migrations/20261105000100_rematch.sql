-- Rematches: the same two seats play again in the same room, on settings either
-- of them can change.

-- The full offer, custom list included. Server-only, like everything on `rooms`.
alter table rooms add column rematch jsonb;

-- What the players may see of the offer: who made it and the settings' labels.
alter table game_public add column rematch jsonb;

-- Who walked away from the results sheet. Separate from `abandoned_by`, which
-- means "quit mid-draft" and turns the results into a dead-end screen.
alter table game_public
	add column left_by smallint
		check (left_by is null or left_by in (0, 1));

comment on column game_public.rematch is
	'Pending rematch offer as players see it: { by, categoryId, variantId, categoryLabel, variantLabel, budget, slots }.';
comment on column game_public.left_by is
	'Seat that left after the game finished, so the other player stops waiting on a rematch.';

-- Restarts a finished room with a freshly dealt game. Version-conditional like
-- `commit_room_action`, so two accepts can't deal twice.
create or replace function commit_rematch(
	p_room_id uuid,
	p_expected integer,
	p_state jsonb,
	p_public jsonb,
	p_room jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
	v_version integer;
	v_code text;
begin
	update games
		set state = p_state, version = p_expected + 1, updated_at = now()
		where room_id = p_room_id and version = p_expected
		returning version into v_version;

	if v_version is null then
		return jsonb_build_object('ok', false);
	end if;

	update game_public
		set payload = p_public, version = v_version, rematch = null, updated_at = now()
		where room_id = p_room_id;

	-- Back to `playing` puts the code under the active-code unique index again,
	-- and another room may have drawn it since. Nobody joins by it now anyway.
	select code into v_code from rooms where id = p_room_id;
	while exists (
		select 1 from rooms where code = v_code and status in ('open', 'playing') and id <> p_room_id
	) loop
		v_code := generate_room_code();
	end loop;

	update rooms
		set status = 'playing',
			code = v_code,
			rematch = null,
			category_id = p_room->>'category_id',
			variant_id = p_room->>'variant_id',
			category_label = p_room->>'category_label',
			variant_label = p_room->>'variant_label',
			budget = (p_room->>'budget')::integer,
			slots = (p_room->>'slots')::integer,
			last_active_at = now()
		where id = p_room_id;

	return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

revoke execute on function commit_rematch(uuid, integer, jsonb, jsonb, jsonb) from anon, authenticated, public;
grant execute on function commit_rematch(uuid, integer, jsonb, jsonb, jsonb) to service_role;
