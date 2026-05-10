create table if not exists public.pub_crawls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  started_at timestamp with time zone not null default now(),
  ended_at timestamp with time zone,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint pub_crawls_status_check check (status in ('active', 'published', 'cancelled'))
);

alter table public.sessions
  add column if not exists pub_crawl_id uuid references public.pub_crawls(id) on delete set null,
  add column if not exists crawl_stop_order integer,
  add column if not exists is_crawl_stop boolean not null default false,
  add column if not exists hide_from_feed boolean not null default false;

create unique index if not exists pub_crawls_one_active_per_user_idx
  on public.pub_crawls(user_id)
  where status = 'active';

create index if not exists pub_crawls_status_published_at_idx
  on public.pub_crawls(status, published_at desc);

create index if not exists pub_crawls_user_status_idx
  on public.pub_crawls(user_id, status, started_at desc);

create index if not exists sessions_pub_crawl_stop_order_idx
  on public.sessions(pub_crawl_id, crawl_stop_order)
  where pub_crawl_id is not null;

create unique index if not exists sessions_pub_crawl_stop_order_unique_idx
  on public.sessions(pub_crawl_id, crawl_stop_order)
  where pub_crawl_id is not null
    and crawl_stop_order is not null;

create unique index if not exists sessions_one_active_crawl_stop_idx
  on public.sessions(pub_crawl_id)
  where status = 'active'
    and is_crawl_stop = true
    and pub_crawl_id is not null;

create index if not exists sessions_feed_visible_published_at_idx
  on public.sessions(status, hide_from_feed, published_at desc)
  where status = 'published';

create table if not exists public.pub_crawl_cheers (
  pub_crawl_id uuid not null references public.pub_crawls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (pub_crawl_id, user_id)
);

create table if not exists public.pub_crawl_comments (
  id uuid primary key default gen_random_uuid(),
  pub_crawl_id uuid not null references public.pub_crawls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint pub_crawl_comments_body_length check (char_length(btrim(body)) between 1 and 500)
);

create index if not exists pub_crawl_cheers_user_id_idx
  on public.pub_crawl_cheers(user_id);

create index if not exists pub_crawl_comments_crawl_created_at_idx
  on public.pub_crawl_comments(pub_crawl_id, created_at asc);

create index if not exists pub_crawl_comments_user_created_at_idx
  on public.pub_crawl_comments(user_id, created_at desc);

alter table public.pub_crawls enable row level security;
alter table public.pub_crawl_cheers enable row level security;
alter table public.pub_crawl_comments enable row level security;

create or replace function public.set_pub_crawls_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pub_crawls_set_updated_at on public.pub_crawls;
create trigger pub_crawls_set_updated_at
  before update on public.pub_crawls
  for each row
  execute function public.set_pub_crawls_updated_at();

create or replace function public.set_pub_crawl_comments_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pub_crawl_comments_set_updated_at on public.pub_crawl_comments;
create trigger pub_crawl_comments_set_updated_at
  before update on public.pub_crawl_comments
  for each row
  execute function public.set_pub_crawl_comments_updated_at();

drop policy if exists "Pub crawls are viewable by signed-in users" on public.pub_crawls;
create policy "Pub crawls are viewable by signed-in users"
  on public.pub_crawls
  for select
  to authenticated
  using (
    status = 'published'
    or user_id = (select auth.uid())
  );

drop policy if exists "Users can create their own pub crawls" on public.pub_crawls;
create policy "Users can create their own pub crawls"
  on public.pub_crawls
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own pub crawls" on public.pub_crawls;
create policy "Users can update their own pub crawls"
  on public.pub_crawls
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Pub crawl cheers are viewable by signed-in users" on public.pub_crawl_cheers;
create policy "Pub crawl cheers are viewable by signed-in users"
  on public.pub_crawl_cheers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pub_crawls
      where pub_crawls.id = pub_crawl_cheers.pub_crawl_id
        and (
          pub_crawls.status = 'published'
          or pub_crawls.user_id = (select auth.uid())
          or pub_crawl_cheers.user_id = (select auth.uid())
        )
    )
  );

drop policy if exists "Users can cheer pub crawls as themselves" on public.pub_crawl_cheers;
create policy "Users can cheer pub crawls as themselves"
  on public.pub_crawl_cheers
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.pub_crawls
      where pub_crawls.id = pub_crawl_cheers.pub_crawl_id
        and pub_crawls.status = 'published'
        and pub_crawls.user_id <> (select auth.uid())
    )
  );

drop policy if exists "Users can remove their own pub crawl cheers" on public.pub_crawl_cheers;
create policy "Users can remove their own pub crawl cheers"
  on public.pub_crawl_cheers
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Pub crawl comments are viewable by signed-in users" on public.pub_crawl_comments;
create policy "Pub crawl comments are viewable by signed-in users"
  on public.pub_crawl_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pub_crawls
      where pub_crawls.id = pub_crawl_comments.pub_crawl_id
        and (
          pub_crawls.status = 'published'
          or pub_crawls.user_id = (select auth.uid())
          or pub_crawl_comments.user_id = (select auth.uid())
        )
    )
  );

drop policy if exists "Users can comment as themselves on published pub crawls" on public.pub_crawl_comments;
create policy "Users can comment as themselves on published pub crawls"
  on public.pub_crawl_comments
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.pub_crawls
      where pub_crawls.id = pub_crawl_comments.pub_crawl_id
        and pub_crawls.status = 'published'
    )
  );

drop policy if exists "Users can update their own pub crawl comments" on public.pub_crawl_comments;
create policy "Users can update their own pub crawl comments"
  on public.pub_crawl_comments
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own pub crawl comments" on public.pub_crawl_comments;
create policy "Users can delete their own pub crawl comments"
  on public.pub_crawl_comments
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.resolve_pub_for_crawl_stop(
  target_pub_id uuid,
  fallback_pub_name text,
  out resolved_pub_id uuid,
  out resolved_pub_name text
)
returns record
language plpgsql
stable
set search_path = public
as $$
begin
  if target_pub_id is not null then
    select pubs.id, pubs.name
    into resolved_pub_id, resolved_pub_name
    from public.pubs
    where pubs.id = target_pub_id
      and pubs.status = 'active';

    if resolved_pub_id is null then
      raise exception 'Choose a valid pub.';
    end if;
  else
    resolved_pub_id := null;
    resolved_pub_name := nullif(btrim(coalesce(fallback_pub_name, '')), '');

    if resolved_pub_name is null then
      raise exception 'Choose a pub before moving on.';
    end if;
  end if;
end;
$$;

create or replace function public.convert_session_to_pub_crawl(target_session_id uuid)
returns public.pub_crawls
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  session_row public.sessions;
  crawl_row public.pub_crawls;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into session_row
  from public.sessions
  where id = target_session_id
    and user_id = requesting_user_id
    and status = 'active'
  for update;

  if session_row.id is null then
    raise exception 'Choose an active session to turn into a pub crawl.';
  end if;

  if session_row.pub_crawl_id is not null then
    select *
    into crawl_row
    from public.pub_crawls
    where id = session_row.pub_crawl_id
      and user_id = requesting_user_id
      and status = 'active';

    if crawl_row.id is not null then
      return crawl_row;
    end if;

    raise exception 'This session is already attached to another pub crawl.';
  end if;

  insert into public.pub_crawls (user_id, status, started_at)
  values (requesting_user_id, 'active', coalesce(session_row.started_at, session_row.created_at, now()))
  returning * into crawl_row;

  update public.sessions
  set pub_crawl_id = crawl_row.id,
      crawl_stop_order = 1,
      is_crawl_stop = true,
      hide_from_feed = false
  where id = session_row.id;

  return crawl_row;
end;
$$;

create or replace function public.update_active_crawl_stop_pub(
  target_crawl_id uuid,
  target_pub_id uuid,
  fallback_pub_name text
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  active_stop public.sessions;
  resolved_pub_id uuid;
  resolved_pub_name text;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.pub_crawls
    where id = target_crawl_id
      and user_id = requesting_user_id
      and status = 'active'
  ) then
    raise exception 'Choose an active pub crawl.';
  end if;

  select *
  into active_stop
  from public.sessions
  where pub_crawl_id = target_crawl_id
    and user_id = requesting_user_id
    and status = 'active'
    and is_crawl_stop = true
  order by crawl_stop_order desc
  limit 1
  for update;

  if active_stop.id is null then
    raise exception 'No active pub crawl stop found.';
  end if;

  select *
  into resolved_pub_id, resolved_pub_name
  from public.resolve_pub_for_crawl_stop(target_pub_id, fallback_pub_name);

  update public.sessions
  set pub_id = resolved_pub_id,
      pub_name = resolved_pub_name
  where id = active_stop.id
  returning * into active_stop;

  return active_stop;
end;
$$;

create or replace function public.finish_active_crawl_stop(target_crawl_id uuid)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  active_stop public.sessions;
  drink_count integer;
  now_value timestamp with time zone := now();
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.pub_crawls
    where id = target_crawl_id
      and user_id = requesting_user_id
      and status = 'active'
  ) then
    raise exception 'Choose an active pub crawl.';
  end if;

  select *
  into active_stop
  from public.sessions
  where pub_crawl_id = target_crawl_id
    and user_id = requesting_user_id
    and status = 'active'
    and is_crawl_stop = true
  order by crawl_stop_order desc
  limit 1
  for update;

  if active_stop.id is null then
    raise exception 'No active pub crawl stop found.';
  end if;

  select coalesce(sum(greatest(coalesce(session_beers.quantity, 1), 0)), 0)::integer
  into drink_count
  from public.session_beers
  where session_beers.session_id = active_stop.id;

  if drink_count <= 0 then
    raise exception 'Add at least one drink before moving on.';
  end if;

  update public.sessions
  set status = 'published',
      ended_at = now_value,
      published_at = now_value,
      hide_from_feed = true
  where id = active_stop.id
  returning * into active_stop;

  return active_stop;
end;
$$;

create or replace function public.start_next_crawl_stop(
  target_crawl_id uuid,
  target_pub_id uuid,
  fallback_pub_name text
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  crawl_row public.pub_crawls;
  next_order integer;
  resolved_pub_id uuid;
  resolved_pub_name text;
  next_stop public.sessions;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into crawl_row
  from public.pub_crawls
  where id = target_crawl_id
    and user_id = requesting_user_id
    and status = 'active'
  for update;

  if crawl_row.id is null then
    raise exception 'Choose an active pub crawl.';
  end if;

  if exists (
    select 1
    from public.sessions
    where pub_crawl_id = target_crawl_id
      and user_id = requesting_user_id
      and status = 'active'
      and is_crawl_stop = true
  ) then
    raise exception 'Finish the current pub crawl stop first.';
  end if;

  select coalesce(max(crawl_stop_order), 0) + 1
  into next_order
  from public.sessions
  where pub_crawl_id = target_crawl_id;

  select *
  into resolved_pub_id, resolved_pub_name
  from public.resolve_pub_for_crawl_stop(target_pub_id, fallback_pub_name);

  insert into public.sessions (
    user_id,
    pub_id,
    pub_name,
    status,
    started_at,
    pub_crawl_id,
    crawl_stop_order,
    is_crawl_stop,
    hide_from_feed,
    comment,
    image_url,
    beer_name,
    volume,
    quantity,
    abv
  )
  values (
    requesting_user_id,
    resolved_pub_id,
    resolved_pub_name,
    'active',
    now(),
    target_crawl_id,
    next_order,
    true,
    false,
    null,
    null,
    'Session in progress',
    'Pint',
    1,
    0
  )
  returning * into next_stop;

  return next_stop;
end;
$$;

create or replace function public.publish_pub_crawl(target_crawl_id uuid)
returns public.pub_crawls
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  crawl_row public.pub_crawls;
  now_value timestamp with time zone := now();
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.finish_active_crawl_stop(target_crawl_id);

  update public.pub_crawls
  set status = 'published',
      ended_at = now_value,
      published_at = now_value
  where id = target_crawl_id
    and user_id = requesting_user_id
    and status = 'active'
  returning * into crawl_row;

  if crawl_row.id is null then
    raise exception 'Could not publish pub crawl.';
  end if;

  return crawl_row;
end;
$$;

create or replace function public.cancel_pub_crawl(target_crawl_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  now_value timestamp with time zone := now();
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.pub_crawls
  set status = 'cancelled',
      ended_at = now_value
  where id = target_crawl_id
    and user_id = requesting_user_id
    and status = 'active';

  if not found then
    raise exception 'Choose an active pub crawl.';
  end if;

  update public.sessions
  set status = 'cancelled',
      ended_at = coalesce(ended_at, now_value),
      hide_from_feed = true
  where pub_crawl_id = target_crawl_id
    and user_id = requesting_user_id;
end;
$$;

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
    check (type in ('cheer', 'invite', 'session_started', 'comment', 'invite_response', 'pub_crawl_started'));
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
      or (
        type = 'invite'
        and reference_id is not null
        and exists (
          select 1
          from public.drinking_invites
          where drinking_invites.id = notifications.reference_id
            and drinking_invites.sender_id = notifications.actor_id
            and drinking_invites.recipient_id = notifications.user_id
            and drinking_invites.status = 'pending'
        )
      )
      or (
        type = 'invite_response'
        and reference_id is not null
        and exists (
          select 1
          from public.drinking_invites
          where drinking_invites.id = notifications.reference_id
            and drinking_invites.sender_id = notifications.user_id
            and drinking_invites.recipient_id = notifications.actor_id
            and drinking_invites.status in ('accepted', 'declined')
        )
      )
      or (
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
      or (
        type = 'pub_crawl_started'
        and reference_id is not null
        and exists (
          select 1
          from public.pub_crawls
          where pub_crawls.id = notifications.reference_id
            and pub_crawls.user_id = notifications.actor_id
            and pub_crawls.status = 'active'
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
      or (
        type = 'comment'
        and reference_id is not null
        and (
          exists (
            select 1
            from public.sessions
            where sessions.id = notifications.reference_id
              and sessions.user_id = notifications.user_id
              and sessions.status = 'published'
          )
          or exists (
            select 1
            from public.pub_crawls
            join public.pub_crawl_comments
              on pub_crawl_comments.pub_crawl_id = pub_crawls.id
            where pub_crawls.id = notifications.reference_id
              and pub_crawls.user_id = notifications.user_id
              and pub_crawls.status = 'published'
              and pub_crawl_comments.user_id = notifications.actor_id
          )
        )
        and (
          exists (
            select 1
            from public.session_comments
            where session_comments.session_id = notifications.reference_id
              and session_comments.user_id = notifications.actor_id
          )
          or exists (
            select 1
            from public.pub_crawl_comments
            where pub_crawl_comments.pub_crawl_id = notifications.reference_id
              and pub_crawl_comments.user_id = notifications.actor_id
          )
        )
      )
    )
  );

revoke execute on function public.resolve_pub_for_crawl_stop(uuid, text) from public, anon;
revoke execute on function public.convert_session_to_pub_crawl(uuid) from public, anon;
revoke execute on function public.update_active_crawl_stop_pub(uuid, uuid, text) from public, anon;
revoke execute on function public.finish_active_crawl_stop(uuid) from public, anon;
revoke execute on function public.start_next_crawl_stop(uuid, uuid, text) from public, anon;
revoke execute on function public.publish_pub_crawl(uuid) from public, anon;
revoke execute on function public.cancel_pub_crawl(uuid) from public, anon;

grant execute on function public.convert_session_to_pub_crawl(uuid) to authenticated;
grant execute on function public.update_active_crawl_stop_pub(uuid, uuid, text) to authenticated;
grant execute on function public.finish_active_crawl_stop(uuid) to authenticated;
grant execute on function public.start_next_crawl_stop(uuid, uuid, text) to authenticated;
grant execute on function public.publish_pub_crawl(uuid) to authenticated;
grant execute on function public.cancel_pub_crawl(uuid) to authenticated;

comment on table public.pub_crawls is 'Parent posts for multi-stop pub crawls. Child stops remain normal sessions for stats.';
comment on column public.sessions.hide_from_feed is 'Hides published child crawl sessions from standalone feed rendering while preserving stats and leaderboard counting.';
comment on function public.convert_session_to_pub_crawl(uuid) is 'Turns an existing active session into stop one of a new active pub crawl.';
comment on function public.publish_pub_crawl(uuid) is 'Publishes the current stop and parent pub crawl in one transaction.';
comment on function public.cancel_pub_crawl(uuid) is 'Cancels an active pub crawl and all of its child sessions.';
