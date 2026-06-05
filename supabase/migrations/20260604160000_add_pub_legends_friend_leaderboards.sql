create or replace function public.get_friend_pub_watch_leaderboards(result_limit integer default 25)
returns table (
  leaderboard_type text,
  rank integer,
  user_id uuid,
  username text,
  avatar_url text,
  current_streak integer,
  latest_drink_at timestamp with time zone,
  hours_since_last_drink integer
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(result_limit, 25), 1), 50) as limit_value
  ),
  followed_users as (
    select
      follows.following_id as user_id,
      profiles.username,
      profiles.avatar_url
    from public.follows
    left join public.profiles on profiles.id = follows.following_id
    where follows.follower_id = (select auth.uid())
  ),
  leaderboard_users as (
    select
      followed_users.user_id,
      followed_users.username,
      followed_users.avatar_url
    from followed_users

    union

    select
      (select auth.uid()) as user_id,
      profiles.username,
      profiles.avatar_url
    from (select (select auth.uid()) as user_id) viewer
    left join public.profiles on profiles.id = viewer.user_id
    where viewer.user_id is not null
  ),
  latest_drinks as (
    select
      sessions.user_id,
      max(coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) as latest_drink_at
    from public.sessions
    left join public.session_beers on session_beers.session_id = sessions.id
    where sessions.status = 'published'
      and sessions.user_id in (select leaderboard_users.user_id from leaderboard_users)
    group by sessions.user_id
  ),
  current_streaks as (
    select *
    from public.get_current_streaks(
      (select coalesce(array_agg(leaderboard_users.user_id), array[]::uuid[]) from leaderboard_users)
    )
  ),
  streak_rows as (
    select
      leaderboard_users.user_id,
      leaderboard_users.username,
      leaderboard_users.avatar_url,
      coalesce(current_streaks.current_streak, 0) as current_streak,
      latest_drinks.latest_drink_at
    from leaderboard_users
    left join current_streaks on current_streaks.user_id = leaderboard_users.user_id
    left join latest_drinks on latest_drinks.user_id = leaderboard_users.user_id
  ),
  active_streak_ranked as (
    select
      'active_streak'::text as leaderboard_type,
      row_number() over (
        order by
          streak_rows.current_streak desc,
          streak_rows.latest_drink_at desc nulls last,
          lower(coalesce(streak_rows.username, '')) asc,
          streak_rows.user_id asc
      )::integer as rank,
      streak_rows.user_id,
      streak_rows.username,
      streak_rows.avatar_url,
      streak_rows.current_streak,
      streak_rows.latest_drink_at,
      null::integer as hours_since_last_drink
    from streak_rows
    where streak_rows.current_streak > 0
  ),
  overdue_rows as (
    select
      leaderboard_users.user_id,
      leaderboard_users.username,
      leaderboard_users.avatar_url,
      coalesce(current_streaks.current_streak, 0) as current_streak,
      latest_drinks.latest_drink_at,
      greatest(round(extract(epoch from (now() - latest_drink_at)) / 3600.0)::integer, 0) as hours_since_last_drink
    from leaderboard_users
    join latest_drinks on latest_drinks.user_id = leaderboard_users.user_id
    left join current_streaks on current_streaks.user_id = leaderboard_users.user_id
  ),
  most_overdue_ranked as (
    select
      'most_overdue'::text as leaderboard_type,
      row_number() over (
        order by
          overdue_rows.hours_since_last_drink desc,
          overdue_rows.latest_drink_at asc,
          lower(coalesce(overdue_rows.username, '')) asc,
          overdue_rows.user_id asc
      )::integer as rank,
      overdue_rows.user_id,
      overdue_rows.username,
      overdue_rows.avatar_url,
      overdue_rows.current_streak,
      overdue_rows.latest_drink_at,
      overdue_rows.hours_since_last_drink
    from overdue_rows
  )
  select
    active_streak_ranked.leaderboard_type,
    active_streak_ranked.rank,
    active_streak_ranked.user_id,
    active_streak_ranked.username,
    active_streak_ranked.avatar_url,
    active_streak_ranked.current_streak,
    active_streak_ranked.latest_drink_at,
    active_streak_ranked.hours_since_last_drink
  from active_streak_ranked, params
  where active_streak_ranked.rank <= params.limit_value

  union all

  select
    most_overdue_ranked.leaderboard_type,
    most_overdue_ranked.rank,
    most_overdue_ranked.user_id,
    most_overdue_ranked.username,
    most_overdue_ranked.avatar_url,
    most_overdue_ranked.current_streak,
    most_overdue_ranked.latest_drink_at,
    most_overdue_ranked.hours_since_last_drink
  from most_overdue_ranked, params
  where most_overdue_ranked.rank <= params.limit_value

  order by leaderboard_type asc, rank asc;
$$;

revoke execute on function public.get_friend_pub_watch_leaderboards(integer) from public, anon;
grant execute on function public.get_friend_pub_watch_leaderboards(integer) to authenticated;

comment on function public.get_friend_pub_watch_leaderboards(integer) is
  'Returns viewer-plus-followed active streak and most-overdue friend leaderboards for the current Pub Legends viewer.';

notify pgrst, 'reload schema';
