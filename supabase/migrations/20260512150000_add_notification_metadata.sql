alter table public.notifications
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_metadata_is_object'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_metadata_is_object
      check (jsonb_typeof(metadata) = 'object');
  end if;
end;
$$;

create or replace function public.set_notification_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_pub_name text;
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
  end if;

  if resolved_pub_name is not null then
    new.metadata := new.metadata || jsonb_build_object('pub_name', resolved_pub_name);
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_set_metadata on public.notifications;
create trigger notifications_set_metadata
  before insert on public.notifications
  for each row
  execute function public.set_notification_metadata();

update public.notifications
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('pub_name', nullif(btrim(sessions.pub_name), ''))
from public.sessions
where notifications.type = 'session_started'
  and notifications.reference_id = sessions.id
  and notifications.actor_id = sessions.user_id
  and nullif(btrim(sessions.pub_name), '') is not null;

update public.notifications
set metadata = coalesce(notifications.metadata, '{}'::jsonb) || jsonb_build_object('pub_name', nullif(btrim(sessions.pub_name), ''))
from public.pub_crawls
join public.sessions
  on sessions.pub_crawl_id = pub_crawls.id
where notifications.type = 'pub_crawl_started'
  and notifications.reference_id = pub_crawls.id
  and notifications.actor_id = pub_crawls.user_id
  and sessions.crawl_stop_order = 1
  and nullif(btrim(sessions.pub_name), '') is not null;

comment on column public.notifications.metadata is 'Snapshot metadata for notification display, such as the pub name at creation time.';
comment on function public.set_notification_metadata() is 'Snapshots display metadata onto notifications so recipients do not need to read active referenced rows.';
