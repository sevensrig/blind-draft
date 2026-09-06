-- Remote play: rooms, players and server-held game state.
--
-- The deck is why this is server-authoritative: the game rests on neither player
-- knowing what's coming, so the shuffled order never leaves the server. Clients
-- read the projections built in the next migration.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type room_visibility as enum ('public', 'private');

-- open      : waiting for a second player, listed if public
-- playing   : both seats taken, game underway
-- finished  : both rosters full
-- abandoned : ended early (opponent left and the other player closed it out)
create type room_status as enum ('open', 'playing', 'finished', 'abandoned');

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------

create table rooms (
	id uuid primary key default gen_random_uuid(),
	-- Short numeric code for typing in by hand; unique only among joinable rooms.
	code text not null,
	visibility room_visibility not null,
	status room_status not null default 'open',

	-- Game settings, chosen at creation and fixed thereafter.
	category_id text not null,
	variant_id text not null,
	category_label text not null,
	variant_label text,
	budget integer not null check (budget between 5 and 200),
	slots integer not null check (slots between 2 and 10),

	created_at timestamptz not null default now(),
	-- Bumped on every action; drives both the abandonment UI and cleanup.
	last_active_at timestamptz not null default now()
);

-- Codes are only looked up while a room is joinable, so uniqueness only needs
-- to hold there — a finished room can keep its code without blocking it.
create unique index rooms_code_active_idx
	on rooms (code)
	where status in ('open', 'playing');

create index rooms_public_open_idx
	on rooms (created_at desc)
	where visibility = 'public' and status = 'open';

create index rooms_cleanup_idx on rooms (last_active_at);

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------

create table room_players (
	id uuid primary key default gen_random_uuid(),
	room_id uuid not null references rooms (id) on delete cascade,
	-- 0 or 1, matching PlayerId in the TypeScript engine.
	seat smallint not null check (seat in (0, 1)),
	name text not null,

	-- Per-device secret from localStorage — the entire identity system, since
	-- there are no accounts. Never exposed by any read policy.
	token text not null,

	joined_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),

	unique (room_id, seat)
);

create index room_players_token_idx on room_players (token);

-- ---------------------------------------------------------------------------
-- Game state
-- ---------------------------------------------------------------------------

create table games (
	room_id uuid primary key references rooms (id) on delete cascade,

	-- The full GameState. Authoritative, and never returned to clients as-is.
	state jsonb not null,

	-- Optimistic concurrency: two bids can arrive together, so each write is
	-- conditional on the version it read and the loser gets `stale`.
	version integer not null default 0,

	updated_at timestamptz not null default now()
);

comment on column games.state is
	'Authoritative GameState. Contains the unshuffled remainder of the deck; never expose directly to clients.';
comment on column games.version is
	'Incremented on every applied action. Clients send the version they saw; mismatches are rejected as stale.';

-- ---------------------------------------------------------------------------
-- Room codes
-- ---------------------------------------------------------------------------

-- 6 digits. Collisions are retried by the caller against the partial unique
-- index above, so this stays cheap and pure.
create or replace function generate_room_code()
returns text
language sql
volatile
as $$
	select lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
$$;
