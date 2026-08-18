-- Housekeeping: room cleanup and the rate-limit check.

-- ---------------------------------------------------------------------------
-- Cleanup
--
-- Free-tier tidiness. Two different clocks, because an abandoned lobby is
-- rubbish much sooner than a finished game someone might still be looking at.
-- Cascades handle room_players, games, game_public and public_room_listings.
-- ---------------------------------------------------------------------------

create or replace function cleanup_stale_rooms()
returns table (deleted_rooms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
	removed integer;
begin
	with gone as (
		delete from rooms
		where
			-- Finished or given up on: keep a day and a half so a results screen
			-- survives being left open overnight.
			(status in ('finished', 'abandoned') and last_active_at < now() - interval '36 hours')
			-- Never filled: a lobby nobody joined is worthless after a day.
			or (status = 'open' and last_active_at < now() - interval '24 hours')
			-- Started but stalled: both players walked away mid-game.
			or (status = 'playing' and last_active_at < now() - interval '24 hours')
		returning 1
	)
	select count(*)::integer into removed from gone;

	-- The rate-limit log only matters for the last few minutes; anything older
	-- is dead weight.
	delete from request_log where created_at < now() - interval '1 day';

	return query select removed;
end;
$$;

comment on function cleanup_stale_rooms is
	'Deletes finished/abandoned rooms after 36h and unfinished ones after 24h. Invoked on a cron schedule.';

-- ---------------------------------------------------------------------------
-- Rate limiting
--
-- Records the attempt and reports whether the caller has blown the limit, in one
-- round trip. Deliberately crude: the goal is stopping one actor spinning up
-- thousands of rooms a minute, not production abuse infrastructure.
-- ---------------------------------------------------------------------------

create or replace function check_rate_limit(
	p_actor text,
	p_action text,
	p_limit integer,
	p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
	recent integer;
begin
	select count(*) into recent
	from request_log
	where actor = p_actor
		and action = p_action
		and created_at > now() - p_window;

	if recent >= p_limit then
		return false;
	end if;

	insert into request_log (actor, action) values (p_actor, p_action);
	return true;
end;
$$;

comment on function check_rate_limit is
	'True if the attempt is allowed (and logs it), false if the caller is over the limit for this window.';

-- ---------------------------------------------------------------------------
-- Schedule
--
-- pg_cron puts its functions in a `cron` schema, not under `extensions` — naming
-- it `extensions.cron.schedule` parses as database.schema.function and Postgres
-- rejects it as a cross-database reference.
--
-- Everything is wrapped in EXECUTE and guarded twice: pg_cron may not be
-- available at all (some environments), and on hosted Supabase it may need
-- enabling from the dashboard first. A project without it still gets a working
-- `cleanup_stale_rooms()` that can be called by hand or from a scheduled
-- function — it just won't self-schedule. The migration must stay safe to re-run
-- against the shared project either way.
-- ---------------------------------------------------------------------------

do $$
begin
	if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
		execute 'create extension if not exists pg_cron';
	end if;

	if exists (select 1 from pg_extension where extname = 'pg_cron') then
		-- Drop any previous incarnation so re-running is idempotent.
		execute $q$
			select cron.unschedule(jobid) from cron.job where jobname = 'blind-draft-cleanup'
		$q$;

		execute format(
			'select cron.schedule(%L, %L, %L)',
			'blind-draft-cleanup',
			'17 3 * * *', -- daily, off the hour to dodge the stampede
			'select public.cleanup_stale_rooms();'
		);
	else
		raise notice 'pg_cron unavailable: cleanup_stale_rooms() exists but is not scheduled';
	end if;
end;
$$;
