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
  resolved_pub_crawl_id uuid;
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
      sessions.pub_crawl_id,
      nullif(btrim(sessions.pub_name), ''),
      sessions.status
    into
      resolved_session_id,
      resolved_pub_crawl_id,
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
    if resolved_pub_crawl_id is not null then
      new.metadata := new.metadata || jsonb_build_object(
        'target_type', 'pub_crawl',
        'session_id', resolved_session_id,
        'pub_crawl_id', resolved_pub_crawl_id,
        'session_status', resolved_session_status
      );
    else
      new.metadata := new.metadata || jsonb_build_object(
        'target_type', 'session',
        'session_id', resolved_session_id,
        'session_status', resolved_session_status
      );
    end if;
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
      'target_type', case when target_session.pub_crawl_id is not null then 'pub_crawl' else 'session' end,
      'target_id', coalesce(target_session.pub_crawl_id, target_session_id),
      'session_id', target_session_id,
      'pub_crawl_id', target_session.pub_crawl_id,
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

revoke execute on function public.set_session_buddies(uuid, uuid[]) from public, anon;
grant execute on function public.set_session_buddies(uuid, uuid[]) to authenticated;

comment on function public.set_session_buddies(uuid, uuid[]) is 'Reconciles an owned active or published session buddy list, including pub crawl stop sessions, and notifies newly added mutual mates.';
comment on function public.set_notification_metadata() is 'Snapshots display metadata and typed post targets onto notifications so recipients can open referenced posts directly.';

notify pgrst, 'reload schema';
