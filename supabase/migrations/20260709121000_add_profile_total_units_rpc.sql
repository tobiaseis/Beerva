create or replace function public.get_profile_total_units(target_user_id uuid)
returns double precision
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    round(
      sum(
        (
          public.beerva_serving_volume_ml(session_beers.volume)
          * greatest(coalesce(session_beers.quantity, 1)::double precision, 0)
          * (greatest(coalesce(session_beers.abv, 0)::double precision, 0) / 100.0)
          * 0.789
        ) / 12.0
      )::numeric,
      1
    )::double precision,
    0
  )
  from public.sessions
  join public.session_beers
    on session_beers.session_id = sessions.id
  where sessions.user_id = target_user_id
    and sessions.status = 'published'
    and coalesce(session_beers.excluded_from_stats, false) = false;
$$;

revoke execute on function public.get_profile_total_units(uuid) from public, anon;
grant execute on function public.get_profile_total_units(uuid) to authenticated;

comment on function public.get_profile_total_units(uuid) is 'Returns the all-time Danish alcohol unit total for a profile, excluding admin-invalidated drinks.';

notify pgrst, 'reload schema';
