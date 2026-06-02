create or replace function public.get_local_challenge_leaderboard(target_challenge_id uuid)
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
  with local_entries as (
    select global_leaderboard.*
    from public.get_challenge_leaderboard(target_challenge_id) as global_leaderboard
    where global_leaderboard.user_id = (select auth.uid())
       or public.is_mutual_follower((select auth.uid()), global_leaderboard.user_id)
  )
  select
    row_number() over (
      order by local_entries.rank asc
    )::integer as rank,
    local_entries.user_id,
    local_entries.username,
    local_entries.avatar_url,
    local_entries.progress_value,
    local_entries.completed
  from local_entries
  order by local_entries.rank asc;
$$;

create or replace function public.get_official_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  metric_type text,
  challenge_type text,
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
  with viewer as (
    select (select auth.uid()) as user_id
  ),
  local_users as (
    select viewer.user_id
    from viewer
    where viewer.user_id is not null
    union
    select outgoing_follow.following_id
    from viewer
    join public.follows as outgoing_follow
      on outgoing_follow.follower_id = viewer.user_id
    join public.follows as incoming_follow
      on incoming_follow.follower_id = outgoing_follow.following_id
     and incoming_follow.following_id = viewer.user_id
  ),
  local_entries as (
    select
      challenge_entries.challenge_id,
      challenge_entries.user_id,
      challenge_entries.joined_at
    from local_users
    join public.challenge_entries as challenge_entries
      on challenge_entries.user_id = local_users.user_id
  ),
  beer_events as (
    select
      local_entries.challenge_id,
      local_entries.user_id,
      public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 0)
        / 568.0 as true_pints
    from local_entries
    join public.challenges as challenges
      on challenges.id = local_entries.challenge_id
    join public.sessions as sessions
      on sessions.user_id = local_entries.user_id
     and sessions.status = 'published'
    join public.session_beers as session_beers
      on session_beers.session_id = sessions.id
    where coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenges.starts_at
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenges.ends_at
  ),
  legacy_session_events as (
    select
      local_entries.challenge_id,
      local_entries.user_id,
      public.beerva_serving_volume_ml(sessions.volume)
        * greatest(coalesce(sessions.quantity, 1), 0)
        / 568.0 as true_pints
    from local_entries
    join public.challenges as challenges
      on challenges.id = local_entries.challenge_id
    join public.sessions as sessions
      on sessions.user_id = local_entries.user_id
     and sessions.status = 'published'
    where coalesce(sessions.started_at, sessions.created_at) >= challenges.starts_at
      and coalesce(sessions.started_at, sessions.created_at) < challenges.ends_at
      and not exists (
        select 1
        from public.session_beers
        where session_beers.session_id = sessions.id
      )
  ),
  beverage_progress as (
    select
      drink_events.challenge_id,
      drink_events.user_id,
      sum(drink_events.true_pints) as progress_value
    from (
      select beer_events.challenge_id, beer_events.user_id, beer_events.true_pints
      from beer_events
      union all
      select legacy_session_events.challenge_id, legacy_session_events.user_id, legacy_session_events.true_pints
      from legacy_session_events
    ) as drink_events
    group by drink_events.challenge_id, drink_events.user_id
  ),
  ranked_local_entries as (
    select
      local_entries.challenge_id,
      row_number() over (
        partition by local_entries.challenge_id
        order by coalesce(beverage_progress.progress_value, 0) desc, local_entries.joined_at asc, local_entries.user_id asc
      )::integer as rank,
      local_entries.user_id,
      coalesce(beverage_progress.progress_value, 0)::double precision as progress_value
    from local_entries
    left join beverage_progress
      on beverage_progress.challenge_id = local_entries.challenge_id
     and beverage_progress.user_id = local_entries.user_id
  ),
  local_challenge_rollups as (
    select
      challenges.id,
      count(ranked_local_entries.user_id)::integer as entrants_count
    from public.challenges
    left join ranked_local_entries
      on ranked_local_entries.challenge_id = challenges.id
    group by challenges.id
  ),
  current_user_entries as (
    select
      local_entries.challenge_id,
      local_entries.joined_at
    from local_entries
    where local_entries.user_id = (select viewer.user_id from viewer)
  ),
  local_current_user_ranks as (
    select
      ranked_local_entries.challenge_id,
      ranked_local_entries.rank,
      ranked_local_entries.progress_value
    from ranked_local_entries
    where ranked_local_entries.user_id = (select viewer.user_id from viewer)
  )
  select
    challenges.id,
    challenges.slug,
    challenges.title,
    challenges.description,
    challenges.metric_type,
    challenges.challenge_type,
    challenges.target_value,
    challenges.starts_at,
    challenges.ends_at,
    challenges.join_closes_at,
    current_user_entries.joined_at,
    coalesce(local_challenge_rollups.entrants_count, 0) as entrants_count,
    local_current_user_ranks.rank as current_user_rank,
    local_current_user_ranks.progress_value as current_user_progress
  from public.challenges
  left join local_challenge_rollups
    on local_challenge_rollups.id = challenges.id
  left join current_user_entries
    on current_user_entries.challenge_id = challenges.id
  left join local_current_user_ranks
    on local_current_user_ranks.challenge_id = challenges.id
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
  current_user_entry as (
    select challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge
      on target_challenge.id = challenge_entries.challenge_id
    where challenge_entries.user_id = (select auth.uid())
  ),
  global_leaderboard as (
    select global_rows.*
    from target_challenge
    cross join lateral public.get_challenge_leaderboard(target_challenge.id) as global_rows
  ),
  local_leaderboard as (
    select
      row_number() over (
        order by global_leaderboard.rank asc
      )::integer as rank,
      global_leaderboard.user_id,
      global_leaderboard.username,
      global_leaderboard.avatar_url,
      global_leaderboard.progress_value,
      global_leaderboard.completed
    from global_leaderboard
    where global_leaderboard.user_id = (select auth.uid())
       or public.is_mutual_follower((select auth.uid()), global_leaderboard.user_id)
  ),
  local_scope as (
    select
      count(*)::integer as entrants_count,
      max(local_leaderboard.rank)
        filter (where local_leaderboard.user_id = (select auth.uid())) as current_user_rank,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', local_leaderboard.rank,
            'user_id', local_leaderboard.user_id,
            'username', local_leaderboard.username,
            'avatar_url', local_leaderboard.avatar_url,
            'progress_value', local_leaderboard.progress_value,
            'completed', local_leaderboard.completed
          )
          order by local_leaderboard.rank asc
        ) filter (where local_leaderboard.user_id is not null),
        '[]'::jsonb
      ) as leaderboard
    from local_leaderboard
  ),
  global_scope as (
    select
      count(*)::integer as entrants_count,
      max(global_leaderboard.rank)
        filter (where global_leaderboard.user_id = (select auth.uid())) as current_user_rank,
      max(global_leaderboard.progress_value)
        filter (where global_leaderboard.user_id = (select auth.uid())) as current_user_progress,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', global_leaderboard.rank,
            'user_id', global_leaderboard.user_id,
            'username', global_leaderboard.username,
            'avatar_url', global_leaderboard.avatar_url,
            'progress_value', global_leaderboard.progress_value,
            'completed', global_leaderboard.completed
          )
          order by global_leaderboard.rank asc
        ) filter (where global_leaderboard.user_id is not null),
        '[]'::jsonb
      ) as leaderboard
    from global_leaderboard
  )
  select jsonb_build_object(
    'id', target_challenge.id,
    'slug', target_challenge.slug,
    'title', target_challenge.title,
    'description', target_challenge.description,
    'metric_type', target_challenge.metric_type,
    'challenge_type', target_challenge.challenge_type,
    'target_value', target_challenge.target_value,
    'starts_at', target_challenge.starts_at,
    'ends_at', target_challenge.ends_at,
    'join_closes_at', target_challenge.join_closes_at,
    'joined_at', (select joined_at from current_user_entry),
    'entrants_count', local_scope.entrants_count,
    'current_user_rank', local_scope.current_user_rank,
    'current_user_progress', global_scope.current_user_progress,
    'leaderboard', local_scope.leaderboard,
    'leaderboards', jsonb_build_object(
      'local', jsonb_build_object(
        'entrants_count', local_scope.entrants_count,
        'current_user_rank', local_scope.current_user_rank,
        'leaderboard', local_scope.leaderboard
      ),
      'global', jsonb_build_object(
        'entrants_count', global_scope.entrants_count,
        'current_user_rank', global_scope.current_user_rank,
        'leaderboard', global_scope.leaderboard
      )
    )
  )
  from target_challenge
  cross join local_scope
  cross join global_scope;
$$;

revoke execute on function public.get_local_challenge_leaderboard(uuid) from public, anon;
revoke execute on function public.get_official_challenges() from public, anon;
revoke execute on function public.get_challenge_detail(text) from public, anon;
grant execute on function public.get_local_challenge_leaderboard(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;
grant execute on function public.get_challenge_detail(text) to authenticated;

comment on function public.get_local_challenge_leaderboard(uuid)
  is 'Returns joined challenge users limited to the signed-in user and mutual followers, reranked inside that local comparison group.';

notify pgrst, 'reload schema';
