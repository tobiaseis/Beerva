create extension if not exists pg_trgm;

create table if not exists public.pubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  address text,
  latitude double precision,
  longitude double precision,
  source text not null default 'user',
  source_id text,
  source_tags jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  merged_into uuid references public.pubs(id) on delete set null,
  use_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint pubs_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint pubs_source_check check (source in ('osm', 'user', 'legacy')),
  constraint pubs_status_check check (status in ('active', 'hidden', 'merged')),
  constraint pubs_latitude_check check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint pubs_longitude_check check (longitude is null or (longitude >= -180 and longitude <= 180))
);

create unique index if not exists pubs_source_source_id_unique
  on public.pubs(source, source_id);

create index if not exists pubs_name_trgm_idx
  on public.pubs using gin (name gin_trgm_ops);

create index if not exists pubs_city_trgm_idx
  on public.pubs using gin (city gin_trgm_ops);

create index if not exists pubs_status_use_count_idx
  on public.pubs(status, use_count desc);

alter table public.pubs enable row level security;

drop policy if exists "Pubs are viewable by signed-in users" on public.pubs;
create policy "Pubs are viewable by signed-in users"
  on public.pubs
  for select
  to authenticated
  using (status = 'active');

drop policy if exists "Users can add pub candidates" on public.pubs;
create policy "Users can add pub candidates"
  on public.pubs
  for insert
  to authenticated
  with check (
    status = 'active'
    and (
      (source = 'user' and created_by = auth.uid())
      or (source = 'osm' and created_by = auth.uid() and source_id is not null)
    )
  );

drop policy if exists "Users can update pubs they added" on public.pubs;
create policy "Users can update pubs they added"
  on public.pubs
  for update
  to authenticated
  using (source = 'user' and created_by = auth.uid())
  with check (source = 'user' and created_by = auth.uid() and status = 'active');

create or replace function public.set_pubs_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pubs_set_updated_at on public.pubs;
create trigger pubs_set_updated_at
  before update on public.pubs
  for each row
  execute function public.set_pubs_updated_at();

alter table public.sessions
  add column if not exists pub_id uuid references public.pubs(id) on delete set null;

create index if not exists sessions_pub_id_idx
  on public.sessions(pub_id);

with legacy_pubs as (
  select
    btrim(pub_name) as name,
    'legacy:' || md5(lower(btrim(pub_name))) as source_id,
    count(*)::integer as use_count,
    min(created_at) as first_seen_at
  from public.sessions
  where nullif(btrim(coalesce(pub_name, '')), '') is not null
  group by btrim(pub_name), lower(btrim(pub_name))
)
insert into public.pubs (name, source, source_id, status, use_count, created_at, updated_at)
select
  name,
  'legacy',
  source_id,
  'active',
  use_count,
  coalesce(first_seen_at, now()),
  now()
from legacy_pubs
on conflict (source, source_id) do nothing;

update public.sessions
set pub_id = pubs.id
from public.pubs
where sessions.pub_id is null
  and nullif(btrim(coalesce(sessions.pub_name, '')), '') is not null
  and pubs.source = 'legacy'
  and pubs.source_id = 'legacy:' || md5(lower(btrim(sessions.pub_name)));

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

create or replace function public.increment_pub_use_count(target_pub_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pubs
  set use_count = use_count + 1,
      updated_at = now()
  where id = target_pub_id
    and status = 'active';
$$;

grant execute on function public.increment_pub_use_count(uuid) to authenticated;

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
        when '50cl' then 500::double precision
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

comment on table public.pubs is 'Cached pub directory seeded from OpenStreetMap and Beerva users.';
comment on column public.sessions.pub_id is 'Canonical pub directory record for this drinking session when available.';
