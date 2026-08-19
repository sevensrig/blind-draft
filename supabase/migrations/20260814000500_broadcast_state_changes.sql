-- Realtime for game state, done as Broadcast rather than Postgres Changes.
--
-- The `game_public` policy authorises a device by reading `x-player-token` from
-- `request.headers`. That works for REST, because PostgREST populates it — but
-- Realtime's Postgres Changes evaluates RLS outside any HTTP request, where the
-- setting is NULL. The policy therefore denied every row and subscribers were
-- never told anything: a host sat in the lobby forever while their opponent was
-- already in the room.
--
-- Options were to weaken the policy so any holder of a room id could read state,
-- or to stop depending on RLS for delivery. This does the latter. A trigger
-- broadcasts only the new version number on a per-room topic; clients treat it as
-- "something changed" and re-fetch over REST, where the token is checked properly.
-- The broadcast itself carries nothing worth protecting, so the channel is public
-- and the strict read policy stays exactly as it is.

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

-- Postgres Changes on this table can never reach a client, for the reason above.
-- Leaving it published would imply a delivery path that doesn't exist.
alter publication supabase_realtime drop table game_public;
