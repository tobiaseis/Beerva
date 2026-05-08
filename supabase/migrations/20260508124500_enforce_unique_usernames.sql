do $$
declare
  duplicate_profile record;
begin
  select
    lower(btrim(username)) as normalized_username,
    string_agg(id::text, ', ' order by id::text) as profile_ids
  into duplicate_profile
  from public.profiles
  where username is not null
    and btrim(username) <> ''
  group by lower(btrim(username))
  having count(*) > 1
  limit 1;

  if duplicate_profile.normalized_username is not null then
    raise exception
      'Cannot enforce unique usernames until duplicate username "%" is fixed for profile ids: %',
      duplicate_profile.normalized_username,
      duplicate_profile.profile_ids
      using errcode = '23505';
  end if;
end $$;

create unique index if not exists profiles_username_normalized_unique_idx
  on public.profiles (lower(btrim(username)))
  where username is not null
    and btrim(username) <> '';
