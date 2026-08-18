-- Internal functions were reachable as public RPCs.
--
-- Anything in the `public` schema is exposed by PostgREST, and `execute` defaults
-- to PUBLIC — so with only the anon key a caller could run the cleanup job,
-- mint room codes, and worst of all call `check_rate_limit` with arbitrary
-- arguments. That last one takes `actor` and `action` as parameters and writes a
-- row, so it was an unauthenticated insert into `request_log`: flood the table,
-- or burn through another device's allowance.
--
-- These are service-role and cron internals. `player_holds_seat` and
-- `request_player_token` stay callable because RLS policies evaluate them as the
-- calling role, and they only ever return a boolean or the caller's own header.

revoke execute on function cleanup_stale_rooms() from anon, authenticated, public;
revoke execute on function check_rate_limit(text, text, integer, interval) from anon, authenticated, public;
revoke execute on function generate_room_code() from anon, authenticated, public;

grant execute on function cleanup_stale_rooms() to service_role;
grant execute on function check_rate_limit(text, text, integer, interval) to service_role;
grant execute on function generate_room_code() to service_role;
