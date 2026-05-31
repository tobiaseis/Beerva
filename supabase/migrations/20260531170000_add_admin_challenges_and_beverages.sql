alter table public.profiles
  add column if not exists is_admin boolean not null default false;

update public.profiles
set is_admin = true
where id in (
  select auth_users.id
  from auth.users as auth_users
  where lower(auth_users.email) = 'xdrengx@gmail.com'
);

create or replace function public.prevent_profile_admin_self_promotion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'INSERT' and new.is_admin = true then
      raise exception 'Profile admin access cannot be changed by signed-in users.';
    end if;

    if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
      raise exception 'Profile admin access cannot be changed by signed-in users.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_admin_self_promotion on public.profiles;
create trigger profiles_prevent_admin_self_promotion
  before insert or update of is_admin on public.profiles
  for each row
  execute function public.prevent_profile_admin_self_promotion();

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_admin = true
  );
$$;

create table if not exists public.admin_beverages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abv numeric not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint admin_beverages_name_check check (length(btrim(name)) > 0),
  constraint admin_beverages_abv_check check (abv >= 0 and abv <= 100)
);

create unique index if not exists admin_beverages_name_lower_idx
  on public.admin_beverages(lower(btrim(name)));

alter table public.admin_beverages enable row level security;

drop policy if exists "Signed-in users can view admin beverages" on public.admin_beverages;
create policy "Signed-in users can view admin beverages"
  on public.admin_beverages
  for select
  to authenticated
  using (true);

revoke insert, update, delete on table public.admin_beverages from anon, authenticated;
grant select on table public.admin_beverages to authenticated;

create or replace function public.get_admin_beverages()
returns table (
  id uuid,
  name text,
  abv numeric,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language sql
stable
set search_path = public
as $$
  select
    admin_beverages.id,
    admin_beverages.name,
    admin_beverages.abv,
    admin_beverages.created_at,
    admin_beverages.updated_at
  from public.admin_beverages
  order by lower(admin_beverages.name), admin_beverages.id;
$$;

create or replace function public.admin_save_beverage(
  target_beverage_id uuid default null,
  beverage_name text default null,
  beverage_abv numeric default null
)
returns public.admin_beverages
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(coalesce(beverage_name, ''));
  saved_row public.admin_beverages;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if clean_name = '' then
    raise exception 'Beer name is required.';
  end if;

  if beverage_abv is null or beverage_abv < 0 or beverage_abv > 100 then
    raise exception 'ABV must be between 0 and 100.';
  end if;

  if target_beverage_id is null then
    insert into public.admin_beverages (
      name,
      abv,
      created_by
    ) values (
      clean_name,
      beverage_abv,
      auth.uid()
    )
    returning * into saved_row;
  else
    update public.admin_beverages
    set
      name = clean_name,
      abv = beverage_abv,
      updated_at = now()
    where admin_beverages.id = target_beverage_id
    returning * into saved_row;

    if saved_row.id is null then
      raise exception 'Admin beer not found.';
    end if;
  end if;

  return saved_row;
exception
  when unique_violation then
    raise exception 'A beer with that name already exists.';
end;
$$;

alter table public.challenges
  add column if not exists winner_trophy_enabled boolean not null default false,
  add column if not exists winner_trophy_title text,
  add column if not exists winner_trophy_description text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_winner_trophy_type_check'
      and conrelid = 'public.challenges'::regclass
  ) then
    alter table public.challenges
      add constraint challenges_winner_trophy_type_check
      check (challenge_type = 'leaderboard' or winner_trophy_enabled = false);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_winner_trophy_copy_check'
      and conrelid = 'public.challenges'::regclass
  ) then
    alter table public.challenges
      add constraint challenges_winner_trophy_copy_check
      check (
        (
          winner_trophy_enabled = true
          and length(btrim(coalesce(winner_trophy_title, ''))) > 0
          and length(btrim(coalesce(winner_trophy_description, ''))) > 0
        )
        or (
          winner_trophy_enabled = false
          and winner_trophy_title is null
          and winner_trophy_description is null
        )
      );
  end if;
end;
$$;

create or replace function public.admin_get_challenges()
returns setof public.challenges
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  return query
  select challenges.*
  from public.challenges
  order by challenges.starts_at desc, challenges.created_at desc;
end;
$$;

create or replace function public.admin_save_challenge(
  target_challenge_id uuid default null,
  challenge_title text default null,
  challenge_description text default null,
  target_challenge_type text default null,
  challenge_target_value numeric default null,
  challenge_starts_at timestamp with time zone default null,
  challenge_ends_at timestamp with time zone default null,
  challenge_join_closes_at timestamp with time zone default null,
  challenge_winner_trophy_enabled boolean default false,
  challenge_winner_trophy_title text default null,
  challenge_winner_trophy_description text default null
)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_title text := btrim(coalesce(challenge_title, ''));
  clean_description text := btrim(coalesce(challenge_description, ''));
  clean_trophy_title text := nullif(btrim(coalesce(challenge_winner_trophy_title, '')), '');
  clean_trophy_description text := nullif(btrim(coalesce(challenge_winner_trophy_description, '')), '');
  saved_row public.challenges;
  existing_row public.challenges;
  generated_slug text;
  has_entries boolean := false;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if clean_title = '' then
    raise exception 'Challenge title is required.';
  end if;

  if clean_description = '' then
    raise exception 'Challenge description is required.';
  end if;

  if target_challenge_type not in ('target', 'leaderboard') then
    raise exception 'Challenge type must be target or leaderboard.';
  end if;

  if challenge_starts_at is null
    or challenge_ends_at is null
    or challenge_join_closes_at is null then
    raise exception 'Challenge dates are required.';
  end if;

  if challenge_starts_at >= challenge_ends_at then
    raise exception 'Challenge end must be after its start.';
  end if;

  if challenge_join_closes_at < challenge_starts_at
    or challenge_join_closes_at > challenge_ends_at then
    raise exception 'Joining must close between the challenge start and end.';
  end if;

  if target_challenge_type = 'target' then
    if challenge_target_value is null or challenge_target_value <= 0 then
      raise exception 'Target true pints must be greater than 0.';
    end if;

    if challenge_winner_trophy_enabled
      or clean_trophy_title is not null
      or clean_trophy_description is not null then
      raise exception 'Winner trophies are only available for leaderboard challenges.';
    end if;

    challenge_winner_trophy_enabled := false;
    clean_trophy_title := null;
    clean_trophy_description := null;
  else
    challenge_target_value := null;
  end if;

  if challenge_winner_trophy_enabled
    and (clean_trophy_title is null or clean_trophy_description is null) then
    raise exception 'Winner trophy title and description are required.';
  end if;

  if not challenge_winner_trophy_enabled then
    clean_trophy_title := null;
    clean_trophy_description := null;
  end if;

  if target_challenge_id is null then
    generated_slug := btrim(
      regexp_replace(lower(clean_title), '[^a-z0-9]+', '-', 'g'),
      '-'
    );
    generated_slug := coalesce(nullif(generated_slug, ''), 'challenge')
      || '-'
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    insert into public.challenges (
      slug,
      title,
      description,
      metric_type,
      challenge_type,
      target_value,
      starts_at,
      ends_at,
      join_closes_at,
      winner_trophy_enabled,
      winner_trophy_title,
      winner_trophy_description
    ) values (
      generated_slug,
      clean_title,
      clean_description,
      'true_pints',
      target_challenge_type,
      challenge_target_value,
      challenge_starts_at,
      challenge_ends_at,
      challenge_join_closes_at,
      challenge_winner_trophy_enabled,
      clean_trophy_title,
      clean_trophy_description
    )
    returning * into saved_row;

    return saved_row;
  end if;

  select challenges.*
  into existing_row
  from public.challenges
  where challenges.id = target_challenge_id
  for update;

  if existing_row.id is null then
    raise exception 'Challenge not found.';
  end if;

  if existing_row.finalized_at is not null then
    raise exception 'Finalized challenges cannot be edited.';
  end if;

  select exists (
    select 1
    from public.challenge_entries
    where challenge_entries.challenge_id = target_challenge_id
  )
  into has_entries;

  if has_entries and (
    existing_row.challenge_type is distinct from target_challenge_type
    or existing_row.target_value is distinct from challenge_target_value
    or existing_row.starts_at is distinct from challenge_starts_at
    or existing_row.ends_at is distinct from challenge_ends_at
    or existing_row.join_closes_at is distinct from challenge_join_closes_at
    or existing_row.winner_trophy_enabled is distinct from challenge_winner_trophy_enabled
    or existing_row.winner_trophy_title is distinct from clean_trophy_title
    or existing_row.winner_trophy_description is distinct from clean_trophy_description
  ) then
    raise exception 'Competition rules cannot change after people have joined.';
  end if;

  update public.challenges
  set
    title = clean_title,
    description = clean_description,
    metric_type = 'true_pints',
    challenge_type = target_challenge_type,
    target_value = challenge_target_value,
    starts_at = challenge_starts_at,
    ends_at = challenge_ends_at,
    join_closes_at = challenge_join_closes_at,
    winner_trophy_enabled = challenge_winner_trophy_enabled,
    winner_trophy_title = clean_trophy_title,
    winner_trophy_description = clean_trophy_description
  where challenges.id = target_challenge_id
  returning * into saved_row;

  return saved_row;
end;
$$;

create or replace function public.finalize_generic_due_challenges(batch_size integer default 10)
returns table (
  challenge_id uuid,
  challenge_slug text,
  winner_user_id uuid,
  winner_progress_value double precision,
  award_id uuid,
  official_post_id uuid,
  finalized_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
  leader_row record;
  stats_row record;
  award_row_id uuid;
  post_row_id uuid;
  final_time timestamp with time zone;
begin
  for challenge_row in
    select challenges.*
    from public.challenges as challenges
    where challenges.challenge_type = 'leaderboard'
      and challenges.slug <> 'karnevalsdruk-2026'
      and challenges.ends_at <= now()
      and challenges.finalized_at is null
    order by challenges.ends_at asc
    limit least(greatest(coalesce(batch_size, 10), 1), 50)
  loop
    final_time := now();
    award_row_id := null;
    post_row_id := null;

    select leaderboard.*
    into leader_row
    from public.get_challenge_leaderboard(challenge_row.id) as leaderboard
    order by leaderboard.rank asc
    limit 1;

    if leader_row.user_id is null
      or leader_row.progress_value is null
      or leader_row.progress_value <= 0 then
      update public.challenges
      set
        finalized_at = final_time,
        winner_user_id = null,
        winner_progress_value = null
      where challenges.id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := null;
      winner_progress_value := null;
      award_id := null;
      official_post_id := null;
      finalized_at := final_time;
      return next;
      continue;
    end if;

    select
      coalesce(sum(drink_events.quantity), 0)::integer as drink_count,
      round((
        sum(drink_events.abv * drink_events.quantity) filter (where drink_events.abv is not null)
        / nullif(sum(drink_events.quantity) filter (where drink_events.abv is not null), 0)
      )::numeric, 1)::double precision as average_abv,
      count(distinct drink_events.session_id)::integer as session_count
    into stats_row
    from (
      select
        sessions.id as session_id,
        greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
        session_beers.abv
      from public.sessions
      join public.session_beers on session_beers.session_id = sessions.id
      where sessions.user_id = leader_row.user_id
        and sessions.status = 'published'
        and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
      union all
      select
        sessions.id as session_id,
        greatest(coalesce(sessions.quantity, 1), 0) as quantity,
        sessions.abv
      from public.sessions
      where sessions.user_id = leader_row.user_id
        and sessions.status = 'published'
        and coalesce(sessions.started_at, sessions.created_at) >= challenge_row.starts_at
        and coalesce(sessions.started_at, sessions.created_at) < challenge_row.ends_at
        and not exists (
          select 1
          from public.session_beers
          where session_beers.session_id = sessions.id
        )
    ) as drink_events;

    insert into public.official_feed_posts (
      challenge_id,
      kind,
      title,
      body,
      metadata,
      published_at
    ) values (
      challenge_row.id,
      'challenge_winner',
      'Winner of ' || challenge_row.title,
      coalesce(leader_row.username, 'Beer Lover')
        || ' won '
        || challenge_row.title
        || ' with '
        || round(leader_row.progress_value::numeric, 1)::text
        || ' true pints.',
      jsonb_build_object(
        'winner_user_id', leader_row.user_id,
        'winner_username', leader_row.username,
        'winner_avatar_url', leader_row.avatar_url,
        'true_pints', round(leader_row.progress_value::numeric, 1),
        'drink_count', coalesce(stats_row.drink_count, 0),
        'average_abv', coalesce(stats_row.average_abv, 0),
        'session_count', coalesce(stats_row.session_count, 0),
        'challenge_slug', challenge_row.slug
      ),
      final_time
    )
    on conflict on constraint official_feed_posts_challenge_id_kind_key do update set
      title = excluded.title,
      body = excluded.body,
      metadata = excluded.metadata,
      published_at = excluded.published_at
    returning id into post_row_id;

    if challenge_row.winner_trophy_enabled then
      insert into public.challenge_awards (
        challenge_id,
        user_id,
        award_slug,
        title,
        description,
        rank,
        progress_value,
        metadata,
        awarded_at
      ) values (
        challenge_row.id,
        leader_row.user_id,
        challenge_row.slug || '-winner',
        challenge_row.winner_trophy_title,
        challenge_row.winner_trophy_description,
        1,
        leader_row.progress_value,
        jsonb_build_object(
          'award_category', 'winner',
          'challenge_slug', challenge_row.slug,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0)
        ),
        final_time
      )
      on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key do update set
        title = excluded.title,
        description = excluded.description,
        rank = excluded.rank,
        progress_value = excluded.progress_value,
        metadata = excluded.metadata,
        awarded_at = excluded.awarded_at
      returning id into award_row_id;
    end if;

    update public.challenges
    set
      finalized_at = final_time,
      winner_user_id = leader_row.user_id,
      winner_progress_value = leader_row.progress_value
    where challenges.id = challenge_row.id;

    challenge_id := challenge_row.id;
    challenge_slug := challenge_row.slug;
    winner_user_id := leader_row.user_id;
    winner_progress_value := leader_row.progress_value;
    award_id := award_row_id;
    official_post_id := post_row_id;
    finalized_at := final_time;
    return next;
  end loop;
end;
$$;

create or replace function public.invoke_challenge_finalizer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.finalize_due_challenges(10);

  perform 1
  from public.finalize_generic_due_challenges(10);
end;
$$;

revoke execute on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;

revoke execute on function public.prevent_profile_admin_self_promotion() from public, anon, authenticated;
revoke execute on function public.get_admin_beverages() from public, anon;
revoke execute on function public.admin_get_challenges() from public, anon;
revoke execute on function public.admin_save_beverage(uuid, text, numeric) from public, anon;
revoke execute on function public.admin_save_challenge(uuid, text, text, text, numeric, timestamp with time zone, timestamp with time zone, timestamp with time zone, boolean, text, text) from public, anon;
grant execute on function public.get_admin_beverages() to authenticated;
grant execute on function public.admin_get_challenges() to authenticated;
grant execute on function public.admin_save_beverage(uuid, text, numeric) to authenticated;
grant execute on function public.admin_save_challenge(uuid, text, text, text, numeric, timestamp with time zone, timestamp with time zone, timestamp with time zone, boolean, text, text) to authenticated;

revoke execute on function public.finalize_generic_due_challenges(integer)
  from public, anon, authenticated;
grant execute on function public.finalize_generic_due_challenges(integer) to service_role;

revoke execute on function public.invoke_challenge_finalizer()
  from public, anon, authenticated;

comment on table public.admin_beverages
  is 'Ordinary beers added through the Beerva admin tools and merged into the built-in client catalog.';
comment on function public.finalize_generic_due_challenges(integer)
  is 'Finalizes admin-created leaderboard challenges with official winner posts and optional persistent winner trophies.';

notify pgrst, 'reload schema';
