-- Internal functions were reachable as public RPCs.
--
-- Anything in `public` is exposed by PostgREST and `execute` defaults to PUBLIC,
-- so the anon key could run the cleanup job, mint room codes, and call
-- `check_rate_limit` with arbitrary arguments — an unauthenticated insert into
-- `request_log`. Any new helper needs the same treatment.
--
-- `player_holds_seat` and `request_player_token` stay callable: RLS evaluates
-- them as the calling role, and they return a boolean or the caller's own header.

revoke execute on function cleanup_stale_rooms() from anon, authenticated, public;
revoke execute on function check_rate_limit(text, text, integer, interval) from anon, authenticated, public;
revoke execute on function generate_room_code() from anon, authenticated, public;

grant execute on function cleanup_stale_rooms() to service_role;
grant execute on function check_rate_limit(text, text, integer, interval) to service_role;
grant execute on function generate_room_code() to service_role;
