create table if not exists public.session_buddies (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  buddy_user_id uuid not null references auth.users(id) on delete cascade,
  added_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  responded_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint session_buddies_status_check check (status in ('active', 'removed', 'declined')),
  constraint session_buddies_no_self_tag_check check (buddy_user_id <> added_by_user_id),
  constraint session_buddies_session_buddy_unique unique (session_id, buddy_user_id)
);

create index if not exists session_buddies_session_status_idx
  on public.session_buddies(session_id, status);

create index if not exists session_buddies_buddy_status_created_at_idx
  on public.session_buddies(buddy_user_id, status, created_at desc);

create index if not exists session_buddies_added_by_created_at_idx
  on public.session_buddies(added_by_user_id, created_at desc);

alter table public.session_buddies enable row level security;

drop policy if exists "Session buddies are viewable by owner and buddy" on public.session_buddies;
create policy "Session buddies are viewable by owner and buddy"
  on public.session_buddies
  for select
  to authenticated
  using (
    added_by_user_id = (select auth.uid())
    or buddy_user_id = (select auth.uid())
  );

revoke all on table public.session_buddies from anon;
revoke insert, update, delete on table public.session_buddies from authenticated;
grant select on table public.session_buddies to authenticated;

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
      'drinking_buddy_added'
    ));
end $$;

create or replace function public.set_notification_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_pub_name text;
  resolved_target_type text;
  resolved_session_id uuid;
  resolved_session_status text;
begin
  if new.metadata is null or jsonb_typeof(new.metadata) <> 'object' then
    new.metadata := '{}'::jsonb;
  end if;

  if new.type = 'session_started' and new.reference_id is not null then
    select nullif(btrim(sessions.pub_name), '')
    into resolved_pub_name
    from public.sessions
    where sessions.id = new.reference_id
      and sessions.user_id = new.actor_id;
  elsif new.type = 'pub_crawl_started' and new.reference_id is not null then
    select nullif(btrim(sessions.pub_name), '')
    into resolved_pub_name
    from public.sessions
    join public.pub_crawls
      on pub_crawls.id = sessions.pub_crawl_id
    where pub_crawls.id = new.reference_id
      and pub_crawls.user_id = new.actor_id
      and sessions.crawl_stop_order = 1
    order by sessions.started_at asc nulls last, sessions.created_at asc nulls last
    limit 1;
  elsif new.type = 'drinking_buddy_added' and new.reference_id is not null then
    select
      sessions.id,
      nullif(btrim(sessions.pub_name), ''),
      sessions.status
    into
      resolved_session_id,
      resolved_pub_name,
      resolved_session_status
    from public.session_buddies
    join public.sessions
      on sessions.id = session_buddies.session_id
    where session_buddies.id = new.reference_id
      and session_buddies.added_by_user_id = new.actor_id
      and session_buddies.buddy_user_id = new.user_id;
  end if;

  if new.type in ('cheer', 'comment') and new.reference_id is not null then
    if exists (
      select 1
      from public.sessions
      where sessions.id = new.reference_id
        and sessions.user_id = new.user_id
    ) then
      resolved_target_type := 'session';
    elsif exists (
      select 1
      from public.pub_crawls
      where pub_crawls.id = new.reference_id
        and pub_crawls.user_id = new.user_id
    ) then
      resolved_target_type := 'pub_crawl';
    end if;
  end if;

  if resolved_pub_name is not null then
    new.metadata := new.metadata || jsonb_build_object('pub_name', resolved_pub_name);
  end if;

  if resolved_target_type is not null then
    new.metadata := new.metadata || jsonb_build_object('target_type', resolved_target_type);
  end if;

  if resolved_session_id is not null then
    new.metadata := new.metadata || jsonb_build_object(
      'target_type', 'session',
      'session_id', resolved_session_id,
      'session_status', resolved_session_status
    );
  end if;

  return new;
end;
$$;

create or replace function public.set_session_buddies(
  target_session_id uuid,
  buddy_user_ids uuid[]
)
returns setof public.session_buddies
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  target_session public.sessions;
  requested_buddy_id uuid;
  cleaned_buddy_ids uuid[];
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into target_session
  from public.sessions
  where id = target_session_id
    and user_id = requesting_user_id
    and pub_crawl_id is null
    and status in ('active', 'published');

  if target_session.id is null then
    raise exception 'Session not found.';
  end if;

  if requesting_user_id = any(coalesce(buddy_user_ids, array[]::uuid[])) then
    raise exception 'You cannot add yourself as a drinking buddy.';
  end if;

  select coalesce(array_agg(distinct requested.buddy_id), array[]::uuid[])
  into cleaned_buddy_ids
  from unnest(coalesce(buddy_user_ids, array[]::uuid[])) as requested(buddy_id)
  where requested.buddy_id is not null;

  foreach requested_buddy_id in array cleaned_buddy_ids loop
    if not public.is_mutual_follower(requesting_user_id, requested_buddy_id) then
      raise exception 'Drinking buddies must be mutual mates.';
    end if;
  end loop;

  if exists (
    select 1
    from public.session_buddies
    where session_id = target_session_id
      and buddy_user_id = any(cleaned_buddy_ids)
      and status = 'declined'
  ) then
    raise exception 'A buddy who used Not with me cannot be re-added to this session.';
  end if;

  update public.session_buddies
  set
    status = 'removed',
    responded_at = null,
    updated_at = now()
  where session_id = target_session_id
    and added_by_user_id = requesting_user_id
    and status = 'active'
    and not (buddy_user_id = any(cleaned_buddy_ids));

  with requested as (
    select unnest(cleaned_buddy_ids) as buddy_user_id
  ),
  changed as (
    insert into public.session_buddies (
      session_id,
      buddy_user_id,
      added_by_user_id,
      status,
      responded_at,
      updated_at
    )
    select
      target_session_id,
      requested.buddy_user_id,
      requesting_user_id,
      'active',
      null,
      now()
    from requested
    on conflict (session_id, buddy_user_id)
    do update
      set
        status = 'active',
        responded_at = null,
        updated_at = now()
      where public.session_buddies.status = 'removed'
    returning public.session_buddies.*
  )
  insert into public.notifications (user_id, actor_id, type, reference_id, metadata)
  select
    changed.buddy_user_id,
    requesting_user_id,
    'drinking_buddy_added',
    changed.id,
    jsonb_build_object(
      'target_type', 'session',
      'session_id', target_session_id,
      'pub_name', target_session.pub_name,
      'session_status', target_session.status
    )
  from changed
  where changed.status = 'active';

  return query
  select buddies.*
  from public.session_buddies buddies
  where buddies.session_id = target_session_id
    and buddies.added_by_user_id = requesting_user_id
    and buddies.status = 'active'
  order by buddies.created_at asc;
end;
$$;

create or replace function public.decline_session_buddy(target_session_buddy_id uuid)
returns public.session_buddies
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  buddy_row public.session_buddies;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.session_buddies
  set
    status = 'declined',
    responded_at = now(),
    updated_at = now()
  where id = target_session_buddy_id
    and buddy_user_id = requesting_user_id
    and status = 'active'
  returning * into buddy_row;

  if buddy_row.id is null then
    raise exception 'This drinking buddy tag is no longer active.';
  end if;

  return buddy_row;
end;
$$;

create or replace function public.get_session_buddy_summaries(session_ids uuid[])
returns table (
  session_id uuid,
  id uuid,
  buddy_user_id uuid,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    buddies.session_id,
    buddies.id,
    buddies.buddy_user_id,
    profiles.username,
    profiles.avatar_url
  from public.session_buddies buddies
  join public.sessions
    on sessions.id = buddies.session_id
  join public.profiles
    on profiles.id = buddies.buddy_user_id
  where buddies.session_id = any(coalesce(session_ids, array[]::uuid[]))
    and buddies.status = 'active'
    and (
      sessions.status = 'published'
      or sessions.user_id = (select auth.uid())
      or buddies.buddy_user_id = (select auth.uid())
    )
  order by buddies.created_at asc;
$$;

revoke execute on function public.set_session_buddies(uuid, uuid[]) from public, anon;
revoke execute on function public.decline_session_buddy(uuid) from public, anon;
revoke execute on function public.get_session_buddy_summaries(uuid[]) from public, anon;

grant execute on function public.set_session_buddies(uuid, uuid[]) to authenticated;
grant execute on function public.decline_session_buddy(uuid) to authenticated;
grant execute on function public.get_session_buddy_summaries(uuid[]) to authenticated;

comment on table public.session_buddies is 'Mutual mates tagged as drinking together on a session. Declined tags remain locked for that session.';
comment on function public.set_session_buddies(uuid, uuid[]) is 'Reconciles an owned active or published session buddy list and notifies newly added mutual mates.';
comment on function public.decline_session_buddy(uuid) is 'Allows a tagged buddy to mark an active drinking buddy tag as declined.';
comment on function public.get_session_buddy_summaries(uuid[]) is 'Returns display-safe active drinking buddy summaries for visible sessions.';
comment on function public.set_notification_metadata() is 'Snapshots display metadata and typed targets onto notifications so recipients can open referenced posts directly.';

notify pgrst, 'reload schema';
