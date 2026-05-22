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
  pint_user_id uuid;
  pint_username text;
  pint_avatar_url text;
  pint_true_pints double precision;
  pint_drink_count integer;
  pint_average_abv double precision;
  pint_session_count integer;
  abv_user_id uuid;
  abv_username text;
  abv_avatar_url text;
  abv_true_pints double precision;
  abv_drink_count integer;
  abv_average_abv double precision;
  abv_session_count integer;
  pint_award_row_id uuid;
  abv_award_row_id uuid;
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
    pint_award_row_id := null;
    abv_award_row_id := null;
    post_row_id := null;

    select
      leaderboard.user_id,
      leaderboard.username,
      leaderboard.avatar_url,
      leaderboard.progress_value,
      coalesce(pint_stats.drink_count, 0),
      pint_stats.average_abv,
      coalesce(pint_stats.session_count, 0)
    into
      pint_user_id,
      pint_username,
      pint_avatar_url,
      pint_true_pints,
      pint_drink_count,
      pint_average_abv,
      pint_session_count
    from public.get_challenge_leaderboard(challenge_row.id) leaderboard
    left join lateral (
      select
        coalesce(sum(drink_events.quantity), 0)::integer as drink_count,
        round((
          sum(drink_events.abv * drink_events.quantity) filter (where drink_events.abv is not null)
          / nullif(sum(drink_events.quantity) filter (where drink_events.abv is not null), 0)
        )::numeric, 1)::double precision as average_abv,
        count(distinct drink_events.session_id)::integer as session_count
      from (
        select
          sessions.id as session_id,
          greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
          session_beers.abv
        from public.sessions
        join public.session_beers on session_beers.session_id = sessions.id
        where sessions.user_id = leaderboard.user_id
          and sessions.status = 'published'
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
        union all
        select
          sessions.id as session_id,
          greatest(coalesce(sessions.quantity, 1), 0) as quantity,
          sessions.abv
        from public.sessions
        where sessions.user_id = leaderboard.user_id
          and sessions.status = 'published'
          and coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
          and not exists (
            select 1
            from public.session_beers
            where session_beers.session_id = sessions.id
          )
      ) drink_events
    ) pint_stats on true
    order by leaderboard.rank asc
    limit 1;

    with joined_users as (
      select challenge_entries.user_id
      from public.challenge_entries
      where challenge_entries.challenge_id = challenge_row.id
    ),
    drink_events as (
      select
        joined_users.user_id,
        sessions.id as session_id,
        public.beerva_serving_volume_ml(session_beers.volume)
          * greatest(coalesce(session_beers.quantity, 1), 0)
          / 568.0 as true_pints,
        greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
        session_beers.abv
      from joined_users
      join public.sessions on sessions.user_id = joined_users.user_id
        and sessions.status = 'published'
      join public.session_beers on session_beers.session_id = sessions.id
      where coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
      union all
      select
        joined_users.user_id,
        sessions.id as session_id,
        public.beerva_serving_volume_ml(sessions.volume)
          * greatest(coalesce(sessions.quantity, 1), 0)
          / 568.0 as true_pints,
        greatest(coalesce(sessions.quantity, 1), 0) as quantity,
        sessions.abv
      from joined_users
      join public.sessions on sessions.user_id = joined_users.user_id
        and sessions.status = 'published'
      where coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
        and not exists (
          select 1
          from public.session_beers
          where session_beers.session_id = sessions.id
        )
    ),
    participant_stats as (
      select
        drink_events.user_id,
        coalesce(sum(drink_events.true_pints), 0)::double precision as true_pints,
        coalesce(sum(drink_events.quantity), 0)::integer as drink_count,
        round((
          sum(drink_events.abv * drink_events.quantity) filter (where drink_events.abv is not null)
          / nullif(sum(drink_events.quantity) filter (where drink_events.abv is not null), 0)
        )::numeric, 1)::double precision as average_abv,
        count(distinct drink_events.session_id)::integer as session_count
      from drink_events
      group by drink_events.user_id
    )
    select
      participant_stats.user_id,
      profiles.username,
      profiles.avatar_url,
      participant_stats.true_pints,
      participant_stats.drink_count,
      participant_stats.average_abv,
      participant_stats.session_count
    into
      abv_user_id,
      abv_username,
      abv_avatar_url,
      abv_true_pints,
      abv_drink_count,
      abv_average_abv,
      abv_session_count
    from participant_stats
    left join public.profiles on profiles.id = participant_stats.user_id
    where participant_stats.average_abv is not null
      and participant_stats.drink_count > 0
    order by
      participant_stats.average_abv desc,
      participant_stats.true_pints desc,
      participant_stats.drink_count desc,
      participant_stats.user_id asc
    limit 1;

    if pint_user_id is null
      or pint_true_pints is null
      or pint_true_pints <= 0 then
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
    end if;

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
      pint_user_id,
      'king-of-karneval-pints',
      'King of Karneval',
      'Congrats, you outperformed everyone else by being an absolute legend.',
      1,
      pint_true_pints,
      jsonb_build_object(
        'award_category', 'pints',
        'challenge_slug', challenge_row.slug,
        'true_pints', round(pint_true_pints::numeric, 1),
        'drink_count', coalesce(pint_drink_count, 0),
        'average_abv', coalesce(pint_average_abv, 0),
        'session_count', coalesce(pint_session_count, 0)
      ),
      final_time
    )
    on conflict (challenge_id, user_id, award_slug) do update set
      title = excluded.title,
      description = excluded.description,
      rank = excluded.rank,
      progress_value = excluded.progress_value,
      metadata = excluded.metadata,
      awarded_at = excluded.awarded_at
    returning id into pint_award_row_id;

    if abv_user_id is not null then
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
        abv_user_id,
        'king-of-karneval-abv',
        'King of Karneval',
        'Are you ok? You had the highest ABV-average',
        1,
        abv_average_abv,
        jsonb_build_object(
          'award_category', 'average_abv',
          'challenge_slug', challenge_row.slug,
          'average_abv', round(abv_average_abv::numeric, 1),
          'true_pints', round(coalesce(abv_true_pints, 0)::numeric, 1),
          'drink_count', coalesce(abv_drink_count, 0),
          'session_count', coalesce(abv_session_count, 0)
        ),
        final_time
      )
      on conflict (challenge_id, user_id, award_slug) do update set
        title = excluded.title,
        description = excluded.description,
        rank = excluded.rank,
        progress_value = excluded.progress_value,
        metadata = excluded.metadata,
        awarded_at = excluded.awarded_at
      returning id into abv_award_row_id;
    end if;

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
      'Kings of Karneval 2026',
      coalesce(pint_username, 'Beer Lover')
        || ' won King of Karneval for total pints with '
        || round(pint_true_pints::numeric, 1)::text
        || ' true pints.'
        || case
          when abv_user_id is null then ''
          else ' ' || coalesce(abv_username, 'Beer Lover')
            || ' won King of Karneval for highest average ABV at '
            || round(abv_average_abv::numeric, 1)::text
            || '%.'
        end,
      jsonb_build_object(
        'winner_user_id', pint_user_id,
        'winner_username', pint_username,
        'winner_avatar_url', pint_avatar_url,
        'true_pints', round(pint_true_pints::numeric, 1),
        'drink_count', coalesce(pint_drink_count, 0),
        'average_abv', coalesce(pint_average_abv, 0),
        'session_count', coalesce(pint_session_count, 0),
        'pint_winner_user_id', pint_user_id,
        'pint_winner_username', pint_username,
        'pint_winner_avatar_url', pint_avatar_url,
        'pint_winner_true_pints', round(pint_true_pints::numeric, 1),
        'abv_winner_user_id', abv_user_id,
        'abv_winner_username', abv_username,
        'abv_winner_avatar_url', abv_avatar_url,
        'abv_winner_average_abv', case
          when abv_average_abv is null then null
          else round(abv_average_abv::numeric, 1)
        end,
        'abv_winner_true_pints', case
          when abv_true_pints is null then null
          else round(abv_true_pints::numeric, 1)
        end,
        'challenge_slug', challenge_row.slug
      ),
      final_time
    )
    on conflict (challenge_id, kind) do update set
      title = excluded.title,
      body = excluded.body,
      metadata = excluded.metadata,
      published_at = excluded.published_at
    returning id into post_row_id;

    update public.challenges
    set finalized_at = final_time,
        winner_user_id = pint_user_id,
        winner_progress_value = pint_true_pints
    where id = challenge_row.id;

    challenge_id := challenge_row.id;
    challenge_slug := challenge_row.slug;
    winner_user_id := pint_user_id;
    winner_progress_value := pint_true_pints;
    award_id := pint_award_row_id;
    official_post_id := post_row_id;
    finalized_at := final_time;
    return next;
  end loop;
end;
$$;

revoke execute on function public.finalize_due_challenges(integer) from public, anon, authenticated;
grant execute on function public.finalize_due_challenges(integer) to service_role;

comment on function public.finalize_due_challenges(integer) is 'Finalizes the real KarnevalsDruk challenge, awarding King of Karneval trophies for total pints and highest average ABV.';

notify pgrst, 'reload schema';
