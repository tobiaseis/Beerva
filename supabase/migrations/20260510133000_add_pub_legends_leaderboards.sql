create index if not exists sessions_published_pub_id_idx
  on public.sessions(pub_id, published_at desc)
  where status = 'published';

create index if not exists sessions_published_pub_name_idx
  on public.sessions(lower(btrim(pub_name)), published_at desc)
  where status = 'published'
    and pub_name is not null;

create or replace function public.get_pub_legends(limit_count integer default 10)
returns table (
  pub_key text,
  pub_id uuid,
  pub_name text,
  city text,
  address text,
  session_count integer,
  unique_drinker_count integer,
  top_true_pints double precision,
  champion_user_id uuid,
  champion_username text,
  champion_avatar_url text,
  champion_session_id uuid,
  champion_at timestamp with time zone
)
language sql
stable
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(limit_count, 10), 1), 25) as limit_value
  ),
  published_sessions as (
    select
      sessions.id as session_id,
      sessions.user_id,
      sessions.pub_id,
      coalesce(pubs.name, nullif(btrim(sessions.pub_name), ''), 'Unknown pub') as pub_name,
      pubs.city,
      pubs.address,
      coalesce(sessions.pub_id::text, nullif(lower(btrim(sessions.pub_name)), '')) as pub_key,
      coalesce(sessions.started_at, sessions.created_at) as session_started_at,
      coalesce(sessions.published_at, sessions.created_at) as published_at,
      sessions.created_at,
      sessions.volume,
      sessions.quantity
    from public.sessions
    left join public.pubs on pubs.id = sessions.pub_id
    where sessions.status = 'published'
      and coalesce(sessions.pub_id::text, nullif(lower(btrim(sessions.pub_name)), '')) is not null
  ),
  beer_session_totals as (
    select
      published_sessions.session_id,
      sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 0)
        / 568.0
      ) as true_pints,
      sum(greatest(coalesce(session_beers.quantity, 1), 0))::integer as drink_count
    from published_sessions
    join public.session_beers on session_beers.session_id = published_sessions.session_id
    group by published_sessions.session_id
  ),
  session_totals as (
    select
      published_sessions.*,
      coalesce(
        beer_session_totals.true_pints,
        public.beerva_serving_volume_ml(published_sessions.volume)
          * greatest(coalesce(published_sessions.quantity, 1), 0)
          / 568.0,
        0
      ) as true_pints,
      coalesce(
        beer_session_totals.drink_count,
        greatest(coalesce(published_sessions.quantity, 1), 0)
      )::integer as drink_count
    from published_sessions
    left join beer_session_totals on beer_session_totals.session_id = published_sessions.session_id
  ),
  pub_rollups as (
    select
      session_totals.pub_key,
      (array_agg(session_totals.pub_id order by session_totals.published_at desc) filter (where session_totals.pub_id is not null))[1] as pub_id,
      (array_agg(session_totals.pub_name order by session_totals.published_at desc))[1] as pub_name,
      (array_agg(session_totals.city order by session_totals.published_at desc) filter (where session_totals.city is not null))[1] as city,
      (array_agg(session_totals.address order by session_totals.published_at desc) filter (where session_totals.address is not null))[1] as address,
      count(distinct session_totals.session_id)::integer as session_count,
      count(distinct session_totals.user_id)::integer as unique_drinker_count,
      max(session_totals.published_at) as latest_published_at
    from session_totals
    group by session_totals.pub_key
  ),
  pub_champions as (
    select *
    from (
      select
        session_totals.*,
        profiles.username,
        profiles.avatar_url,
        row_number() over (
          partition by session_totals.pub_key
          order by session_totals.true_pints desc, session_totals.published_at asc, session_totals.session_id asc
        ) as champion_rank
      from session_totals
      left join public.profiles on profiles.id = session_totals.user_id
    ) ranked_champions
    where ranked_champions.champion_rank = 1
  )
  select
    pub_rollups.pub_key,
    pub_rollups.pub_id,
    pub_rollups.pub_name,
    pub_rollups.city,
    pub_rollups.address,
    pub_rollups.session_count,
    pub_rollups.unique_drinker_count,
    coalesce(round(pub_champions.true_pints::numeric, 1)::double precision, 0) as top_true_pints,
    pub_champions.user_id as champion_user_id,
    pub_champions.username as champion_username,
    pub_champions.avatar_url as champion_avatar_url,
    pub_champions.session_id as champion_session_id,
    pub_champions.published_at as champion_at
  from pub_rollups
  left join pub_champions on pub_champions.pub_key = pub_rollups.pub_key
  order by
    pub_rollups.session_count desc,
    pub_rollups.unique_drinker_count desc,
    pub_rollups.latest_published_at desc,
    pub_rollups.pub_name asc
  limit (select limit_value from params);
$$;

create or replace function public.get_pub_king_of_the_pub(
  target_pub_key text,
  result_limit integer default 10
)
returns table (
  rank integer,
  user_id uuid,
  username text,
  avatar_url text,
  session_id uuid,
  true_pints double precision,
  drink_count integer,
  session_started_at timestamp with time zone,
  published_at timestamp with time zone
)
language sql
stable
set search_path = public
as $$
  with params as (
    select
      nullif(lower(btrim(coalesce(target_pub_key, ''))), '') as target_key,
      least(greatest(coalesce(result_limit, 10), 1), 50) as limit_value
  ),
  published_sessions as (
    select
      sessions.id as session_id,
      sessions.user_id,
      coalesce(sessions.pub_id::text, nullif(lower(btrim(sessions.pub_name)), '')) as pub_key,
      coalesce(sessions.started_at, sessions.created_at) as session_started_at,
      coalesce(sessions.published_at, sessions.created_at) as published_at,
      sessions.created_at,
      sessions.volume,
      sessions.quantity
    from public.sessions, params
    where sessions.status = 'published'
      and coalesce(sessions.pub_id::text, nullif(lower(btrim(sessions.pub_name)), '')) = params.target_key
  ),
  beer_session_totals as (
    select
      published_sessions.session_id,
      sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 0)
        / 568.0
      ) as true_pints,
      sum(greatest(coalesce(session_beers.quantity, 1), 0))::integer as drink_count
    from published_sessions
    join public.session_beers on session_beers.session_id = published_sessions.session_id
    group by published_sessions.session_id
  ),
  session_totals as (
    select
      published_sessions.*,
      coalesce(
        beer_session_totals.true_pints,
        public.beerva_serving_volume_ml(published_sessions.volume)
          * greatest(coalesce(published_sessions.quantity, 1), 0)
          / 568.0,
        0
      ) as true_pints,
      coalesce(
        beer_session_totals.drink_count,
        greatest(coalesce(published_sessions.quantity, 1), 0)
      )::integer as drink_count
    from published_sessions
    left join beer_session_totals on beer_session_totals.session_id = published_sessions.session_id
  ),
  best_session_per_user as (
    select *
    from (
      select
        session_totals.*,
        profiles.username,
        profiles.avatar_url,
        row_number() over (
          partition by session_totals.user_id
          order by session_totals.true_pints desc, session_totals.published_at asc, session_totals.session_id asc
        ) as user_pub_rank
      from session_totals
      left join public.profiles on profiles.id = session_totals.user_id
    ) ranked_user_sessions
    where ranked_user_sessions.user_pub_rank = 1
  ),
  ranked_leaders as (
    select
      row_number() over (
        order by best_session_per_user.true_pints desc, best_session_per_user.published_at asc, best_session_per_user.session_id asc
      )::integer as rank,
      best_session_per_user.user_id,
      best_session_per_user.username,
      best_session_per_user.avatar_url,
      best_session_per_user.session_id,
      round(best_session_per_user.true_pints::numeric, 1)::double precision as true_pints,
      best_session_per_user.drink_count,
      best_session_per_user.session_started_at,
      best_session_per_user.published_at
    from best_session_per_user
  )
  select
    ranked_leaders.rank,
    ranked_leaders.user_id,
    ranked_leaders.username,
    ranked_leaders.avatar_url,
    ranked_leaders.session_id,
    ranked_leaders.true_pints,
    ranked_leaders.drink_count,
    ranked_leaders.session_started_at,
    ranked_leaders.published_at
  from ranked_leaders, params
  order by ranked_leaders.rank asc
  limit (select limit_value from params);
$$;

grant execute on function public.get_pub_legends(integer) to authenticated;
grant execute on function public.get_pub_king_of_the_pub(text, integer) to authenticated;

comment on function public.get_pub_legends(integer) is 'Returns the most visited pubs from published sessions with each pub champion by true pints.';
comment on function public.get_pub_king_of_the_pub(text, integer) is 'Returns each user''s best published true-pint session at a pub, ranked King of the Pub style.';
