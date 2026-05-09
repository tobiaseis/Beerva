create or replace function public.pub_osm_tag_value(tags jsonb, keys text[])
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(tags ->> tag_key), '')
  from unnest(keys) as tag_keys(tag_key)
  where nullif(btrim(tags ->> tag_key), '') is not null
  limit 1;
$$;

create or replace function public.pub_city_from_osm_tags(tags jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    public.pub_osm_tag_value(
      tags,
      array[
        'addr:city',
        'addr:town',
        'addr:village',
        'addr:hamlet',
        'addr:municipality',
        'is_in:city',
        'is_in:town',
        'is_in:village'
      ]
    ),
    (
      select nullif(btrim(part), '')
      from regexp_split_to_table(coalesce(tags ->> 'is_in', ''), '[,;]') as parts(part)
      where nullif(btrim(part), '') is not null
        and lower(btrim(part)) not in ('denmark', 'danmark')
        and lower(btrim(part)) not like '% region'
        and lower(btrim(part)) not like '% kommune'
        and lower(btrim(part)) not like '% municipality'
      limit 1
    )
  );
$$;

create or replace function public.pub_address_from_osm_tags(tags jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  with parts as (
    select
      public.pub_osm_tag_value(tags, array['addr:full']) as full_address,
      public.pub_osm_tag_value(tags, array['addr:street', 'addr:place']) as street,
      public.pub_osm_tag_value(tags, array['addr:housenumber']) as house_number,
      public.pub_osm_tag_value(tags, array['addr:postcode']) as postcode,
      public.pub_city_from_osm_tags(tags) as city
  )
  select coalesce(
    full_address,
    nullif(
      concat_ws(
        ', ',
        nullif(btrim(concat_ws(' ', street, house_number)), ''),
        case
          when postcode is not null then nullif(btrim(concat_ws(' ', postcode, city)), '')
          else null
        end
      ),
      ''
    )
  )
  from parts;
$$;

create or replace function public.upsert_osm_pubs(pub_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
begin
  with incoming as (
    select
      nullif(btrim(item ->> 'name'), '') as name,
      nullif(btrim(item ->> 'city'), '') as city,
      nullif(btrim(item ->> 'address'), '') as address,
      case
        when nullif(item ->> 'latitude', '') is not null then (item ->> 'latitude')::double precision
        else null
      end as latitude,
      case
        when nullif(item ->> 'longitude', '') is not null then (item ->> 'longitude')::double precision
        else null
      end as longitude,
      nullif(btrim(item ->> 'source_id'), '') as source_id,
      case
        when jsonb_typeof(item -> 'source_tags') = 'object' then item -> 'source_tags'
        else '{}'::jsonb
      end as source_tags,
      case
        when nullif(item ->> 'created_by', '') is not null then (item ->> 'created_by')::uuid
        else null
      end as created_by,
      greatest(coalesce((item ->> 'use_count')::integer, 0), 0) as use_count
    from jsonb_array_elements(coalesce(pub_rows, '[]'::jsonb)) as item
  ),
  normalized as (
    select
      name,
      coalesce(city, public.pub_city_from_osm_tags(source_tags)) as city,
      coalesce(address, public.pub_address_from_osm_tags(source_tags)) as address,
      latitude,
      longitude,
      source_id,
      source_tags,
      created_by,
      use_count
    from incoming
    where source_id is not null
      and char_length(name) between 2 and 120
      and (latitude is null or (latitude >= -90 and latitude <= 90))
      and (longitude is null or (longitude >= -180 and longitude <= 180))
  )
  insert into public.pubs (
    name,
    city,
    address,
    latitude,
    longitude,
    source,
    source_id,
    source_tags,
    status,
    created_by,
    use_count
  )
  select
    name,
    city,
    address,
    latitude,
    longitude,
    'osm',
    source_id,
    source_tags,
    'active',
    created_by,
    use_count
  from normalized
  on conflict (source, source_id) do update
    set name = excluded.name,
        city = coalesce(nullif(btrim(public.pubs.city), ''), nullif(btrim(excluded.city), '')),
        address = coalesce(nullif(btrim(public.pubs.address), ''), nullif(btrim(excluded.address), '')),
        latitude = coalesce(excluded.latitude, public.pubs.latitude),
        longitude = coalesce(excluded.longitude, public.pubs.longitude),
        source_tags = coalesce(public.pubs.source_tags, '{}'::jsonb) || coalesce(excluded.source_tags, '{}'::jsonb),
        status = case
          when public.pubs.status in ('hidden', 'merged') then public.pubs.status
          else 'active'
        end,
        created_by = coalesce(public.pubs.created_by, excluded.created_by),
        use_count = greatest(public.pubs.use_count, excluded.use_count),
        updated_at = now();

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

create or replace function public.update_pub_enrichments(pub_updates jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
begin
  with incoming as (
    select
      (item ->> 'id')::uuid as id,
      nullif(btrim(item ->> 'city'), '') as city,
      nullif(btrim(item ->> 'address'), '') as address
    from jsonb_array_elements(coalesce(pub_updates, '[]'::jsonb)) as item
    where nullif(item ->> 'id', '') is not null
  )
  update public.pubs
  set city = coalesce(nullif(btrim(incoming.city), ''), nullif(btrim(public.pubs.city), '')),
      address = coalesce(nullif(btrim(incoming.address), ''), nullif(btrim(public.pubs.address), '')),
      updated_at = now()
  from incoming
  where public.pubs.id = incoming.id
    and public.pubs.source = 'osm'
    and (
      (nullif(btrim(public.pubs.city), '') is null and incoming.city is not null)
      or (nullif(btrim(public.pubs.address), '') is null and incoming.address is not null)
    );

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

update public.pubs
set city = nullif(btrim(city), ''),
    address = nullif(btrim(address), '')
where city is not null
  or address is not null;

update public.pubs
set city = coalesce(nullif(btrim(city), ''), public.pub_city_from_osm_tags(source_tags)),
    address = coalesce(nullif(btrim(address), ''), public.pub_address_from_osm_tags(source_tags))
where source = 'osm'
  and (
    nullif(btrim(city), '') is null
    or nullif(btrim(address), '') is null
  )
  and (
    public.pub_city_from_osm_tags(source_tags) is not null
    or public.pub_address_from_osm_tags(source_tags) is not null
  );

create index if not exists pubs_address_trgm_idx
  on public.pubs using gin (address gin_trgm_ops);

revoke execute on function public.upsert_osm_pubs(jsonb) from public, anon, authenticated;
revoke execute on function public.update_pub_enrichments(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_osm_pubs(jsonb) to service_role;
grant execute on function public.update_pub_enrichments(jsonb) to service_role;

comment on function public.upsert_osm_pubs(jsonb) is 'Service-role helper for OSM pub imports that preserves existing enriched address metadata on conflict.';
comment on function public.update_pub_enrichments(jsonb) is 'Service-role helper for batch filling missing pub city/address metadata.';
