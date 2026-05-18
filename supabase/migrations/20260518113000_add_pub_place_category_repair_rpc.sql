create or replace function public.set_pub_place_category(
  target_pub_id uuid,
  target_place_category text
)
returns table (
  id uuid,
  place_category text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  clean_place_category text := nullif(btrim(coalesce(target_place_category, '')), '');
  updated_pub record;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_pub_id is null then
    raise exception 'Missing place id.';
  end if;

  if clean_place_category is null or clean_place_category not in ('pub', 'other') then
    raise exception 'Unknown place category.';
  end if;

  update public.pubs
  set place_category = clean_place_category,
      updated_at = now()
  where pubs.id = target_pub_id
    and pubs.source = 'user'
    and pubs.created_by = requesting_user_id
    and pubs.status = 'active'
  returning pubs.id, pubs.place_category
  into updated_pub;

  if not found then
    raise exception 'Only manually added places you created can be reclassified.';
  end if;

  return query
  select updated_pub.id, updated_pub.place_category;
end;
$$;

revoke execute on function public.set_pub_place_category(uuid, text) from public, anon;
grant execute on function public.set_pub_place_category(uuid, text) to authenticated;

comment on function public.set_pub_place_category(uuid, text) is 'Lets users repair the pub/other category for active user-added places they created, so private places can be removed from Pub Legends.';
