with replacements(old_name, new_name) as (
  values
    ('Tuborg Gron', 'Tuborg Grøn'),
    ('Tuborg Paskebryg', 'Tuborg Påskebryg'),
    ('Grimbergen Double Ambree', 'Grimbergen Double-Ambrée'),
    ('Royal Okologisk', 'Royal Økologisk'),
    ('Schiotz Mork Mumme', 'Schiøtz Mørk Mumme'),
    ('Schiotz Gylden IPA', 'Schiøtz Gylden IPA'),
    ('Thisted Okologisk Humle', 'Thisted Økologisk Humle'),
    ('Norrebro Bryghus New York Lager', 'Nørrebro Bryghus New York Lager'),
    ('Norrebro Bryghus Bombay IPA', 'Nørrebro Bryghus Bombay IPA'),
    ('Norrebro Bryghus Ravnsborg Rod', 'Nørrebro Bryghus Ravnsborg Rød'),
    ('To Ol City Session IPA', 'To Øl City Session IPA'),
    ('To Ol Whirl Domination', 'To Øl Whirl Domination'),
    ('To Ol 45 Days Pilsner', 'To Øl 45 Days Pilsner'),
    ('To Ol Gose to Hollywood', 'To Øl Gose to Hollywood'),
    ('Svaneke Mork Guld', 'Svaneke Mørk Guld'),
    ('Hancock Hoker Bajer', 'Hancock Høker Bajer')
)
update public.session_beers
set beer_name = replacements.new_name
from replacements
where public.session_beers.beer_name = replacements.old_name;

with replacements(old_name, new_name) as (
  values
    ('Tuborg Gron', 'Tuborg Grøn'),
    ('Tuborg Paskebryg', 'Tuborg Påskebryg'),
    ('Grimbergen Double Ambree', 'Grimbergen Double-Ambrée'),
    ('Royal Okologisk', 'Royal Økologisk'),
    ('Schiotz Mork Mumme', 'Schiøtz Mørk Mumme'),
    ('Schiotz Gylden IPA', 'Schiøtz Gylden IPA'),
    ('Thisted Okologisk Humle', 'Thisted Økologisk Humle'),
    ('Norrebro Bryghus New York Lager', 'Nørrebro Bryghus New York Lager'),
    ('Norrebro Bryghus Bombay IPA', 'Nørrebro Bryghus Bombay IPA'),
    ('Norrebro Bryghus Ravnsborg Rod', 'Nørrebro Bryghus Ravnsborg Rød'),
    ('To Ol City Session IPA', 'To Øl City Session IPA'),
    ('To Ol Whirl Domination', 'To Øl Whirl Domination'),
    ('To Ol 45 Days Pilsner', 'To Øl 45 Days Pilsner'),
    ('To Ol Gose to Hollywood', 'To Øl Gose to Hollywood'),
    ('Svaneke Mork Guld', 'Svaneke Mørk Guld'),
    ('Hancock Hoker Bajer', 'Hancock Høker Bajer')
)
update public.sessions
set beer_name = replacements.new_name
from replacements
where public.sessions.beer_name = replacements.old_name;

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
  unique_beers integer,
  max_beers_in_one_day integer,
  has_early_bird_session boolean,
  months_logged integer
)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      sessions.id as session_id,
      sessions.pub_name,
      coalesce(sessions.pub_id::text, nullif(lower(btrim(sessions.pub_name)), '')) as pub_key,
      session_beers.beer_name,
      coalesce(session_beers.quantity, 1)::double precision as quantity_value,
      coalesce(session_beers.abv, 0)::double precision as abv_value,
      case lower(coalesce(session_beers.volume, 'pint'))
        when '25cl' then 250::double precision
        when '33cl' then 330::double precision
        when 'schooner' then 379::double precision
        when '40cl' then 400::double precision
        when '50cl' then 500::double precision
        when '1l' then 1000::double precision
        when '1 l' then 1000::double precision
        when '100cl' then 1000::double precision
        else 568::double precision
      end as volume_ml,
      timezone('Europe/Copenhagen', coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) as local_created_at,
      (timezone('Europe/Copenhagen', coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) - interval '6 hours')::date as drinking_day
    from sessions
    join session_beers on session_beers.session_id = sessions.id
    where sessions.user_id = target_user_id
      and sessions.status = 'published'
  ),
  beer_rows as (
    select
      *,
      volume_ml * quantity_value as beer_ml,
      (volume_ml * quantity_value) / 568.0 as beer_pints
    from base
  ),
  sessions_per_day as (
    select drinking_day, count(distinct session_id)::integer as session_count
    from beer_rows
    where drinking_day is not null
    group by drinking_day
  ),
  pubs_per_day as (
    select drinking_day, count(distinct pub_key)::integer as pub_count
    from beer_rows
    where drinking_day is not null and pub_key is not null
    group by drinking_day
  ),
  beers_per_day as (
    select drinking_day, count(distinct beer_name)::integer as beer_count
    from beer_rows
    where drinking_day is not null and beer_name is not null
    group by drinking_day
  ),
  sessions_per_pub as (
    select pub_key, count(distinct session_id)::integer as session_count
    from beer_rows
    where pub_key is not null
    group by pub_key
  ),
  pints_per_session as (
    select session_id, sum(beer_pints) as session_pints
    from beer_rows
    group by session_id
  ),
  streak_days as (
    select
      drinking_day,
      drinking_day - row_number() over (order by drinking_day)::integer as streak_group
    from (
      select distinct drinking_day
      from beer_rows
      where drinking_day is not null
    ) days
  ),
  streaks as (
    select count(*)::integer as streak_length
    from streak_days
    group by streak_group
  )
  select
    coalesce(round((sum(beer_ml) / 568.0)::numeric, 1)::double precision, 0) as total_pints,
    (count(distinct pub_key) filter (where pub_key is not null))::integer as unique_pubs,
    coalesce(round((sum(beer_ml * abv_value) / nullif(sum(beer_ml), 0))::numeric, 1)::double precision, 0) as avg_abv,
    coalesce(round((select max(session_pints) from pints_per_session)::numeric, 1)::double precision, 0) as max_session_pints,
    coalesce(round(max(abv_value)::numeric, 1)::double precision, 0) as strongest_abv,
    coalesce(bool_or(extract(hour from local_created_at) >= 3 and extract(hour from local_created_at) < 6), false) as has_late_night_session,
    coalesce((select max(session_count) from sessions_per_day), 0) as max_sessions_in_one_day,
    coalesce((select max(pub_count) from pubs_per_day), 0) as max_pubs_in_one_day,
    coalesce((select max(session_count) from sessions_per_pub), 0) as max_sessions_at_same_pub,
    coalesce((select max(streak_length) from streaks), 0) as longest_day_streak,
    (count(distinct beer_name) filter (where beer_name is not null))::integer as unique_beers,
    coalesce((select max(beer_count) from beers_per_day), 0) as max_beers_in_one_day,
    coalesce(bool_or(extract(hour from local_created_at) >= 6 and extract(hour from local_created_at) < 10), false) as has_early_bird_session,
    (count(distinct extract(month from local_created_at)) filter (where local_created_at is not null))::integer as months_logged
  from beer_rows;
$$;

grant execute on function public.get_profile_stats(uuid) to authenticated;

comment on function public.get_profile_stats(uuid) is 'Profile aggregate stats with current Beerva serving volume conversions.';
