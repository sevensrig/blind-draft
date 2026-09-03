-- Quitting a remote game, server-side.
--
-- `room_status` has carried `abandoned` since the first migration, but nothing
-- ever set it: leaving was purely client-side, so the row stayed `open` and a
-- public lobby stayed listed until the cleanup cron reaped it.
--
-- The `leave-room` Edge Function sets `rooms.status`, and the existing trigger
-- then drops the public listing for free. Telling the opponent is the other
-- half: clients have no grant on `rooms`, so it travels through a projection.

-- Which seat walked out, or null while the game is live. A seat number is safe
-- in a projection — both players already see both names.
--
-- Only ever set for a game that ended *early*; a `finished` room leaves it null.
alter table game_public
	add column abandoned_by smallint
		check (abandoned_by is null or abandoned_by in (0, 1));

comment on column game_public.abandoned_by is
	'Seat that quit early, or null. Set only from open/playing; a finished game stays null so results are never shown as an abandonment.';

-- Deliberately no version bump: `game_public.version` mirrors `games.version`
-- and quitting applies no game action, so advancing one and not the other would
-- make the survivor's next move come back `stale`. The broadcast trigger fires
-- on any update here, so subscribers are still nudged.
