-- Housekeeping: room cleanup and the rate-limit check.

-- ---------------------------------------------------------------------------
-- Cleanup. Different clocks, because an abandoned lobby is rubbish sooner than
-- a finished game someone may still be looking at. Cascades do the rest.
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
			-- Keep a day and a half, so a results screen survives being left
			-- open overnight.
			(status in ('finished', 'abandoned') and last_active_at < now() - interval '36 hours')
			-- Never filled: a lobby nobody joined is worthless after a day.
			or (status = 'open' and last_active_at < now() - interval '24 hours')
			-- Started but stalled: both players walked away mid-game.
			or (status = 'playing' and last_active_at < now() - interval '24 hours')
		returning 1
	)
	select count(*)::integer into removed from gone;

	-- The rate-limit log only matters for the last few minutes.
	delete from request_log where created_at < now() - interval '1 day';

	return query select removed;
end;
$$;

comment on function cleanup_stale_rooms is
	'Deletes finished/abandoned rooms after 36h and unfinished ones after 24h. Invoked on a cron schedule.';

-- ---------------------------------------------------------------------------
-- Rate limiting: records the attempt and reports whether the caller blew the
-- limit, in one round trip. Crude on purpose.
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
-- pg_cron lives in a `cron` schema, not under `extensions` — the latter parses
-- as database.schema.function and is rejected as a cross-database reference.
--
-- Wrapped in EXECUTE and guarded twice, because pg_cron may be unavailable or
-- need enabling from the dashboard first. Without it `cleanup_stale_rooms()`
-- still works by hand, it just won't self-schedule. Stays safe to re-run.
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
