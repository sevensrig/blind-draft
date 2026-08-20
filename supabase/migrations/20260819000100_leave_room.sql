-- Quitting a remote game, server-side.
--
-- `room_status` has carried an `abandoned` value since the first migration, with
-- a comment describing exactly this case — but nothing ever set it. Leaving a
-- room was a purely client-side act: forget the local seat, drop the channel.
-- The row stayed `open`/`playing`, a public lobby stayed in the browser for
-- strangers to join into an empty room, and the opponent was never told
-- anything. Rooms only really closed when the cleanup cron reaped them a day
-- later.
--
-- Two pieces are missing. `rooms.status` is one, and the `leave-room` Edge
-- Function sets it — the existing trigger on `status` then pulls the row out of
-- `public_room_listings` for free.
--
-- The other is telling the opponent. Clients have no grant on `rooms`, so the
-- fact has to reach them through a projection. Hence a column here rather than
-- a read policy on the authoritative table.

-- Which seat walked out, or null while the game is live.
--
-- A seat number is not a secret — both players already see both names and
-- rosters — so this is safe in a projection by the standing test: would a player
-- be allowed to know it? They are the ones who need to.
--
-- Only ever set for a game that ended *early*. A room that reached `finished`
-- leaves this null, so the normal results sheet is never mistaken for someone
-- rage-quitting.
alter table game_public
	add column abandoned_by smallint
		check (abandoned_by is null or abandoned_by in (0, 1));

comment on column game_public.abandoned_by is
	'Seat that quit early, or null. Set only from open/playing; a finished game stays null so results are never shown as an abandonment.';

-- Note there is deliberately no version bump attached to this: `game_public.version`
-- mirrors `games.version`, and quitting applies no game action. Advancing one and
-- not the other would make the surviving client's next move look `stale`. The
-- broadcast trigger fires on any update to this table, so subscribers still get
-- nudged and re-fetch — the nudge has never meant "the version went up".
