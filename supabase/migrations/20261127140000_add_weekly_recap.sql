-- Sunday weekly recap: one RPC that builds the caller's week, and a
-- scheduler that queues one weekly_recap push per person on Sunday evening.
-- The opt-out column, engagement_push_log and the weekly_recap notification
-- type come from 20261127130000_add_friday_nudge.sql.

create or replace function public.get_weekly_recap(target_week_start date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := (select auth.uid());
  recap_week date := coalesce(
    date_trunc('week', target_week_start::timestamp)::date,
    public.beerva_drinking_week(now())
  );
  window_start timestamp with time zone := (recap_week::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  window_end timestamp with time zone := ((recap_week + 7)::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  result jsonb;
begin
  if viewer is null then
    return null;
  end if;

  with my_sessions as (
    select
      s.id,
      s.pub_name,
      s.hide_from_feed,
      s.volume,
      s.quantity,
      s.abv,
      coalesce(s.started_at, s.created_at) as started
    from public.sessions s
    where s.user_id = viewer
      and s.status = 'published'
      and coalesce(s.started_at, s.created_at) >= window_start
      and coalesce(s.started_at, s.created_at) < window_end
  ),
  my_crawls as (
    select c.id
    from public.pub_crawls c
    where c.user_id = viewer
      and c.status = 'published'
      and c.published_at >= window_start
      and c.published_at < window_end
  ),
  drinks as (
    select
      greatest(coalesce(sb.quantity, 1), 0) as quantity,
      public.beerva_challenge_progress_value('alcohol_units', sb.volume, sb.quantity::numeric, sb.abv::numeric) as units
    from my_sessions ms
    join public.session_beers sb on sb.session_id = ms.id
    where coalesce(sb.excluded_from_stats, false) = false
    union all
    select
      greatest(coalesce(ms.quantity, 1), 0) as quantity,
      public.beerva_challenge_progress_value('alcohol_units', ms.volume, ms.quantity::numeric, ms.abv::numeric) as units
    from my_sessions ms
    where not exists (
      select 1 from public.session_beers sb where sb.session_id = ms.id
    )
  ),
  nights as (
    select distinct public.beerva_drinking_day(ms.started) as night
    from my_sessions ms
  ),
  night_islands as (
    select nights.night, nights.night - (row_number() over (order by nights.night))::integer as island
    from nights
  ),
  named_pubs as (
    select btrim(ms.pub_name) as pub_name
    from my_sessions ms
    where nullif(btrim(coalesce(ms.pub_name, '')), '') is not null
  ),
  top_pub as (
    -- Same pub regardless of case; shown with its most common spelling.
    select mode() within group (order by named_pubs.pub_name) as pub_name
    from named_pubs
    group by lower(named_pubs.pub_name)
    order by count(*) desc, lower(named_pubs.pub_name)
    limit 1
  ),
  viewers as (
    select v.viewer_id
    from public.session_views v
    join my_sessions ms on ms.id = v.session_id
    union
    select v.viewer_id
    from public.pub_crawl_views v
    join my_crawls mc on mc.id = v.pub_crawl_id
  ),
  mates as (
    select
      pr.id as user_id,
      pr.username,
      pr.avatar_url,
      count(distinct public.beerva_drinking_day(coalesce(s.started_at, s.created_at)))::integer as nights_out
    from public.follows f
    join public.sessions s
      on s.user_id = f.following_id
     and s.status = 'published'
     and coalesce(s.started_at, s.created_at) >= window_start
     and coalesce(s.started_at, s.created_at) < window_end
    join public.profiles pr on pr.id = f.following_id
    where f.follower_id = viewer
    group by pr.id, pr.username, pr.avatar_url
  ),
  my_challenges as (
    select ch.id, ch.slug, ch.title, ch.metric_type, ch.challenge_type, ch.ends_at
    from public.challenge_entries ce
    join public.challenges ch on ch.id = ce.challenge_id
    where ce.user_id = viewer
      and ch.archived_at is null
      and ch.starts_at < window_end
      and ch.ends_at > window_start
  )
  select jsonb_build_object(
    'week_start', recap_week,
    'week_end', recap_week + 6,
    'is_current_week', recap_week = public.beerva_drinking_week(now()),
    'nights_out', (select count(*) from nights),
    'units', round(coalesce((select sum(drinks.units) from drinks), 0)::numeric, 1),
    'drinks', coalesce((select sum(drinks.quantity) from drinks), 0),
    'posts', (select count(*) from my_sessions where not coalesce(my_sessions.hide_from_feed, false))
      + (select count(*) from my_crawls),
    'pubs', (select count(distinct lower(named_pubs.pub_name)) from named_pubs),
    'top_pub', (select top_pub.pub_name from top_pub),
    'seen_by', (select count(*) from viewers),
    'cheers', (select count(*) from public.session_cheers c join my_sessions ms on ms.id = c.session_id)
      + (select count(*) from public.pub_crawl_cheers c join my_crawls mc on mc.id = c.pub_crawl_id),
    'comments', (select count(*) from public.session_comments c join my_sessions ms on ms.id = c.session_id)
      + (select count(*) from public.pub_crawl_comments c join my_crawls mc on mc.id = c.pub_crawl_id),
    'best_run', coalesce((
      select max(run_length)
      from (select count(*) as run_length from night_islands group by night_islands.island) runs
    ), 0),
    'weekly_streak', coalesce((select ws.weekly_streak from public.get_weekly_streaks(array[viewer]) ws), 0),
    'challenges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'slug', mc.slug,
          'title', mc.title,
          'metric_type', public.beerva_effective_challenge_metric_type(mc.challenge_type, mc.metric_type),
          'challenge_type', mc.challenge_type,
          'rank', lb.rank,
          'progress_value', round(coalesce(lb.progress_value, 0)::numeric, 1),
          'entrants', lb.entrants
        )
        order by mc.ends_at
      )
      from my_challenges mc
      cross join lateral (
        select
          max(l.rank) filter (where l.user_id = viewer) as rank,
          max(l.progress_value) filter (where l.user_id = viewer) as progress_value,
          count(*)::integer as entrants
        from public.get_challenge_leaderboard(mc.id) l
      ) lb
    ), '[]'::jsonb),
    'mates_out', (select count(*) from mates),
    'mates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', top_mates.user_id,
          'username', top_mates.username,
          'avatar_url', top_mates.avatar_url,
          'nights_out', top_mates.nights_out
        )
        order by top_mates.nights_out desc, top_mates.username
      )
      from (
        select mates.*
        from mates
        order by mates.nights_out desc, mates.username
        limit 5
      ) top_mates
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke execute on function public.get_weekly_recap(date) from public, anon;
grant execute on function public.get_weekly_recap(date) to authenticated;

comment on function public.get_weekly_recap(date) is
  'The signed-in user''s week (Monday-Sunday drinking days): nights, units, reach, streak, challenges and mates. Null week means the current week.';

create or replace function public.queue_weekly_recaps(
  force boolean default false,
  only_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := timezone('Europe/Copenhagen', now());
  this_week date := public.beerva_drinking_week(now());
  window_start timestamp with time zone := (this_week::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  queued integer := 0;
  candidate record;
  claimed_user uuid;
  new_notification_id uuid;
begin
  if not coalesce(force, false) and (
    extract(isodow from local_now) <> 7
    or local_now::time < time '18:00'
    or local_now::time >= time '19:30'
  ) then
    return 0;
  end if;

  for candidate in
    select
      p.id as user_id,
      (
        select count(distinct public.beerva_drinking_day(coalesce(s.started_at, s.created_at)))
        from public.sessions s
        where s.user_id = p.id
          and s.status = 'published'
          and coalesce(s.started_at, s.created_at) >= window_start
      )::integer as nights_out,
      (
        select count(distinct f.following_id)
        from public.follows f
        join public.sessions s
          on s.user_id = f.following_id
         and s.status = 'published'
         and coalesce(s.started_at, s.created_at) >= window_start
        where f.follower_id = p.id
      )::integer as mates_out,
      (
        select count(*)
        from (
          select v.viewer_id
          from public.session_views v
          join public.sessions s on s.id = v.session_id
          where s.user_id = p.id
            and s.status = 'published'
            and coalesce(s.started_at, s.created_at) >= window_start
          union
          select v.viewer_id
          from public.pub_crawl_views v
          join public.pub_crawls c on c.id = v.pub_crawl_id
          where c.user_id = p.id
            and c.status = 'published'
            and c.published_at >= window_start
        ) seen
      )::integer as seen_by
    from public.profiles p
    where p.engagement_pushes_enabled
      and (only_user_id is null or p.id = only_user_id)
      and (
        exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
        or exists (select 1 from public.native_push_tokens nt where nt.user_id = p.id)
      )
      and not exists (
        select 1
        from public.engagement_push_log l
        where l.user_id = p.id
          and l.kind = 'weekly_recap'
          and l.week_start = this_week
      )
  loop
    if candidate.nights_out = 0 and candidate.mates_out = 0 then
      continue;
    end if;

    claimed_user := null;
    insert into public.engagement_push_log (user_id, kind, week_start)
    values (candidate.user_id, 'weekly_recap', this_week)
    on conflict (user_id, kind, week_start) do nothing
    returning user_id into claimed_user;

    if claimed_user is null then
      continue;
    end if;

    insert into public.notifications (user_id, actor_id, type, reference_id, metadata)
    values (
      candidate.user_id,
      candidate.user_id,
      'weekly_recap',
      null,
      jsonb_build_object(
        'week_start', this_week,
        'nights_out', candidate.nights_out,
        'mates_out', candidate.mates_out,
        'seen_by', candidate.seen_by
      )
    )
    returning id into new_notification_id;

    update public.engagement_push_log
    set notification_id = new_notification_id
    where engagement_push_log.user_id = candidate.user_id
      and engagement_push_log.kind = 'weekly_recap'
      and engagement_push_log.week_start = this_week;

    queued := queued + 1;
  end loop;

  return queued;
end;
$$;

revoke execute on function public.queue_weekly_recaps(boolean, uuid) from public, anon, authenticated;

comment on function public.queue_weekly_recaps(boolean, uuid) is
  'Queues one weekly_recap notification per eligible user per week between 18:00 and 19:30 Copenhagen time on Sundays. For testing: force skips the time check, only_user_id limits it to one user.';

-- Every 15 minutes, 16:00-18:59 UTC on Sundays: covers 18:00-19:30 Copenhagen
-- in both winter and summer time. The function decides whether it is time.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-weekly-recap') then
    perform cron.unschedule('beerva-weekly-recap');
  end if;

  perform cron.schedule(
    'beerva-weekly-recap',
    '*/15 16-18 * * 0',
    $job$select public.queue_weekly_recaps();$job$
  );
end;
$$;

notify pgrst, 'reload schema';
