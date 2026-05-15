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

comment on column public.pubs.place_category is 'Classifies places as real pubs for leaderboard inclusion or other drinking locations excluded from Pub Legends.';
