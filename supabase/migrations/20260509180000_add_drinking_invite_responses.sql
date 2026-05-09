create table if not exists public.drinking_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamp with time zone not null default now(),
  responded_at timestamp with time zone,
  constraint drinking_invites_distinct_users check (sender_id <> recipient_id),
  constraint drinking_invites_status_check check (status in ('pending', 'accepted', 'declined'))
);

alter table public.drinking_invites enable row level security;

create index if not exists drinking_invites_recipient_status_created_at_idx
  on public.drinking_invites(recipient_id, status, created_at desc);

create index if not exists drinking_invites_sender_created_at_idx
  on public.drinking_invites(sender_id, created_at desc);

create or replace function public.validate_drinking_invite_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sender_id <> old.sender_id
    or new.recipient_id <> old.recipient_id
    or new.created_at <> old.created_at
  then
    raise exception 'Invite participants cannot be changed';
  end if;

  if old.status <> 'pending' and new.status <> old.status then
    raise exception 'Invite has already been answered';
  end if;

  if old.status = 'pending' and new.status in ('accepted', 'declined') and new.responded_at is null then
    new.responded_at := now();
  end if;

  if new.status = 'pending' then
    new.responded_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists drinking_invites_validate_update on public.drinking_invites;
create trigger drinking_invites_validate_update
  before update on public.drinking_invites
  for each row
  execute function public.validate_drinking_invite_update();

drop policy if exists "Drinking invites are viewable by participants" on public.drinking_invites;
create policy "Drinking invites are viewable by participants"
  on public.drinking_invites
  for select
  to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

drop policy if exists "Mutual mates can create drinking invites" on public.drinking_invites;
create policy "Mutual mates can create drinking invites"
  on public.drinking_invites
  for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and sender_id <> recipient_id
    and status = 'pending'
    and responded_at is null
    and exists (
      select 1
      from public.follows sender_follow
      where sender_follow.follower_id = drinking_invites.sender_id
        and sender_follow.following_id = drinking_invites.recipient_id
    )
    and exists (
      select 1
      from public.follows recipient_follow
      where recipient_follow.follower_id = drinking_invites.recipient_id
        and recipient_follow.following_id = drinking_invites.sender_id
    )
  );

drop policy if exists "Recipients can answer pending drinking invites" on public.drinking_invites;
create policy "Recipients can answer pending drinking invites"
  on public.drinking_invites
  for update
  to authenticated
  using (
    (select auth.uid()) = recipient_id
    and status = 'pending'
  )
  with check (
    (select auth.uid()) = recipient_id
    and status in ('accepted', 'declined')
  );

drop policy if exists "Senders can delete pending drinking invites" on public.drinking_invites;
create policy "Senders can delete pending drinking invites"
  on public.drinking_invites
  for delete
  to authenticated
  using (
    (select auth.uid()) = sender_id
    and status = 'pending'
  );

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
    check (type in ('cheer', 'invite', 'session_started', 'comment', 'invite_response'));
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
        type = 'comment'
        and reference_id is not null
        and exists (
          select 1
          from public.sessions
          where sessions.id = notifications.reference_id
            and sessions.user_id = notifications.user_id
            and sessions.status = 'published'
        )
        and exists (
          select 1
          from public.session_comments
          where session_comments.session_id = notifications.reference_id
            and session_comments.user_id = notifications.actor_id
        )
      )
    )
  );

comment on table public.drinking_invites is 'Actionable drinking invitations between mutual mates.';
