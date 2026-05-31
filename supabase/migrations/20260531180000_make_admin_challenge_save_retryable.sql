alter table public.challenges
  add column if not exists admin_request_key uuid;

create unique index if not exists challenges_admin_request_key_idx
  on public.challenges(admin_request_key)
  where admin_request_key is not null;

drop function if exists public.admin_save_challenge(
  uuid,
  text,
  text,
  text,
  numeric,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text
);

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
  challenge_winner_trophy_description text default null,
  challenge_request_key uuid default null
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
    if challenge_request_key is not null then
      select challenges.*
      into saved_row
      from public.challenges
      where challenges.admin_request_key = challenge_request_key;

      if saved_row.id is not null then
        return saved_row;
      end if;
    end if;

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
      winner_trophy_description,
      admin_request_key
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
      clean_trophy_description,
      challenge_request_key
    )
    on conflict (admin_request_key)
      where admin_request_key is not null
      do nothing
    returning * into saved_row;

    if saved_row.id is null and challenge_request_key is not null then
      select challenges.*
      into saved_row
      from public.challenges
      where challenges.admin_request_key = challenge_request_key;
    end if;

    if saved_row.id is null then
      raise exception 'Could not save challenge.';
    end if;

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

revoke execute on function public.admin_save_challenge(
  uuid,
  text,
  text,
  text,
  numeric,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  uuid
) from public, anon;

grant execute on function public.admin_save_challenge(
  uuid,
  text,
  text,
  text,
  numeric,
  timestamp with time zone,
  timestamp with time zone,
  timestamp with time zone,
  boolean,
  text,
  text,
  uuid
) to authenticated;

comment on column public.challenges.admin_request_key
  is 'Client-generated UUID used to make admin challenge creation retry-safe.';

notify pgrst, 'reload schema';
