-- Phase 2 cleanup: KarnevalsDruk (May 23-24 2026) is over. Take the one-off
-- event branching back out of the hangover HOT PATH -- the per-published-post
-- prompt triggers and the per-rating rate_hangover RPC. They no longer call
-- is_karnevalsdruk_hangover_target, so they fall back to the simple grouped
-- "one prompt per local drinking night" behaviour from migration
-- 20260521130000.
--
-- Left in place on purpose (dormant, not in the hot path): the karneval helper
-- functions (is_karnevalsdruk_hangover_target, suppress_*, create_karnevalsdruk_*),
-- the challenge join/finalize triggers, the 4-arg find_hangover_replacement_*
-- functions, and the reassign_* triggers. They only run on challenge
-- join/finalize or post deletion, never on every published post.
--
-- ON CONFLICT keeps the predicate of the live partial unique index
-- (user_id, drinking_day) WHERE drinking_day is not null AND challenge_id is null.
-- Existing KarnevalsDruk prompts, ratings, awards and feed posts are untouched.

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
begin
  if new.status <> 'published' or coalesce(new.hide_from_feed, false) then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  resolved_timezone := public.resolve_hangover_timezone(new.timezone, new.user_id);

  select details.prompt_at, details.drinking_day
  into resolved_prompt_at, resolved_drinking_day
  from public.calculate_hangover_prompt_details(
    coalesce(new.published_at, new.ended_at, new.created_at),
    resolved_timezone
  ) details
  limit 1;

  if resolved_prompt_at is null or resolved_drinking_day is null then
    return new;
  end if;

  insert into public.hangover_prompts (user_id, session_id, prompt_at, drinking_day)
  values (new.user_id, new.id, resolved_prompt_at, resolved_drinking_day)
  on conflict (user_id, drinking_day)
    where drinking_day is not null
      and challenge_id is null
    do nothing;

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
begin
  if new.status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  resolved_timezone := public.resolve_hangover_timezone(new.timezone, new.user_id);

  select details.prompt_at, details.drinking_day
  into resolved_prompt_at, resolved_drinking_day
  from public.calculate_hangover_prompt_details(
    coalesce(new.published_at, new.ended_at, new.created_at),
    resolved_timezone
  ) details
  limit 1;

  if resolved_prompt_at is null or resolved_drinking_day is null then
    return new;
  end if;

  insert into public.hangover_prompts (user_id, pub_crawl_id, prompt_at, drinking_day)
  values (new.user_id, new.id, resolved_prompt_at, resolved_drinking_day)
  on conflict (user_id, drinking_day)
    where drinking_day is not null
      and challenge_id is null
    do nothing;

  return new;
end;
$$;

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

  select details.drinking_day
  into resolved_drinking_day
  from public.calculate_hangover_prompt_details(target_published_at, resolved_timezone) details
  limit 1;

  if resolved_drinking_day is null then
    raise exception 'This post is not eligible for a hangover rating.';
  end if;

  night_start := (resolved_drinking_day + time '21:00') at time zone resolved_timezone;
  night_end := ((resolved_drinking_day + 1) + time '06:00') at time zone resolved_timezone;

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

comment on function public.create_hangover_prompt_for_session() is 'Creates one grouped local drinking-night hangover prompt per published late-night session.';
comment on function public.create_hangover_prompt_for_pub_crawl() is 'Creates one grouped local drinking-night hangover prompt per published late-night pub crawl.';
comment on function public.rate_hangover(text, uuid, integer) is 'Rates every eligible published post for the resolved local drinking night.';
