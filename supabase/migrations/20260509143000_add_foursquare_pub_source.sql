alter table public.pubs
  drop constraint if exists pubs_source_check;

alter table public.pubs
  add constraint pubs_source_check
  check (source in ('osm', 'foursquare', 'user', 'legacy'));

comment on column public.pubs.source is 'Origin of the pub record: osm, foursquare, user, or legacy.';
