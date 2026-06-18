alter table public.session_beers
  add column if not exists excluded_from_stats boolean not null default false,
  add column if not exists excluded_from_stats_at timestamp with time zone,
  add column if not exists excluded_from_stats_by uuid references auth.users(id) on delete set null,
  add column if not exists excluded_from_stats_reason text;

create index if not exists session_beers_excluded_from_stats_idx
  on public.session_beers (session_id, excluded_from_stats)
  where excluded_from_stats = true;

comment on column public.session_beers.excluded_from_stats
  is 'Admin moderation flag. When true, the drink remains visible but is ignored by stats, trophies, and challenge progress.';
comment on column public.session_beers.excluded_from_stats_at
  is 'Timestamp for when an admin marked this drink ignored in stats.';
comment on column public.session_beers.excluded_from_stats_by
  is 'Admin user who last marked this drink ignored in stats.';
comment on column public.session_beers.excluded_from_stats_reason
  is 'Optional private admin note for why the drink is ignored in stats.';

create or replace function public.admin_get_moderation_drinks(
  search_query text default null,
  target_user_id uuid default null,
  result_limit integer default 100
)
returns table (
  session_beer_id uuid,
  session_id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  beer_name text,
  volume text,
  quantity integer,
  abv double precision,
  beverage_category text,
  pub_name text,
  consumed_at timestamp with time zone,
  session_started_at timestamp with time zone,
  session_created_at timestamp with time zone,
  excluded_from_stats boolean,
  excluded_from_stats_at timestamp with time zone,
  excluded_from_stats_by uuid,
  excluded_from_stats_reason text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean_search text := nullif(btrim(coalesce(search_query, '')), '');
  clean_limit integer := least(greatest(coalesce(result_limit, 100), 1), 250);
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  return query
  select
    session_beers.id as session_beer_id,
    session_beers.session_id,
    sessions.user_id,
    profiles.username,
    profiles.avatar_url,
    session_beers.beer_name,
    session_beers.volume,
    session_beers.quantity,
    session_beers.abv,
    coalesce(nullif(session_beers.beverage_category, ''), 'beer') as beverage_category,
    sessions.pub_name,
    session_beers.consumed_at,
    sessions.started_at as session_started_at,
    sessions.created_at as session_created_at,
    coalesce(session_beers.excluded_from_stats, false) as excluded_from_stats,
    session_beers.excluded_from_stats_at,
    session_beers.excluded_from_stats_by,
    session_beers.excluded_from_stats_reason
  from public.session_beers as session_beers
  join public.sessions as sessions
    on sessions.id = session_beers.session_id
  left join public.profiles as profiles
    on profiles.id = sessions.user_id
  where (target_user_id is null or sessions.user_id = target_user_id)
    and (
      clean_search is null
      or profiles.username ilike '%' || clean_search || '%'
      or session_beers.beer_name ilike '%' || clean_search || '%'
      or sessions.pub_name ilike '%' || clean_search || '%'
    )
  order by
    coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) desc nulls last,
    session_beers.created_at desc nulls last
  limit clean_limit;
end;
$$;

create or replace function public.admin_set_session_beer_excluded(
  target_session_beer_id uuid,
  should_exclude boolean,
  exclusion_reason text default null
)
returns public.session_beers
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  saved_row public.session_beers;
  clean_reason text := nullif(btrim(coalesce(exclusion_reason, '')), '');
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  update public.session_beers
  set
    excluded_from_stats = coalesce(should_exclude, false),
    excluded_from_stats_at = case when coalesce(should_exclude, false) then now() else null end,
    excluded_from_stats_by = case when coalesce(should_exclude, false) then (select auth.uid()) else null end,
    excluded_from_stats_reason = case when coalesce(should_exclude, false) then clean_reason else null end
  where session_beers.id = target_session_beer_id
  returning * into saved_row;

  if saved_row.id is null then
    raise exception 'Drink not found.';
  end if;

  return saved_row;
end;
$$;

create or replace function public.get_profile_stats(target_user_id uuid)
returns table (
  total_pints double precision,
  unique_pubs integer,
  avg_abv double precision,
  max_session_pints double precision,
  strongest_abv double precision,
  has_late_night_session boolean,
  max_sessions_in_one_day integer,
  max_pubs_in_one_day integer,
  max_sessions_at_same_pub integer,
  longest_day_streak integer,
  max_two_pint_week_streak integer,
  unique_beers integer,
  max_beers_in_one_day integer,
  has_early_bird_session boolean,
  months_logged integer,
  rtd_count integer,
  unique_rtds integer,
  max_rtds_in_one_day integer,
  jagerbomb_count integer,
  max_jagerbombs_in_one_day integer,
  sambuca_count integer,
  max_sambucas_in_one_day integer,
  current_streak integer
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      sessions.id as session_id,
      coalesce(sessions.pub_id::text, nullif(lower(btrim(sessions.pub_name)), '')) as pub_key,
      nullif(regexp_replace(lower(btrim(session_beers.beer_name)), '[[:space:]]+', ' ', 'g'), '') as beer_key,
      nullif(
        btrim(
          regexp_replace(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(lower(btrim(session_beers.beer_name)), U&'\00E6', 'ae'),
                        U&'\00F8',
                        'o'
                      ),
                      U&'\00E5',
                      'a'
                    ),
                    U&'\00E4',
                    'a'
                  ),
                  U&'\00F6',
                  'o'
                ),
                U&'\00EF',
                'i'
              ),
              U&'\00E9',
              'e'
            ),
            '[^a-z0-9]+',
            ' ',
            'g'
          )
        ),
        ''
      ) as beverage_stat_key,
      coalesce(session_beers.quantity, 1)::double precision as quantity_value,
      coalesce(session_beers.abv, 0)::double precision as abv_value,
      coalesce(nullif(session_beers.beverage_category, ''), 'beer') as captured_beverage_category,
      session_beers.beverage_category = 'wine' as is_captured_wine,
      session_beers.beverage_category = 'drink' as is_captured_drink,
      public.beerva_serving_volume_ml(session_beers.volume) as volume_ml,
      timezone('Europe/Copenhagen', coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) as beer_local_at,
      timezone('Europe/Copenhagen', coalesce(sessions.started_at, sessions.created_at)) as session_local_at,
      (timezone('Europe/Copenhagen', coalesce(sessions.started_at, sessions.created_at)) - interval '6 hours')::date as session_drinking_day
    from public.sessions
    join public.session_beers on session_beers.session_id = sessions.id
    where sessions.user_id = target_user_id
      and sessions.status = 'published'
      and coalesce(session_beers.excluded_from_stats, false) = false
  ),
  beer_rows as (
    select
      *,
      beverage_stat_key in (
        'breezer lime',
        'breezer mango',
        'breezer orange',
        'breezer pineapple',
        'breezer watermelon',
        'breezer passion fruit',
        'breezer strawberry',
        'breezer blueberry',
        'smirnoff ice original',
        'smirnoff ice raspberry',
        'smirnoff ice tropical',
        'smirnoff ice green apple',
        'shaker original',
        'shaker orange',
        'shaker passion',
        'shaker sport',
        'shaker sport plus',
        'shaker sport pink',
        'cult mokai',
        'mokai hyldeblomst',
        'mokai pop pink',
        'mokai pink apple',
        'mokai peach',
        'mokai blueberry',
        'somersby apple cider',
        'somersby blackberry',
        'somersby elderflower lime',
        'somersby sparkling rose',
        'somersby mango lime',
        'tempt cider no 7',
        'tempt cider no 9',
        'rekorderlig strawberry lime',
        'rekorderlig wild berries',
        'garage hard lemon',
        'garage hard lemonade',
        'gordon s gin tonic',
        'gordon s pink gin tonic',
        'captain morgan cola',
        'jack daniel s cola',
        'bacardi mojito rtd',
        'absolut vodka soda raspberry'
      ) as is_rtd,
      beverage_stat_key in (
        'jagerbomb',
        'jager bomb',
        'jaegerbomb',
        'jaeger bomb'
      ) as is_jagerbomb,
      beverage_stat_key in (
        'sambuca shot',
        'sambuca',
        'sambuca shots',
        'black sambuca',
        'sambucca',
        'sambucca shot'
      ) as is_sambuca,
      beverage_stat_key in (
        'white wine',
        'red wine'
      ) as is_wine,
      beverage_stat_key in (
        'gin hass',
        'gin tonic',
        'gin and tonic',
        'g t',
        'cosmopolitan',
        'cosmo',
        'mojito',
        'margarita',
        'daiquiri',
        'old fashioned',
        'whiskey sour',
        'whisky sour',
        'espresso martini',
        'negroni',
        'pina colada',
        'long island iced tea',
        'long island ice tea',
        'sex on the beach',
        'moscow mule',
        'caipirinha',
        'caipirina',
        'aperol spritz',
        'spritz',
        'dry martini',
        'martini',
        'gin martini',
        'manhattan',
        'cuba libre',
        'rum and coke',
        'rum coke',
        'tequila sunrise',
        'vodkaredbull',
        'vodka red bull',
        'vodka redbull',
        'vodka orange juice',
        'vodka orange',
        'coffee bailey',
        'coffee baileys',
        'coffee bailey s'
      ) as is_special_mixed,
      volume_ml * quantity_value as beer_ml,
      (volume_ml * quantity_value) / 568.0 as beer_pints
    from base
  ),
  session_rows as (
    select distinct
      session_id,
      pub_key,
      session_local_at,
      session_drinking_day
    from beer_rows
  ),
  sessions_per_day as (
    select session_drinking_day, count(session_id)::integer as session_count
    from session_rows
    where session_drinking_day is not null
    group by session_drinking_day
  ),
  pubs_per_day as (
    select session_drinking_day, count(distinct pub_key)::integer as pub_count
    from session_rows
    where session_drinking_day is not null and pub_key is not null
    group by session_drinking_day
  ),
  beers_per_day as (
    select session_drinking_day, count(distinct beer_key)::integer as beer_count
    from beer_rows
    where session_drinking_day is not null and beer_key is not null
    group by session_drinking_day
  ),
  rtds_per_day as (
    select session_drinking_day, sum(quantity_value)::integer as rtd_count
    from beer_rows
    where session_drinking_day is not null and is_rtd
    group by session_drinking_day
  ),
  jagerbombs_per_day as (
    select session_drinking_day, sum(quantity_value)::integer as jagerbomb_count
    from beer_rows
    where session_drinking_day is not null and is_jagerbomb
    group by session_drinking_day
  ),
  sambucas_per_day as (
    select session_drinking_day, sum(quantity_value)::integer as sambuca_count
    from beer_rows
    where session_drinking_day is not null and is_sambuca
    group by session_drinking_day
  ),
  sessions_per_pub as (
    select pub_key, count(session_id)::integer as session_count
    from session_rows
    where pub_key is not null
    group by pub_key
  ),
  pints_per_session as (
    select session_id, sum(beer_pints) as session_pints
    from beer_rows
    group by session_id
  ),
  weekly_pints as (
    select date_trunc('week', beer_local_at)::date as week_start, sum(beer_pints) as week_pints
    from beer_rows
    where beer_local_at is not null
    group by date_trunc('week', beer_local_at)::date
  ),
  qualifying_two_pint_weeks as (
    select week_start
    from weekly_pints
    where week_pints >= 2
  ),
  two_pint_week_streak_days as (
    select
      week_start,
      week_start - (row_number() over (order by week_start)::integer * 7) as streak_group
    from qualifying_two_pint_weeks
  ),
  two_pint_week_streaks as (
    select count(*)::integer as streak_length
    from two_pint_week_streak_days
    group by streak_group
  ),
  streak_days as (
    select
      session_drinking_day,
      session_drinking_day - row_number() over (order by session_drinking_day)::integer as streak_group
    from (
      select distinct session_drinking_day
      from session_rows
      where session_drinking_day is not null
    ) days
  ),
  streaks as (
    select count(*)::integer as streak_length
    from streak_days
    group by streak_group
  ),
  months_per_year as (
    select
      extract(year from session_local_at)::integer as logged_year,
      count(distinct extract(month from session_local_at))::integer as month_count
    from session_rows
    where session_local_at is not null
    group by extract(year from session_local_at)
  )
  select
    coalesce(round((sum(beer_ml) / 568.0)::numeric, 1)::double precision, 0) as total_pints,
    (count(distinct pub_key) filter (where pub_key is not null))::integer as unique_pubs,
    coalesce(round((sum(beer_ml * abv_value) / nullif(sum(beer_ml), 0))::numeric, 1)::double precision, 0) as avg_abv,
    coalesce(round((select max(session_pints) from pints_per_session)::numeric, 1)::double precision, 0) as max_session_pints,
    coalesce(round(max(abv_value) filter (
      where not is_rtd
        and not is_jagerbomb
        and not is_sambuca
        and not is_wine
        and not is_special_mixed
        and not is_captured_wine
        and not is_captured_drink
    )::numeric, 1)::double precision, 0) as strongest_abv,
    coalesce(bool_or(extract(hour from session_local_at) >= 3 and extract(hour from session_local_at) < 6), false) as has_late_night_session,
    coalesce((select max(session_count) from sessions_per_day), 0) as max_sessions_in_one_day,
    coalesce((select max(pub_count) from pubs_per_day), 0) as max_pubs_in_one_day,
    coalesce((select max(session_count) from sessions_per_pub), 0) as max_sessions_at_same_pub,
    coalesce((select max(streak_length) from streaks), 0) as longest_day_streak,
    coalesce((select max(streak_length) from two_pint_week_streaks), 0) as max_two_pint_week_streak,
    (count(distinct beer_key) filter (where beer_key is not null))::integer as unique_beers,
    coalesce((select max(beer_count) from beers_per_day), 0) as max_beers_in_one_day,
    coalesce(bool_or(extract(hour from session_local_at) >= 6 and extract(hour from session_local_at) < 10), false) as has_early_bird_session,
    coalesce((select max(month_count) from months_per_year), 0) as months_logged,
    coalesce(sum(quantity_value) filter (where is_rtd), 0)::integer as rtd_count,
    (count(distinct beverage_stat_key) filter (where is_rtd and beverage_stat_key is not null))::integer as unique_rtds,
    coalesce((select max(rtd_count) from rtds_per_day), 0) as max_rtds_in_one_day,
    coalesce(sum(quantity_value) filter (where is_jagerbomb), 0)::integer as jagerbomb_count,
    coalesce((select max(jagerbomb_count) from jagerbombs_per_day), 0) as max_jagerbombs_in_one_day,
    coalesce(sum(quantity_value) filter (where is_sambuca), 0)::integer as sambuca_count,
    coalesce((select max(sambuca_count) from sambucas_per_day), 0) as max_sambucas_in_one_day,
    coalesce((select cs.current_streak from public.get_current_streaks(array[target_user_id]) cs limit 1), 0) as current_streak
  from beer_rows;
$$;

create or replace function public.get_session_feed_details(session_ids uuid[])
returns table (
  session_id uuid,
  author_username text,
  author_avatar_url text,
  cheers_count integer,
  cheers jsonb,
  beers jsonb,
  comments jsonb,
  photos jsonb,
  units double precision,
  author_current_streak integer
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_sessions as (
    select s.id, s.user_id
    from public.sessions s
    where s.id = any(coalesce(session_ids, array[]::uuid[]))
      and s.status = 'published'
      and (
        s.user_id = (select auth.uid())
        or exists (
          select 1
          from public.follows
          where follows.follower_id = (select auth.uid())
            and follows.following_id = s.user_id
        )
      )
  ),
  author_streaks as (
    select cs.user_id, cs.current_streak
    from public.get_current_streaks(
      (select array_agg(distinct vs.user_id) from visible_sessions vs)
    ) cs
  )
  select
    vs.id as session_id,
    author.username as author_username,
    author.avatar_url as author_avatar_url,
    coalesce(cheer_agg.cheers_count, 0) as cheers_count,
    coalesce(cheer_agg.cheers, '[]'::jsonb) as cheers,
    coalesce(beer_agg.beers, '[]'::jsonb) as beers,
    coalesce(comment_agg.comments, '[]'::jsonb) as comments,
    coalesce(photo_agg.photos, '[]'::jsonb) as photos,
    coalesce(beer_agg.units, 0) as units,
    coalesce(author_streaks.current_streak, 0) as author_current_streak
  from visible_sessions vs
  left join public.profiles author
    on author.id = vs.user_id
  left join author_streaks on author_streaks.user_id = vs.user_id
  left join lateral (
    select
      count(*)::int as cheers_count,
      jsonb_agg(
        jsonb_build_object(
          'user_id', ch.user_id,
          'username', pr.username,
          'avatar_url', pr.avatar_url,
          'created_at', ch.created_at
        )
        order by ch.created_at asc nulls last
      ) as cheers
    from public.session_cheers ch
    left join public.profiles pr on pr.id = ch.user_id
    where ch.session_id = vs.id
  ) cheer_agg on true
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', sb.id,
          'session_id', sb.session_id,
          'beer_name', sb.beer_name,
          'volume', sb.volume,
          'quantity', sb.quantity,
          'abv', sb.abv,
          'beverage_category', sb.beverage_category,
          'note', sb.note,
          'consumed_at', sb.consumed_at,
          'created_at', sb.created_at,
          'excluded_from_stats', sb.excluded_from_stats,
          'excluded_from_stats_at', sb.excluded_from_stats_at,
          'excluded_from_stats_reason', sb.excluded_from_stats_reason
        )
        order by sb.consumed_at asc nulls last
      ) as beers,
      coalesce(round((sum(
        public.beerva_serving_volume_ml(sb.volume)
        * greatest(coalesce(sb.quantity, 1)::double precision, 0)
        * (greatest(coalesce(sb.abv, 0)::double precision, 0) / 100.0)
        * 0.789
        / 12.0
      ) filter (where coalesce(sb.excluded_from_stats, false) = false))::numeric, 1)::double precision, 0) as units
    from public.session_beers sb
    where sb.session_id = vs.id
  ) beer_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', co.id,
        'session_id', co.session_id,
        'user_id', co.user_id,
        'body', co.body,
        'created_at', co.created_at,
        'updated_at', co.updated_at,
        'username', pr.username,
        'avatar_url', pr.avatar_url
      )
      order by co.created_at asc nulls last
    ) as comments
    from public.session_comments co
    left join public.profiles pr on pr.id = co.user_id
    where co.session_id = vs.id
  ) comment_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', ph.id,
        'session_id', ph.session_id,
        'image_url', ph.image_url,
        'is_keeper', ph.is_keeper,
        'expires_at', ph.expires_at,
        'created_at', ph.created_at
      )
      order by ph.is_keeper desc, ph.created_at asc nulls last
    ) as photos
    from public.session_photos ph
    where ph.session_id = vs.id
  ) photo_agg on true;
$$;

create or replace function public.get_live_session_true_pints(target_session_id uuid)
returns double precision
language sql
stable
set search_path = public
as $$
  select coalesce(
    round((
      coalesce(sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 1)
        / 568.0
      ) filter (where coalesce(session_beers.excluded_from_stats, false) = false), 0)
    )::numeric, 1)::double precision,
    0::double precision
  )
  from public.session_beers
  where session_beers.session_id = target_session_id;
$$;

create or replace function public.get_live_pub_crawl_true_pints(target_pub_crawl_id uuid)
returns double precision
language sql
stable
set search_path = public
as $$
  select coalesce(
    round((
      coalesce(sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 1)
        / 568.0
      ) filter (where coalesce(session_beers.excluded_from_stats, false) = false), 0)
    )::numeric, 1)::double precision,
    0::double precision
  )
  from public.sessions
  join public.session_beers
    on session_beers.session_id = sessions.id
  where sessions.pub_crawl_id = target_pub_crawl_id
    and sessions.is_crawl_stop = true
    and sessions.status in ('active', 'published');
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
      and challenges.archived_at is null
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
      public.beerva_challenge_progress_value(
        public.beerva_effective_challenge_metric_type(
          target_challenge.challenge_type,
          target_challenge.metric_type
        ),
        session_beers.volume,
        session_beers.quantity::numeric,
        session_beers.abv::numeric
      ) as progress_value
    from joined_users
    join target_challenge on true
    join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
    join public.session_beers on session_beers.session_id = sessions.id
    where coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < target_challenge.ends_at
      and coalesce(session_beers.excluded_from_stats, false) = false
  ),
  legacy_session_events as (
    select
      joined_users.user_id,
      public.beerva_challenge_progress_value(
        public.beerva_effective_challenge_metric_type(
          target_challenge.challenge_type,
          target_challenge.metric_type
        ),
        sessions.volume,
        sessions.quantity::numeric,
        sessions.abv::numeric
      ) as progress_value
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
      sum(drink_events.progress_value) as progress_value
    from (
      select beer_events.user_id, beer_events.progress_value
      from beer_events
      union all
      select legacy_session_events.user_id, legacy_session_events.progress_value
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
      public.beerva_challenge_progress_value(
        public.beerva_effective_challenge_metric_type(
          challenges.challenge_type,
          challenges.metric_type
        ),
        session_beers.volume,
        session_beers.quantity::numeric,
        session_beers.abv::numeric
      ) as progress_value
    from local_entries
    join public.challenges as challenges
      on challenges.id = local_entries.challenge_id
     and challenges.archived_at is null
    join public.sessions as sessions
      on sessions.user_id = local_entries.user_id
     and sessions.status = 'published'
    join public.session_beers as session_beers
      on session_beers.session_id = sessions.id
    where coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenges.starts_at
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenges.ends_at
      and coalesce(session_beers.excluded_from_stats, false) = false
  ),
  legacy_session_events as (
    select
      local_entries.challenge_id,
      local_entries.user_id,
      public.beerva_challenge_progress_value(
        public.beerva_effective_challenge_metric_type(
          challenges.challenge_type,
          challenges.metric_type
        ),
        sessions.volume,
        sessions.quantity::numeric,
        sessions.abv::numeric
      ) as progress_value
    from local_entries
    join public.challenges as challenges
      on challenges.id = local_entries.challenge_id
     and challenges.archived_at is null
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
      sum(drink_events.progress_value) as progress_value
    from (
      select beer_events.challenge_id, beer_events.user_id, beer_events.progress_value
      from beer_events
      union all
      select legacy_session_events.challenge_id, legacy_session_events.user_id, legacy_session_events.progress_value
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
    where challenges.archived_at is null
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
    public.beerva_effective_challenge_metric_type(
      challenges.challenge_type,
      challenges.metric_type
    ) as metric_type,
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
  where challenges.archived_at is null
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

create or replace function public.finalize_generic_due_challenges(batch_size integer default 10)
returns table (
  challenge_id uuid,
  challenge_slug text,
  winner_user_id uuid,
  winner_progress_value double precision,
  award_id uuid,
  official_post_id uuid,
  finalized_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
  leader_row record;
  stats_row record;
  award_row_id uuid;
  post_row_id uuid;
  final_time timestamp with time zone;
begin
  for challenge_row in
    select challenges.*
    from public.challenges as challenges
    where challenges.challenge_type = 'leaderboard'
      and challenges.slug <> 'karnevalsdruk-2026'
      and challenges.ends_at <= now()
      and challenges.finalized_at is null
      and challenges.archived_at is null
    order by challenges.ends_at asc
    limit least(greatest(coalesce(batch_size, 10), 1), 50)
  loop
    final_time := now();
    award_row_id := null;
    post_row_id := null;

    select leaderboard.*
    into leader_row
    from public.get_challenge_leaderboard(challenge_row.id) as leaderboard
    order by leaderboard.rank asc
    limit 1;

    if leader_row.user_id is null
      or leader_row.progress_value is null
      or leader_row.progress_value <= 0 then
      update public.challenges
      set
        finalized_at = final_time,
        winner_user_id = null,
        winner_progress_value = null
      where challenges.id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := null;
      winner_progress_value := null;
      award_id := null;
      official_post_id := null;
      finalized_at := final_time;
      return next;
      continue;
    end if;

    select
      coalesce(sum(drink_events.quantity), 0)::integer as drink_count,
      round((
        sum(drink_events.abv * drink_events.quantity) filter (where drink_events.abv is not null)
        / nullif(sum(drink_events.quantity) filter (where drink_events.abv is not null), 0)
      )::numeric, 1)::double precision as average_abv,
      count(distinct drink_events.session_id)::integer as session_count
    into stats_row
    from (
      select
        sessions.id as session_id,
        greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
        session_beers.abv
      from public.sessions
      join public.session_beers on session_beers.session_id = sessions.id
      where sessions.user_id = leader_row.user_id
        and sessions.status = 'published'
        and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
        and coalesce(session_beers.excluded_from_stats, false) = false
      union all
      select
        sessions.id as session_id,
        greatest(coalesce(sessions.quantity, 1), 0) as quantity,
        sessions.abv
      from public.sessions
      where sessions.user_id = leader_row.user_id
        and sessions.status = 'published'
        and coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
        and not exists (
          select 1
          from public.session_beers
          where session_beers.session_id = sessions.id
        )
    ) as drink_events;

    insert into public.official_feed_posts (
      challenge_id,
      kind,
      title,
      body,
      metadata,
      published_at
    ) values (
      challenge_row.id,
      'challenge_winner',
      'Winner of ' || challenge_row.title,
      coalesce(leader_row.username, 'Beer Lover')
        || ' won '
        || challenge_row.title
        || ' with '
        || round(leader_row.progress_value::numeric, 1)::text
        || ' true pints.',
      jsonb_build_object(
        'winner_user_id', leader_row.user_id,
        'winner_username', leader_row.username,
        'winner_avatar_url', leader_row.avatar_url,
        'true_pints', round(leader_row.progress_value::numeric, 1),
        'drink_count', coalesce(stats_row.drink_count, 0),
        'average_abv', coalesce(stats_row.average_abv, 0),
        'session_count', coalesce(stats_row.session_count, 0),
        'challenge_slug', challenge_row.slug
      ),
      final_time
    )
    on conflict on constraint official_feed_posts_challenge_id_kind_key do update set
      title = excluded.title,
      body = excluded.body,
      metadata = excluded.metadata,
      published_at = excluded.published_at
    returning id into post_row_id;

    if challenge_row.winner_trophy_enabled then
      insert into public.challenge_awards (
        challenge_id,
        user_id,
        award_slug,
        title,
        description,
        rank,
        progress_value,
        metadata,
        awarded_at
      ) values (
        challenge_row.id,
        leader_row.user_id,
        challenge_row.slug || '-winner',
        challenge_row.winner_trophy_title,
        challenge_row.winner_trophy_description,
        1,
        leader_row.progress_value,
        jsonb_build_object(
          'award_category', 'winner',
          'challenge_slug', challenge_row.slug,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0)
        ),
        final_time
      )
      on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key do update set
        title = excluded.title,
        description = excluded.description,
        rank = excluded.rank,
        progress_value = excluded.progress_value,
        metadata = excluded.metadata,
        awarded_at = excluded.awarded_at
      returning id into award_row_id;
    end if;

    update public.challenges
    set
      finalized_at = final_time,
      winner_user_id = leader_row.user_id,
      winner_progress_value = leader_row.progress_value
    where challenges.id = challenge_row.id;

    challenge_id := challenge_row.id;
    challenge_slug := challenge_row.slug;
    winner_user_id := leader_row.user_id;
    winner_progress_value := leader_row.progress_value;
    award_id := award_row_id;
    official_post_id := post_row_id;
    finalized_at := final_time;
    return next;
  end loop;
end;
$$;

create or replace function public.finalize_due_challenges(batch_size integer default 10)
returns table (
  challenge_id uuid,
  challenge_slug text,
  winner_user_id uuid,
  winner_progress_value double precision,
  award_id uuid,
  official_post_id uuid,
  finalized_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
  pint_user_id uuid;
  pint_username text;
  pint_avatar_url text;
  pint_true_pints double precision;
  pint_drink_count integer;
  pint_average_abv double precision;
  pint_session_count integer;
  abv_user_id uuid;
  abv_username text;
  abv_avatar_url text;
  abv_true_pints double precision;
  abv_drink_count integer;
  abv_average_abv double precision;
  abv_session_count integer;
  pint_award_row_id uuid;
  post_row_id uuid;
  final_time timestamp with time zone;
begin
  for challenge_row in
    select challenges.*
    from public.challenges as challenges
    where challenges.challenge_type = 'leaderboard'
      and challenges.slug = 'karnevalsdruk-2026'
      and challenges.ends_at <= now()
      and challenges.finalized_at is null
      and challenges.archived_at is null
    order by challenges.ends_at asc
    limit least(greatest(coalesce(batch_size, 10), 1), 50)
  loop
    final_time := now();
    pint_award_row_id := null;
    post_row_id := null;

    select
      leaderboard.user_id,
      leaderboard.username,
      leaderboard.avatar_url,
      leaderboard.progress_value,
      coalesce(pint_stats.drink_count, 0),
      pint_stats.average_abv,
      coalesce(pint_stats.session_count, 0)
    into
      pint_user_id,
      pint_username,
      pint_avatar_url,
      pint_true_pints,
      pint_drink_count,
      pint_average_abv,
      pint_session_count
    from public.get_challenge_leaderboard(challenge_row.id) as leaderboard
    left join lateral (
      select
        coalesce(sum(drink_events.quantity), 0)::integer as drink_count,
        round((
          sum(drink_events.abv * drink_events.quantity) filter (where drink_events.abv is not null)
          / nullif(sum(drink_events.quantity) filter (where drink_events.abv is not null), 0)
        )::numeric, 1)::double precision as average_abv,
        count(distinct drink_events.session_id)::integer as session_count
      from (
        select
          sessions.id as session_id,
          greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
          session_beers.abv
        from public.sessions as sessions
        join public.session_beers as session_beers on session_beers.session_id = sessions.id
        where sessions.user_id = leaderboard.user_id
          and sessions.status = 'published'
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
          and coalesce(session_beers.excluded_from_stats, false) = false
        union all
        select
          sessions.id as session_id,
          greatest(coalesce(sessions.quantity, 1), 0) as quantity,
          sessions.abv
        from public.sessions as sessions
        where sessions.user_id = leaderboard.user_id
          and sessions.status = 'published'
          and coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
          and not exists (
            select 1
            from public.session_beers as session_beers
            where session_beers.session_id = sessions.id
          )
      ) as drink_events
    ) as pint_stats on true
    order by leaderboard.rank asc
    limit 1;

    with joined_users as (
      select challenge_entries.user_id
      from public.challenge_entries as challenge_entries
      where challenge_entries.challenge_id = challenge_row.id
    ),
    drink_events as (
      select
        joined_users.user_id,
        sessions.id as session_id,
        public.beerva_serving_volume_ml(session_beers.volume)
          * greatest(coalesce(session_beers.quantity, 1), 0)
          / 568.0 as true_pints,
        greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
        session_beers.abv
      from joined_users
      join public.sessions as sessions on sessions.user_id = joined_users.user_id
        and sessions.status = 'published'
      join public.session_beers as session_beers on session_beers.session_id = sessions.id
      where coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
        and coalesce(session_beers.excluded_from_stats, false) = false
      union all
      select
        joined_users.user_id,
        sessions.id as session_id,
        public.beerva_serving_volume_ml(sessions.volume)
          * greatest(coalesce(sessions.quantity, 1), 0)
          / 568.0 as true_pints,
        greatest(coalesce(sessions.quantity, 1), 0) as quantity,
        sessions.abv
      from joined_users
      join public.sessions as sessions on sessions.user_id = joined_users.user_id
        and sessions.status = 'published'
      where coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
        and not exists (
          select 1
          from public.session_beers as session_beers
          where session_beers.session_id = sessions.id
        )
    ),
    participant_stats as (
      select
        drink_events.user_id,
        coalesce(sum(drink_events.true_pints), 0)::double precision as true_pints,
        coalesce(sum(drink_events.quantity), 0)::integer as drink_count,
        round((
          sum(drink_events.abv * drink_events.quantity) filter (where drink_events.abv is not null)
          / nullif(sum(drink_events.quantity) filter (where drink_events.abv is not null), 0)
        )::numeric, 1)::double precision as average_abv,
        count(distinct drink_events.session_id)::integer as session_count
      from drink_events
      group by drink_events.user_id
    )
    select
      participant_stats.user_id,
      profiles.username,
      profiles.avatar_url,
      participant_stats.true_pints,
      participant_stats.drink_count,
      participant_stats.average_abv,
      participant_stats.session_count
    into
      abv_user_id,
      abv_username,
      abv_avatar_url,
      abv_true_pints,
      abv_drink_count,
      abv_average_abv,
      abv_session_count
    from participant_stats
    left join public.profiles as profiles on profiles.id = participant_stats.user_id
    where participant_stats.average_abv is not null
      and participant_stats.drink_count > 0
    order by
      participant_stats.average_abv desc,
      participant_stats.true_pints desc,
      participant_stats.drink_count desc,
      participant_stats.user_id asc
    limit 1;

    if pint_user_id is null
      or pint_true_pints is null
      or pint_true_pints <= 0 then
      update public.challenges as challenges
      set finalized_at = final_time,
          winner_user_id = null,
          winner_progress_value = null
      where challenges.id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := null;
      winner_progress_value := null;
      award_id := null;
      official_post_id := null;
      finalized_at := final_time;
      return next;
    end if;

    insert into public.challenge_awards (
      challenge_id,
      user_id,
      award_slug,
      title,
      description,
      rank,
      progress_value,
      metadata,
      awarded_at
    ) values (
      challenge_row.id,
      pint_user_id,
      'king-of-karneval-pints',
      'King of Karneval',
      'Congrats, you outperformed everyone else by being an absolute legend.',
      1,
      pint_true_pints,
      jsonb_build_object(
        'award_category', 'pints',
        'challenge_slug', challenge_row.slug,
        'true_pints', round(pint_true_pints::numeric, 1),
        'drink_count', coalesce(pint_drink_count, 0),
        'average_abv', coalesce(pint_average_abv, 0),
        'session_count', coalesce(pint_session_count, 0)
      ),
      final_time
    )
    on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key do update set
      title = excluded.title,
      description = excluded.description,
      rank = excluded.rank,
      progress_value = excluded.progress_value,
      metadata = excluded.metadata,
      awarded_at = excluded.awarded_at
    returning id into pint_award_row_id;

    if abv_user_id is not null then
      insert into public.challenge_awards (
        challenge_id,
        user_id,
        award_slug,
        title,
        description,
        rank,
        progress_value,
        metadata,
        awarded_at
      ) values (
        challenge_row.id,
        abv_user_id,
        'king-of-karneval-abv',
        'King of Karneval',
        'Are you ok? You had the highest ABV-average',
        1,
        abv_average_abv,
        jsonb_build_object(
          'award_category', 'average_abv',
          'challenge_slug', challenge_row.slug,
          'average_abv', round(abv_average_abv::numeric, 1),
          'true_pints', round(coalesce(abv_true_pints, 0)::numeric, 1),
          'drink_count', coalesce(abv_drink_count, 0),
          'session_count', coalesce(abv_session_count, 0)
        ),
        final_time
      )
      on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key do update set
        title = excluded.title,
        description = excluded.description,
        rank = excluded.rank,
        progress_value = excluded.progress_value,
        metadata = excluded.metadata,
        awarded_at = excluded.awarded_at;
    end if;

    insert into public.official_feed_posts (
      challenge_id,
      kind,
      title,
      body,
      metadata,
      published_at
    ) values (
      challenge_row.id,
      'challenge_winner',
      'Kings of Karneval 2026',
      coalesce(pint_username, 'Beer Lover')
        || ' won King of Karneval for total pints with '
        || round(pint_true_pints::numeric, 1)::text
        || ' true pints.'
        || case
          when abv_user_id is null then ''
          else ' ' || coalesce(abv_username, 'Beer Lover')
            || ' won King of Karneval for highest average ABV at '
            || round(abv_average_abv::numeric, 1)::text
            || '%.'
        end,
      jsonb_build_object(
        'winner_user_id', pint_user_id,
        'winner_username', pint_username,
        'winner_avatar_url', pint_avatar_url,
        'true_pints', round(pint_true_pints::numeric, 1),
        'drink_count', coalesce(pint_drink_count, 0),
        'average_abv', coalesce(pint_average_abv, 0),
        'session_count', coalesce(pint_session_count, 0),
        'pint_winner_user_id', pint_user_id,
        'pint_winner_username', pint_username,
        'pint_winner_avatar_url', pint_avatar_url,
        'pint_winner_true_pints', round(pint_true_pints::numeric, 1),
        'abv_winner_user_id', abv_user_id,
        'abv_winner_username', abv_username,
        'abv_winner_avatar_url', abv_avatar_url,
        'abv_winner_average_abv', case
          when abv_average_abv is null then null
          else round(abv_average_abv::numeric, 1)
        end,
        'abv_winner_true_pints', case
          when abv_true_pints is null then null
          else round(abv_true_pints::numeric, 1)
        end,
        'challenge_slug', challenge_row.slug
      ),
      final_time
    )
    on conflict on constraint official_feed_posts_challenge_id_kind_key do update set
      title = excluded.title,
      body = excluded.body,
      metadata = excluded.metadata,
      published_at = excluded.published_at
    returning id into post_row_id;

    update public.challenges as challenges
    set finalized_at = final_time,
        winner_user_id = pint_user_id,
        winner_progress_value = pint_true_pints
    where challenges.id = challenge_row.id;

    challenge_id := challenge_row.id;
    challenge_slug := challenge_row.slug;
    winner_user_id := pint_user_id;
    winner_progress_value := pint_true_pints;
    award_id := pint_award_row_id;
    official_post_id := post_row_id;
    finalized_at := final_time;
    return next;
  end loop;
end;
$$;

revoke execute on function public.admin_get_moderation_drinks(text, uuid, integer) from public, anon;
revoke execute on function public.admin_set_session_beer_excluded(uuid, boolean, text) from public, anon;
revoke execute on function public.get_profile_stats(uuid) from public, anon;
revoke execute on function public.get_session_feed_details(uuid[]) from public, anon;
revoke execute on function public.get_challenge_leaderboard(uuid) from public, anon;
revoke execute on function public.get_official_challenges() from public, anon;
revoke execute on function public.get_challenge_detail(text) from public, anon;

grant execute on function public.admin_get_moderation_drinks(text, uuid, integer) to authenticated;
grant execute on function public.admin_set_session_beer_excluded(uuid, boolean, text) to authenticated;
grant execute on function public.get_profile_stats(uuid) to authenticated;
grant execute on function public.get_session_feed_details(uuid[]) to authenticated;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;
grant execute on function public.get_challenge_detail(text) to authenticated;

notify pgrst, 'reload schema';
