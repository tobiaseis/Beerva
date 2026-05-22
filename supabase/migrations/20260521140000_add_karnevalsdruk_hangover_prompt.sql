alter table public.hangover_prompts
  add column if not exists challenge_id uuid references public.challenges(id) on delete cascade;

drop index if exists public.hangover_prompts_user_drinking_day_unique_idx;

create unique index if not exists hangover_prompts_user_drinking_day_unique_idx
  on public.hangover_prompts(user_id, drinking_day)
  where drinking_day is not null
    and challenge_id is null;

create unique index if not exists hangover_prompts_user_challenge_unique_idx
  on public.hangover_prompts(user_id, challenge_id)
  where challenge_id is not null;

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

  if public.is_karnevalsdruk_hangover_target(new.user_id, target_published_at) then
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
  target_published_at timestamp with time zone;
begin
  if new.status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  target_published_at := coalesce(new.published_at, new.ended_at, new.created_at);

  if public.is_karnevalsdruk_hangover_target(new.user_id, target_published_at) then
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
  on conflict (user_id, drinking_day)
    where drinking_day is not null
      and challenge_id is null
    do nothing;

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
      challenges.ends_at
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
      null::uuid as pub_crawl_id
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
      pub_crawls.id as pub_crawl_id
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
      and hangover_prompts.challenge_id is null
      and hangover_prompts.sent_at is null
      and hangover_prompts.completed_at is null
      and (
        (event_targets.session_id is not null and hangover_prompts.session_id = event_targets.session_id)
        or (event_targets.pub_crawl_id is not null and hangover_prompts.pub_crawl_id = event_targets.pub_crawl_id)
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
  completed_normal_ratings as (
    select distinct on (eligible_targets.user_id)
      eligible_targets.user_id,
      coalesce(session_scores.hangover_score, pub_crawl_scores.hangover_score) as hangover_score,
      coalesce(
        session_scores.hangover_rated_at,
        pub_crawl_scores.hangover_rated_at,
        hangover_prompts.completed_at,
        now()
      ) as hangover_rated_at
    from eligible_targets
    join public.hangover_prompts as hangover_prompts
      on hangover_prompts.user_id = eligible_targets.user_id
      and hangover_prompts.challenge_id is null
      and (
        (eligible_targets.session_id is not null and hangover_prompts.session_id = eligible_targets.session_id)
        or (eligible_targets.pub_crawl_id is not null and hangover_prompts.pub_crawl_id = eligible_targets.pub_crawl_id)
      )
    left join public.sessions as session_scores
      on session_scores.id = eligible_targets.session_id
    left join public.pub_crawls as pub_crawl_scores
      on pub_crawl_scores.id = eligible_targets.pub_crawl_id
    where hangover_prompts.completed_at is not null
      and hangover_prompts.last_error is distinct from 'Superseded by KarnevalsDruk grouped hangover prompt.'
      and coalesce(session_scores.hangover_score, pub_crawl_scores.hangover_score) is not null
    order by
      eligible_targets.user_id,
      hangover_prompts.completed_at desc,
      eligible_targets.target_published_at asc,
      eligible_targets.target_created_at asc,
      eligible_targets.target_kind asc,
      eligible_targets.target_id asc
  ),
  propagated_completed_rating_sessions as (
    update public.sessions as sessions
    set hangover_score = completed_normal_ratings.hangover_score,
        hangover_rated_at = coalesce(completed_normal_ratings.hangover_rated_at, now())
    from target_challenge, completed_normal_ratings
    where sessions.user_id = completed_normal_ratings.user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < target_challenge.ends_at
    returning sessions.id
  ),
  propagated_completed_rating_pub_crawls as (
    update public.pub_crawls as pub_crawls
    set hangover_score = completed_normal_ratings.hangover_score,
        hangover_rated_at = coalesce(completed_normal_ratings.hangover_rated_at, now())
    from target_challenge, completed_normal_ratings
    where pub_crawls.user_id = completed_normal_ratings.user_id
      and pub_crawls.status = 'published'
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= target_challenge.starts_at
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < target_challenge.ends_at
    returning pub_crawls.id
  ),
  already_handled_users as (
    select distinct eligible_targets.user_id
    from eligible_targets
    join public.hangover_prompts as hangover_prompts
      on hangover_prompts.user_id = eligible_targets.user_id
      and hangover_prompts.challenge_id is null
      and (
        (eligible_targets.session_id is not null and hangover_prompts.session_id = eligible_targets.session_id)
        or (eligible_targets.pub_crawl_id is not null and hangover_prompts.pub_crawl_id = eligible_targets.pub_crawl_id)
      )

    where hangover_prompts.sent_at is not null

    union

    select completed_normal_ratings.user_id from completed_normal_ratings
  ),
  representative_targets as (
    select distinct on (eligible_targets.user_id)
      eligible_targets.user_id,
      eligible_targets.session_id,
      eligible_targets.pub_crawl_id
    from eligible_targets
    where not exists (
      select 1
      from already_handled_users
      where already_handled_users.user_id = eligible_targets.user_id
    )
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
    challenge_id,
    prompt_at,
    drinking_day
  )
  select
    representative_targets.user_id,
    representative_targets.session_id,
    representative_targets.pub_crawl_id,
    target_challenge.id,
    (
      timezone('Europe/Copenhagen', target_challenge.ends_at)::date
      + time '11:00'
    ) at time zone 'Europe/Copenhagen',
    timezone('Europe/Copenhagen', target_challenge.starts_at)::date
  from representative_targets
  cross join target_challenge
  on conflict (user_id, challenge_id)
    where challenge_id is not null
    do nothing;

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

drop function if exists public.find_hangover_replacement_session(uuid, date, uuid);
drop function if exists public.find_hangover_replacement_pub_crawl(uuid, date, uuid);

create or replace function public.find_hangover_replacement_session(
  target_user_id uuid,
  target_drinking_day date,
  target_challenge_id uuid,
  excluded_session_id uuid
)
returns table (
  replacement_session_id uuid
)
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at
    from public.challenges as challenges
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = challenges.id
      and challenge_entries.user_id = target_user_id
    where target_challenge_id is not null
      and challenges.id = target_challenge_id
      and challenges.slug = 'karnevalsdruk-2026'
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
    where target_challenge_id is null
      and sessions.user_id = target_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and details.drinking_day = target_drinking_day
      and not public.is_karnevalsdruk_hangover_target(
        sessions.user_id,
        coalesce(sessions.published_at, sessions.ended_at, sessions.created_at)
      )
      and (excluded_session_id is null or sessions.id <> excluded_session_id)

    union all

    select
      sessions.id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) as target_published_at,
      sessions.created_at as target_created_at
    from public.sessions as sessions
    join target_challenge on true
    where target_challenge_id is not null
      and sessions.user_id = target_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < target_challenge.ends_at
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
  target_challenge_id uuid,
  excluded_pub_crawl_id uuid
)
returns table (
  replacement_pub_crawl_id uuid
)
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at
    from public.challenges as challenges
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = challenges.id
      and challenge_entries.user_id = target_user_id
    where target_challenge_id is not null
      and challenges.id = target_challenge_id
      and challenges.slug = 'karnevalsdruk-2026'
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
    where target_challenge_id is null
      and pub_crawls.user_id = target_user_id
      and pub_crawls.status = 'published'
      and details.drinking_day = target_drinking_day
      and not public.is_karnevalsdruk_hangover_target(
        pub_crawls.user_id,
        coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at)
      )
      and (excluded_pub_crawl_id is null or pub_crawls.id <> excluded_pub_crawl_id)

    union all

    select
      pub_crawls.id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) as target_published_at,
      pub_crawls.created_at as target_created_at
    from public.pub_crawls as pub_crawls
    join target_challenge on true
    where target_challenge_id is not null
      and pub_crawls.user_id = target_user_id
      and pub_crawls.status = 'published'
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= target_challenge.starts_at
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < target_challenge.ends_at
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

create or replace function public.reassign_hangover_prompt_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prompt_record record;
  selected_session_id uuid;
  selected_pub_crawl_id uuid;
begin
  if tg_op = 'UPDATE' and new.status = 'published' and coalesce(new.hide_from_feed, false) = false then
    return new;
  end if;

  for prompt_record in
    select
      hangover_prompts.id,
      hangover_prompts.user_id,
      hangover_prompts.drinking_day,
      hangover_prompts.challenge_id
    from public.hangover_prompts as hangover_prompts
    where hangover_prompts.session_id = old.id
      and (
        hangover_prompts.drinking_day is not null
        or hangover_prompts.challenge_id is not null
      )
    for update
  loop
    select replacements.replacement_session_id
    into selected_session_id
    from public.find_hangover_replacement_session(
      prompt_record.user_id,
      prompt_record.drinking_day,
      prompt_record.challenge_id,
      old.id
    ) replacements
    limit 1;

    if selected_session_id is not null then
      update public.hangover_prompts as hangover_prompts
      set session_id = selected_session_id,
          pub_crawl_id = null
      where hangover_prompts.id = prompt_record.id;

      update public.notifications as notifications
      set reference_id = selected_session_id,
          metadata = jsonb_set(
            coalesce(notifications.metadata, '{}'::jsonb),
            '{target_type}',
            to_jsonb('session'::text),
            true
          )
      from public.hangover_prompts as hangover_prompts
      where notifications.id = hangover_prompts.notification_id
        and notifications.type = 'hangover_check'
        and hangover_prompts.id = prompt_record.id;
    else
      select replacements.replacement_pub_crawl_id
      into selected_pub_crawl_id
      from public.find_hangover_replacement_pub_crawl(
        prompt_record.user_id,
        prompt_record.drinking_day,
        prompt_record.challenge_id,
        null
      ) replacements
      limit 1;

      if selected_pub_crawl_id is not null then
        update public.hangover_prompts as hangover_prompts
        set session_id = null,
            pub_crawl_id = selected_pub_crawl_id
        where hangover_prompts.id = prompt_record.id;

        update public.notifications as notifications
        set reference_id = selected_pub_crawl_id,
            metadata = jsonb_set(
              coalesce(notifications.metadata, '{}'::jsonb),
              '{target_type}',
              to_jsonb('pub_crawl'::text),
              true
            )
        from public.hangover_prompts as hangover_prompts
        where notifications.id = hangover_prompts.notification_id
          and notifications.type = 'hangover_check'
          and hangover_prompts.id = prompt_record.id;
      elsif tg_op = 'UPDATE' then
        update public.hangover_prompts as hangover_prompts
        set completed_at = coalesce(hangover_prompts.completed_at, now()),
            last_error = 'No eligible hangover prompt representative remains for this prompt scope.'
        where hangover_prompts.id = prompt_record.id;
      end if;
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public.reassign_hangover_prompt_from_pub_crawl()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prompt_record record;
  selected_session_id uuid;
  selected_pub_crawl_id uuid;
begin
  if tg_op = 'UPDATE' and new.status = 'published' then
    return new;
  end if;

  for prompt_record in
    select
      hangover_prompts.id,
      hangover_prompts.user_id,
      hangover_prompts.drinking_day,
      hangover_prompts.challenge_id
    from public.hangover_prompts as hangover_prompts
    where hangover_prompts.pub_crawl_id = old.id
      and (
        hangover_prompts.drinking_day is not null
        or hangover_prompts.challenge_id is not null
      )
    for update
  loop
    select replacements.replacement_session_id
    into selected_session_id
    from public.find_hangover_replacement_session(
      prompt_record.user_id,
      prompt_record.drinking_day,
      prompt_record.challenge_id,
      null
    ) replacements
    limit 1;

    if selected_session_id is not null then
      update public.hangover_prompts as hangover_prompts
      set session_id = selected_session_id,
          pub_crawl_id = null
      where hangover_prompts.id = prompt_record.id;

      update public.notifications as notifications
      set reference_id = selected_session_id,
          metadata = jsonb_set(
            coalesce(notifications.metadata, '{}'::jsonb),
            '{target_type}',
            to_jsonb('session'::text),
            true
          )
      from public.hangover_prompts as hangover_prompts
      where notifications.id = hangover_prompts.notification_id
        and notifications.type = 'hangover_check'
        and hangover_prompts.id = prompt_record.id;
    else
      select replacements.replacement_pub_crawl_id
      into selected_pub_crawl_id
      from public.find_hangover_replacement_pub_crawl(
        prompt_record.user_id,
        prompt_record.drinking_day,
        prompt_record.challenge_id,
        old.id
      ) replacements
      limit 1;

      if selected_pub_crawl_id is not null then
        update public.hangover_prompts as hangover_prompts
        set session_id = null,
            pub_crawl_id = selected_pub_crawl_id
        where hangover_prompts.id = prompt_record.id;

        update public.notifications as notifications
        set reference_id = selected_pub_crawl_id,
            metadata = jsonb_set(
              coalesce(notifications.metadata, '{}'::jsonb),
              '{target_type}',
              to_jsonb('pub_crawl'::text),
              true
            )
        from public.hangover_prompts as hangover_prompts
        where notifications.id = hangover_prompts.notification_id
          and notifications.type = 'hangover_check'
          and hangover_prompts.id = prompt_record.id;
      elsif tg_op = 'UPDATE' then
        update public.hangover_prompts as hangover_prompts
        set completed_at = coalesce(hangover_prompts.completed_at, now()),
            last_error = 'No eligible hangover prompt representative remains for this prompt scope.'
        where hangover_prompts.id = prompt_record.id;
      end if;
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

comment on function public.create_karnevalsdruk_hangover_prompts(uuid) is 'Creates one grouped May 24 11am hangover prompt for each joined KarnevalsDruk user with an event-window post.';
comment on function public.suppress_karnevalsdruk_normal_hangover_prompts(uuid) is 'Completes unsent normal hangover prompts for joined KarnevalsDruk users when the grouped event prompt owns the event window.';
comment on column public.hangover_prompts.challenge_id is 'Challenge scope for one-off event hangover prompts that must dedupe separately from normal local drinking nights.';
comment on index public.hangover_prompts_user_drinking_day_unique_idx is 'Ensures one normal hangover prompt per user per local drinking night.';
comment on index public.hangover_prompts_user_challenge_unique_idx is 'Ensures one event-scoped hangover prompt per user per challenge.';

revoke execute on function public.is_karnevalsdruk_hangover_target(uuid, timestamp with time zone) from public, anon, authenticated;
revoke execute on function public.suppress_karnevalsdruk_normal_hangover_prompts(uuid) from public, anon, authenticated;
revoke execute on function public.suppress_karnevalsdruk_hangover_prompts_after_join() from public, anon, authenticated;
revoke execute on function public.create_karnevalsdruk_hangover_prompts(uuid) from public, anon, authenticated;
revoke execute on function public.find_hangover_replacement_session(uuid, date, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.find_hangover_replacement_pub_crawl(uuid, date, uuid, uuid) from public, anon, authenticated;

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
    and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < night_end
    and (
      karnevalsdruk_row.id is not null
      or not public.is_karnevalsdruk_hangover_target(
        sessions.user_id,
        coalesce(sessions.published_at, sessions.ended_at, sessions.created_at)
      )
    );

  select coalesce(array_agg(pub_crawls.id), array[]::uuid[])
  into pub_crawl_ids
  from public.pub_crawls as pub_crawls
  where pub_crawls.user_id = requesting_user_id
    and pub_crawls.status = 'published'
    and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= night_start
    and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < night_end
    and (
      karnevalsdruk_row.id is not null
      or not public.is_karnevalsdruk_hangover_target(
        pub_crawls.user_id,
        coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at)
      )
    );

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

  if karnevalsdruk_row.id is not null then
    update public.hangover_prompts as hangover_prompts
    set completed_at = coalesce(hangover_prompts.completed_at, now())
    where hangover_prompts.user_id = requesting_user_id
      and (
        hangover_prompts.challenge_id = karnevalsdruk_row.id
        or hangover_prompts.session_id = any(session_ids)
        or hangover_prompts.pub_crawl_id = any(pub_crawl_ids)
      );
  else
    update public.hangover_prompts as hangover_prompts
    set completed_at = coalesce(hangover_prompts.completed_at, now())
    where hangover_prompts.user_id = requesting_user_id
      and hangover_prompts.challenge_id is null
      and (
        hangover_prompts.drinking_day = resolved_drinking_day
        or hangover_prompts.session_id = any(session_ids)
        or hangover_prompts.pub_crawl_id = any(pub_crawl_ids)
      );
  end if;

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
