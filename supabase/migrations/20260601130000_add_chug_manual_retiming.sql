alter table public.session_chug_attempts
  add column if not exists ai_duration_ms integer,
  add column if not exists manual_start_ms integer,
  add column if not exists manual_end_ms integer,
  add column if not exists manual_duration_ms integer,
  add column if not exists timing_source text not null default 'ai';

update public.session_chug_attempts
set ai_duration_ms = duration_ms
where ai_duration_ms is null;

alter table public.session_chug_attempts
  alter column ai_duration_ms set not null,
  drop constraint if exists session_chug_attempts_ai_duration_check,
  drop constraint if exists session_chug_attempts_manual_range_check,
  drop constraint if exists session_chug_attempts_timing_source_check,
  drop constraint if exists session_chug_attempts_manual_source_check;

alter table public.session_chug_attempts
  add constraint session_chug_attempts_ai_duration_check
    check (ai_duration_ms > 0 and ai_duration_ms <= 15000),
  add constraint session_chug_attempts_manual_range_check
    check (
      (
        manual_start_ms is null
        and manual_end_ms is null
        and manual_duration_ms is null
      )
      or (
        manual_start_ms >= 0
        and manual_end_ms > manual_start_ms
        and manual_duration_ms = manual_end_ms - manual_start_ms
        and manual_duration_ms <= 15000
      )
    ),
  add constraint session_chug_attempts_timing_source_check
    check (timing_source in ('ai', 'manual')),
  add constraint session_chug_attempts_manual_source_check
    check (timing_source <> 'manual' or manual_duration_ms is not null);

drop function if exists public.review_chug_attempt(uuid, text, text);

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
    timing_source = case when has_manual_timing then 'manual' else 'ai' end,
    duration_ms = case when has_manual_timing then reviewed_manual_duration_ms else attempt.ai_duration_ms end
  where id = target_attempt_id
  returning * into attempt;

  return attempt;
end;
$$;

grant execute on function public.review_chug_attempt(uuid, text, text, integer, integer) to authenticated;

comment on function public.review_chug_attempt(uuid, text, text, integer, integer) is
  'Lets the chosen verifier approve, manually retime, or reject a chug attempt and clears temporary proof media.';
