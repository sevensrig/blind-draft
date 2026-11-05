-- Post-game chat. Written only by the `room-chat` Edge Function, which checks
-- the seat, that the game finished, and the slur filter; clients just read.
--
-- Emotes during the draft don't come through here: they're a fixed set, so
-- there's nothing to moderate, and they go straight over the room's Broadcast
-- channel without touching Postgres.

create table chat_messages (
	id bigserial primary key,
	room_id uuid not null references rooms (id) on delete cascade,
	seat smallint not null check (seat in (0, 1)),
	body text not null check (char_length(body) between 1 and 200),
	created_at timestamptz not null default now()
);

create index chat_messages_room_idx on chat_messages (room_id, id);

alter table chat_messages enable row level security;

create policy "players read their own room's chat"
	on chat_messages for select
	to anon, authenticated
	using (player_holds_seat(chat_messages.room_id));

-- Revoke first: Supabase's defaults would hand anon TRUNCATE, which ignores RLS.
revoke all on chat_messages from anon, authenticated;
grant select on chat_messages to anon, authenticated;
grant select, insert, delete on chat_messages to service_role;
grant usage, select on sequence chat_messages_id_seq to service_role;

-- Same pattern as game state: a nudge on the room topic, then a REST re-fetch
-- where the token is checked. The nudge carries no text.
create or replace function broadcast_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	perform realtime.send(
		jsonb_build_object('id', new.id),
		'chat',
		'room:' || new.room_id::text,
		false
	);
	return new;
end;
$$;

revoke execute on function broadcast_chat_message() from anon, authenticated, public;

create trigger chat_messages_broadcast
	after insert on chat_messages
	for each row execute function broadcast_chat_message();
