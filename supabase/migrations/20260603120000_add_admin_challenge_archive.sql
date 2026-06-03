alter table public.challenges
  add column if not exists archived_at timestamp with time zone,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists challenges_unarchived_window_idx
  on public.challenges(starts_at desc, ends_at desc)
  where archived_at is null;

drop policy if exists "Signed-in users can view official challenges" on public.challenges;
create policy "Signed-in users can view official challenges"
  on public.challenges
  for select
  to authenticated
  using (archived_at is null);

create or replace function public.admin_archive_challenge(target_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select challenges.*
  into challenge_row
  from public.challenges
  where challenges.id = target_challenge_id
  for update;

  if challenge_row.id is null then
    raise exception 'Challenge not found.';
  end if;

  if challenge_row.archived_at is not null then
    return challenge_row;
  end if;

  if challenge_row.ends_at > now() then
    raise exception 'Only ended challenges can be archived.';
  end if;

  update public.challenges
  set
    archived_at = now(),
    archived_by = auth.uid()
  where challenges.id = target_challenge_id
  returning * into challenge_row;

  return challenge_row;
end;
$$;

create or replace function public.admin_restore_challenge(target_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select challenges.*
  into challenge_row
  from public.challenges
  where challenges.id = target_challenge_id
  for update;

  if challenge_row.id is null then
    raise exception 'Challenge not found.';
  end if;

  if challenge_row.archived_at is null then
    return challenge_row;
  end if;

  update public.challenges
  set
    archived_at = null,
    archived_by = null
  where challenges.id = target_challenge_id
  returning * into challenge_row;

  return challenge_row;
end;
$$;

create or replace function public.join_challenge(target_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a challenge.';
  end if;

  if not exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and challenges.archived_at is null
      and now() < challenges.join_closes_at
  ) then
    raise exception 'This challenge is closed for joining.';
  end if;

  insert into public.challenge_entries(challenge_id, user_id)
  values (target_challenge_id, auth.uid())
  on conflict (challenge_id, user_id) do nothing;
end;
$$;

create or replace function public.get_challenge_leaderboard(target_challenge_id uuid)
returns table (
  rank integer,
  user_id uuid,
  username text,
  avatar_url text,
  progress_value double precision,
  completed boolean
)
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select *
    from public.challenges
    where challenges.id = target_challenge_id
      and challenges.archived_at is null
  ),
  joined_users as (
    select
      challenge_entries.user_id,
      challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
  ),
  beer_events as (
    select
      joined_users.user_id,
      public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 0)
        / 568.0 as true_pints
    from joined_users
    join target_challenge on true
    join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
    join public.session_beers on session_beers.session_id = sessions.id
    where coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < target_challenge.ends_at
  ),
  legacy_session_events as (
    select
      joined_users.user_id,
      public.beerva_serving_volume_ml(sessions.volume)
        * greatest(coalesce(sessions.quantity, 1), 0)
        / 568.0 as true_pints
    from joined_users
    join target_challenge on true
    join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
    where coalesce(sessions.started_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(sessions.started_at, sessions.created_at) < target_challenge.ends_at
      and not exists (
        select 1
        from public.session_beers
        where session_beers.session_id = sessions.id
      )
  ),
  beverage_progress as (
    select
      drink_events.user_id,
      sum(drink_events.true_pints) as progress_value
    from (
      select beer_events.user_id, beer_events.true_pints
      from beer_events
      union all
      select legacy_session_events.user_id, legacy_session_events.true_pints
      from legacy_session_events
    ) drink_events
    group by drink_events.user_id
  ),
  ranked as (
    select
      row_number() over (
        order by coalesce(beverage_progress.progress_value, 0) desc, joined_users.joined_at asc, joined_users.user_id asc
      )::integer as rank,
      joined_users.user_id,
      profiles.username,
      profiles.avatar_url,
      coalesce(beverage_progress.progress_value, 0)::double precision as progress_value,
      case
        when target_challenge.challenge_type = 'leaderboard' then false
        else coalesce(beverage_progress.progress_value, 0) >= target_challenge.target_value
      end as completed
    from joined_users
    join target_challenge on true
    left join beverage_progress on beverage_progress.user_id = joined_users.user_id
    left join public.profiles on profiles.id = joined_users.user_id
  )
  select
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.avatar_url,
    ranked.progress_value,
    ranked.completed
  from ranked
  order by ranked.rank asc;
$$;

create or replace function public.get_official_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  metric_type text,
  challenge_type text,
  target_value numeric,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  join_closes_at timestamp with time zone,
  joined_at timestamp with time zone,
  entrants_count integer,
  current_user_rank integer,
  current_user_progress double precision
)
language sql
stable
set search_path = public
as $$
  with viewer as (
    select (select auth.uid()) as user_id
  ),
  local_users as (
    select viewer.user_id
    from viewer
    where viewer.user_id is not null
    union
    select outgoing_follow.following_id
    from viewer
    join public.follows as outgoing_follow
      on outgoing_follow.follower_id = viewer.user_id
    join public.follows as incoming_follow
      on incoming_follow.follower_id = outgoing_follow.following_id
     and incoming_follow.following_id = viewer.user_id
  ),
  local_entries as (
    select
      challenge_entries.challenge_id,
      challenge_entries.user_id,
      challenge_entries.joined_at
    from local_users
    join public.challenge_entries as challenge_entries
      on challenge_entries.user_id = local_users.user_id
  ),
  beer_events as (
    select
      local_entries.challenge_id,
      local_entries.user_id,
      public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 0)
        / 568.0 as true_pints
    from local_entries
    join public.challenges as challenges
      on challenges.id = local_entries.challenge_id
     and challenges.archived_at is null
    join public.sessions as sessions
      on sessions.user_id = local_entries.user_id
     and sessions.status = 'published'
    join public.session_beers as session_beers
      on session_beers.session_id = sessions.id
    where coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenges.starts_at
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenges.ends_at
  ),
  legacy_session_events as (
    select
      local_entries.challenge_id,
      local_entries.user_id,
      public.beerva_serving_volume_ml(sessions.volume)
        * greatest(coalesce(sessions.quantity, 1), 0)
        / 568.0 as true_pints
    from local_entries
    join public.challenges as challenges
      on challenges.id = local_entries.challenge_id
     and challenges.archived_at is null
    join public.sessions as sessions
      on sessions.user_id = local_entries.user_id
     and sessions.status = 'published'
    where coalesce(sessions.started_at, sessions.created_at) >= challenges.starts_at
      and coalesce(sessions.started_at, sessions.created_at) < challenges.ends_at
      and not exists (
        select 1
        from public.session_beers
        where session_beers.session_id = sessions.id
      )
  ),
  beverage_progress as (
    select
      drink_events.challenge_id,
      drink_events.user_id,
      sum(drink_events.true_pints) as progress_value
    from (
      select beer_events.challenge_id, beer_events.user_id, beer_events.true_pints
      from beer_events
      union all
      select legacy_session_events.challenge_id, legacy_session_events.user_id, legacy_session_events.true_pints
      from legacy_session_events
    ) as drink_events
    group by drink_events.challenge_id, drink_events.user_id
  ),
  ranked_local_entries as (
    select
      local_entries.challenge_id,
      row_number() over (
        partition by local_entries.challenge_id
        order by coalesce(beverage_progress.progress_value, 0) desc, local_entries.joined_at asc, local_entries.user_id asc
      )::integer as rank,
      local_entries.user_id,
      coalesce(beverage_progress.progress_value, 0)::double precision as progress_value
    from local_entries
    left join beverage_progress
      on beverage_progress.challenge_id = local_entries.challenge_id
     and beverage_progress.user_id = local_entries.user_id
  ),
  local_challenge_rollups as (
    select
      challenges.id,
      count(ranked_local_entries.user_id)::integer as entrants_count
    from public.challenges
    left join ranked_local_entries
      on ranked_local_entries.challenge_id = challenges.id
    where challenges.archived_at is null
    group by challenges.id
  ),
  current_user_entries as (
    select
      local_entries.challenge_id,
      local_entries.joined_at
    from local_entries
    where local_entries.user_id = (select viewer.user_id from viewer)
  ),
  local_current_user_ranks as (
    select
      ranked_local_entries.challenge_id,
      ranked_local_entries.rank,
      ranked_local_entries.progress_value
    from ranked_local_entries
    where ranked_local_entries.user_id = (select viewer.user_id from viewer)
  )
  select
    challenges.id,
    challenges.slug,
    challenges.title,
    challenges.description,
    challenges.metric_type,
    challenges.challenge_type,
    challenges.target_value,
    challenges.starts_at,
    challenges.ends_at,
    challenges.join_closes_at,
    current_user_entries.joined_at,
    coalesce(local_challenge_rollups.entrants_count, 0) as entrants_count,
    local_current_user_ranks.rank as current_user_rank,
    local_current_user_ranks.progress_value as current_user_progress
  from public.challenges
  left join local_challenge_rollups
    on local_challenge_rollups.id = challenges.id
  left join current_user_entries
    on current_user_entries.challenge_id = challenges.id
  left join local_current_user_ranks
    on local_current_user_ranks.challenge_id = challenges.id
  where challenges.archived_at is null
  order by
    case
      when now() >= challenges.starts_at and now() < challenges.ends_at then 0
      when now() < challenges.starts_at then 1
      else 2
    end,
    challenges.starts_at desc;
$$;

create or replace function public.get_challenge_detail(target_challenge_slug text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select *
    from public.challenges
    where (
        challenges.slug = target_challenge_slug
        or challenges.id::text = target_challenge_slug
      )
      and challenges.archived_at is null
    limit 1
  ),
  current_user_entry as (
    select challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge
      on target_challenge.id = challenge_entries.challenge_id
    where challenge_entries.user_id = (select auth.uid())
  ),
  global_leaderboard as (
    select global_rows.*
    from target_challenge
    cross join lateral public.get_challenge_leaderboard(target_challenge.id) as global_rows
  ),
  local_leaderboard as (
    select
      row_number() over (
        order by global_leaderboard.rank asc
      )::integer as rank,
      global_leaderboard.user_id,
      global_leaderboard.username,
      global_leaderboard.avatar_url,
      global_leaderboard.progress_value,
      global_leaderboard.completed
    from global_leaderboard
    where global_leaderboard.user_id = (select auth.uid())
       or public.is_mutual_follower((select auth.uid()), global_leaderboard.user_id)
  ),
  local_scope as (
    select
      count(*)::integer as entrants_count,
      max(local_leaderboard.rank)
        filter (where local_leaderboard.user_id = (select auth.uid())) as current_user_rank,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', local_leaderboard.rank,
            'user_id', local_leaderboard.user_id,
            'username', local_leaderboard.username,
            'avatar_url', local_leaderboard.avatar_url,
            'progress_value', local_leaderboard.progress_value,
            'completed', local_leaderboard.completed
          )
          order by local_leaderboard.rank asc
        ) filter (where local_leaderboard.user_id is not null),
        '[]'::jsonb
      ) as leaderboard
    from local_leaderboard
  ),
  global_scope as (
    select
      count(*)::integer as entrants_count,
      max(global_leaderboard.rank)
        filter (where global_leaderboard.user_id = (select auth.uid())) as current_user_rank,
      max(global_leaderboard.progress_value)
        filter (where global_leaderboard.user_id = (select auth.uid())) as current_user_progress,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', global_leaderboard.rank,
            'user_id', global_leaderboard.user_id,
            'username', global_leaderboard.username,
            'avatar_url', global_leaderboard.avatar_url,
            'progress_value', global_leaderboard.progress_value,
            'completed', global_leaderboard.completed
          )
          order by global_leaderboard.rank asc
        ) filter (where global_leaderboard.user_id is not null),
        '[]'::jsonb
      ) as leaderboard
    from global_leaderboard
  )
  select jsonb_build_object(
    'id', target_challenge.id,
    'slug', target_challenge.slug,
    'title', target_challenge.title,
    'description', target_challenge.description,
    'metric_type', target_challenge.metric_type,
    'challenge_type', target_challenge.challenge_type,
    'target_value', target_challenge.target_value,
    'starts_at', target_challenge.starts_at,
    'ends_at', target_challenge.ends_at,
    'join_closes_at', target_challenge.join_closes_at,
    'joined_at', (select joined_at from current_user_entry),
    'entrants_count', local_scope.entrants_count,
    'current_user_rank', local_scope.current_user_rank,
    'current_user_progress', global_scope.current_user_progress,
    'leaderboard', local_scope.leaderboard,
    'leaderboards', jsonb_build_object(
      'local', jsonb_build_object(
        'entrants_count', local_scope.entrants_count,
        'current_user_rank', local_scope.current_user_rank,
        'leaderboard', local_scope.leaderboard
      ),
      'global', jsonb_build_object(
        'entrants_count', global_scope.entrants_count,
        'current_user_rank', global_scope.current_user_rank,
        'leaderboard', global_scope.leaderboard
      )
    )
  )
  from target_challenge
  cross join local_scope
  cross join global_scope;
$$;

create or replace function public.finalize_generic_due_challenges(batch_size integer default 10)
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
  award_row_id uuid;
  post_row_id uuid;
  final_time timestamp with time zone;
begin
  for challenge_row in
    select challenges.*
    from public.challenges as challenges
    where challenges.challenge_type = 'leaderboard'
      and challenges.slug <> 'karnevalsdruk-2026'
      and challenges.ends_at <= now()
      and challenges.finalized_at is null
      and challenges.archived_at is null
    order by challenges.ends_at asc
    limit least(greatest(coalesce(batch_size, 10), 1), 50)
  loop
    final_time := now();
    award_row_id := null;
    post_row_id := null;

    select leaderboard.*
    into leader_row
    from public.get_challenge_leaderboard(challenge_row.id) as leaderboard
    order by leaderboard.rank asc
    limit 1;

    if leader_row.user_id is null
      or leader_row.progress_value is null
      or leader_row.progress_value <= 0 then
      update public.challenges
      set
        finalized_at = final_time,
        winner_user_id = null,
        winner_progress_value = null
      where challenges.id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := null;
      winner_progress_value := null;
      award_id := null;
      official_post_id := null;
      finalized_at := final_time;
      return next;
      continue;
    end if;

    select
      coalesce(sum(drink_events.quantity), 0)::integer as drink_count,
      round((
        sum(drink_events.abv * drink_events.quantity) filter (where drink_events.abv is not null)
        / nullif(sum(drink_events.quantity) filter (where drink_events.abv is not null), 0)
      )::numeric, 1)::double precision as average_abv,
      count(distinct drink_events.session_id)::integer as session_count
    into stats_row
    from (
      select
        sessions.id as session_id,
        greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
        session_beers.abv
      from public.sessions
      join public.session_beers on session_beers.session_id = sessions.id
      where sessions.user_id = leader_row.user_id
        and sessions.status = 'published'
        and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
      union all
      select
        sessions.id as session_id,
        greatest(coalesce(sessions.quantity, 1), 0) as quantity,
        sessions.abv
      from public.sessions
      where sessions.user_id = leader_row.user_id
        and sessions.status = 'published'
        and coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
        and not exists (
          select 1
          from public.session_beers
          where session_beers.session_id = sessions.id
        )
    ) as drink_events;

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
      'Winner of ' || challenge_row.title,
      coalesce(leader_row.username, 'Beer Lover')
        || ' won '
        || challenge_row.title
        || ' with '
        || round(leader_row.progress_value::numeric, 1)::text
        || ' true pints.',
      jsonb_build_object(
        'winner_user_id', leader_row.user_id,
        'winner_username', leader_row.username,
        'winner_avatar_url', leader_row.avatar_url,
        'true_pints', round(leader_row.progress_value::numeric, 1),
        'drink_count', coalesce(stats_row.drink_count, 0),
        'average_abv', coalesce(stats_row.average_abv, 0),
        'session_count', coalesce(stats_row.session_count, 0),
        'challenge_slug', challenge_row.slug
      ),
      final_time
    )
    on conflict on constraint official_feed_posts_challenge_id_kind_key do update set
      title = excluded.title,
      body = excluded.body,
      metadata = excluded.metadata,
      published_at = excluded.published_at
    returning id into post_row_id;

    if challenge_row.winner_trophy_enabled then
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
        challenge_row.slug || '-winner',
        challenge_row.winner_trophy_title,
        challenge_row.winner_trophy_description,
        1,
        leader_row.progress_value,
        jsonb_build_object(
          'award_category', 'winner',
          'challenge_slug', challenge_row.slug,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0)
        ),
        final_time
      )
      on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key do update set
        title = excluded.title,
        description = excluded.description,
        rank = excluded.rank,
        progress_value = excluded.progress_value,
        metadata = excluded.metadata,
        awarded_at = excluded.awarded_at
      returning id into award_row_id;
    end if;

    update public.challenges
    set
      finalized_at = final_time,
      winner_user_id = leader_row.user_id,
      winner_progress_value = leader_row.progress_value
    where challenges.id = challenge_row.id;

    challenge_id := challenge_row.id;
    challenge_slug := challenge_row.slug;
    winner_user_id := leader_row.user_id;
    winner_progress_value := leader_row.progress_value;
    award_id := award_row_id;
    official_post_id := post_row_id;
    finalized_at := final_time;
    return next;
  end loop;
end;
$$;

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
  post_row_id uuid;
  final_time timestamp with time zone;
begin
  for challenge_row in
    select challenges.*
    from public.challenges as challenges
    where challenges.challenge_type = 'leaderboard'
      and challenges.slug = 'karnevalsdruk-2026'
      and challenges.ends_at <= now()
      and challenges.finalized_at is null
      and challenges.archived_at is null
    order by challenges.ends_at asc
    limit least(greatest(coalesce(batch_size, 10), 1), 50)
  loop
    final_time := now();
    pint_award_row_id := null;
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
    from public.get_challenge_leaderboard(challenge_row.id) as leaderboard
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
        from public.sessions as sessions
        join public.session_beers as session_beers on session_beers.session_id = sessions.id
        where sessions.user_id = leaderboard.user_id
          and sessions.status = 'published'
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
        union all
        select
          sessions.id as session_id,
          greatest(coalesce(sessions.quantity, 1), 0) as quantity,
          sessions.abv
        from public.sessions as sessions
        where sessions.user_id = leaderboard.user_id
          and sessions.status = 'published'
          and coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
          and not exists (
            select 1
            from public.session_beers as session_beers
            where session_beers.session_id = sessions.id
          )
      ) as drink_events
    ) as pint_stats on true
    order by leaderboard.rank asc
    limit 1;

    with joined_users as (
      select challenge_entries.user_id
      from public.challenge_entries as challenge_entries
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
      join public.sessions as sessions on sessions.user_id = joined_users.user_id
        and sessions.status = 'published'
      join public.session_beers as session_beers on session_beers.session_id = sessions.id
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
      join public.sessions as sessions on sessions.user_id = joined_users.user_id
        and sessions.status = 'published'
      where coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
        and not exists (
          select 1
          from public.session_beers as session_beers
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
    left join public.profiles as profiles on profiles.id = participant_stats.user_id
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
      update public.challenges as challenges
      set finalized_at = final_time,
          winner_user_id = null,
          winner_progress_value = null
      where challenges.id = challenge_row.id;

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
    on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key do update set
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
      on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key do update set
        title = excluded.title,
        description = excluded.description,
        rank = excluded.rank,
        progress_value = excluded.progress_value,
        metadata = excluded.metadata,
        awarded_at = excluded.awarded_at;
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
    on conflict on constraint official_feed_posts_challenge_id_kind_key do update set
      title = excluded.title,
      body = excluded.body,
      metadata = excluded.metadata,
      published_at = excluded.published_at
    returning id into post_row_id;

    update public.challenges as challenges
    set finalized_at = final_time,
        winner_user_id = pint_user_id,
        winner_progress_value = pint_true_pints
    where challenges.id = challenge_row.id;

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

revoke execute on function public.admin_archive_challenge(uuid) from public, anon;
revoke execute on function public.admin_restore_challenge(uuid) from public, anon;
grant execute on function public.admin_archive_challenge(uuid) to authenticated;
grant execute on function public.admin_restore_challenge(uuid) to authenticated;

revoke execute on function public.join_challenge(uuid) from public, anon;
revoke execute on function public.get_challenge_leaderboard(uuid) from public, anon;
revoke execute on function public.get_official_challenges() from public, anon;
revoke execute on function public.get_challenge_detail(text) from public, anon;
grant execute on function public.join_challenge(uuid) to authenticated;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;
grant execute on function public.get_challenge_detail(text) to authenticated;

revoke execute on function public.finalize_due_challenges(integer) from public, anon, authenticated;
revoke execute on function public.finalize_generic_due_challenges(integer) from public, anon, authenticated;
grant execute on function public.finalize_due_challenges(integer) to service_role;
grant execute on function public.finalize_generic_due_challenges(integer) to service_role;

comment on column public.challenges.archived_at
  is 'When set, hides the challenge from normal app challenge surfaces while preserving history for admins.';
comment on column public.challenges.archived_by
  is 'Admin user who archived the challenge most recently.';
comment on function public.admin_archive_challenge(uuid)
  is 'Admin-only RPC that hides an ended challenge without deleting challenge history.';
comment on function public.admin_restore_challenge(uuid)
  is 'Admin-only RPC that restores an archived challenge to normal app challenge surfaces.';

notify pgrst, 'reload schema';
