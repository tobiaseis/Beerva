alter table public.challenges
  drop constraint if exists challenges_metric_type_check;

alter table public.challenges
  add constraint challenges_metric_type_check
  check (metric_type in ('true_pints', 'alcohol_units'));

create or replace function public.beerva_challenge_progress_value(
  challenge_metric_type text,
  serving_volume text,
  quantity_value numeric,
  abv_value numeric
)
returns double precision
language sql
immutable
set search_path = public
as $$
  select case
    when challenge_metric_type = 'alcohol_units' then
      (
        public.beerva_serving_volume_ml(serving_volume)
        * greatest(coalesce(quantity_value, 1), 0)::double precision
        * (greatest(coalesce(abv_value, 0), 0)::double precision / 100.0)
        * 0.789
        / 12.0
      )::double precision
    else
      (
        public.beerva_serving_volume_ml(serving_volume)
        * greatest(coalesce(quantity_value, 1), 0)::double precision
        / 568.0
      )::double precision
  end;
$$;

comment on function public.beerva_challenge_progress_value(text, text, numeric, numeric) is
  'Calculates challenge progress for true-pint and Danish alcohol-unit challenge metrics.';

grant execute on function public.beerva_challenge_progress_value(text, text, numeric, numeric) to authenticated;

update public.challenges
set metric_type = 'alcohol_units'
where challenge_type = 'target'
  and finalized_at is null
  and ends_at > now();

create or replace function public.admin_save_challenge(
  target_challenge_id uuid default null,
  challenge_title text default null,
  challenge_description text default null,
  target_challenge_type text default null,
  challenge_target_value numeric default null,
  challenge_starts_at timestamp with time zone default null,
  challenge_ends_at timestamp with time zone default null,
  challenge_join_closes_at timestamp with time zone default null,
  challenge_winner_trophy_enabled boolean default false,
  challenge_winner_trophy_title text default null,
  challenge_winner_trophy_description text default null,
  challenge_request_key uuid default null
)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_title text := btrim(coalesce(challenge_title, ''));
  clean_description text := btrim(coalesce(challenge_description, ''));
  clean_trophy_title text := nullif(btrim(coalesce(challenge_winner_trophy_title, '')), '');
  clean_trophy_description text := nullif(btrim(coalesce(challenge_winner_trophy_description, '')), '');
  saved_row public.challenges;
  existing_row public.challenges;
  generated_slug text;
  has_entries boolean := false;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if clean_title = '' then
    raise exception 'Challenge title is required.';
  end if;

  if clean_description = '' then
    raise exception 'Challenge description is required.';
  end if;

  if target_challenge_type not in ('target', 'leaderboard') then
    raise exception 'Challenge type must be target or leaderboard.';
  end if;

  if challenge_starts_at is null
    or challenge_ends_at is null
    or challenge_join_closes_at is null then
    raise exception 'Challenge dates are required.';
  end if;

  if challenge_starts_at >= challenge_ends_at then
    raise exception 'Challenge end must be after its start.';
  end if;

  if challenge_join_closes_at < challenge_starts_at
    or challenge_join_closes_at > challenge_ends_at then
    raise exception 'Joining must close between the challenge start and end.';
  end if;

  if target_challenge_type = 'target' then
    if challenge_target_value is null or challenge_target_value <= 0 then
      raise exception 'Target units must be greater than 0.';
    end if;

    if challenge_winner_trophy_enabled
      or clean_trophy_title is not null
      or clean_trophy_description is not null then
      raise exception 'Winner trophies are only available for leaderboard challenges.';
    end if;

    challenge_winner_trophy_enabled := false;
    clean_trophy_title := null;
    clean_trophy_description := null;
  else
    challenge_target_value := null;
  end if;

  if challenge_winner_trophy_enabled
    and (clean_trophy_title is null or clean_trophy_description is null) then
    raise exception 'Winner trophy title and description are required.';
  end if;

  if not challenge_winner_trophy_enabled then
    clean_trophy_title := null;
    clean_trophy_description := null;
  end if;

  if target_challenge_id is null then
    if challenge_request_key is not null then
      select challenges.*
      into saved_row
      from public.challenges
      where challenges.admin_request_key = challenge_request_key;

      if saved_row.id is not null then
        return saved_row;
      end if;
    end if;

    generated_slug := btrim(
      regexp_replace(lower(clean_title), '[^a-z0-9]+', '-', 'g'),
      '-'
    );
    generated_slug := coalesce(nullif(generated_slug, ''), 'challenge')
      || '-'
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

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
      winner_trophy_enabled,
      winner_trophy_title,
      winner_trophy_description,
      admin_request_key
    ) values (
      generated_slug,
      clean_title,
      clean_description,
      case
        when target_challenge_type = 'target' then 'alcohol_units'
        else 'true_pints'
      end,
      target_challenge_type,
      challenge_target_value,
      challenge_starts_at,
      challenge_ends_at,
      challenge_join_closes_at,
      challenge_winner_trophy_enabled,
      clean_trophy_title,
      clean_trophy_description,
      challenge_request_key
    )
    on conflict (admin_request_key)
      where admin_request_key is not null
      do nothing
    returning * into saved_row;

    if saved_row.id is null and challenge_request_key is not null then
      select challenges.*
      into saved_row
      from public.challenges
      where challenges.admin_request_key = challenge_request_key;
    end if;

    if saved_row.id is null then
      raise exception 'Could not save challenge.';
    end if;

    return saved_row;
  end if;

  select challenges.*
  into existing_row
  from public.challenges
  where challenges.id = target_challenge_id
  for update;

  if existing_row.id is null then
    raise exception 'Challenge not found.';
  end if;

  if existing_row.finalized_at is not null then
    raise exception 'Finalized challenges cannot be edited.';
  end if;

  select exists (
    select 1
    from public.challenge_entries
    where challenge_entries.challenge_id = target_challenge_id
  )
  into has_entries;

  if has_entries and (
    existing_row.challenge_type is distinct from target_challenge_type
    or existing_row.target_value is distinct from challenge_target_value
    or existing_row.starts_at is distinct from challenge_starts_at
    or existing_row.ends_at is distinct from challenge_ends_at
    or existing_row.join_closes_at is distinct from challenge_join_closes_at
    or existing_row.winner_trophy_enabled is distinct from challenge_winner_trophy_enabled
    or existing_row.winner_trophy_title is distinct from clean_trophy_title
    or existing_row.winner_trophy_description is distinct from clean_trophy_description
  ) then
    raise exception 'Competition rules cannot change after people have joined.';
  end if;

  update public.challenges
  set
    title = clean_title,
    description = clean_description,
    metric_type = case
      when target_challenge_type = 'target' then 'alcohol_units'
      else 'true_pints'
    end,
    challenge_type = target_challenge_type,
    target_value = challenge_target_value,
    starts_at = challenge_starts_at,
    ends_at = challenge_ends_at,
    join_closes_at = challenge_join_closes_at,
    winner_trophy_enabled = challenge_winner_trophy_enabled,
    winner_trophy_title = clean_trophy_title,
    winner_trophy_description = clean_trophy_description
  where challenges.id = target_challenge_id
  returning * into saved_row;

  return saved_row;
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
      public.beerva_challenge_progress_value(
        target_challenge.metric_type,
        session_beers.volume,
        session_beers.quantity::numeric,
        session_beers.abv::numeric
      ) as progress_value
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
      public.beerva_challenge_progress_value(
        target_challenge.metric_type,
        sessions.volume,
        sessions.quantity::numeric,
        sessions.abv::numeric
      ) as progress_value
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
      sum(drink_events.progress_value) as progress_value
    from (
      select beer_events.user_id, beer_events.progress_value
      from beer_events
      union all
      select legacy_session_events.user_id, legacy_session_events.progress_value
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
      public.beerva_challenge_progress_value(
        challenges.metric_type,
        session_beers.volume,
        session_beers.quantity::numeric,
        session_beers.abv::numeric
      ) as progress_value
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
      public.beerva_challenge_progress_value(
        challenges.metric_type,
        sessions.volume,
        sessions.quantity::numeric,
        sessions.abv::numeric
      ) as progress_value
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
      sum(drink_events.progress_value) as progress_value
    from (
      select beer_events.challenge_id, beer_events.user_id, beer_events.progress_value
      from beer_events
      union all
      select legacy_session_events.challenge_id, legacy_session_events.user_id, legacy_session_events.progress_value
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

-- KarnevalsDruk finalization is intentionally unchanged; the existing finalizer
-- remains scoped with: where challenges.challenge_type = 'leaderboard'
-- and challenges.slug = 'karnevalsdruk-2026'.

revoke execute on function public.admin_save_challenge(
  uuid,
  text,
  text,
  text,
  numeric,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  uuid
) from public, anon;

grant execute on function public.admin_save_challenge(
  uuid,
  text,
  text,
  text,
  numeric,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  uuid
) to authenticated;

revoke execute on function public.get_challenge_leaderboard(uuid) from public, anon;
revoke execute on function public.get_official_challenges() from public, anon;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;

notify pgrst, 'reload schema';
