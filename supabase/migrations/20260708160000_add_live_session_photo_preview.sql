create or replace function public.get_live_session_photos(target_session_id uuid)
returns table (
  id uuid,
  session_id uuid,
  image_url text,
  is_keeper boolean,
  expires_at timestamp with time zone,
  created_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ph.id,
    ph.session_id,
    ph.image_url,
    ph.is_keeper,
    ph.expires_at,
    ph.created_at
  from public.session_photos ph
  join public.live_mate_sessions live
    on live.session_id = ph.session_id
  where live.session_id = target_session_id
    and (
      live.user_id = (select auth.uid())
      or exists (
        select 1
        from public.follows
        where follows.follower_id = (select auth.uid())
          and follows.following_id = live.user_id
      )
    )
  order by ph.is_keeper desc nulls last, ph.created_at asc nulls last;
$$;

revoke execute on function public.get_live_session_photos(uuid) from public, anon;
grant execute on function public.get_live_session_photos(uuid) to authenticated;

comment on function public.get_live_session_photos(uuid) is
  'Returns active-session photos for a live session when the current viewer owns or follows the live user.';

notify pgrst, 'reload schema';
