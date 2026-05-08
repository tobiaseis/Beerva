create table if not exists public.session_cheers (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (session_id, user_id)
);

alter table public.session_cheers enable row level security;

drop policy if exists "Session cheers are viewable by signed-in users" on public.session_cheers;
create policy "Session cheers are viewable by signed-in users"
  on public.session_cheers
  for select
  to authenticated
  using (true);

drop policy if exists "Users can cheer as themselves" on public.session_cheers;
create policy "Users can cheer as themselves"
  on public.session_cheers
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own cheers" on public.session_cheers;
create policy "Users can remove their own cheers"
  on public.session_cheers
  for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists session_cheers_session_id_idx
  on public.session_cheers(session_id);

create index if not exists session_cheers_user_id_idx
  on public.session_cheers(user_id);

comment on table public.session_cheers is 'One cheers reaction per user per beer session.';
