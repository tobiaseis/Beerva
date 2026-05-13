alter table public.pubs
  add column if not exists place_category text not null default 'pub';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pubs_place_category_check'
      and conrelid = 'public.pubs'::regclass
  ) then
    alter table public.pubs
      add constraint pubs_place_category_check
      check (place_category in ('pub', 'other'));
  end if;
end;
$$;

create index if not exists pubs_status_category_use_count_idx
  on public.pubs(status, place_category, use_count desc);

drop function if exists public.search_pubs(text, double precision, double precision, integer);

create or replace function public.search_pubs(
  search_query text default '',
  user_lat double precision default null,
  user_lon double precision default null,
  result_limit integer default 20
)
returns table (
  id uuid,
  name text,
  city text,
  address text,
  latitude double precision,
  longitude double precision,
  source text,
  source_id text,
  use_count integer,
  place_category text,
  distance_meters double precision
)
language sql
stable
set search_path = public
as $$
  with params as (
    select
      nullif(lower(btrim(coalesce(search_query, ''))), '') as q,
      user_lat as lat,
      user_lon as lon,
      least(greatest(coalesce(result_limit, 20), 1), 50) as limit_value
  ),
  ranked as (
    select
      pubs.id,
      pubs.name,
      pubs.city,
      pubs.address,
      pubs.latitude,
      pubs.longitude,
      pubs.source,
      pubs.source_id,
      pubs.use_count,
      pubs.place_category,
      case
        when params.lat is null or params.lon is null or pubs.latitude is null or pubs.longitude is null then null
        else 6371000 * acos(
          least(1, greatest(-1,
            cos(radians(params.lat))
            * cos(radians(pubs.latitude))
            * cos(radians(pubs.longitude) - radians(params.lon))
            + sin(radians(params.lat))
            * sin(radians(pubs.latitude))
          ))
        )
      end as distance_meters,
      case
        when params.q is null then 0
        when lower(pubs.name) = params.q then 120
        when lower(pubs.name) like params.q || '%' then 100
        when lower(pubs.name) like '%' || params.q || '%' then 80
        when lower(coalesce(pubs.city, '')) like params.q || '%' then 58
        when lower(coalesce(pubs.address, '')) like '%' || params.q || '%' then 44
        else similarity(lower(pubs.name), params.q) * 70
      end as text_rank
    from public.pubs, params
    where pubs.status = 'active'
      and (
        params.q is null
        or lower(pubs.name) like '%' || params.q || '%'
        or lower(coalesce(pubs.city, '')) like '%' || params.q || '%'
        or lower(coalesce(pubs.address, '')) like '%' || params.q || '%'
        or similarity(lower(pubs.name), params.q) > 0.16
      )
  )
  select
    ranked.id,
    ranked.name,
    ranked.city,
    ranked.address,
    ranked.latitude,
    ranked.longitude,
    ranked.source,
    ranked.source_id,
    ranked.use_count,
    ranked.place_category,
    ranked.distance_meters
  from ranked, params
  order by
    ranked.text_rank desc,
    case when ranked.distance_meters is null then 1 else 0 end,
    ranked.distance_meters asc nulls last,
    ranked.use_count desc,
    ranked.name asc
  limit (select limit_value from params);
$$;

grant execute on function public.search_pubs(text, double precision, double precision, integer) to authenticated;

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
      and coalesce(pubs.place_category, 'pub') = 'pub'
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
    from public.sessions
    left join public.pubs on pubs.id = sessions.pub_id,
    params
    where sessions.status = 'published'
      and coalesce(pubs.place_category, 'pub') = 'pub'
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

comment on column public.pubs.place_category is 'Classifies places as real pubs for leaderboard inclusion or other drinking locations excluded from Pub Legends.';
comment on function public.get_pub_legends(integer) is 'Returns the most visited real pubs from published sessions with each pub champion by true pints.';
comment on function public.get_pub_king_of_the_pub(text, integer) is 'Returns each user''s best published true-pint session at a real pub, ranked King of the Pub style.';
