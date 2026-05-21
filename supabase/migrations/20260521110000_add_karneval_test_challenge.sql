insert into public.challenges (
  slug,
  title,
  description,
  metric_type,
  challenge_type,
  target_value,
  starts_at,
  ends_at,
  join_closes_at,
  finalized_at,
  winner_user_id,
  winner_progress_value
) values (
  'karneval-test',
  'karneval test',
  'Test challenge for validating the KarnevalsDruk live leaderboard. Counts drinks from 06:00 May 21 to 06:00 May 22.',
  'true_pints',
  'leaderboard',
  null,
  timestamp with time zone '2026-05-21 04:00:00+00',
  timestamp with time zone '2026-05-22 04:00:00+00',
  timestamp with time zone '2026-05-22 04:00:00+00',
  null,
  null,
  null
) on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_type = excluded.metric_type,
  challenge_type = excluded.challenge_type,
  target_value = excluded.target_value,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  join_closes_at = excluded.join_closes_at,
  finalized_at = null,
  winner_user_id = null,
  winner_progress_value = null;

create or replace function public.finalize_due_challenges(batch_size integer default 10)
returns table (
  challenge_id uuid,
  challenge_slug text,
  winner_user_id uuid,
  winner_progress_value double precision,
  award_id uuid,
  official_post_id uuid,
  finalized_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
  leader_row record;
  stats_row record;
  profile_row record;
  award_row_id uuid;
  post_row_id uuid;
  final_time timestamp with time zone;
begin
  for challenge_row in
    select *
    from public.challenges
    where challenge_type = 'leaderboard'
      and slug = 'karnevalsdruk-2026'
      and ends_at <= now()
      and finalized_at is null
    order by ends_at asc
    limit least(greatest(coalesce(batch_size, 10), 1), 50)
  loop
    final_time := now();
    award_row_id := null;
    post_row_id := null;

    select *
    into leader_row
    from public.get_challenge_leaderboard(challenge_row.id)
    order by rank asc
    limit 1;

    if leader_row.user_id is null
      or leader_row.progress_value is null
      or leader_row.progress_value <= 0 then
      update public.challenges
      set finalized_at = final_time,
          winner_user_id = null,
          winner_progress_value = null
      where id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := null;
      winner_progress_value := null;
      award_id := null;
      official_post_id := null;
      finalized_at := final_time;
      return next;
    else
      select profiles.username, profiles.avatar_url
      into profile_row
      from public.profiles
      where profiles.id = leader_row.user_id;

      with filtered_beers as (
        select
          sessions.id as session_id,
          session_beers.volume,
          greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
          session_beers.abv
        from public.sessions
        join public.session_beers on session_beers.session_id = sessions.id
        where sessions.user_id = leader_row.user_id
          and sessions.status = 'published'
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
      )
      select
        coalesce(sum(public.beerva_serving_volume_ml(filtered_beers.volume) * filtered_beers.quantity / 568.0), 0)::double precision as true_pints,
        coalesce(sum(filtered_beers.quantity), 0)::integer as drink_count,
        round((
          sum(filtered_beers.abv * filtered_beers.quantity) filter (where filtered_beers.abv is not null)
          / nullif(sum(filtered_beers.quantity) filter (where filtered_beers.abv is not null), 0)
        )::numeric, 1)::double precision as average_abv,
        count(distinct filtered_beers.session_id)::integer as session_count
      into stats_row
      from filtered_beers;

      insert into public.challenge_awards (
        challenge_id,
        user_id,
        award_slug,
        title,
        description,
        rank,
        progress_value,
        metadata,
        awarded_at
      ) values (
        challenge_row.id,
        leader_row.user_id,
        'winner-of-karneval-2026',
        'Winner of Karneval 2026',
        'Won KarnevalsDruk 2026 by drinking the most true pints.',
        1,
        leader_row.progress_value,
        jsonb_build_object(
          'challenge_slug', challenge_row.slug,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0)
        ),
        final_time
      )
      on conflict (challenge_id, user_id, award_slug) do update set
        progress_value = excluded.progress_value,
        metadata = excluded.metadata
      returning id into award_row_id;

      insert into public.official_feed_posts (
        challenge_id,
        kind,
        title,
        body,
        metadata,
        published_at
      ) values (
        challenge_row.id,
        'challenge_winner',
        'Winner of Karneval 2026',
        coalesce(profile_row.username, 'Beer Lover') || ' won KarnevalsDruk with ' || round(leader_row.progress_value::numeric, 1)::text || ' true pints.',
        jsonb_build_object(
          'winner_user_id', leader_row.user_id,
          'winner_username', profile_row.username,
          'winner_avatar_url', profile_row.avatar_url,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0),
          'challenge_slug', challenge_row.slug
        ),
        final_time
      )
      on conflict (challenge_id, kind) do update set
        title = excluded.title,
        body = excluded.body,
        metadata = excluded.metadata
      returning id into post_row_id;

      update public.challenges
      set finalized_at = final_time,
          winner_user_id = leader_row.user_id,
          winner_progress_value = leader_row.progress_value
      where id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := leader_row.user_id;
      winner_progress_value := leader_row.progress_value;
      award_id := award_row_id;
      official_post_id := post_row_id;
      finalized_at := final_time;
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.finalize_due_challenges(integer) from public, anon, authenticated;
grant execute on function public.finalize_due_challenges(integer) to service_role;

comment on function public.finalize_due_challenges(integer) is 'Finalizes the real KarnevalsDruk leaderboard challenge, awarding the official winner and posting a Beerva announcement idempotently.';

notify pgrst, 'reload schema';
