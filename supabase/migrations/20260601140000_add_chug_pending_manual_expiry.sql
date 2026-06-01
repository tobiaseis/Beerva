create extension if not exists pg_cron;

alter table public.session_chug_attempts
  add column if not exists expires_at timestamp with time zone;

update public.session_chug_attempts
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.session_chug_attempts
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null,
  alter column duration_ms drop not null,
  alter column ai_duration_ms drop not null,
  drop constraint if exists session_chug_attempts_status_check,
  drop constraint if exists session_chug_attempts_duration_check,
  drop constraint if exists session_chug_attempts_ai_duration_check,
  drop constraint if exists session_chug_attempts_timing_source_check,
  drop constraint if exists session_chug_attempts_manual_source_check,
  drop constraint if exists session_chug_attempts_timing_state_check;

alter table public.session_chug_attempts
  add constraint session_chug_attempts_status_check
    check (status in ('unverified', 'verified', 'rejected', 'expired')),
  add constraint session_chug_attempts_duration_check
    check (
      (
        timing_source = 'pending_manual'
        and duration_ms is null
      )
      or (
        timing_source <> 'pending_manual'
        and duration_ms > 0
        and duration_ms <= 15000
      )
    ),
  add constraint session_chug_attempts_ai_duration_check
    check (
      ai_duration_ms is null
      or (ai_duration_ms > 0 and ai_duration_ms <= 15000)
    ),
  add constraint session_chug_attempts_timing_source_check
    check (timing_source in ('ai', 'manual', 'pending_manual')),
  add constraint session_chug_attempts_manual_source_check
    check (timing_source <> 'manual' or manual_duration_ms is not null),
  add constraint session_chug_attempts_timing_state_check
    check (
      (
        timing_source = 'ai'
        and duration_ms is not null
        and ai_duration_ms is not null
      )
      or (
        timing_source = 'pending_manual'
        and status in ('unverified', 'rejected', 'expired')
        and duration_ms is null
        and ai_duration_ms is null
        and manual_duration_ms is null
      )
      or (
        timing_source = 'manual'
        and duration_ms is not null
        and manual_duration_ms is not null
      )
    );

create index if not exists session_chug_attempts_status_expires_at_idx
  on public.session_chug_attempts(status, expires_at)
  where status = 'unverified';

drop function if exists public.get_session_chug_attempt_summaries(uuid[]);

create or replace function public.get_session_chug_attempt_summaries(session_ids uuid[])
returns table (
  id uuid,
  session_id uuid,
  session_beer_id uuid,
  status text,
  duration_ms integer,
  confidence_score double precision,
  detected_start_ms integer,
  detected_end_ms integer,
  container_type text,
  required_volume text,
  timing_source text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone,
  verified_at timestamp with time zone,
  beer_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    attempts.id,
    attempts.session_id,
    attempts.session_beer_id,
    attempts.status,
    attempts.duration_ms,
    attempts.confidence_score,
    attempts.detected_start_ms,
    attempts.detected_end_ms,
    attempts.container_type,
    attempts.required_volume,
    attempts.timing_source,
    attempts.expires_at,
    attempts.created_at,
    attempts.verified_at,
    session_beers.beer_name
  from public.session_chug_attempts attempts
  join public.sessions
    on sessions.id = attempts.session_id
  join public.session_beers
    on session_beers.id = attempts.session_beer_id
  where attempts.session_id = any(session_ids)
    and attempts.status <> 'rejected'
    and sessions.status = 'published'
    and (
      sessions.user_id = (select auth.uid())
      or exists (
        select 1
        from public.follows
        where follows.follower_id = (select auth.uid())
          and follows.following_id = sessions.user_id
      )
    );
$$;

drop function if exists public.review_chug_attempt(uuid, text, text, integer, integer);

create or replace function public.review_chug_attempt(
  target_attempt_id uuid,
  next_status text,
  note text default null,
  manual_start_ms integer default null,
  manual_end_ms integer default null
)
returns public.session_chug_attempts
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  attempt public.session_chug_attempts;
  cleaned_note text := nullif(btrim(coalesce(note, '')), '');
  reviewed_manual_start_ms integer := $4;
  reviewed_manual_end_ms integer := $5;
  reviewed_manual_duration_ms integer;
  has_manual_timing boolean := reviewed_manual_start_ms is not null or reviewed_manual_end_ms is not null;
begin
  if next_status not in ('verified', 'rejected') then
    raise exception 'Chug review status must be verified or rejected.';
  end if;

  if (reviewed_manual_start_ms is null) <> (reviewed_manual_end_ms is null) then
    raise exception 'Manual timing requires both start and end timestamps.';
  end if;

  if next_status = 'rejected' and has_manual_timing then
    raise exception 'Manual timing is only allowed when verifying a chug attempt.';
  end if;

  if has_manual_timing then
    reviewed_manual_duration_ms := reviewed_manual_end_ms - reviewed_manual_start_ms;
    if reviewed_manual_start_ms < 0
      or reviewed_manual_duration_ms <= 0
      or reviewed_manual_duration_ms > 15000 then
      raise exception 'Manual chug timing must be between 1 and 15000 milliseconds.';
    end if;
  end if;

  select *
  into attempt
  from public.session_chug_attempts
  where id = target_attempt_id
  for update;

  if attempt.id is null then
    raise exception 'Chug attempt not found.';
  end if;

  if attempt.verifier_user_id <> (select auth.uid()) then
    raise exception 'Only the chosen verifier can review this chug attempt.';
  end if;

  if attempt.status <> 'unverified' then
    raise exception 'This chug attempt has already been reviewed.';
  end if;

  if attempt.expires_at <= now() then
    raise exception 'This chug verification has expired.';
  end if;

  if next_status = 'verified'
    and attempt.timing_source = 'pending_manual'
    and not has_manual_timing then
    raise exception 'Pending manual chug attempts require manual timing before verification.';
  end if;

  delete from storage.objects
  where bucket_id = 'chug_videos'
    and name in (
      select media.path
      from unnest(array[attempt.video_path, attempt.thumbnail_path]) as media(path)
      where media.path is not null and btrim(media.path) <> ''
    );

  update public.session_chug_attempts
  set
    status = next_status,
    verifier_note = cleaned_note,
    verified_at = now(),
    video_path = null,
    thumbnail_path = null,
    manual_start_ms = case when has_manual_timing then reviewed_manual_start_ms else null end,
    manual_end_ms = case when has_manual_timing then reviewed_manual_end_ms else null end,
    manual_duration_ms = case when has_manual_timing then reviewed_manual_duration_ms else null end,
    timing_source = case when has_manual_timing then 'manual' else attempt.timing_source end,
    duration_ms = case when has_manual_timing then reviewed_manual_duration_ms else attempt.duration_ms end
  where id = target_attempt_id
  returning * into attempt;

  return attempt;
end;
$$;

create or replace function public.expire_stale_chug_attempts()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  expired_count integer;
begin
  delete from storage.objects
  where bucket_id = 'chug_videos'
    and name in (
      select media.path
      from public.session_chug_attempts attempts
      cross join lateral unnest(array[attempts.video_path, attempts.thumbnail_path]) as media(path)
      where attempts.status = 'unverified'
        and attempts.expires_at <= now()
        and media.path is not null
        and btrim(media.path) <> ''
    );

  update public.session_chug_attempts
  set
    status = 'expired',
    video_path = null,
    thumbnail_path = null
  where status = 'unverified'
    and expires_at <= now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

grant execute on function public.get_session_chug_attempt_summaries(uuid[]) to authenticated;
grant execute on function public.review_chug_attempt(uuid, text, text, integer, integer) to authenticated;
revoke execute on function public.expire_stale_chug_attempts() from public, anon, authenticated;
grant execute on function public.expire_stale_chug_attempts() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-expire-chug-attempts') then
    perform cron.unschedule('beerva-expire-chug-attempts');
  end if;

  perform cron.schedule(
    'beerva-expire-chug-attempts',
    '* * * * *',
    $job$select public.expire_stale_chug_attempts();$job$
  );
end;
$$;

comment on function public.expire_stale_chug_attempts() is
  'Deletes overdue temporary chug proofs and retains their attempts as expired audit rows.';
