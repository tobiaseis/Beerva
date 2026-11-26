-- Friday evening nudge for people who have not logged a night out this week,
-- plus the shared pieces the Sunday weekly recap reuses: a per-user opt-out,
-- a send log that makes each engagement push idempotent per week, and both
-- engagement notification types.

alter table public.profiles
  add column if not exists engagement_pushes_enabled boolean not null default true;

comment on column public.profiles.engagement_pushes_enabled is
  'Opt-out for scheduled engagement pushes (Friday nudge, Sunday recap). Social pushes are unaffected.';

create table if not exists public.engagement_push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('friday_nudge', 'weekly_recap')),
  week_start date not null,
  notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  primary key (user_id, kind, week_start)
);

-- No policies: only the security definer queue functions read or write it.
alter table public.engagement_push_log enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications drop constraint notifications_type_check;
  end if;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'cheer',
      'invite',
      'session_started',
      'comment',
      'invite_response',
      'pub_crawl_started',
      'hangover_check',
      'follow',
      'chug_verification',
      'drinking_buddy_added',
      'official_post',
      'mention',
      'beverage_submission',
      'friday_nudge',
      'weekly_recap'
    ));
end;
$$;

create or replace function public.queue_friday_nudges(
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
  this_week_start timestamp with time zone := (this_week::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  last_weekend_start timestamp with time zone := ((this_week - 3)::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  queued integer := 0;
  candidate record;
  claimed_user uuid;
  new_notification_id uuid;
begin
  if not coalesce(force, false) and (
    extract(isodow from local_now) <> 5
    or local_now::time < time '17:30'
    or local_now::time >= time '19:00'
  ) then
    return 0;
  end if;

  for candidate in
    select
      p.id as user_id,
      coalesce(streak.weekly_streak, 0) as weekly_streak,
      coalesce(mates.names, array[]::text[]) as mate_names,
      coalesce(mates.total, 0) as mates_out
    from public.profiles p
    left join lateral public.get_weekly_streaks(array[p.id]) as streak on true
    left join lateral (
      select
        (array_agg(mate.username order by mate.nights desc, mate.username))[1:2] as names,
        count(*)::integer as total
      from (
        select
          pr.username,
          count(distinct public.beerva_drinking_day(coalesce(s.started_at, s.created_at))) as nights
        from public.follows f
        join public.sessions s
          on s.user_id = f.following_id
         and s.status = 'published'
         and coalesce(s.started_at, s.created_at) >= last_weekend_start
         and coalesce(s.started_at, s.created_at) < this_week_start
        join public.profiles pr on pr.id = f.following_id
        where f.follower_id = p.id
          and nullif(btrim(coalesce(pr.username, '')), '') is not null
        group by pr.username
      ) as mate
    ) as mates on true
    where p.engagement_pushes_enabled
      and (only_user_id is null or p.id = only_user_id)
      and (
        exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
        or exists (select 1 from public.native_push_tokens nt where nt.user_id = p.id)
      )
      and exists (
        select 1
        from public.sessions s
        where s.user_id = p.id
          and s.status = 'published'
          and coalesce(s.started_at, s.created_at) >= now() - interval '8 weeks'
      )
      and not exists (
        select 1
        from public.sessions s
        where s.user_id = p.id
          and s.status in ('published', 'active')
          and coalesce(s.started_at, s.created_at) >= this_week_start
      )
      and not exists (
        select 1
        from public.engagement_push_log l
        where l.user_id = p.id
          and l.kind = 'friday_nudge'
          and l.week_start = this_week
      )
  loop
    claimed_user := null;

    insert into public.engagement_push_log (user_id, kind, week_start)
    values (candidate.user_id, 'friday_nudge', this_week)
    on conflict (user_id, kind, week_start) do nothing
    returning user_id into claimed_user;

    -- Another run claimed this user first.
    if claimed_user is null then
      continue;
    end if;

    -- Stored as read: a nudge is a push, not something to clear from the bell.
    insert into public.notifications (user_id, actor_id, type, reference_id, metadata, read)
    values (
      candidate.user_id,
      candidate.user_id,
      'friday_nudge',
      null,
      jsonb_build_object(
        'week_start', this_week,
        'weekly_streak', candidate.weekly_streak,
        'mate_names', to_jsonb(candidate.mate_names),
        'mates_out', candidate.mates_out
      ),
      true
    )
    returning id into new_notification_id;

    update public.engagement_push_log
    set notification_id = new_notification_id
    where engagement_push_log.user_id = candidate.user_id
      and engagement_push_log.kind = 'friday_nudge'
      and engagement_push_log.week_start = this_week;

    queued := queued + 1;
  end loop;

  return queued;
end;
$$;

revoke execute on function public.queue_friday_nudges(boolean, uuid) from public, anon, authenticated;

comment on function public.queue_friday_nudges(boolean, uuid) is
  'Queues one friday_nudge notification per eligible user per week between 17:30 and 19:00 Copenhagen time. For testing: force skips the time check, only_user_id limits it to one user.';

-- Every 15 minutes, 15:00-18:59 UTC on Fridays. That covers 17:30-19:00
-- Copenhagen in both winter (UTC+1) and summer (UTC+2). The function decides
-- whether it is time, and the log makes repeat runs harmless.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-friday-nudge') then
    perform cron.unschedule('beerva-friday-nudge');
  end if;

  perform cron.schedule(
    'beerva-friday-nudge',
    '*/15 15-18 * * 5',
    $job$select public.queue_friday_nudges();$job$
  );
end;
$$;

notify pgrst, 'reload schema';
