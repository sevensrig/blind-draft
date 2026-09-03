-- Realtime for game state, as Broadcast rather than Postgres Changes.
--
-- `game_public`'s policy reads `x-player-token` from `request.headers`, which
-- PostgREST populates and Realtime does not — so Postgres Changes evaluated RLS
-- with a NULL setting, denied every row, and told subscribers nothing.
--
-- Rather than weaken the policy so any holder of a room id could read state,
-- this stops depending on RLS for delivery: a trigger broadcasts the new version
-- on a per-room topic, and clients re-fetch over REST where the token is checked.
-- The nudge carries nothing worth protecting, so the strict policy stays.

create or replace function broadcast_game_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	perform realtime.send(
		jsonb_build_object('version', new.version),
		'state',
		'room:' || new.room_id::text,
		false -- public channel: a version integer is not a secret
	);
	return new;
end;
$$;

comment on function broadcast_game_version is
	'Nudges a room''s subscribers that state moved on. Deliberately carries only the version — the state itself is fetched over REST so RLS still applies.';

create trigger game_public_broadcast
	after insert or update on game_public
	for each row execute function broadcast_game_version();

-- Postgres Changes here can never reach a client, so leaving it published would
-- imply a delivery path that doesn't exist.
alter publication supabase_realtime drop table game_public;
