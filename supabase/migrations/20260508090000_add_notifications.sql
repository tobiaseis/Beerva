create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('cheer', 'invite')),
  reference_id uuid,
  read boolean not null default false,
  created_at timestamp with time zone not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "Notifications are viewable by owner" on public.notifications;
create policy "Notifications are viewable by owner"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert notifications acting as themselves" on public.notifications;
create policy "Users can insert notifications acting as themselves"
  on public.notifications
  for insert
  to authenticated
  with check (auth.uid() = actor_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can delete notifications they created" on public.notifications;
create policy "Users can delete notifications they created"
  on public.notifications
  for delete
  to authenticated
  using (auth.uid() = actor_id);

create index if not exists notifications_user_id_idx
  on public.notifications(user_id);

comment on table public.notifications is 'User notifications for cheers, invites, etc.';
