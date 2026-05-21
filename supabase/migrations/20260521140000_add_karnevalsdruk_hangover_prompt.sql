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

revoke execute on function public.create_karnevalsdruk_hangover_prompts(uuid) from public, anon, authenticated;
