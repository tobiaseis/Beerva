alter table public.hangover_prompts
  add column if not exists drinking_day date;

create or replace function public.calculate_hangover_prompt_details(
  target_published_at timestamp with time zone,
  target_timezone text
)
returns table (
  prompt_at timestamp with time zone,
  drinking_day date
)
language plpgsql
stable
set search_path = public
as $$
declare
  local_published_at timestamp without time zone;
  resolved_drinking_day date;
begin
  if target_published_at is null then
    return;
  end if;

  local_published_at := timezone(target_timezone, target_published_at);

  if not (
    extract(hour from local_published_at) >= 21
    or extract(hour from local_published_at) < 6
  ) then
    return;
  end if;

  resolved_drinking_day := (local_published_at - interval '6 hours')::date;
  prompt_at := ((resolved_drinking_day + 1) + time '11:00') at time zone target_timezone;
  drinking_day := resolved_drinking_day;
  return next;
end;
$$;

create or replace function public.calculate_hangover_prompt_at(
  target_published_at timestamp with time zone,
  target_timezone text
)
returns timestamp with time zone
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_prompt_at timestamp with time zone;
begin
  select details.prompt_at
  into resolved_prompt_at
  from public.calculate_hangover_prompt_details(target_published_at, target_timezone) details
  limit 1;

  return resolved_prompt_at;
end;
$$;

drop index if exists public.hangover_prompts_user_drinking_day_unique_idx;
drop index if exists public.hangover_prompts_session_id_unique_idx;
drop index if exists public.hangover_prompts_pub_crawl_id_unique_idx;

update public.hangover_prompts as hangover_prompts
set drinking_day = details.drinking_day
from public.sessions as sessions
cross join lateral public.calculate_hangover_prompt_details(
  coalesce(sessions.published_at, sessions.ended_at, sessions.created_at),
  public.resolve_hangover_timezone(sessions.timezone, sessions.user_id)
) details
where hangover_prompts.session_id = sessions.id
  and hangover_prompts.drinking_day is null;

update public.hangover_prompts as hangover_prompts
set drinking_day = details.drinking_day
from public.pub_crawls as pub_crawls
cross join lateral public.calculate_hangover_prompt_details(
  coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at),
  public.resolve_hangover_timezone(pub_crawls.timezone, pub_crawls.user_id)
) details
where hangover_prompts.pub_crawl_id = pub_crawls.id
  and hangover_prompts.drinking_day is null;

with ranked_prompts as (
  select
    hangover_prompts.id,
    row_number() over (
      partition by hangover_prompts.user_id, hangover_prompts.drinking_day
      order by
        case when hangover_prompts.sent_at is not null then 0 else 1 end,
        hangover_prompts.prompt_at asc,
        hangover_prompts.created_at asc,
        hangover_prompts.id asc
    ) as duplicate_rank
  from public.hangover_prompts
  where hangover_prompts.drinking_day is not null
)
update public.hangover_prompts as hangover_prompts
set drinking_day = null,
    completed_at = coalesce(hangover_prompts.completed_at, now()),
    last_error = coalesce(
      hangover_prompts.last_error,
      'Superseded by grouped drinking-night hangover prompt.'
    )
from ranked_prompts
where hangover_prompts.id = ranked_prompts.id
  and ranked_prompts.duplicate_rank > 1;

create unique index if not exists hangover_prompts_user_drinking_day_unique_idx
  on public.hangover_prompts(user_id, drinking_day)
  where drinking_day is not null;

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
  on conflict (user_id, drinking_day) where drinking_day is not null do nothing;

  return new;
end;
$$;

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
  select sessions.id
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
  order by
    coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) asc,
    sessions.created_at asc,
    sessions.id asc
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
  select pub_crawls.id
  from public.pub_crawls as pub_crawls
  cross join lateral public.calculate_hangover_prompt_details(
    coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at),
    public.resolve_hangover_timezone(pub_crawls.timezone, pub_crawls.user_id)
  ) details
  where pub_crawls.user_id = target_user_id
    and pub_crawls.status = 'published'
    and details.drinking_day = target_drinking_day
    and (excluded_pub_crawl_id is null or pub_crawls.id <> excluded_pub_crawl_id)
  order by
    coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) asc,
    pub_crawls.created_at asc,
    pub_crawls.id asc
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
      hangover_prompts.drinking_day
    from public.hangover_prompts as hangover_prompts
    where hangover_prompts.session_id = old.id
      and hangover_prompts.drinking_day is not null
    for update
  loop
    select replacements.replacement_session_id
    into selected_session_id
    from public.find_hangover_replacement_session(
      prompt_record.user_id,
      prompt_record.drinking_day,
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
            last_error = 'No eligible hangover prompt representative remains for this drinking night.'
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

drop trigger if exists sessions_reassign_hangover_prompt_representative on public.sessions;
create trigger sessions_reassign_hangover_prompt_representative
  before delete or update of status, hide_from_feed on public.sessions
  for each row
  execute function public.reassign_hangover_prompt_from_session();

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
      hangover_prompts.drinking_day
    from public.hangover_prompts as hangover_prompts
    where hangover_prompts.pub_crawl_id = old.id
      and hangover_prompts.drinking_day is not null
    for update
  loop
    select replacements.replacement_session_id
    into selected_session_id
    from public.find_hangover_replacement_session(
      prompt_record.user_id,
      prompt_record.drinking_day,
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
            last_error = 'No eligible hangover prompt representative remains for this drinking night.'
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

drop trigger if exists pub_crawls_reassign_hangover_prompt_representative on public.pub_crawls;
create trigger pub_crawls_reassign_hangover_prompt_representative
  before delete or update of status on public.pub_crawls
  for each row
  execute function public.reassign_hangover_prompt_from_pub_crawl();

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

comment on column public.hangover_prompts.drinking_day is 'Local drinking-night date used to dedupe one hangover prompt per user per night.';
comment on function public.calculate_hangover_prompt_details(timestamp with time zone, text) is 'Returns the 11am prompt timestamp and local drinking-night date for eligible late-night posts.';
comment on index public.hangover_prompts_user_drinking_day_unique_idx is 'Ensures one hangover prompt per user per local drinking night.';
