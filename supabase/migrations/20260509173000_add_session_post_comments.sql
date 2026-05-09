create table if not exists public.session_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint session_comments_body_length check (char_length(btrim(body)) between 1 and 500)
);

alter table public.session_comments enable row level security;

create index if not exists session_comments_session_id_created_at_idx
  on public.session_comments(session_id, created_at asc);

create index if not exists session_comments_user_id_created_at_idx
  on public.session_comments(user_id, created_at desc);

drop policy if exists "Session comments are viewable by signed-in users" on public.session_comments;
create policy "Session comments are viewable by signed-in users"
  on public.session_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_comments.session_id
        and (
          sessions.status = 'published'
          or sessions.user_id = (select auth.uid())
          or session_comments.user_id = (select auth.uid())
        )
    )
  );

drop policy if exists "Users can comment as themselves on published sessions" on public.session_comments;
create policy "Users can comment as themselves on published sessions"
  on public.session_comments
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.sessions
      where sessions.id = session_comments.session_id
        and sessions.status = 'published'
    )
  );

drop policy if exists "Users can update their own session comments" on public.session_comments;
create policy "Users can update their own session comments"
  on public.session_comments
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their own session comments" on public.session_comments;
create policy "Users can delete their own session comments"
  on public.session_comments
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.set_session_comments_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists session_comments_set_updated_at on public.session_comments;
create trigger session_comments_set_updated_at
  before update on public.session_comments
  for each row
  execute function public.set_session_comments_updated_at();

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
    check (type in ('cheer', 'invite', 'session_started', 'comment'));
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
        type = 'session_started'
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

comment on table public.session_comments is 'User comments on published Beerva sessions.';
