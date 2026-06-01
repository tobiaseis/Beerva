create table if not exists public.session_chug_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  session_beer_id uuid not null references public.session_beers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verifier_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'unverified',
  duration_ms integer not null,
  confidence_score double precision,
  detected_start_ms integer,
  detected_end_ms integer,
  container_type text not null default 'bottle',
  required_volume text not null default '33cl',
  video_path text,
  thumbnail_path text,
  verifier_note text,
  created_at timestamp with time zone not null default now(),
  verified_at timestamp with time zone,
  constraint session_chug_attempts_status_check check (status in ('unverified', 'verified', 'rejected')),
  constraint session_chug_attempts_duration_check check (duration_ms > 0 and duration_ms <= 15000),
  constraint session_chug_attempts_container_check check (container_type = 'bottle'),
  constraint session_chug_attempts_required_volume_check check (required_volume = '33cl'),
  constraint session_chug_attempts_no_self_verify check (user_id <> verifier_user_id)
);

create index if not exists session_chug_attempts_session_status_duration_idx
  on public.session_chug_attempts(session_id, status, duration_ms);

create index if not exists session_chug_attempts_user_created_at_idx
  on public.session_chug_attempts(user_id, created_at desc);

create index if not exists session_chug_attempts_verifier_status_created_at_idx
  on public.session_chug_attempts(verifier_user_id, status, created_at desc);

create index if not exists session_chug_attempts_session_beer_id_idx
  on public.session_chug_attempts(session_beer_id);

alter table public.session_chug_attempts enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chug_videos',
  'chug_videos',
  false,
  15728640,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_mutual_follower(first_user_id uuid, second_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.follows outgoing_follow
    join public.follows incoming_follow
      on incoming_follow.follower_id = second_user_id
     and incoming_follow.following_id = first_user_id
    where outgoing_follow.follower_id = first_user_id
      and outgoing_follow.following_id = second_user_id
  );
$$;

drop policy if exists "Session chug attempts are viewable by owner and verifier" on public.session_chug_attempts;
create policy "Session chug attempts are viewable by owner and verifier"
  on public.session_chug_attempts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or verifier_user_id = (select auth.uid())
  );

drop policy if exists "Users can create valid chug attempts" on public.session_chug_attempts;
create policy "Users can create valid chug attempts"
  on public.session_chug_attempts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'unverified'
    and container_type = 'bottle'
    and required_volume = '33cl'
    and public.is_mutual_follower(user_id, verifier_user_id)
    and exists (
      select 1
      from public.sessions
      where sessions.id = session_chug_attempts.session_id
        and sessions.user_id = session_chug_attempts.user_id
    )
    and exists (
      select 1
      from public.session_beers
      where session_beers.id = session_chug_attempts.session_beer_id
        and session_beers.session_id = session_chug_attempts.session_id
        and lower(replace(coalesce(session_beers.volume, ''), ' ', '')) = '33cl'
    )
  );

drop policy if exists "Users can upload their own chug proofs" on storage.objects;
create policy "Users can upload their own chug proofs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chug_videos'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

drop policy if exists "Chug proof videos are viewable by owner and verifier" on storage.objects;
create policy "Chug proof videos are viewable by owner and verifier"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chug_videos'
    and exists (
      select 1
      from public.session_chug_attempts attempts
      where attempts.video_path = storage.objects.name
        and (attempts.user_id = (select auth.uid()) or attempts.verifier_user_id = (select auth.uid()))
    )
  );

drop policy if exists "Users can delete their own unreviewed chug proofs" on storage.objects;
create policy "Users can delete their own unreviewed chug proofs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chug_videos'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

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

create or replace function public.review_chug_attempt(
  target_attempt_id uuid,
  next_status text,
  note text default null
)
returns public.session_chug_attempts
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  attempt public.session_chug_attempts;
  cleaned_note text := nullif(btrim(coalesce(note, '')), '');
begin
  if next_status not in ('verified', 'rejected') then
    raise exception 'Chug review status must be verified or rejected.';
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
    thumbnail_path = null
  where id = target_attempt_id
  returning * into attempt;

  return attempt;
end;
$$;

grant execute on function public.is_mutual_follower(uuid, uuid) to authenticated;
grant execute on function public.get_session_chug_attempt_summaries(uuid[]) to authenticated;
grant execute on function public.review_chug_attempt(uuid, text, text) to authenticated;

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
    check (type in (
      'cheer',
      'invite',
      'session_started',
      'comment',
      'invite_response',
      'pub_crawl_started',
      'hangover_check',
      'follow',
      'chug_verification'
    ));
end $$;

drop policy if exists "Users can create chug verification notifications" on public.notifications;
create policy "Users can create chug verification notifications"
  on public.notifications
  for insert
  to authenticated
  with check (
    type = 'chug_verification'
    and actor_id = (select auth.uid())
    and exists (
      select 1
      from public.session_chug_attempts attempts
      where attempts.id = notifications.reference_id
        and attempts.user_id = notifications.actor_id
        and attempts.verifier_user_id = notifications.user_id
        and attempts.status = 'unverified'
    )
  );

comment on table public.session_chug_attempts is 'Timed 33cl bottled-beer chug attempts attached to session beers.';
comment on function public.get_session_chug_attempt_summaries(uuid[]) is 'Returns public chug stat metadata for published sessions without proof video paths.';
comment on function public.review_chug_attempt(uuid, text, text) is 'Lets the chosen verifier approve or reject a chug attempt and clears temporary proof media.';
