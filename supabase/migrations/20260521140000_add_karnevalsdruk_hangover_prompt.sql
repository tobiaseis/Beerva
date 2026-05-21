create or replace function public.is_karnevalsdruk_hangover_target(
  target_user_id uuid,
  target_published_at timestamp with time zone
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenges as challenges
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = challenges.id
      and challenge_entries.user_id = target_user_id
    where challenges.slug = 'karnevalsdruk-2026'
      and target_published_at >= challenges.starts_at
      and target_published_at < challenges.ends_at
  );
$$;

create or replace function public.is_karnevalsdruk_event_window_target(
  target_published_at timestamp with time zone
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenges as challenges
    where challenges.slug = 'karnevalsdruk-2026'
      and target_published_at >= challenges.starts_at
      and target_published_at < challenges.ends_at
  );
$$;

create or replace function public.create_hangover_prompt_for_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_timezone text;
  resolved_prompt_at timestamp with time zone;
  resolved_drinking_day date;
  target_published_at timestamp with time zone;
begin
  if new.status <> 'published' or coalesce(new.hide_from_feed, false) then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  target_published_at := coalesce(new.published_at, new.ended_at, new.created_at);

  if public.is_karnevalsdruk_event_window_target(target_published_at) then
    return new;
  end if;

  resolved_timezone := public.resolve_hangover_timezone(new.timezone, new.user_id);

  select details.prompt_at, details.drinking_day
  into resolved_prompt_at, resolved_drinking_day
  from public.calculate_hangover_prompt_details(
    target_published_at,
    resolved_timezone
  ) details
  limit 1;

  if resolved_prompt_at is null or resolved_drinking_day is null then
    return new;
  end if;

  insert into public.hangover_prompts (user_id, session_id, prompt_at, drinking_day)
  values (new.user_id, new.id, resolved_prompt_at, resolved_drinking_day)
  on conflict (user_id, drinking_day) where drinking_day is not null do nothing;

  return new;
end;
$$;

create or replace function public.create_hangover_prompt_for_pub_crawl()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_timezone text;
  resolved_prompt_at timestamp with time zone;
  resolved_drinking_day date;
  target_published_at timestamp with time zone;
begin
  if new.status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  target_published_at := coalesce(new.published_at, new.ended_at, new.created_at);

  if public.is_karnevalsdruk_event_window_target(target_published_at) then
    return new;
  end if;

  resolved_timezone := public.resolve_hangover_timezone(new.timezone, new.user_id);

  select details.prompt_at, details.drinking_day
  into resolved_prompt_at, resolved_drinking_day
  from public.calculate_hangover_prompt_details(
    target_published_at,
    resolved_timezone
  ) details
  limit 1;

  if resolved_prompt_at is null or resolved_drinking_day is null then
    return new;
  end if;

  insert into public.hangover_prompts (user_id, pub_crawl_id, prompt_at, drinking_day)
  values (new.user_id, new.id, resolved_prompt_at, resolved_drinking_day)
  on conflict (user_id, drinking_day) where drinking_day is not null do nothing;

  return new;
end;
$$;

create or replace function public.suppress_karnevalsdruk_normal_hangover_prompts(
  target_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
<<suppress_scope>>
declare
  suppressed_prompt_count integer := 0;
begin
  with target_challenge as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at,
      timezone('Europe/Copenhagen', challenges.starts_at)::date as event_drinking_day,
      (
        timezone('Europe/Copenhagen', challenges.ends_at)::date
        + time '11:00'
      ) at time zone 'Europe/Copenhagen' as event_prompt_at
    from public.challenges as challenges
    where challenges.slug = 'karnevalsdruk-2026'
    limit 1
  ),
  joined_users as (
    select distinct challenge_entries.user_id
    from target_challenge
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = target_challenge.id
    where suppress_scope.target_user_id is null
      or challenge_entries.user_id = suppress_scope.target_user_id
  ),
  event_targets as (
    select
      joined_users.user_id,
      sessions.id as session_id,
      null::uuid as pub_crawl_id,
      target_challenge.event_drinking_day,
      target_challenge.event_prompt_at
    from target_challenge
    join joined_users on true
    join public.sessions as sessions
      on sessions.user_id = joined_users.user_id
    where sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < target_challenge.ends_at

    union all

    select
      joined_users.user_id,
      null::uuid as session_id,
      pub_crawls.id as pub_crawl_id,
      target_challenge.event_drinking_day,
      target_challenge.event_prompt_at
    from target_challenge
    join joined_users on true
    join public.pub_crawls as pub_crawls
      on pub_crawls.user_id = joined_users.user_id
    where pub_crawls.status = 'published'
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= target_challenge.starts_at
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < target_challenge.ends_at
  ),
  suppressed_prompts as (
    update public.hangover_prompts as hangover_prompts
    set drinking_day = null,
        completed_at = coalesce(hangover_prompts.completed_at, now()),
        last_error = 'Superseded by KarnevalsDruk grouped hangover prompt.'
    from event_targets
    where hangover_prompts.user_id = event_targets.user_id
      and hangover_prompts.sent_at is null
      and hangover_prompts.completed_at is null
      and (
        (event_targets.session_id is not null and hangover_prompts.session_id = event_targets.session_id)
        or (event_targets.pub_crawl_id is not null and hangover_prompts.pub_crawl_id = event_targets.pub_crawl_id)
      )
      and not (
        hangover_prompts.drinking_day = event_targets.event_drinking_day
        and hangover_prompts.prompt_at = event_targets.event_prompt_at
      )
    returning 1
  )
  select count(*)
  into suppressed_prompt_count
  from suppressed_prompts;

  return suppressed_prompt_count;
end;
$$;

create or replace function public.create_karnevalsdruk_hangover_prompts(
  target_challenge_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_prompt_count integer := 0;
begin
  if not exists (
    select 1
    from public.challenges as challenges
    where challenges.id = target_challenge_id
      and challenges.slug = 'karnevalsdruk-2026'
  ) then
    return 0;
  end if;

  perform public.suppress_karnevalsdruk_normal_hangover_prompts(null);

  with target_challenge as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at
    from public.challenges as challenges
    where challenges.id = target_challenge_id
      and challenges.slug = 'karnevalsdruk-2026'
    limit 1
  ),
  eligible_targets as (
    select
      challenge_entries.user_id,
      'session'::text as target_kind,
      sessions.id as target_id,
      sessions.id as session_id,
      null::uuid as pub_crawl_id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) as target_published_at,
      sessions.created_at as target_created_at
    from target_challenge
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = target_challenge.id
    join public.sessions as sessions
      on sessions.user_id = challenge_entries.user_id
    where sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < target_challenge.ends_at

    union all

    select
      challenge_entries.user_id,
      'pub_crawl'::text as target_kind,
      pub_crawls.id as target_id,
      null::uuid as session_id,
      pub_crawls.id as pub_crawl_id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) as target_published_at,
      pub_crawls.created_at as target_created_at
    from target_challenge
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = target_challenge.id
    join public.pub_crawls as pub_crawls
      on pub_crawls.user_id = challenge_entries.user_id
    where pub_crawls.status = 'published'
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= target_challenge.starts_at
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < target_challenge.ends_at
  ),
  representative_targets as (
    select distinct on (eligible_targets.user_id)
      eligible_targets.user_id,
      eligible_targets.session_id,
      eligible_targets.pub_crawl_id
    from eligible_targets
    order by
      eligible_targets.user_id,
      eligible_targets.target_published_at asc,
      eligible_targets.target_created_at asc,
      eligible_targets.target_kind asc,
      eligible_targets.target_id asc
  )
  insert into public.hangover_prompts (
    user_id,
    session_id,
    pub_crawl_id,
    prompt_at,
    drinking_day
  )
  select
    representative_targets.user_id,
    representative_targets.session_id,
    representative_targets.pub_crawl_id,
    (
      timezone('Europe/Copenhagen', target_challenge.ends_at)::date
      + time '11:00'
    ) at time zone 'Europe/Copenhagen',
    timezone('Europe/Copenhagen', target_challenge.starts_at)::date
  from representative_targets
  cross join target_challenge
  on conflict (user_id, drinking_day) where drinking_day is not null do nothing;

  get diagnostics inserted_prompt_count = row_count;
  return inserted_prompt_count;
end;
$$;

create or replace function public.suppress_karnevalsdruk_hangover_prompts_after_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.challenges as challenges
    where challenges.id = new.challenge_id
      and challenges.slug = 'karnevalsdruk-2026'
  ) then
    perform public.suppress_karnevalsdruk_normal_hangover_prompts(new.user_id);
  end if;

  return new;
end;
$$;

create or replace function public.create_karnevalsdruk_hangover_prompts_after_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug = 'karnevalsdruk-2026'
    and old.finalized_at is null
    and new.finalized_at is not null then
    perform public.create_karnevalsdruk_hangover_prompts(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists challenges_create_karnevalsdruk_hangover_prompts_after_finalize on public.challenges;
create trigger challenges_create_karnevalsdruk_hangover_prompts_after_finalize
  after update of finalized_at on public.challenges
  for each row
  execute function public.create_karnevalsdruk_hangover_prompts_after_finalize();

drop trigger if exists challenge_entries_suppress_karnevalsdruk_hangover_prompts_after_join on public.challenge_entries;
create trigger challenge_entries_suppress_karnevalsdruk_hangover_prompts_after_join
  after insert on public.challenge_entries
  for each row
  execute function public.suppress_karnevalsdruk_hangover_prompts_after_join();

select public.create_karnevalsdruk_hangover_prompts(challenges.id)
from public.challenges as challenges
where challenges.slug = 'karnevalsdruk-2026'
  and challenges.finalized_at is not null;

create or replace function public.find_hangover_replacement_session(
  target_user_id uuid,
  target_drinking_day date,
  excluded_session_id uuid default null
)
returns table (
  replacement_session_id uuid
)
language sql
stable
set search_path = public
as $$
  with karnevalsdruk as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at
    from public.challenges as challenges
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = challenges.id
      and challenge_entries.user_id = target_user_id
    where challenges.slug = 'karnevalsdruk-2026'
      and timezone('Europe/Copenhagen', challenges.starts_at)::date = target_drinking_day
    limit 1
  ),
  candidates as (
    select
      sessions.id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) as target_published_at,
      sessions.created_at as target_created_at
    from public.sessions as sessions
    cross join lateral public.calculate_hangover_prompt_details(
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at),
      public.resolve_hangover_timezone(sessions.timezone, sessions.user_id)
    ) details
    where sessions.user_id = target_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and details.drinking_day = target_drinking_day
      and (excluded_session_id is null or sessions.id <> excluded_session_id)

    union

    select
      sessions.id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) as target_published_at,
      sessions.created_at as target_created_at
    from public.sessions as sessions
    join karnevalsdruk on true
    where sessions.user_id = target_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= karnevalsdruk.starts_at
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < karnevalsdruk.ends_at
      and (excluded_session_id is null or sessions.id <> excluded_session_id)
  )
  select candidates.id
  from candidates
  order by
    candidates.target_published_at asc,
    candidates.target_created_at asc,
    candidates.id asc
  limit 1;
$$;

create or replace function public.find_hangover_replacement_pub_crawl(
  target_user_id uuid,
  target_drinking_day date,
  excluded_pub_crawl_id uuid default null
)
returns table (
  replacement_pub_crawl_id uuid
)
language sql
stable
set search_path = public
as $$
  with karnevalsdruk as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at
    from public.challenges as challenges
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = challenges.id
      and challenge_entries.user_id = target_user_id
    where challenges.slug = 'karnevalsdruk-2026'
      and timezone('Europe/Copenhagen', challenges.starts_at)::date = target_drinking_day
    limit 1
  ),
  candidates as (
    select
      pub_crawls.id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) as target_published_at,
      pub_crawls.created_at as target_created_at
    from public.pub_crawls as pub_crawls
    cross join lateral public.calculate_hangover_prompt_details(
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at),
      public.resolve_hangover_timezone(pub_crawls.timezone, pub_crawls.user_id)
    ) details
    where pub_crawls.user_id = target_user_id
      and pub_crawls.status = 'published'
      and details.drinking_day = target_drinking_day
      and (excluded_pub_crawl_id is null or pub_crawls.id <> excluded_pub_crawl_id)

    union

    select
      pub_crawls.id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) as target_published_at,
      pub_crawls.created_at as target_created_at
    from public.pub_crawls as pub_crawls
    join karnevalsdruk on true
    where pub_crawls.user_id = target_user_id
      and pub_crawls.status = 'published'
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= karnevalsdruk.starts_at
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < karnevalsdruk.ends_at
      and (excluded_pub_crawl_id is null or pub_crawls.id <> excluded_pub_crawl_id)
  )
  select candidates.id
  from candidates
  order by
    candidates.target_published_at asc,
    candidates.target_created_at asc,
    candidates.id asc
  limit 1;
$$;

comment on function public.create_karnevalsdruk_hangover_prompts(uuid) is 'Creates one grouped May 24 11am hangover prompt for each joined KarnevalsDruk user with an event-window post.';
comment on function public.suppress_karnevalsdruk_normal_hangover_prompts(uuid) is 'Completes unsent normal hangover prompts for joined KarnevalsDruk users when the grouped event prompt owns the event window.';
comment on function public.is_karnevalsdruk_event_window_target(timestamp with time zone) is 'Checks whether a post timestamp falls inside the official KarnevalsDruk window, independent of challenge entry membership.';

revoke execute on function public.is_karnevalsdruk_hangover_target(uuid, timestamp with time zone) from public, anon, authenticated;
revoke execute on function public.is_karnevalsdruk_event_window_target(timestamp with time zone) from public, anon, authenticated;
revoke execute on function public.suppress_karnevalsdruk_normal_hangover_prompts(uuid) from public, anon, authenticated;
revoke execute on function public.suppress_karnevalsdruk_hangover_prompts_after_join() from public, anon, authenticated;
revoke execute on function public.create_karnevalsdruk_hangover_prompts(uuid) from public, anon, authenticated;

create or replace function public.rate_hangover(
  target_kind text,
  target_id uuid,
  target_score integer
)
returns table (
  rated_target_type text,
  rated_target_id uuid,
  hangover_score smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  target_user_id uuid;
  target_published_at timestamp with time zone;
  resolved_timezone text;
  resolved_drinking_day date;
  night_start timestamp with time zone;
  night_end timestamp with time zone;
  karnevalsdruk_row public.challenges;
  session_ids uuid[] := array[]::uuid[];
  pub_crawl_ids uuid[] := array[]::uuid[];
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_score is null or target_score < 1 or target_score > 10 then
    raise exception 'Hangover score must be between 1 and 10.';
  end if;

  if target_kind = 'session' then
    select
      sessions.user_id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at),
      public.resolve_hangover_timezone(sessions.timezone, sessions.user_id)
    into target_user_id, target_published_at, resolved_timezone
    from public.sessions as sessions
    where sessions.id = target_id
      and sessions.user_id = requesting_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false;
  elsif target_kind = 'pub_crawl' then
    select
      pub_crawls.user_id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at),
      public.resolve_hangover_timezone(pub_crawls.timezone, pub_crawls.user_id)
    into target_user_id, target_published_at, resolved_timezone
    from public.pub_crawls as pub_crawls
    where pub_crawls.id = target_id
      and pub_crawls.user_id = requesting_user_id
      and pub_crawls.status = 'published';
  else
    raise exception 'Unknown hangover target type.';
  end if;

  if target_user_id is null then
    raise exception 'Could not find a published post to rate.';
  end if;

  select challenges.*
  into karnevalsdruk_row
  from public.challenges as challenges
  join public.challenge_entries as challenge_entries
    on challenge_entries.challenge_id = challenges.id
    and challenge_entries.user_id = requesting_user_id
  where challenges.slug = 'karnevalsdruk-2026'
    and target_published_at >= challenges.starts_at
    and target_published_at < challenges.ends_at
  limit 1;

  if karnevalsdruk_row.id is not null then
    resolved_drinking_day := timezone('Europe/Copenhagen', karnevalsdruk_row.starts_at)::date;
    night_start := karnevalsdruk_row.starts_at;
    night_end := karnevalsdruk_row.ends_at;
  else
    select details.drinking_day
    into resolved_drinking_day
    from public.calculate_hangover_prompt_details(target_published_at, resolved_timezone) details
    limit 1;

    if resolved_drinking_day is null then
      raise exception 'This post is not eligible for a hangover rating.';
    end if;

    night_start := (resolved_drinking_day + time '21:00') at time zone resolved_timezone;
    night_end := ((resolved_drinking_day + 1) + time '06:00') at time zone resolved_timezone;
  end if;

  select coalesce(array_agg(sessions.id), array[]::uuid[])
  into session_ids
  from public.sessions as sessions
  where sessions.user_id = requesting_user_id
    and sessions.status = 'published'
    and coalesce(sessions.hide_from_feed, false) = false
    and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= night_start
    and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < night_end;

  select coalesce(array_agg(pub_crawls.id), array[]::uuid[])
  into pub_crawl_ids
  from public.pub_crawls as pub_crawls
  where pub_crawls.user_id = requesting_user_id
    and pub_crawls.status = 'published'
    and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= night_start
    and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < night_end;

  if coalesce(array_length(session_ids, 1), 0) + coalesce(array_length(pub_crawl_ids, 1), 0) = 0 then
    raise exception 'Could not find published posts for this drinking night.';
  end if;

  update public.sessions as sessions
  set hangover_score = target_score::smallint,
      hangover_rated_at = now()
  where sessions.id = any(session_ids);

  update public.pub_crawls as pub_crawls
  set hangover_score = target_score::smallint,
      hangover_rated_at = now()
  where pub_crawls.id = any(pub_crawl_ids);

  update public.hangover_prompts as hangover_prompts
  set completed_at = coalesce(hangover_prompts.completed_at, now())
  where hangover_prompts.user_id = requesting_user_id
    and (
      hangover_prompts.drinking_day = resolved_drinking_day
      or hangover_prompts.session_id = any(session_ids)
      or hangover_prompts.pub_crawl_id = any(pub_crawl_ids)
    );

  return query
  select 'session'::text, sessions.id, sessions.hangover_score
  from public.sessions as sessions
  where sessions.id = any(session_ids)
  order by sessions.published_at asc nulls last, sessions.created_at asc;

  return query
  select 'pub_crawl'::text, pub_crawls.id, pub_crawls.hangover_score
  from public.pub_crawls as pub_crawls
  where pub_crawls.id = any(pub_crawl_ids)
  order by pub_crawls.published_at asc nulls last, pub_crawls.created_at asc;
end;
$$;

grant execute on function public.rate_hangover(text, uuid, integer) to authenticated;

comment on function public.rate_hangover(text, uuid, integer) is 'Rates normal local drinking nights and the one-off full KarnevalsDruk challenge window for joined event users.';
