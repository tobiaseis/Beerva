-- Adds the canonical current-streak computation and surfaces it on the two
-- read RPCs the app already calls (profile stats + feed details).

-- Canonical: current consecutive drinking-day streak per user.
-- A drinking day is the 6am-6am Europe/Copenhagen window. The streak is the
-- length of the consecutive-day run ending at the user's most recent drinking
-- day, returned only when that day is today or yesterday (else 0). Published
-- sessions only.
create or replace function public.get_current_streaks(user_ids uuid[])
returns table (
  user_id uuid,
  current_streak integer
)
language sql
stable
security definer
set search_path = public
as $$
  with drinking_days as (
    select distinct
      s.user_id as uid,
      (timezone('Europe/Copenhagen', coalesce(s.started_at, s.created_at)) - interval '6 hours')::date as drinking_day
    from public.sessions s
    where s.user_id = any(coalesce(user_ids, array[]::uuid[]))
      and s.status = 'published'
  ),
  grouped as (
    select
      uid,
      drinking_day,
      drinking_day - (row_number() over (partition by uid order by drinking_day))::integer as streak_group
    from drinking_days
  ),
  runs as (
    select
      uid,
      count(*)::integer as run_length,
      max(drinking_day) as run_end
    from grouped
    group by uid, streak_group
  ),
  latest_run as (
    select distinct on (uid)
      uid,
      run_length,
      run_end
    from runs
    order by uid, run_end desc
  )
  select
    latest_run.uid as user_id,
    case
      when latest_run.run_end >= ((timezone('Europe/Copenhagen', now()) - interval '6 hours')::date - 1)
        then latest_run.run_length
      else 0
    end as current_streak
  from latest_run;
$$;

revoke execute on function public.get_current_streaks(uuid[]) from public, anon;
grant execute on function public.get_current_streaks(uuid[]) to authenticated;

comment on function public.get_current_streaks(uuid[]) is
  'Current consecutive drinking-day streak per user (6am Copenhagen day buckets), active only when the most recent day is today or yesterday.';

-- Redefine get_profile_stats to append current_streak.
drop function if exists public.get_profile_stats(uuid);

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
      public.beerva_serving_volume_ml(session_beers.volume) as volume_ml,
      timezone('Europe/Copenhagen', coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) as beer_local_at,
      timezone('Europe/Copenhagen', coalesce(sessions.started_at, sessions.created_at)) as session_local_at,
      (timezone('Europe/Copenhagen', coalesce(sessions.started_at, sessions.created_at)) - interval '6 hours')::date as session_drinking_day
    from public.sessions
    join public.session_beers on session_beers.session_id = sessions.id
    where sessions.user_id = target_user_id
      and sessions.status = 'published'
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
    coalesce(round(max(abv_value) filter (where not is_rtd and not is_jagerbomb and not is_sambuca and not is_wine and not is_special_mixed)::numeric, 1)::double precision, 0) as strongest_abv,
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

grant execute on function public.get_profile_stats(uuid) to authenticated;

comment on function public.get_profile_stats(uuid) is 'Profile aggregate stats with session-based trophy day buckets, normalized drink uniqueness, parsed beverage serving volumes, RTD/Jagerbomb/Sambuca/special mixed drink counters, wine and cocktail exclusions from beer-only strongest ABV calculation, 2+ true-pint weekly streaks, and current drinking-day streak.';

-- Redefine get_session_feed_details to append author_current_streak.
drop function if exists public.get_session_feed_details(uuid[]);

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
    select jsonb_agg(
      jsonb_build_object(
        'id', sb.id,
        'session_id', sb.session_id,
        'beer_name', sb.beer_name,
        'volume', sb.volume,
        'quantity', sb.quantity,
        'abv', sb.abv,
        'note', sb.note,
        'consumed_at', sb.consumed_at,
        'created_at', sb.created_at
      )
      order by sb.consumed_at asc nulls last
    ) as beers
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

revoke execute on function public.get_session_feed_details(uuid[]) from public, anon;
grant execute on function public.get_session_feed_details(uuid[]) to authenticated;

comment on function public.get_session_feed_details(uuid[]) is
  'Returns author profile (incl. current streak) plus jsonb cheers/beers/comments/photos for visible published sessions in one round-trip for the feed.';

notify pgrst, 'reload schema';
