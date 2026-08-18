-- Security model.
--
-- There is no auth, so every client holds the anon key and RLS is the only thing
-- standing between a curious player and the deck. Two ideas do the work:
--
-- 1. Clients never read the authoritative tables at all. `rooms`, `room_players`
--    and `games` are closed to the anon role outright. What clients may see is
--    copied into dedicated projection tables that physically cannot contain a
--    secret, because the columns don't exist. Getting a policy subtly wrong then
--    leaks nothing, and Realtime — which broadcasts whole rows — has nothing
--    sensitive to broadcast.
--
-- 2. Identity is a per-device token presented in the `x-player-token` header.
--    Policies check it against `room_players`.
--
-- All writes go through Edge Functions using the service role, which bypasses
-- RLS. Nothing below grants a client any write.

-- ---------------------------------------------------------------------------
-- Identity helper
-- ---------------------------------------------------------------------------

create or replace function request_player_token()
returns text
language sql
stable
as $$
	select nullif(current_setting('request.headers', true)::json ->> 'x-player-token', '');
$$;

comment on function request_player_token is
	'The calling device''s room token, read from the x-player-token header. Null when absent.';

/*
 * Does the calling device hold a seat in this room?
 *
 * SECURITY DEFINER is load-bearing, not decoration. An RLS policy is evaluated as
 * the calling role, and `anon` deliberately has no grant on `room_players` — so a
 * policy that reads that table inline fails with "permission denied" for
 * everyone, legitimate players included. Running the lookup as the owner fixes
 * that without widening what a client can read: this returns a boolean and never
 * exposes a token.
 */
create or replace function player_holds_seat(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select exists (
		select 1
		from room_players
		where room_id = p_room_id
			and token = request_player_token()
	);
$$;

comment on function player_holds_seat is
	'True when the x-player-token header matches a seat in the given room. SECURITY DEFINER so RLS can call it as anon.';

-- ---------------------------------------------------------------------------
-- Projection 1: the public rooms browser
--
-- Deliberately holds only what the spec allows on screen — category, budget,
-- roster size. No code, no player names, no state. A row exists only while the
-- room is public AND open, so a room drops off the list the moment it fills or
-- starts, without the client needing to filter.
-- ---------------------------------------------------------------------------

create table public_room_listings (
	room_id uuid primary key references rooms (id) on delete cascade,
	category_label text not null,
	variant_label text,
	budget integer not null,
	slots integer not null,
	created_at timestamptz not null
);

create or replace function sync_public_room_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	if new.visibility = 'public' and new.status = 'open' then
		insert into public_room_listings (room_id, category_label, variant_label, budget, slots, created_at)
		values (new.id, new.category_label, new.variant_label, new.budget, new.slots, new.created_at)
		on conflict (room_id) do update
			set category_label = excluded.category_label,
				variant_label = excluded.variant_label,
				budget = excluded.budget,
				slots = excluded.slots;
	else
		delete from public_room_listings where room_id = new.id;
	end if;
	return new;
end;
$$;

create trigger rooms_sync_public_listing
	after insert or update of status, visibility on rooms
	for each row execute function sync_public_room_listing();

-- ---------------------------------------------------------------------------
-- Projection 2: the redacted game state
--
-- `games.state` holds the shuffled deck. This table holds what the two players
-- are allowed to see: the revealed item, the standing bid, both rosters and
-- wallets. The Edge Function writes both in one transaction.
-- ---------------------------------------------------------------------------

create table game_public (
	room_id uuid primary key references rooms (id) on delete cascade,
	-- Redacted view of GameState. Never contains unrevealed deck entries.
	payload jsonb not null,
	-- Mirrors games.version so a client can tell whether it has the latest.
	version integer not null default 0,
	updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rate limiting (Postgres, deliberately not Redis)
--
-- Public unauthenticated endpoints can be spammed. Redis would be real
-- infrastructure for a two-player party game, and Postgres already answers the
-- only question being asked: "has this caller done this too many times just
-- now?" Written and read by Edge Functions under the service role.
-- ---------------------------------------------------------------------------

create table request_log (
	id bigserial primary key,
	-- Client IP, or the device token when an IP isn't available.
	actor text not null,
	action text not null,
	created_at timestamptz not null default now()
);

create index request_log_lookup_idx on request_log (actor, action, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table rooms enable row level security;
alter table room_players enable row level security;
alter table games enable row level security;
alter table public_room_listings enable row level security;
alter table game_public enable row level security;
alter table request_log enable row level security;

-- No policies on rooms, room_players, games or request_log. RLS with zero
-- policies denies everything, which is exactly right: only the service role
-- (which bypasses RLS) touches them. This is intentional, not an omission.

-- The rooms browser is open to everyone; the table has nothing worth hiding.
create policy "anyone may browse open public rooms"
	on public_room_listings for select
	to anon, authenticated
	using (true);

-- Redacted game state is readable only by a device holding a token for that
-- room, so a passer-by with a room id still sees nothing.
create policy "players read their own room's state"
	on game_public for select
	to anon, authenticated
	using (player_holds_seat(game_public.room_id));

-- ---------------------------------------------------------------------------
-- Grants
--
-- Belt and braces alongside RLS: the anon role has no table privileges on the
-- authoritative tables at all, so a future policy mistake still can't expose
-- them.
-- ---------------------------------------------------------------------------

-- The authoritative tables: nothing at all.
revoke all on rooms, room_players, games, request_log from anon, authenticated;

-- The projections: revoke first, then grant back only SELECT.
--
-- Supabase's default privileges hand `anon` full rights on new tables in public,
-- which includes TRUNCATE — and TRUNCATE ignores RLS completely, so the read
-- policies above would not have stopped a client emptying the rooms browser.
-- Granting SELECT without revoking first leaves that in place.
revoke all on public_room_listings, game_public from anon, authenticated;
grant select on public_room_listings to anon, authenticated;
grant select on game_public to anon, authenticated;
grant execute on function player_holds_seat(uuid) to anon, authenticated;

-- The Edge Functions run as `service_role` and own every write in the system, so
-- they need this spelled out. Supabase's default privileges did not reach tables
-- created by these migrations — without these grants every endpoint fails with
-- "permission denied for table rooms", which is how this was found. Being
-- explicit also means the hosted project can't behave differently from local
-- because its defaults happen to be configured another way.
grant select, insert, update, delete
	on rooms, room_players, games, game_public, public_room_listings, request_log
	to service_role;

-- request_log's bigserial needs its sequence.
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public_room_listings;
alter publication supabase_realtime add table game_public;
