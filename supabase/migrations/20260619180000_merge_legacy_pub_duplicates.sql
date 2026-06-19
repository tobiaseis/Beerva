do $$
declare
  pair record;
begin
  for pair in
    with candidate_pairs as (
      select
        legacy.id as legacy_pub_id,
        canonical.id as canonical_pub_id,
        count(*) over (partition by legacy.id) as canonical_match_count
      from public.pubs as legacy
      join public.pubs as canonical
        on lower(btrim(legacy.name)) = lower(btrim(canonical.name || ', ' || canonical.city))
      where legacy.source = 'legacy'
        and legacy.status = 'active'
        and coalesce(legacy.place_category, 'pub') = 'pub'
        and canonical.source = 'osm'
        and canonical.status = 'active'
        and coalesce(canonical.place_category, 'pub') = 'pub'
        and canonical.city is not null
    )
    select legacy_pub_id, canonical_pub_id
    from candidate_pairs
    where canonical_match_count = 1
  loop
    update public.sessions
    set pub_id = pair.canonical_pub_id
    where pub_id = pair.legacy_pub_id;

    update public.pubs
    set status = 'merged',
        merged_into = pair.canonical_pub_id,
        use_count = 0,
        updated_at = now()
    where id = pair.legacy_pub_id
      and status = 'active';
  end loop;
end;
$$;

with pub_session_counts as (
  select
    pubs.id as pub_id,
    count(distinct sessions.id)::integer as session_count
  from public.pubs
  left join public.sessions
    on sessions.pub_id = pubs.id
   and sessions.status = 'published'
  where pubs.status = 'active'
    and coalesce(pubs.place_category, 'pub') = 'pub'
  group by pubs.id
)
update public.pubs
set use_count = pub_session_counts.session_count,
    updated_at = now()
from pub_session_counts
where pubs.id = pub_session_counts.pub_id
  and pubs.use_count is distinct from pub_session_counts.session_count;

comment on table public.pubs is
  'Cached pub directory seeded from OpenStreetMap and Beerva users. Exact legacy name-and-city duplicates are retained as merged rows.';
