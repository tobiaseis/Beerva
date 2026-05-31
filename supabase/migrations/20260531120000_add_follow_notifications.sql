-- Add 'follow' notifications: someone started following you.
-- Extends the notifications type check to allow 'follow', and adds a dedicated
-- additive RLS insert policy so a follower can create a notification for the
-- person they just followed. The pre-existing "Users can create valid
-- notifications as themselves" policy is intentionally left untouched; Postgres
-- OR's permissive policies together, so this only widens what is allowed.

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

  -- IMPORTANT: keep every previously allowed type (last set in the hangover
  -- migration) and only ADD 'follow'. Narrowing this list would make existing
  -- hangover_check / pub_crawl_started / invite_response inserts fail.
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
      'follow'
    ));
end $$;

drop policy if exists "Users can create follow notifications as themselves" on public.notifications;
create policy "Users can create follow notifications as themselves"
  on public.notifications
  for insert
  to authenticated
  with check (
    (select auth.uid()) = actor_id
    and user_id <> actor_id
    and type = 'follow'
    and exists (
      select 1
      from public.follows
      where follows.follower_id = notifications.actor_id
        and follows.following_id = notifications.user_id
    )
  );
