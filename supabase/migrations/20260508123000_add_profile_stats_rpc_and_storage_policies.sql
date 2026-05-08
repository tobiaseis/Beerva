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
      pub_name,
      beer_name,
      coalesce(quantity, 1)::double precision as quantity_value,
      coalesce(abv, 0)::double precision as abv_value,
      case lower(coalesce(volume, 'pint'))
        when '25cl' then 250::double precision
        when '33cl' then 330::double precision
        when 'schooner' then 379::double precision
        when '50cl' then 500::double precision
        else 568::double precision
      end as volume_ml,
      timezone('Europe/Copenhagen', created_at) as local_created_at,
      (timezone('Europe/Copenhagen', created_at) - interval '6 hours')::date as drinking_day
    from sessions
    where user_id = target_user_id
  ),
  per_session as (
    select
      *,
      volume_ml * quantity_value as session_ml,
      (volume_ml * quantity_value) / 568.0 as session_pints
    from base
  ),
  sessions_per_day as (
    select drinking_day, count(*)::integer as session_count
    from per_session
    where drinking_day is not null
    group by drinking_day
  ),
  pubs_per_day as (
    select drinking_day, count(distinct pub_name)::integer as pub_count
    from per_session
    where drinking_day is not null and pub_name is not null
    group by drinking_day
  ),
  beers_per_day as (
    select drinking_day, count(distinct beer_name)::integer as beer_count
    from per_session
    where drinking_day is not null and beer_name is not null
    group by drinking_day
  ),
  sessions_per_pub as (
    select pub_name, count(*)::integer as session_count
    from per_session
    where pub_name is not null
    group by pub_name
  ),
  streak_days as (
    select
      drinking_day,
      drinking_day - row_number() over (order by drinking_day)::integer as streak_group
    from (
      select distinct drinking_day
      from per_session
      where drinking_day is not null
    ) days
  ),
  streaks as (
    select count(*)::integer as streak_length
    from streak_days
    group by streak_group
  )
  select
    coalesce(round((sum(session_ml) / 568.0)::numeric, 1)::double precision, 0) as total_pints,
    (count(distinct pub_name) filter (where pub_name is not null))::integer as unique_pubs,
    coalesce(round((sum(session_ml * abv_value) / nullif(sum(session_ml), 0))::numeric, 1)::double precision, 0) as avg_abv,
    coalesce(round(max(session_pints)::numeric, 1)::double precision, 0) as max_session_pints,
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
  from per_session;
$$;

grant execute on function public.get_profile_stats(uuid) to authenticated;

drop policy if exists "Authenticated users can view session images" on storage.objects;
drop policy if exists "Users can upload own session images" on storage.objects;
drop policy if exists "Users can update own session images" on storage.objects;
drop policy if exists "Users can delete own session images" on storage.objects;

create policy "Authenticated users can view session images"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'session_images');

create policy "Users can upload own session images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'session_images'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "Users can update own session images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'session_images'
    and (
      ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
      or owner = auth.uid()
    )
  )
  with check (
    bucket_id = 'session_images'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "Users can delete own session images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'session_images'
    and (
      ((storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
      or owner = auth.uid()
    )
  );
