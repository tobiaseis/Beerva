alter table public.profiles
  add column if not exists timezone text;

alter table public.sessions
  add column if not exists timezone text,
  add column if not exists hangover_score smallint,
  add column if not exists hangover_rated_at timestamp with time zone;

alter table public.pub_crawls
  add column if not exists timezone text,
  add column if not exists hangover_score smallint,
  add column if not exists hangover_rated_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_hangover_score_check'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_hangover_score_check
      check (hangover_score is null or (hangover_score >= 1 and hangover_score <= 10));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'pub_crawls_hangover_score_check'
      and conrelid = 'public.pub_crawls'::regclass
  ) then
    alter table public.pub_crawls
      add constraint pub_crawls_hangover_score_check
      check (hangover_score is null or (hangover_score >= 1 and hangover_score <= 10));
  end if;
end;
$$;

create table if not exists public.hangover_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  pub_crawl_id uuid references public.pub_crawls(id) on delete cascade,
  prompt_at timestamp with time zone not null,
  processing_at timestamp with time zone,
  sent_at timestamp with time zone,
  completed_at timestamp with time zone,
  notification_id uuid references public.notifications(id) on delete set null,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint hangover_prompts_exactly_one_target
    check ((session_id is not null)::integer + (pub_crawl_id is not null)::integer = 1)
);

alter table public.hangover_prompts enable row level security;

drop policy if exists "Users can view their own hangover prompts" on public.hangover_prompts;
create policy "Users can view their own hangover prompts"
  on public.hangover_prompts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create unique index if not exists hangover_prompts_session_id_unique_idx
  on public.hangover_prompts(session_id)
  where session_id is not null;

create unique index if not exists hangover_prompts_pub_crawl_id_unique_idx
  on public.hangover_prompts(pub_crawl_id)
  where pub_crawl_id is not null;

create index if not exists hangover_prompts_due_idx
  on public.hangover_prompts(prompt_at)
  where sent_at is null
    and completed_at is null;

create index if not exists hangover_prompts_user_id_idx
  on public.hangover_prompts(user_id, prompt_at desc);

create or replace function public.set_hangover_prompts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hangover_prompts_set_updated_at on public.hangover_prompts;
create trigger hangover_prompts_set_updated_at
  before update on public.hangover_prompts
  for each row
  execute function public.set_hangover_prompts_updated_at();

create or replace function public.resolve_hangover_timezone(input_timezone text, target_user_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_timezone text;
  profile_timezone text;
begin
  select pg_timezone_names.name
  into resolved_timezone
  from pg_timezone_names
  where pg_timezone_names.name = nullif(btrim(input_timezone), '')
  limit 1;

  if resolved_timezone is not null then
    return resolved_timezone;
  end if;

  select profiles.timezone
  into profile_timezone
  from public.profiles
  where profiles.id = target_user_id;

  select pg_timezone_names.name
  into resolved_timezone
  from pg_timezone_names
  where pg_timezone_names.name = nullif(btrim(profile_timezone), '')
  limit 1;

  return coalesce(resolved_timezone, 'Europe/Copenhagen');
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
  local_published_at timestamp without time zone;
  drinking_day date;
begin
  if target_published_at is null then
    return null;
  end if;

  local_published_at := timezone(target_timezone, target_published_at);

  if not (
    extract(hour from local_published_at) >= 21
    or extract(hour from local_published_at) < 6
  ) then
    return null;
  end if;

  drinking_day := (local_published_at - interval '6 hours')::date;
  return ((drinking_day + 1) + time '11:00') at time zone target_timezone;
end;
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
begin
  if new.status <> 'published' or coalesce(new.hide_from_feed, false) then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  resolved_timezone := public.resolve_hangover_timezone(new.timezone, new.user_id);
  resolved_prompt_at := public.calculate_hangover_prompt_at(
    coalesce(new.published_at, new.ended_at, new.created_at),
    resolved_timezone
  );

  if resolved_prompt_at is null then
    return new;
  end if;

  insert into public.hangover_prompts (user_id, session_id, prompt_at)
  values (new.user_id, new.id, resolved_prompt_at)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists sessions_create_hangover_prompt on public.sessions;
create trigger sessions_create_hangover_prompt
  after insert or update of status, published_at, ended_at, timezone, hide_from_feed on public.sessions
  for each row
  execute function public.create_hangover_prompt_for_session();

create or replace function public.sync_pub_crawl_timezone_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pub_crawl_id is null or new.timezone is null then
    return new;
  end if;

  update public.pub_crawls
  set timezone = coalesce(pub_crawls.timezone, new.timezone)
  where pub_crawls.id = new.pub_crawl_id
    and pub_crawls.user_id = new.user_id;

  return new;
end;
$$;

drop trigger if exists sessions_sync_pub_crawl_timezone on public.sessions;
create trigger sessions_sync_pub_crawl_timezone
  after insert or update of pub_crawl_id, timezone on public.sessions
  for each row
  execute function public.sync_pub_crawl_timezone_from_session();

create or replace function public.create_hangover_prompt_for_pub_crawl()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_timezone text;
  resolved_prompt_at timestamp with time zone;
begin
  if new.status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  resolved_timezone := public.resolve_hangover_timezone(new.timezone, new.user_id);
  resolved_prompt_at := public.calculate_hangover_prompt_at(
    coalesce(new.published_at, new.ended_at, new.created_at),
    resolved_timezone
  );

  if resolved_prompt_at is null then
    return new;
  end if;

  insert into public.hangover_prompts (user_id, pub_crawl_id, prompt_at)
  values (new.user_id, new.id, resolved_prompt_at)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists pub_crawls_create_hangover_prompt on public.pub_crawls;
create trigger pub_crawls_create_hangover_prompt
  after insert or update of status, published_at, ended_at, timezone on public.pub_crawls
  for each row
  execute function public.create_hangover_prompt_for_pub_crawl();

create or replace function public.claim_due_hangover_prompts(batch_size integer default 50)
returns table (
  id uuid,
  user_id uuid,
  session_id uuid,
  pub_crawl_id uuid,
  prompt_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due_prompts as (
    select hangover_prompts.id
    from public.hangover_prompts
    where hangover_prompts.sent_at is null
      and hangover_prompts.completed_at is null
      and hangover_prompts.prompt_at <= now()
      and (
        hangover_prompts.processing_at is null
        or hangover_prompts.processing_at < now() - interval '10 minutes'
      )
    order by hangover_prompts.prompt_at asc
    limit greatest(1, least(coalesce(batch_size, 50), 100))
    for update skip locked
  )
  update public.hangover_prompts
  set processing_at = now(),
      last_error = null
  from due_prompts
  where hangover_prompts.id = due_prompts.id
  returning
    hangover_prompts.id,
    hangover_prompts.user_id,
    hangover_prompts.session_id,
    hangover_prompts.pub_crawl_id,
    hangover_prompts.prompt_at;
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
  updated_id uuid;
  updated_score smallint;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_score < 1 or target_score > 10 then
    raise exception 'Hangover score must be between 1 and 10.';
  end if;

  if target_kind = 'session' then
    update public.sessions
    set hangover_score = target_score::smallint,
        hangover_rated_at = now()
    where sessions.id = target_id
      and sessions.user_id = requesting_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
    returning sessions.id, sessions.hangover_score into updated_id, updated_score;

    if updated_id is null then
      raise exception 'Could not find a published session to rate.';
    end if;

    update public.hangover_prompts
    set completed_at = coalesce(completed_at, now())
    where hangover_prompts.session_id = target_id
      and hangover_prompts.user_id = requesting_user_id;

    return query select 'session'::text, updated_id, updated_score;
    return;
  end if;

  if target_kind = 'pub_crawl' then
    update public.pub_crawls
    set hangover_score = target_score::smallint,
        hangover_rated_at = now()
    where pub_crawls.id = target_id
      and pub_crawls.user_id = requesting_user_id
      and pub_crawls.status = 'published'
    returning pub_crawls.id, pub_crawls.hangover_score into updated_id, updated_score;

    if updated_id is null then
      raise exception 'Could not find a published pub crawl to rate.';
    end if;

    update public.hangover_prompts
    set completed_at = coalesce(completed_at, now())
    where hangover_prompts.pub_crawl_id = target_id
      and hangover_prompts.user_id = requesting_user_id;

    return query select 'pub_crawl'::text, updated_id, updated_score;
    return;
  end if;

  raise exception 'Unknown hangover target type.';
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications drop constraint notifications_type_check;
  end if;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in ('cheer', 'invite', 'session_started', 'comment', 'invite_response', 'pub_crawl_started', 'hangover_check'));
end;
$$;

grant execute on function public.rate_hangover(text, uuid, integer) to authenticated;

comment on column public.profiles.timezone is 'Latest IANA timezone seen for local-time notification scheduling.';
comment on column public.sessions.timezone is 'IANA timezone snapshot used for local hangover prompt timing.';
comment on column public.sessions.hangover_score is 'Owner-rated next-day hangover score from 1 to 10.';
comment on column public.pub_crawls.timezone is 'IANA timezone snapshot used for local hangover prompt timing.';
comment on column public.pub_crawls.hangover_score is 'Owner-rated next-day hangover score from 1 to 10.';
comment on table public.hangover_prompts is 'Scheduled owner prompts for rating the hangover after late-night published drinking posts.';
comment on function public.rate_hangover(text, uuid, integer) is 'Updates the authenticated owner hangover score for a published session or pub crawl.';
