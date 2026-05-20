create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

alter table public.challenges
  add column if not exists challenge_type text not null default 'target',
  add column if not exists finalized_at timestamp with time zone,
  add column if not exists winner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists winner_progress_value double precision;

alter table public.challenges
  alter column target_value drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_type_check'
      and conrelid = 'public.challenges'::regclass
  ) then
    alter table public.challenges
      add constraint challenges_type_check
      check (challenge_type in ('target', 'leaderboard'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_target_by_type_check'
      and conrelid = 'public.challenges'::regclass
  ) then
    alter table public.challenges
      add constraint challenges_target_by_type_check
      check (
        (challenge_type = 'target' and target_value > 0)
        or (challenge_type = 'leaderboard' and target_value is null)
      );
  end if;
end;
$$;

update public.challenges
set challenge_type = 'target'
where challenge_type is null;

insert into public.challenges (
  slug,
  title,
  description,
  metric_type,
  challenge_type,
  target_value,
  starts_at,
  ends_at,
  join_closes_at
) values (
  'karnevalsdruk-2026',
  'KarnevalsDruk',
  'Log drinks from 06:00 May 23 to 06:00 May 24. Highest true-pint total wins among joined drinkers.',
  'true_pints',
  'leaderboard',
  null,
  timestamp with time zone '2026-05-23 04:00:00+00',
  timestamp with time zone '2026-05-24 04:00:00+00',
  timestamp with time zone '2026-05-24 04:00:00+00'
) on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_type = excluded.metric_type,
  challenge_type = excluded.challenge_type,
  target_value = excluded.target_value,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  join_closes_at = excluded.join_closes_at;

create table if not exists public.challenge_awards (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  award_slug text not null,
  title text not null,
  description text not null,
  rank integer not null,
  progress_value double precision not null,
  metadata jsonb not null default '{}'::jsonb,
  awarded_at timestamp with time zone not null default now(),
  unique (challenge_id, user_id, award_slug)
);

create index if not exists challenge_awards_user_awarded_at_idx
  on public.challenge_awards(user_id, awarded_at desc);

alter table public.challenge_awards enable row level security;

drop policy if exists "Signed-in users can view challenge awards" on public.challenge_awards;
create policy "Signed-in users can view challenge awards"
  on public.challenge_awards
  for select
  to authenticated
  using (true);

create table if not exists public.official_feed_posts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references public.challenges(id) on delete set null,
  kind text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  unique (challenge_id, kind)
);

create index if not exists official_feed_posts_published_at_idx
  on public.official_feed_posts(published_at desc);

alter table public.official_feed_posts enable row level security;

drop policy if exists "Signed-in users can view official feed posts" on public.official_feed_posts;
create policy "Signed-in users can view official feed posts"
  on public.official_feed_posts
  for select
  to authenticated
  using (true);

drop function if exists public.get_official_challenges();
drop function if exists public.get_challenge_detail(text);

create or replace function public.get_official_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  metric_type text,
  challenge_type text,
  target_value numeric,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  join_closes_at timestamp with time zone,
  joined_at timestamp with time zone,
  entrants_count integer,
  current_user_rank integer,
  current_user_progress double precision
)
language sql
stable
set search_path = public
as $$
  with challenge_rollups as (
    select
      challenges.id,
      count(challenge_entries.user_id)::integer as entrants_count
    from public.challenges
    left join public.challenge_entries on challenge_entries.challenge_id = challenges.id
    group by challenges.id
  ),
  current_user_entries as (
    select challenge_entries.challenge_id, challenge_entries.joined_at
    from public.challenge_entries
    where challenge_entries.user_id = auth.uid()
  ),
  all_current_user_ranks as (
    select
      challenges.id as challenge_id,
      leaderboard.rank,
      leaderboard.progress_value
    from public.challenges
    cross join lateral public.get_challenge_leaderboard(challenges.id) leaderboard
    where leaderboard.user_id = auth.uid()
  )
  select
    challenges.id,
    challenges.slug,
    challenges.title,
    challenges.description,
    challenges.metric_type,
    challenges.challenge_type,
    challenges.target_value,
    challenges.starts_at,
    challenges.ends_at,
    challenges.join_closes_at,
    current_user_entries.joined_at,
    coalesce(challenge_rollups.entrants_count, 0) as entrants_count,
    all_current_user_ranks.rank as current_user_rank,
    all_current_user_ranks.progress_value as current_user_progress
  from public.challenges
  left join challenge_rollups on challenge_rollups.id = challenges.id
  left join current_user_entries on current_user_entries.challenge_id = challenges.id
  left join all_current_user_ranks on all_current_user_ranks.challenge_id = challenges.id
  order by
    case
      when now() >= challenges.starts_at and now() < challenges.ends_at then 0
      when now() < challenges.starts_at then 1
      else 2
    end,
    challenges.starts_at desc;
$$;

create or replace function public.get_challenge_detail(target_challenge_slug text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select *
    from public.challenges
    where challenges.slug = target_challenge_slug
       or challenges.id::text = target_challenge_slug
    limit 1
  ),
  challenge_entry_counts as (
    select count(challenge_entries.user_id)::integer as entrants_count
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
  ),
  current_user_entry as (
    select challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
    where challenge_entries.user_id = auth.uid()
  ),
  leaderboard as (
    select *
    from target_challenge
    cross join lateral public.get_challenge_leaderboard(target_challenge.id)
  ),
  current_user_rank as (
    select leaderboard.rank, leaderboard.progress_value
    from leaderboard
    where leaderboard.user_id = auth.uid()
  )
  select jsonb_build_object(
    'id', target_challenge.id,
    'slug', target_challenge.slug,
    'title', target_challenge.title,
    'description', target_challenge.description,
    'metric_type', target_challenge.metric_type,
    'challenge_type', target_challenge.challenge_type,
    'target_value', target_challenge.target_value,
    'starts_at', target_challenge.starts_at,
    'ends_at', target_challenge.ends_at,
    'join_closes_at', target_challenge.join_closes_at,
    'joined_at', (select joined_at from current_user_entry),
    'entrants_count', coalesce((select entrants_count from challenge_entry_counts), 0),
    'current_user_rank', (select rank from current_user_rank),
    'current_user_progress', (select progress_value from current_user_rank),
    'leaderboard', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rank', leaderboard.rank,
            'user_id', leaderboard.user_id,
            'username', leaderboard.username,
            'avatar_url', leaderboard.avatar_url,
            'progress_value', leaderboard.progress_value,
            'completed', leaderboard.completed
          )
          order by leaderboard.rank asc
        )
        from leaderboard
      ),
      '[]'::jsonb
    )
  )
  from target_challenge;
$$;

create or replace function public.get_challenge_awards(target_user_id uuid default null)
returns table (
  id uuid,
  challenge_id uuid,
  user_id uuid,
  award_slug text,
  title text,
  description text,
  rank integer,
  progress_value double precision,
  metadata jsonb,
  awarded_at timestamp with time zone
)
language sql
stable
set search_path = public
as $$
  select
    challenge_awards.id,
    challenge_awards.challenge_id,
    challenge_awards.user_id,
    challenge_awards.award_slug,
    challenge_awards.title,
    challenge_awards.description,
    challenge_awards.rank,
    challenge_awards.progress_value,
    challenge_awards.metadata,
    challenge_awards.awarded_at
  from public.challenge_awards
  where challenge_awards.user_id = coalesce(target_user_id, auth.uid())
  order by challenge_awards.awarded_at desc, challenge_awards.title asc;
$$;

create or replace function public.finalize_due_challenges(batch_size integer default 10)
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
  profile_row record;
  award_row_id uuid;
  post_row_id uuid;
  final_time timestamp with time zone;
begin
  for challenge_row in
    select *
    from public.challenges
    where challenge_type = 'leaderboard'
      and ends_at <= now()
      and finalized_at is null
    order by ends_at asc
    limit least(greatest(coalesce(batch_size, 10), 1), 50)
  loop
    final_time := now();
    award_row_id := null;
    post_row_id := null;

    select *
    into leader_row
    from public.get_challenge_leaderboard(challenge_row.id)
    order by rank asc
    limit 1;

    if leader_row.user_id is null
      or leader_row.progress_value is null
      or leader_row.progress_value <= 0 then
      update public.challenges
      set finalized_at = final_time,
          winner_user_id = null,
          winner_progress_value = null
      where id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := null;
      winner_progress_value := null;
      award_id := null;
      official_post_id := null;
      finalized_at := final_time;
      return next;
    else
      select profiles.username, profiles.avatar_url
      into profile_row
      from public.profiles
      where profiles.id = leader_row.user_id;

      with filtered_beers as (
        select
          sessions.id as session_id,
          session_beers.volume,
          greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
          session_beers.abv
        from public.sessions
        join public.session_beers on session_beers.session_id = sessions.id
        where sessions.user_id = leader_row.user_id
          and sessions.status = 'published'
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
      )
      select
        coalesce(sum(public.beerva_serving_volume_ml(filtered_beers.volume) * filtered_beers.quantity / 568.0), 0)::double precision as true_pints,
        coalesce(sum(filtered_beers.quantity), 0)::integer as drink_count,
        round((
          sum(filtered_beers.abv * filtered_beers.quantity) filter (where filtered_beers.abv is not null)
          / nullif(sum(filtered_beers.quantity) filter (where filtered_beers.abv is not null), 0)
        )::numeric, 1)::double precision as average_abv,
        count(distinct filtered_beers.session_id)::integer as session_count
      into stats_row
      from filtered_beers;

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
        'winner-of-karneval-2026',
        'Winner of Karneval 2026',
        'Won KarnevalsDruk 2026 by drinking the most true pints.',
        1,
        leader_row.progress_value,
        jsonb_build_object(
          'challenge_slug', challenge_row.slug,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0)
        ),
        final_time
      )
      on conflict (challenge_id, user_id, award_slug) do update set
        progress_value = excluded.progress_value,
        metadata = excluded.metadata
      returning id into award_row_id;

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
        'Winner of Karneval 2026',
        coalesce(profile_row.username, 'Beer Lover') || ' won KarnevalsDruk with ' || round(leader_row.progress_value::numeric, 1)::text || ' true pints.',
        jsonb_build_object(
          'winner_user_id', leader_row.user_id,
          'winner_username', profile_row.username,
          'winner_avatar_url', profile_row.avatar_url,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0),
          'challenge_slug', challenge_row.slug
        ),
        final_time
      )
      on conflict (challenge_id, kind) do update set
        title = excluded.title,
        body = excluded.body,
        metadata = excluded.metadata
      returning id into post_row_id;

      update public.challenges
      set finalized_at = final_time,
          winner_user_id = leader_row.user_id,
          winner_progress_value = leader_row.progress_value
      where id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := leader_row.user_id;
      winner_progress_value := leader_row.progress_value;
      award_id := award_row_id;
      official_post_id := post_row_id;
      finalized_at := final_time;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.invoke_challenge_finalizer()
returns void
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  cron_secret text;
  edge_function_jwt text;
  request_headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
begin
  begin
    select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
    where name = 'beerva_challenge_finalizer_cron_secret'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      cron_secret := null;
  end;

  begin
    select decrypted_secret
    into edge_function_jwt
    from vault.decrypted_secrets
    where name = 'beerva_edge_function_jwt'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      edge_function_jwt := null;
  end;

  if nullif(btrim(coalesce(edge_function_jwt, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object('Authorization', 'Bearer ' || edge_function_jwt);
  end if;

  if nullif(btrim(coalesce(cron_secret, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object('x-beerva-cron-secret', cron_secret);
  end if;

  perform net.http_post(
    url := 'https://yzrfihijpusvjypypnip.supabase.co/functions/v1/finalize-challenges',
    body := '{}'::jsonb,
    headers := request_headers,
    timeout_milliseconds := 10000
  );
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-finalize-challenges') then
    perform cron.unschedule('beerva-finalize-challenges');
  end if;

  perform cron.schedule(
    'beerva-finalize-challenges',
    '*/15 * * * *',
    $job$select public.invoke_challenge_finalizer();$job$
  );
end;
$$;

revoke execute on function public.finalize_due_challenges(integer) from public, anon, authenticated;
grant execute on function public.finalize_due_challenges(integer) to service_role;
grant execute on function public.get_challenge_awards(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;
grant execute on function public.get_challenge_detail(text) to authenticated;

comment on function public.finalize_due_challenges(integer) is 'Finalizes ended leaderboard challenges, awarding winners and posting official Beerva announcements idempotently.';
comment on table public.challenge_awards is 'Persistent official challenge trophies awarded by trusted finalization jobs.';
comment on table public.official_feed_posts is 'Beerva-authored feed announcements such as official challenge winners.';
