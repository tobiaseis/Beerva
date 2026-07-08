create table if not exists public.beverage_submissions (
  id uuid primary key default gen_random_uuid(),
  session_beer_id uuid references public.session_beers(id) on delete set null,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  abv numeric not null,
  category text not null,
  status text not null default 'pending',
  resolved_admin_beverage_id uuid references public.admin_beverages(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table public.session_beers
  add column if not exists beverage_submission_id uuid references public.beverage_submissions(id) on delete set null,
  add column if not exists beverage_submission_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'beverage_submissions_name_check'
      and conrelid = 'public.beverage_submissions'::regclass
  ) then
    alter table public.beverage_submissions
      add constraint beverage_submissions_name_check
      check (length(btrim(name)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'beverage_submissions_abv_check'
      and conrelid = 'public.beverage_submissions'::regclass
  ) then
    alter table public.beverage_submissions
      add constraint beverage_submissions_abv_check
      check (abv >= 0 and abv <= 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'beverage_submissions_category_check'
      and conrelid = 'public.beverage_submissions'::regclass
  ) then
    alter table public.beverage_submissions
      add constraint beverage_submissions_category_check
      check (category in ('beer', 'wine', 'drink'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'beverage_submissions_status_check'
      and conrelid = 'public.beverage_submissions'::regclass
  ) then
    alter table public.beverage_submissions
      add constraint beverage_submissions_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_beers_beverage_submission_status_check'
      and conrelid = 'public.session_beers'::regclass
  ) then
    alter table public.session_beers
      add constraint session_beers_beverage_submission_status_check
      check (beverage_submission_status is null or beverage_submission_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

create unique index if not exists beverage_submissions_pending_name_category_idx
  on public.beverage_submissions (lower(btrim(name)), category)
  where status = 'pending';

create index if not exists beverage_submissions_status_created_at_idx
  on public.beverage_submissions (status, created_at desc);

create index if not exists beverage_submissions_submitted_by_idx
  on public.beverage_submissions (submitted_by, created_at desc);

alter table public.beverage_submissions enable row level security;

drop policy if exists "Users can view their own beverage submissions" on public.beverage_submissions;
create policy "Users can view their own beverage submissions"
  on public.beverage_submissions
  for select
  to authenticated
  using (submitted_by = auth.uid() or public.is_current_user_admin());

revoke insert, update, delete on table public.beverage_submissions from anon, authenticated;
grant select on table public.beverage_submissions to authenticated;

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
      'chug_verification',
      'drinking_buddy_added',
      'official_post',
      'mention',
      'beverage_submission'
    ));
end;
$$;

create or replace function public.submit_session_beverage(
  target_session_id uuid,
  beverage_name text,
  beverage_abv numeric,
  beverage_category text,
  beverage_volume text,
  beverage_quantity integer,
  consumed_at timestamp with time zone default now()
)
returns public.session_beers
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(coalesce(beverage_name, ''));
  clean_category text := coalesce(nullif(btrim(coalesce(beverage_category, '')), ''), 'beer');
  clean_volume text := coalesce(nullif(btrim(coalesce(beverage_volume, '')), ''), 'Pint');
  clean_quantity integer := greatest(coalesce(beverage_quantity, 1), 1);
  session_row public.sessions;
  submission_row public.beverage_submissions;
  drink_row public.session_beers;
  admin_profile record;
begin
  if auth.uid() is null then
    raise exception 'Not logged in.';
  end if;

  if clean_name = '' then
    raise exception 'Beverage name is required.';
  end if;

  if clean_category not in ('beer', 'wine', 'drink') then
    raise exception 'Choose a beverage category.';
  end if;

  if beverage_abv is null or beverage_abv < 0 or beverage_abv > 100 then
    raise exception 'ABV must be between 0 and 100.';
  end if;

  select sessions.*
  into session_row
  from public.sessions
  where sessions.id = target_session_id
    and sessions.user_id = auth.uid()
    and sessions.status in ('active', 'published')
  for update;

  if session_row.id is null then
    raise exception 'Session not found.';
  end if;

  insert into public.session_beers (
    session_id,
    beer_name,
    volume,
    quantity,
    abv,
    beverage_category,
    consumed_at
  ) values (
    target_session_id,
    clean_name,
    clean_volume,
    clean_quantity,
    beverage_abv,
    clean_category,
    coalesce(consumed_at, now())
  )
  returning * into drink_row;

  insert into public.beverage_submissions (
    session_beer_id,
    submitted_by,
    name,
    abv,
    category,
    status
  ) values (
    drink_row.id,
    auth.uid(),
    clean_name,
    beverage_abv,
    clean_category,
    'pending'
  )
  on conflict (lower(btrim(name)), category) where status = 'pending'
  do update set
    updated_at = now()
  returning * into submission_row;

  update public.session_beers
  set
    beverage_submission_id = submission_row.id,
    beverage_submission_status = submission_row.status
  where session_beers.id = drink_row.id
  returning * into drink_row;

  for admin_profile in
    select profiles.id
    from public.profiles
    where profiles.is_admin = true
      and profiles.id is not null
  loop
    insert into public.notifications (
      user_id,
      actor_id,
      type,
      reference_id,
      metadata
    ) values (
      admin_profile.id,
      auth.uid(),
      'beverage_submission',
      submission_row.id,
      jsonb_build_object(
        'beverage_name', clean_name,
        'beverage_category', clean_category,
        'beverage_abv', beverage_abv,
        'session_id', target_session_id,
        'session_beer_id', drink_row.id,
        'target_type', 'admin_beverage_submission'
      )
    )
    on conflict do nothing;
  end loop;

  return drink_row;
end;
$$;

create or replace function public.admin_get_beverage_submissions(
  status_filter text default 'pending',
  result_limit integer default 100
)
returns table (
  id uuid,
  session_beer_id uuid,
  session_id uuid,
  submitted_by uuid,
  username text,
  avatar_url text,
  name text,
  abv numeric,
  category text,
  status text,
  resolved_admin_beverage_id uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  pub_name text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean_status text := nullif(btrim(coalesce(status_filter, '')), '');
  clean_limit integer := least(greatest(coalesce(result_limit, 100), 1), 250);
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if clean_status is not null and clean_status not in ('pending', 'approved', 'rejected', 'all') then
    raise exception 'Choose a valid submission status.';
  end if;

  return query
  select
    submissions.id,
    submissions.session_beer_id,
    session_beers.session_id,
    submissions.submitted_by,
    profiles.username,
    profiles.avatar_url,
    submissions.name,
    submissions.abv,
    submissions.category,
    submissions.status,
    submissions.resolved_admin_beverage_id,
    submissions.reviewed_by,
    submissions.reviewed_at,
    submissions.rejection_reason,
    sessions.pub_name,
    submissions.created_at,
    submissions.updated_at
  from public.beverage_submissions submissions
  left join public.session_beers
    on session_beers.id = submissions.session_beer_id
  left join public.sessions
    on sessions.id = session_beers.session_id
  left join public.profiles
    on profiles.id = submissions.submitted_by
  where clean_status is null
    or clean_status = 'all'
    or submissions.status = clean_status
  order by
    case submissions.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    submissions.created_at desc
  limit clean_limit;
end;
$$;

create or replace function public.admin_approve_beverage_submission(
  target_submission_id uuid
)
returns public.beverage_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_row public.beverage_submissions;
  beverage_row public.admin_beverages;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into submission_row
  from public.beverage_submissions
  where id = target_submission_id
  for update;

  if submission_row.id is null then
    raise exception 'Submission not found.';
  end if;

  if submission_row.status <> 'pending' then
    raise exception 'Submission has already been reviewed.';
  end if;

  select *
  into beverage_row
  from public.admin_beverages
  where lower(btrim(name)) = lower(btrim(submission_row.name))
  limit 1;

  if beverage_row.id is null then
    insert into public.admin_beverages (
      name,
      abv,
      category,
      created_by
    ) values (
      submission_row.name,
      submission_row.abv,
      submission_row.category,
      auth.uid()
    )
    returning * into beverage_row;
  end if;

  update public.beverage_submissions
  set
    status = 'approved',
    resolved_admin_beverage_id = beverage_row.id,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = submission_row.id
  returning * into submission_row;

  update public.session_beers
  set beverage_submission_status = 'approved'
  where beverage_submission_id = submission_row.id;

  return submission_row;
end;
$$;

create or replace function public.admin_reject_beverage_submission(
  target_submission_id uuid,
  rejection_reason text default null
)
returns public.beverage_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_row public.beverage_submissions;
  fallback_abv numeric;
  clean_reason text := nullif(btrim(coalesce(rejection_reason, '')), '');
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into submission_row
  from public.beverage_submissions
  where id = target_submission_id
  for update;

  if submission_row.id is null then
    raise exception 'Submission not found.';
  end if;

  if submission_row.status <> 'pending' then
    raise exception 'Submission has already been reviewed.';
  end if;

  fallback_abv := case
    when submission_row.category = 'wine' then 12
    else 5
  end;

  update public.session_beers
  set
    beer_name = session_beers.beer_name,
    abv = fallback_abv,
    beverage_submission_status = 'rejected'
  where beverage_submission_id = submission_row.id;

  update public.beverage_submissions
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = clean_reason,
    updated_at = now()
  where id = submission_row.id
  returning * into submission_row;

  return submission_row;
end;
$$;

revoke execute on function public.submit_session_beverage(uuid, text, numeric, text, text, integer, timestamp with time zone)
  from public, anon;
revoke execute on function public.admin_get_beverage_submissions(text, integer)
  from public, anon;
revoke execute on function public.admin_approve_beverage_submission(uuid)
  from public, anon;
revoke execute on function public.admin_reject_beverage_submission(uuid, text)
  from public, anon;

grant execute on function public.submit_session_beverage(uuid, text, numeric, text, text, integer, timestamp with time zone)
  to authenticated;
grant execute on function public.admin_get_beverage_submissions(text, integer)
  to authenticated;
grant execute on function public.admin_approve_beverage_submission(uuid)
  to authenticated;
grant execute on function public.admin_reject_beverage_submission(uuid, text)
  to authenticated;

comment on table public.beverage_submissions
  is 'User-submitted beverage catalog candidates created while recording session drinks.';
comment on column public.session_beers.beverage_submission_id
  is 'Linked user beverage submission when this drink came from an unknown catalog item.';
comment on column public.session_beers.beverage_submission_status
  is 'Display snapshot for pending, approved, or rejected user beverage submissions.';

notify pgrst, 'reload schema';
