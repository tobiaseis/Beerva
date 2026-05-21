update public.challenges
set
  challenge_type = 'leaderboard',
  target_value = null,
  starts_at = timestamp with time zone '2026-05-23 04:00:00+00',
  ends_at = timestamp with time zone '2026-05-24 04:00:00+00',
  join_closes_at = timestamp with time zone '2026-05-24 04:00:00+00'
where slug = 'karnevalsdruk-2026'
   or lower(title) = lower('KarnevalsDruk');

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
  beer_events as (
    select
      joined_users.user_id,
      public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 0)
        / 568.0 as true_pints
    from joined_users
    join target_challenge on true
    join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
    join public.session_beers on session_beers.session_id = sessions.id
    where coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < target_challenge.ends_at
  ),
  legacy_session_events as (
    select
      joined_users.user_id,
      public.beerva_serving_volume_ml(sessions.volume)
        * greatest(coalesce(sessions.quantity, 1), 0)
        / 568.0 as true_pints
    from joined_users
    join target_challenge on true
    join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
    where coalesce(sessions.started_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(sessions.started_at, sessions.created_at) < target_challenge.ends_at
      and not exists (
        select 1
        from public.session_beers
        where session_beers.session_id = sessions.id
      )
  ),
  beverage_progress as (
    select
      drink_events.user_id,
      sum(drink_events.true_pints) as progress_value
    from (
      select beer_events.user_id, beer_events.true_pints
      from beer_events
      union all
      select legacy_session_events.user_id, legacy_session_events.true_pints
      from legacy_session_events
    ) drink_events
    group by drink_events.user_id
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
      case
        when target_challenge.challenge_type = 'leaderboard' then false
        else coalesce(beverage_progress.progress_value, 0) >= target_challenge.target_value
      end as completed
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
  order by ranked.rank asc;
$$;

grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;

comment on function public.get_challenge_leaderboard(uuid) is 'Returns joined challenge users ranked by true pints inside the challenge window only.';

notify pgrst, 'reload schema';
