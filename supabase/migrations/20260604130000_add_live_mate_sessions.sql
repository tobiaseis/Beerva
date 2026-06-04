create table if not exists public.live_mate_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  pub_crawl_id uuid references public.pub_crawls(id) on delete cascade,
  current_pub_name text not null,
  started_at timestamp with time zone not null,
  last_activity_at timestamp with time zone not null,
  true_pints double precision not null default 0,
  is_pub_crawl boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint live_mate_sessions_user_unique unique (user_id),
  constraint live_mate_sessions_session_unique unique (session_id)
);

create index if not exists live_mate_sessions_user_idx
  on public.live_mate_sessions(user_id);

create index if not exists live_mate_sessions_last_activity_idx
  on public.live_mate_sessions(last_activity_at desc);

create index if not exists live_mate_sessions_pub_crawl_idx
  on public.live_mate_sessions(pub_crawl_id)
  where pub_crawl_id is not null;

alter table public.live_mate_sessions enable row level security;

drop policy if exists "Live mate sessions are visible to followers" on public.live_mate_sessions;
create policy "Live mate sessions are visible to followers"
  on public.live_mate_sessions
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.follows
      where follows.follower_id = (select auth.uid())
        and follows.following_id = live_mate_sessions.user_id
    )
  );

revoke all on table public.live_mate_sessions from anon;
revoke insert, update, delete on table public.live_mate_sessions from authenticated;
grant select on table public.live_mate_sessions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_mate_sessions'
  ) then
    alter publication supabase_realtime add table public.live_mate_sessions;
  end if;
end $$;

create or replace function public.touch_live_mate_session_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists live_mate_sessions_touch_updated_at on public.live_mate_sessions;
create trigger live_mate_sessions_touch_updated_at
  before update on public.live_mate_sessions
  for each row
  execute function public.touch_live_mate_session_updated_at();

create or replace function public.get_live_session_true_pints(target_session_id uuid)
returns double precision
language sql
stable
set search_path = public
as $$
  select coalesce(
    round((
      coalesce(sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 1)
        / 568.0
      ), 0)
    )::numeric, 1)::double precision,
    0::double precision
  )
  from public.session_beers
  where session_beers.session_id = target_session_id;
$$;

create or replace function public.get_live_pub_crawl_true_pints(target_pub_crawl_id uuid)
returns double precision
language sql
stable
set search_path = public
as $$
  select coalesce(
    round((
      coalesce(sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 1)
        / 568.0
      ), 0)
    )::numeric, 1)::double precision,
    0::double precision
  )
  from public.sessions
  join public.session_beers
    on session_beers.session_id = sessions.id
  where sessions.pub_crawl_id = target_pub_crawl_id
    and sessions.is_crawl_stop = true
    and sessions.status in ('active', 'published');
$$;

create or replace function public.get_live_session_last_activity(target_session_id uuid)
returns timestamp with time zone
language sql
stable
set search_path = public
as $$
  select coalesce(
    max(coalesce(session_beers.consumed_at, session_beers.created_at)),
    (
      select coalesce(sessions.started_at, sessions.created_at, now())
      from public.sessions
      where sessions.id = target_session_id
    )
  )
  from public.session_beers
  where session_beers.session_id = target_session_id;
$$;

create or replace function public.get_live_pub_crawl_last_activity(target_pub_crawl_id uuid)
returns timestamp with time zone
language sql
stable
set search_path = public
as $$
  select coalesce(
    max(coalesce(session_beers.consumed_at, session_beers.created_at)),
    (
      select coalesce(pub_crawls.started_at, pub_crawls.created_at, now())
      from public.pub_crawls
      where pub_crawls.id = target_pub_crawl_id
    )
  )
  from public.sessions
  left join public.session_beers
    on session_beers.session_id = sessions.id
  where sessions.pub_crawl_id = target_pub_crawl_id
    and sessions.is_crawl_stop = true
    and sessions.status in ('active', 'published');
$$;

create or replace function public.refresh_live_mate_session_for_session(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.sessions;
  live_pub_name text;
begin
  select *
  into session_row
  from public.sessions
  where id = target_session_id;

  if session_row.id is null then
    delete from public.live_mate_sessions
    where session_id = target_session_id;
    return;
  end if;

  if session_row.pub_crawl_id is not null then
    perform public.refresh_live_mate_session_for_pub_crawl(session_row.pub_crawl_id);
    return;
  end if;

  if session_row.status <> 'active' then
    delete from public.live_mate_sessions
    where session_id = session_row.id
       or (user_id = session_row.user_id and pub_crawl_id is null);
    return;
  end if;

  live_pub_name := coalesce(nullif(btrim(session_row.pub_name), ''), 'Somewhere');

  insert into public.live_mate_sessions (
    user_id,
    session_id,
    pub_crawl_id,
    current_pub_name,
    started_at,
    last_activity_at,
    true_pints,
    is_pub_crawl
  )
  values (
    session_row.user_id,
    session_row.id,
    null,
    live_pub_name,
    coalesce(session_row.started_at, session_row.created_at, now()),
    public.get_live_session_last_activity(session_row.id),
    public.get_live_session_true_pints(session_row.id),
    false
  )
  on conflict (user_id)
  do update set
    session_id = excluded.session_id,
    pub_crawl_id = null,
    current_pub_name = excluded.current_pub_name,
    started_at = excluded.started_at,
    last_activity_at = excluded.last_activity_at,
    true_pints = excluded.true_pints,
    is_pub_crawl = false;
end;
$$;

create or replace function public.refresh_live_mate_session_for_pub_crawl(target_pub_crawl_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  crawl_row public.pub_crawls;
  active_stop public.sessions;
  live_pub_name text;
begin
  select *
  into crawl_row
  from public.pub_crawls
  where id = target_pub_crawl_id;

  if crawl_row.id is null or crawl_row.status <> 'active' then
    delete from public.live_mate_sessions
    where pub_crawl_id = target_pub_crawl_id;
    return;
  end if;

  select *
  into active_stop
  from public.sessions
  where pub_crawl_id = target_pub_crawl_id
    and user_id = crawl_row.user_id
    and status = 'active'
    and is_crawl_stop = true
  order by crawl_stop_order desc nulls last, started_at desc nulls last, created_at desc
  limit 1;

  if active_stop.id is null then
    return;
  end if;

  live_pub_name := coalesce(nullif(btrim(active_stop.pub_name), ''), 'Somewhere');

  insert into public.live_mate_sessions (
    user_id,
    session_id,
    pub_crawl_id,
    current_pub_name,
    started_at,
    last_activity_at,
    true_pints,
    is_pub_crawl
  )
  values (
    crawl_row.user_id,
    active_stop.id,
    crawl_row.id,
    live_pub_name,
    coalesce(crawl_row.started_at, active_stop.started_at, crawl_row.created_at, now()),
    public.get_live_pub_crawl_last_activity(crawl_row.id),
    public.get_live_pub_crawl_true_pints(crawl_row.id),
    true
  )
  on conflict (user_id)
  do update set
    session_id = excluded.session_id,
    pub_crawl_id = excluded.pub_crawl_id,
    current_pub_name = excluded.current_pub_name,
    started_at = excluded.started_at,
    last_activity_at = excluded.last_activity_at,
    true_pints = excluded.true_pints,
    is_pub_crawl = true;
end;
$$;

create or replace function public.handle_live_mate_session_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.pub_crawl_id is not null then
      perform public.refresh_live_mate_session_for_pub_crawl(old.pub_crawl_id);
    else
      delete from public.live_mate_sessions
      where session_id = old.id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.pub_crawl_id is not null
    and old.pub_crawl_id is distinct from new.pub_crawl_id then
    perform public.refresh_live_mate_session_for_pub_crawl(old.pub_crawl_id);
  end if;

  perform public.refresh_live_mate_session_for_session(new.id);
  return new;
end;
$$;

drop trigger if exists sessions_live_mate_refresh on public.sessions;
create trigger sessions_live_mate_refresh
  after insert or update or delete on public.sessions
  for each row
  execute function public.handle_live_mate_session_change();

create or replace function public.handle_live_mate_beer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session_id uuid;
begin
  target_session_id := coalesce(new.session_id, old.session_id);
  perform public.refresh_live_mate_session_for_session(target_session_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists session_beers_live_mate_refresh on public.session_beers;
create trigger session_beers_live_mate_refresh
  after insert or update or delete on public.session_beers
  for each row
  execute function public.handle_live_mate_beer_change();

create or replace function public.handle_live_mate_pub_crawl_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.live_mate_sessions
    where pub_crawl_id = old.id;
    return old;
  end if;

  perform public.refresh_live_mate_session_for_pub_crawl(new.id);
  return new;
end;
$$;

drop trigger if exists pub_crawls_live_mate_refresh on public.pub_crawls;
create trigger pub_crawls_live_mate_refresh
  after insert or update or delete on public.pub_crawls
  for each row
  execute function public.handle_live_mate_pub_crawl_change();

create or replace function public.repair_live_mate_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row record;
  crawl_row record;
begin
  delete from public.live_mate_sessions;

  for session_row in
    select id
    from public.sessions
    where status = 'active'
      and pub_crawl_id is null
  loop
    perform public.refresh_live_mate_session_for_session(session_row.id);
  end loop;

  for crawl_row in
    select id
    from public.pub_crawls
    where status = 'active'
  loop
    perform public.refresh_live_mate_session_for_pub_crawl(crawl_row.id);
  end loop;
end;
$$;

create or replace function public.get_live_mate_sessions()
returns table (
  id uuid,
  user_id uuid,
  session_id uuid,
  pub_crawl_id uuid,
  username text,
  avatar_url text,
  current_pub_name text,
  started_at timestamp with time zone,
  last_activity_at timestamp with time zone,
  true_pints double precision,
  is_pub_crawl boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    live.id,
    live.user_id,
    live.session_id,
    live.pub_crawl_id,
    profiles.username,
    profiles.avatar_url,
    live.current_pub_name,
    live.started_at,
    live.last_activity_at,
    live.true_pints,
    live.is_pub_crawl
  from public.live_mate_sessions live
  left join public.profiles
    on profiles.id = live.user_id
  where exists (
    select 1
    from public.follows
    where follows.follower_id = (select auth.uid())
      and follows.following_id = live.user_id
  )
  order by live.last_activity_at desc nulls last, live.started_at desc nulls last;
$$;

revoke execute on function public.touch_live_mate_session_updated_at() from public, anon, authenticated;
revoke execute on function public.get_live_session_true_pints(uuid) from public, anon, authenticated;
revoke execute on function public.get_live_pub_crawl_true_pints(uuid) from public, anon, authenticated;
revoke execute on function public.get_live_session_last_activity(uuid) from public, anon, authenticated;
revoke execute on function public.get_live_pub_crawl_last_activity(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_live_mate_session_for_session(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_live_mate_session_for_pub_crawl(uuid) from public, anon, authenticated;
revoke execute on function public.handle_live_mate_session_change() from public, anon, authenticated;
revoke execute on function public.handle_live_mate_beer_change() from public, anon, authenticated;
revoke execute on function public.handle_live_mate_pub_crawl_change() from public, anon, authenticated;
revoke execute on function public.repair_live_mate_sessions() from public, anon, authenticated;
revoke execute on function public.get_live_mate_sessions() from public, anon;
grant execute on function public.get_live_mate_sessions() to authenticated;

comment on table public.live_mate_sessions is
  'Trigger-maintained follower-visible live state for active drinking sessions and active pub crawls.';
comment on function public.get_live_mate_sessions() is
  'Returns active live drinking state for users followed by the current viewer.';

select public.repair_live_mate_sessions();

notify pgrst, 'reload schema';
