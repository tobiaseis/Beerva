-- Shows how many nights out each entrant needed next to their challenge total.
--
-- Ranking is unchanged: get_challenge_leaderboard still ranks by the
-- challenge metric (units or true pints) and keeps its signature, so every
-- existing caller keeps working. A separate RPC counts nights out and
-- get_challenge_detail merges it into each leaderboard row as "nights_out".
--
-- A night out is a drinking day (06:00-06:00 Europe/Copenhagen, the same
-- window streaks use) with at least one counted drink inside the challenge
-- window. Invalidated drinks and unpublished sessions do not count, matching
-- the leaderboard totals.

create or replace function public.get_challenge_nights_out(target_challenge_id uuid)
returns table (
  user_id uuid,
  nights_out integer
)
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select challenges.id, challenges.starts_at, challenges.ends_at
    from public.challenges
    where challenges.id = target_challenge_id
      and challenges.archived_at is null
  ),
  joined_users as (
    select challenge_entries.user_id
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
  ),
  drink_events as (
    select
      joined_users.user_id,
      coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) as drank_at
    from joined_users
    join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
    join public.session_beers on session_beers.session_id = sessions.id
    where coalesce(session_beers.excluded_from_stats, false) = false
    union all
    select
      joined_users.user_id,
      coalesce(sessions.started_at, sessions.created_at) as drank_at
    from joined_users
    join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
    where not exists (
      select 1
      from public.session_beers
      where session_beers.session_id = sessions.id
    )
  ),
  windowed_events as (
    select drink_events.user_id, drink_events.drank_at
    from drink_events
    cross join target_challenge
    where drink_events.drank_at >= target_challenge.starts_at
      and drink_events.drank_at < target_challenge.ends_at
  )
  select
    joined_users.user_id,
    count(distinct (timezone('Europe/Copenhagen', drink_events.drank_at) - interval '6 hours')::date)::integer as nights_out
  from joined_users
  left join windowed_events as drink_events
    on drink_events.user_id = joined_users.user_id
  group by joined_users.user_id;
$$;

revoke execute on function public.get_challenge_nights_out(uuid) from public, anon;
grant execute on function public.get_challenge_nights_out(uuid) to authenticated;

comment on function public.get_challenge_nights_out(uuid) is
  'Distinct 06:00-06:00 Copenhagen drinking days with a counted drink, per challenge entrant, inside the challenge window.';

create or replace function public.get_challenge_detail(target_challenge_slug text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select *
    from public.challenges
    where (
        challenges.slug = target_challenge_slug
        or challenges.id::text = target_challenge_slug
      )
      and challenges.archived_at is null
    limit 1
  ),
  current_user_entry as (
    select challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge
      on target_challenge.id = challenge_entries.challenge_id
    where challenge_entries.user_id = (select auth.uid())
  ),
  challenge_nights as materialized (
    select nights.user_id, nights.nights_out
    from target_challenge
    cross join lateral public.get_challenge_nights_out(target_challenge.id) as nights
  ),
  global_leaderboard as (
    select
      global_rows.*,
      coalesce(challenge_nights.nights_out, 0)::integer as nights_out
    from target_challenge
    cross join lateral public.get_challenge_leaderboard(target_challenge.id) as global_rows
    left join challenge_nights
      on challenge_nights.user_id = global_rows.user_id
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
      global_leaderboard.completed,
      global_leaderboard.nights_out
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
            'completed', local_leaderboard.completed,
            'nights_out', local_leaderboard.nights_out
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
            'completed', global_leaderboard.completed,
            'nights_out', global_leaderboard.nights_out
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
    'metric_type', public.beerva_effective_challenge_metric_type(
      target_challenge.challenge_type,
      target_challenge.metric_type
    ),
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


comment on function public.get_challenge_detail(text) is
  'Challenge detail with local and global leaderboards. Rows rank by the challenge metric and include nights_out.';

notify pgrst, 'reload schema';
