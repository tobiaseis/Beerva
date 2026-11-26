-- Weekly streaks (the main streak) and per-post "nights in a row".
--
-- A night out is a 06:00-06:00 Europe/Copenhagen drinking day with a
-- published session, the same bucket get_current_streaks already uses for
-- the daily avatar flame. Weeks run Monday to Sunday on drinking days.

create or replace function public.beerva_drinking_day(event_at timestamp with time zone)
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Europe/Copenhagen', event_at) - interval '6 hours')::date;
$$;

create or replace function public.beerva_drinking_week(event_at timestamp with time zone)
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc('week', public.beerva_drinking_day(event_at)::timestamp)::date;
$$;

grant execute on function public.beerva_drinking_day(timestamp with time zone) to authenticated;
grant execute on function public.beerva_drinking_week(timestamp with time zone) to authenticated;

comment on function public.beerva_drinking_day(timestamp with time zone) is
  'The 06:00-06:00 Europe/Copenhagen drinking day a timestamp belongs to.';
comment on function public.beerva_drinking_week(timestamp with time zone) is
  'Monday of the drinking week a timestamp belongs to.';

-- Consecutive weeks with at least one night out. The latest run counts while
-- it ends this week or last week, so a streak stays alive until the current
-- week is over. Returns a row for every requested user.
create or replace function public.get_weekly_streaks(user_ids uuid[])
returns table (
  user_id uuid,
  weekly_streak integer,
  active_this_week boolean,
  nights_this_week integer
)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select distinct requested_id as uid
    from unnest(coalesce(user_ids, array[]::uuid[])) as requested_id
  ),
  current_week as (
    select public.beerva_drinking_week(now()) as week_start
  ),
  drinking_days as (
    select distinct
      s.user_id as uid,
      public.beerva_drinking_day(coalesce(s.started_at, s.created_at)) as drinking_day
    from public.sessions s
    where s.user_id in (select requested.uid from requested)
      and s.status = 'published'
  ),
  weeks as (
    select distinct
      drinking_days.uid,
      date_trunc('week', drinking_days.drinking_day::timestamp)::date as week_start
    from drinking_days
  ),
  grouped as (
    select
      weeks.uid,
      weeks.week_start,
      weeks.week_start - (7 * row_number() over (partition by weeks.uid order by weeks.week_start))::integer as streak_group
    from weeks
  ),
  runs as (
    select grouped.uid, count(*)::integer as run_length, max(grouped.week_start) as run_end
    from grouped
    group by grouped.uid, grouped.streak_group
  ),
  latest_run as (
    select distinct on (runs.uid) runs.uid, runs.run_length, runs.run_end
    from runs
    order by runs.uid, runs.run_end desc
  ),
  this_week as (
    select drinking_days.uid, count(*)::integer as nights
    from drinking_days
    cross join current_week
    where date_trunc('week', drinking_days.drinking_day::timestamp)::date = current_week.week_start
    group by drinking_days.uid
  )
  select
    requested.uid as user_id,
    case
      when latest_run.run_end >= current_week.week_start - 7 then latest_run.run_length
      else 0
    end as weekly_streak,
    coalesce(latest_run.run_end = current_week.week_start, false) as active_this_week,
    coalesce(this_week.nights, 0) as nights_this_week
  from requested
  cross join current_week
  left join latest_run on latest_run.uid = requested.uid
  left join this_week on this_week.uid = requested.uid;
$$;

-- For each requested post: how many consecutive nights its author had been
-- out, ending at that post's own night (1 = no run).
create or replace function public.get_session_night_runs(session_ids uuid[])
returns table (
  session_id uuid,
  nights_in_a_row integer
)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select
      s.id,
      s.user_id,
      public.beerva_drinking_day(coalesce(s.started_at, s.created_at)) as drinking_day
    from public.sessions s
    where s.id = any(coalesce(session_ids, array[]::uuid[]))
      and s.status = 'published'
  ),
  author_days as (
    select distinct
      s.user_id as uid,
      public.beerva_drinking_day(coalesce(s.started_at, s.created_at)) as drinking_day
    from public.sessions s
    where s.user_id in (select requested.user_id from requested)
      and s.status = 'published'
  ),
  islands as (
    select
      author_days.uid,
      author_days.drinking_day,
      author_days.drinking_day - (row_number() over (partition by author_days.uid order by author_days.drinking_day))::integer as island
    from author_days
  ),
  island_starts as (
    select islands.uid, islands.island, min(islands.drinking_day) as island_start
    from islands
    group by islands.uid, islands.island
  )
  select
    requested.id as session_id,
    (requested.drinking_day - island_starts.island_start + 1)::integer as nights_in_a_row
  from requested
  join islands
    on islands.uid = requested.user_id
   and islands.drinking_day = requested.drinking_day
  join island_starts
    on island_starts.uid = islands.uid
   and island_starts.island = islands.island;
$$;

revoke execute on function public.get_weekly_streaks(uuid[]) from public, anon;
grant execute on function public.get_weekly_streaks(uuid[]) to authenticated;
revoke execute on function public.get_session_night_runs(uuid[]) from public, anon;
grant execute on function public.get_session_night_runs(uuid[]) to authenticated;

comment on function public.get_weekly_streaks(uuid[]) is
  'Consecutive weeks with a night out per user, whether this week already counts, and nights out this week.';
comment on function public.get_session_night_runs(uuid[]) is
  'Consecutive nights out per post, ending at that post''s own drinking day.';

notify pgrst, 'reload schema';
