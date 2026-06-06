-- Adds Danish alcohol units to the feed-details RPC while preserving the
-- current streak output added in 20260604150000_add_current_streaks.sql.

drop function if exists public.get_session_feed_details(uuid[]);

create or replace function public.get_session_feed_details(session_ids uuid[])
returns table (
  session_id uuid,
  author_username text,
  author_avatar_url text,
  cheers_count integer,
  cheers jsonb,
  beers jsonb,
  comments jsonb,
  photos jsonb,
  units double precision,
  author_current_streak integer
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_sessions as (
    select s.id, s.user_id
    from public.sessions s
    where s.id = any(coalesce(session_ids, array[]::uuid[]))
      and s.status = 'published'
      and (
        s.user_id = (select auth.uid())
        or exists (
          select 1
          from public.follows
          where follows.follower_id = (select auth.uid())
            and follows.following_id = s.user_id
        )
      )
  ),
  author_streaks as (
    select cs.user_id, cs.current_streak
    from public.get_current_streaks(
      (select array_agg(distinct vs.user_id) from visible_sessions vs)
    ) cs
  )
  select
    vs.id as session_id,
    author.username as author_username,
    author.avatar_url as author_avatar_url,
    coalesce(cheer_agg.cheers_count, 0) as cheers_count,
    coalesce(cheer_agg.cheers, '[]'::jsonb) as cheers,
    coalesce(beer_agg.beers, '[]'::jsonb) as beers,
    coalesce(comment_agg.comments, '[]'::jsonb) as comments,
    coalesce(photo_agg.photos, '[]'::jsonb) as photos,
    coalesce(beer_agg.units, 0) as units,
    coalesce(author_streaks.current_streak, 0) as author_current_streak
  from visible_sessions vs
  left join public.profiles author
    on author.id = vs.user_id
  left join author_streaks on author_streaks.user_id = vs.user_id
  left join lateral (
    select
      count(*)::int as cheers_count,
      jsonb_agg(
        jsonb_build_object(
          'user_id', ch.user_id,
          'username', pr.username,
          'avatar_url', pr.avatar_url,
          'created_at', ch.created_at
        )
        order by ch.created_at asc nulls last
      ) as cheers
    from public.session_cheers ch
    left join public.profiles pr on pr.id = ch.user_id
    where ch.session_id = vs.id
  ) cheer_agg on true
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', sb.id,
          'session_id', sb.session_id,
          'beer_name', sb.beer_name,
          'volume', sb.volume,
          'quantity', sb.quantity,
          'abv', sb.abv,
          'note', sb.note,
          'consumed_at', sb.consumed_at,
          'created_at', sb.created_at
        )
        order by sb.consumed_at asc nulls last
      ) as beers,
      coalesce(round(sum(
        public.beerva_serving_volume_ml(sb.volume)
        * greatest(coalesce(sb.quantity, 1)::double precision, 0)
        * (greatest(coalesce(sb.abv, 0)::double precision, 0) / 100.0)
        * 0.789
        / 12.0
      )::numeric, 1)::double precision, 0) as units
    from public.session_beers sb
    where sb.session_id = vs.id
  ) beer_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', co.id,
        'session_id', co.session_id,
        'user_id', co.user_id,
        'body', co.body,
        'created_at', co.created_at,
        'updated_at', co.updated_at,
        'username', pr.username,
        'avatar_url', pr.avatar_url
      )
      order by co.created_at asc nulls last
    ) as comments
    from public.session_comments co
    left join public.profiles pr on pr.id = co.user_id
    where co.session_id = vs.id
  ) comment_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', ph.id,
        'session_id', ph.session_id,
        'image_url', ph.image_url,
        'is_keeper', ph.is_keeper,
        'expires_at', ph.expires_at,
        'created_at', ph.created_at
      )
      order by ph.is_keeper desc, ph.created_at asc nulls last
    ) as photos
    from public.session_photos ph
    where ph.session_id = vs.id
  ) photo_agg on true;
$$;

revoke execute on function public.get_session_feed_details(uuid[]) from public, anon;
grant execute on function public.get_session_feed_details(uuid[]) to authenticated;

comment on function public.get_session_feed_details(uuid[]) is
  'Returns author profile, current streak, alcohol units, and jsonb cheers/beers/comments/photos for visible published sessions in one feed round-trip.';

notify pgrst, 'reload schema';
