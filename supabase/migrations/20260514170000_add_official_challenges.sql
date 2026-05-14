create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null,
  metric_type text not null,
  target_value numeric not null,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  join_closes_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  constraint challenges_metric_type_check check (metric_type in ('true_pints')),
  constraint challenges_target_positive_check check (target_value > 0),
  constraint challenges_window_check check (starts_at < ends_at),
  constraint challenges_join_window_check check (starts_at <= join_closes_at and join_closes_at <= ends_at)
);

create table if not exists public.challenge_entries (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamp with time zone not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists challenges_active_window_idx
  on public.challenges(starts_at, ends_at, join_closes_at);

create index if not exists challenge_entries_user_id_idx
  on public.challenge_entries(user_id, joined_at desc);

alter table public.challenges enable row level security;
alter table public.challenge_entries enable row level security;

drop policy if exists "Signed-in users can view official challenges" on public.challenges;
create policy "Signed-in users can view official challenges"
  on public.challenges
  for select
  to authenticated
  using (true);

drop policy if exists "Signed-in users can view challenge entries" on public.challenge_entries;
create policy "Signed-in users can view challenge entries"
  on public.challenge_entries
  for select
  to authenticated
  using (true);

drop policy if exists "Users can join challenges for themselves" on public.challenge_entries;
create policy "Users can join challenges for themselves"
  on public.challenge_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

insert into public.challenges (
  slug,
  title,
  description,
  metric_type,
  target_value,
  starts_at,
  ends_at,
  join_closes_at
) values (
  'may-2026-15-true-pints',
  'Drink 15 beers in May',
  'Reach 15 true pints between May 1 and May 31. All logged beverages count toward your total, normalized by serving size.',
  'true_pints',
  15,
  timestamp with time zone '2026-04-30 22:00:00+00',
  timestamp with time zone '2026-05-31 22:00:00+00',
  timestamp with time zone '2026-05-31 22:00:00+00'
) on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_type = excluded.metric_type,
  target_value = excluded.target_value,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  join_closes_at = excluded.join_closes_at;

create or replace function public.join_challenge(target_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a challenge.';
  end if;

  if not exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and now() < challenges.join_closes_at
  ) then
    raise exception 'This challenge is closed for joining.';
  end if;

  insert into public.challenge_entries(challenge_id, user_id)
  values (target_challenge_id, auth.uid())
  on conflict (challenge_id, user_id) do nothing;
end;
$$;

create or replace function public.get_challenge_leaderboard(target_challenge_id uuid)
returns table (
  rank integer,
  user_id uuid,
  username text,
  avatar_url text,
  progress_value double precision,
  completed boolean
)
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select *
    from public.challenges
    where challenges.id = target_challenge_id
  ),
  joined_users as (
    select
      challenge_entries.user_id,
      challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
  ),
  beverage_progress as (
    select
      joined_users.user_id,
      sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 0)
        / 568.0
      ) as progress_value
    from joined_users
    join target_challenge on true
    left join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
    left join public.session_beers on session_beers.session_id = sessions.id
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < target_challenge.ends_at
    group by joined_users.user_id
  ),
  ranked as (
    select
      row_number() over (
        order by coalesce(beverage_progress.progress_value, 0) desc, joined_users.joined_at asc, joined_users.user_id asc
      )::integer as rank,
      joined_users.user_id,
      profiles.username,
      profiles.avatar_url,
      coalesce(beverage_progress.progress_value, 0)::double precision as progress_value,
      coalesce(beverage_progress.progress_value, 0) >= target_challenge.target_value as completed
    from joined_users
    join target_challenge on true
    left join beverage_progress on beverage_progress.user_id = joined_users.user_id
    left join public.profiles on profiles.id = joined_users.user_id
  )
  select
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.avatar_url,
    ranked.progress_value,
    ranked.completed
  from ranked
  order by progress_value desc, rank asc;
$$;

create or replace function public.get_official_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  metric_type text,
  target_value numeric,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  join_closes_at timestamp with time zone,
  joined_at timestamp with time zone,
  entrants_count integer,
  current_user_rank integer,
  current_user_progress double precision
)
language sql
stable
set search_path = public
as $$
  with challenge_rollups as (
    select
      challenges.id,
      count(challenge_entries.user_id)::integer as entrants_count
    from public.challenges
    left join public.challenge_entries on challenge_entries.challenge_id = challenges.id
    group by challenges.id
  ),
  current_user_entries as (
    select challenge_entries.challenge_id, challenge_entries.joined_at
    from public.challenge_entries
    where challenge_entries.user_id = auth.uid()
  ),
  all_current_user_ranks as (
    select
      challenges.id as challenge_id,
      leaderboard.rank,
      leaderboard.progress_value
    from public.challenges
    cross join lateral public.get_challenge_leaderboard(challenges.id) leaderboard
    where leaderboard.user_id = auth.uid()
  )
  select
    challenges.id,
    challenges.slug,
    challenges.title,
    challenges.description,
    challenges.metric_type,
    challenges.target_value,
    challenges.starts_at,
    challenges.ends_at,
    challenges.join_closes_at,
    current_user_entries.joined_at,
    coalesce(challenge_rollups.entrants_count, 0) as entrants_count,
    all_current_user_ranks.rank as current_user_rank,
    all_current_user_ranks.progress_value as current_user_progress
  from public.challenges
  left join challenge_rollups on challenge_rollups.id = challenges.id
  left join current_user_entries on current_user_entries.challenge_id = challenges.id
  left join all_current_user_ranks on all_current_user_ranks.challenge_id = challenges.id
  order by
    case
      when now() >= challenges.starts_at and now() < challenges.ends_at then 0
      when now() < challenges.starts_at then 1
      else 2
    end,
    challenges.starts_at desc;
$$;

create or replace function public.get_challenge_detail(target_challenge_slug text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select *
    from public.challenges
    where challenges.slug = target_challenge_slug
       or challenges.id::text = target_challenge_slug
    limit 1
  ),
  challenge_entry_counts as (
    select count(challenge_entries.user_id)::integer as entrants_count
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
  ),
  current_user_entry as (
    select challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
    where challenge_entries.user_id = auth.uid()
  ),
  leaderboard as (
    select *
    from target_challenge
    cross join lateral public.get_challenge_leaderboard(target_challenge.id)
  ),
  current_user_rank as (
    select leaderboard.rank, leaderboard.progress_value
    from leaderboard
    where leaderboard.user_id = auth.uid()
  )
  select jsonb_build_object(
    'id', target_challenge.id,
    'slug', target_challenge.slug,
    'title', target_challenge.title,
    'description', target_challenge.description,
    'metric_type', target_challenge.metric_type,
    'target_value', target_challenge.target_value,
    'starts_at', target_challenge.starts_at,
    'ends_at', target_challenge.ends_at,
    'join_closes_at', target_challenge.join_closes_at,
    'joined_at', (select joined_at from current_user_entry),
    'entrants_count', coalesce((select entrants_count from challenge_entry_counts), 0),
    'current_user_rank', (select rank from current_user_rank),
    'current_user_progress', (select progress_value from current_user_rank),
    'leaderboard', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rank', leaderboard.rank,
            'user_id', leaderboard.user_id,
            'username', leaderboard.username,
            'avatar_url', leaderboard.avatar_url,
            'progress_value', leaderboard.progress_value,
            'completed', leaderboard.completed
          )
          order by leaderboard.rank asc
        )
        from leaderboard
      ),
      '[]'::jsonb
    )
  )
  from target_challenge;
$$;

grant execute on function public.join_challenge(uuid) to authenticated;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;
grant execute on function public.get_challenge_detail(text) to authenticated;
