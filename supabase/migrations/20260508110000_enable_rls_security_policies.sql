do $$
declare
  target_table text;
  policy_record record;
begin
  for target_table in
    select unnest(array[
      'profiles',
      'sessions',
      'follows',
      'session_cheers',
      'notifications',
      'push_subscriptions'
    ])
  loop
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, target_table);
    end loop;
  end loop;
end $$;

alter table if exists public.profiles enable row level security;
alter table if exists public.sessions enable row level security;
alter table if exists public.follows enable row level security;
alter table if exists public.session_cheers enable row level security;
alter table if exists public.notifications enable row level security;
alter table if exists public.push_subscriptions enable row level security;

create policy "Authenticated users can view profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "Users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Authenticated users can view sessions"
  on public.sessions
  for select
  to authenticated
  using (true);

create policy "Users can create their own sessions"
  on public.sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own sessions"
  on public.sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own sessions"
  on public.sessions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Authenticated users can view follows"
  on public.follows
  for select
  to authenticated
  using (true);

create policy "Users can follow as themselves"
  on public.follows
  for insert
  to authenticated
  with check ((select auth.uid()) = follower_id);

create policy "Users can unfollow as themselves"
  on public.follows
  for delete
  to authenticated
  using ((select auth.uid()) = follower_id);

create policy "Authenticated users can view cheers"
  on public.session_cheers
  for select
  to authenticated
  using (true);

create policy "Users can cheer as themselves"
  on public.session_cheers
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.sessions
      where sessions.id = session_cheers.session_id
        and sessions.user_id <> (select auth.uid())
    )
  );

create policy "Users can remove their own cheers"
  on public.session_cheers
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their own notifications"
  on public.notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

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
    )
  );

create policy "Users can mark their own notifications"
  on public.notifications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete notifications they created"
  on public.notifications
  for delete
  to authenticated
  using ((select auth.uid()) = actor_id);

create policy "Users can view their own push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists notifications_user_id_read_created_at_idx
  on public.notifications(user_id, read, created_at desc);
