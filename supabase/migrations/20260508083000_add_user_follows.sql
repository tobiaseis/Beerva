create extension if not exists pg_trgm;

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

alter table public.follows enable row level security;

drop policy if exists "Follows are viewable by signed-in users" on public.follows;
create policy "Follows are viewable by signed-in users"
  on public.follows
  for select
  to authenticated
  using (true);

drop policy if exists "Users can follow as themselves" on public.follows;
create policy "Users can follow as themselves"
  on public.follows
  for insert
  to authenticated
  with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow as themselves" on public.follows;
create policy "Users can unfollow as themselves"
  on public.follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);

drop policy if exists "Profiles are viewable by signed-in users" on public.profiles;
create policy "Profiles are viewable by signed-in users"
  on public.profiles
  for select
  to authenticated
  using (true);

create index if not exists follows_following_id_idx
  on public.follows(following_id);

create index if not exists follows_follower_id_idx
  on public.follows(follower_id);

create index if not exists profiles_username_lower_idx
  on public.profiles(lower(username));

create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username gin_trgm_ops);

comment on table public.follows is 'Directed social follow relationships between Beerva users.';
