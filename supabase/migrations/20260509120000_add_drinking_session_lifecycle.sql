alter table public.sessions
  add column if not exists status text not null default 'published',
  add column if not exists started_at timestamp with time zone,
  add column if not exists ended_at timestamp with time zone,
  add column if not exists published_at timestamp with time zone,
  add column if not exists edited_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_status_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_status_check
      check (status in ('active', 'published', 'cancelled'));
  end if;
end $$;

update public.sessions
set
  status = coalesce(status, 'published'),
  started_at = coalesce(started_at, created_at),
  ended_at = coalesce(ended_at, created_at),
  published_at = coalesce(published_at, created_at)
where started_at is null
   or ended_at is null
   or published_at is null
   or status is null;

alter table public.sessions
  alter column started_at set default now(),
  alter column published_at set default now();

create unique index if not exists sessions_one_active_per_user_idx
  on public.sessions(user_id)
  where status = 'active';

create index if not exists sessions_user_id_status_published_at_idx
  on public.sessions(user_id, status, published_at desc);

create table if not exists public.session_beers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  beer_name text not null,
  volume text,
  quantity integer not null default 1 check (quantity > 0),
  abv double precision,
  note text,
  consumed_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

alter table public.session_beers enable row level security;

insert into public.session_beers (
  session_id,
  beer_name,
  volume,
  quantity,
  abv,
  consumed_at,
  created_at
)
select
  sessions.id,
  sessions.beer_name,
  sessions.volume,
  coalesce(sessions.quantity, 1),
  sessions.abv,
  sessions.created_at,
  sessions.created_at
from public.sessions
where sessions.beer_name is not null
  and not exists (
    select 1
    from public.session_beers existing
    where existing.session_id = sessions.id
  );

drop policy if exists "Session beers are viewable by signed-in users" on public.session_beers;
create policy "Session beers are viewable by signed-in users"
  on public.session_beers
  for select
  to authenticated
  using (true);

drop policy if exists "Users can add beers to their own sessions" on public.session_beers;
create policy "Users can add beers to their own sessions"
  on public.session_beers
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_beers.session_id
        and sessions.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update beers in their own sessions" on public.session_beers;
create policy "Users can update beers in their own sessions"
  on public.session_beers
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_beers.session_id
        and sessions.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_beers.session_id
        and sessions.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can remove beers from their own sessions" on public.session_beers;
create policy "Users can remove beers from their own sessions"
  on public.session_beers
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_beers.session_id
        and sessions.user_id = (select auth.uid())
    )
  );

drop policy if exists "Authenticated users can view sessions" on public.sessions;
create policy "Authenticated users can view sessions"
  on public.sessions
  for select
  to authenticated
  using (
    status = 'published'
    or user_id = (select auth.uid())
  );

drop policy if exists "Users can create their own sessions" on public.sessions;
create policy "Users can create their own sessions"
  on public.sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own sessions" on public.sessions;
create policy "Users can update their own sessions"
  on public.sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own sessions" on public.sessions;
create policy "Users can delete their own sessions"
  on public.sessions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

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
    check (type in ('cheer', 'invite', 'session_started'));
end $$;

drop policy if exists "Users can create valid notifications as themselves" on public.notifications;
create policy "Users can create valid notifications as themselves"
  on public.notifications
  for insert
  to authenticated
  with check (
    (select auth.uid()) = actor_id
    and user_id <> actor_id
    and (
      (
        type = 'cheer'
        and reference_id is not null
        and exists (
          select 1
          from public.sessions
          where sessions.id = notifications.reference_id
            and sessions.user_id = notifications.user_id
        )
        and exists (
          select 1
          from public.session_cheers
          where session_cheers.session_id = notifications.reference_id
            and session_cheers.user_id = notifications.actor_id
        )
      )
      or
      (
        type = 'invite'
        and reference_id is null
        and exists (
          select 1
          from public.follows actor_follow
          where actor_follow.follower_id = notifications.actor_id
            and actor_follow.following_id = notifications.user_id
        )
        and exists (
          select 1
          from public.follows recipient_follow
          where recipient_follow.follower_id = notifications.user_id
            and recipient_follow.following_id = notifications.actor_id
        )
      )
      or
      (
        type = 'session_started'
        and reference_id is not null
        and exists (
          select 1
          from public.sessions
          where sessions.id = notifications.reference_id
            and sessions.user_id = notifications.actor_id
            and sessions.status = 'active'
        )
        and exists (
          select 1
          from public.follows actor_follow
          where actor_follow.follower_id = notifications.actor_id
            and actor_follow.following_id = notifications.user_id
        )
        and exists (
          select 1
          from public.follows recipient_follow
          where recipient_follow.follower_id = notifications.user_id
            and recipient_follow.following_id = notifications.actor_id
        )
      )
    )
  );

create index if not exists session_beers_session_id_consumed_at_idx
  on public.session_beers(session_id, consumed_at);

create or replace function public.get_profile_stats(target_user_id uuid)
returns table (
  total_pints double precision,
  unique_pubs integer,
  avg_abv double precision,
  max_session_pints double precision,
  strongest_abv double precision,
  has_late_night_session boolean,
  max_sessions_in_one_day integer,
  max_pubs_in_one_day integer,
  max_sessions_at_same_pub integer,
  longest_day_streak integer,
  unique_beers integer,
  max_beers_in_one_day integer,
  has_early_bird_session boolean,
  months_logged integer
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      sessions.id as session_id,
      sessions.pub_name,
      session_beers.beer_name,
      coalesce(session_beers.quantity, 1)::double precision as quantity_value,
      coalesce(session_beers.abv, 0)::double precision as abv_value,
      case lower(coalesce(session_beers.volume, 'pint'))
        when '25cl' then 250::double precision
        when '33cl' then 330::double precision
        when 'schooner' then 379::double precision
        when '50cl' then 500::double precision
        else 568::double precision
      end as volume_ml,
      timezone('Europe/Copenhagen', coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) as local_created_at,
      (timezone('Europe/Copenhagen', coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) - interval '6 hours')::date as drinking_day
    from sessions
    join session_beers on session_beers.session_id = sessions.id
    where sessions.user_id = target_user_id
      and sessions.status = 'published'
  ),
  beer_rows as (
    select
      *,
      volume_ml * quantity_value as beer_ml,
      (volume_ml * quantity_value) / 568.0 as beer_pints
    from base
  ),
  sessions_per_day as (
    select drinking_day, count(distinct session_id)::integer as session_count
    from beer_rows
    where drinking_day is not null
    group by drinking_day
  ),
  pubs_per_day as (
    select drinking_day, count(distinct pub_name)::integer as pub_count
    from beer_rows
    where drinking_day is not null and pub_name is not null
    group by drinking_day
  ),
  beers_per_day as (
    select drinking_day, count(distinct beer_name)::integer as beer_count
    from beer_rows
    where drinking_day is not null and beer_name is not null
    group by drinking_day
  ),
  sessions_per_pub as (
    select pub_name, count(distinct session_id)::integer as session_count
    from beer_rows
    where pub_name is not null
    group by pub_name
  ),
  pints_per_session as (
    select session_id, sum(beer_pints) as session_pints
    from beer_rows
    group by session_id
  ),
  streak_days as (
    select
      drinking_day,
      drinking_day - row_number() over (order by drinking_day)::integer as streak_group
    from (
      select distinct drinking_day
      from beer_rows
      where drinking_day is not null
    ) days
  ),
  streaks as (
    select count(*)::integer as streak_length
    from streak_days
    group by streak_group
  )
  select
    coalesce(round((sum(beer_ml) / 568.0)::numeric, 1)::double precision, 0) as total_pints,
    (count(distinct pub_name) filter (where pub_name is not null))::integer as unique_pubs,
    coalesce(round((sum(beer_ml * abv_value) / nullif(sum(beer_ml), 0))::numeric, 1)::double precision, 0) as avg_abv,
    coalesce(round((select max(session_pints) from pints_per_session)::numeric, 1)::double precision, 0) as max_session_pints,
    coalesce(round(max(abv_value)::numeric, 1)::double precision, 0) as strongest_abv,
    coalesce(bool_or(extract(hour from local_created_at) >= 3 and extract(hour from local_created_at) < 6), false) as has_late_night_session,
    coalesce((select max(session_count) from sessions_per_day), 0) as max_sessions_in_one_day,
    coalesce((select max(pub_count) from pubs_per_day), 0) as max_pubs_in_one_day,
    coalesce((select max(session_count) from sessions_per_pub), 0) as max_sessions_at_same_pub,
    coalesce((select max(streak_length) from streaks), 0) as longest_day_streak,
    (count(distinct beer_name) filter (where beer_name is not null))::integer as unique_beers,
    coalesce((select max(beer_count) from beers_per_day), 0) as max_beers_in_one_day,
    coalesce(bool_or(extract(hour from local_created_at) >= 6 and extract(hour from local_created_at) < 10), false) as has_early_bird_session,
    (count(distinct extract(month from local_created_at)) filter (where local_created_at is not null))::integer as months_logged
  from beer_rows;
$$;

grant execute on function public.get_profile_stats(uuid) to authenticated;

comment on table public.session_beers is 'Individual beers consumed within a pub drinking session.';
comment on column public.sessions.status is 'Lifecycle state: active while drinking, published once posted to the feed, cancelled if abandoned.';
comment on column public.sessions.edited_at is 'Timestamp of the latest owner edit after publishing.';
