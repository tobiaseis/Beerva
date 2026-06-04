-- Migration: Add autocomplete content mentions

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
    check (
      type in (
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
        'mention'
      )
    );
end $$;

create table if not exists public.content_mentions (
  id uuid primary key default gen_random_uuid(),
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('session', 'pub_crawl')),
  target_id uuid not null,
  surface text not null check (surface in ('post', 'comment')),
  source_id uuid not null,
  mention_label text not null check (char_length(btrim(mention_label)) between 2 and 80),
  created_at timestamp with time zone not null default now()
);

alter table public.content_mentions enable row level security;

create index if not exists content_mentions_mentioned_created_idx
  on public.content_mentions(mentioned_user_id, created_at desc);

create index if not exists content_mentions_target_idx
  on public.content_mentions(target_type, target_id);

create index if not exists content_mentions_source_idx
  on public.content_mentions(surface, source_id);

create unique index if not exists content_mentions_user_source_idx
  on public.content_mentions(mentioned_user_id, surface, source_id);

drop policy if exists "Authenticated users can view content mentions" on public.content_mentions;
create policy "Authenticated users can view content mentions"
  on public.content_mentions
  for select
  to authenticated
  using (true);

create or replace function public.create_content_mentions(
  target_type_input text,
  target_id_input uuid,
  surface_input text,
  source_id_input uuid,
  mention_candidates jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  source_body text;
  target_owner_id uuid;
  inserted_count integer := 0;
  inserted_mention public.content_mentions%rowtype;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_type_input not in ('session', 'pub_crawl') then
    raise exception 'Invalid mention target type.';
  end if;

  if surface_input not in ('post', 'comment') then
    raise exception 'Invalid mention surface.';
  end if;

  if mention_candidates is null or jsonb_typeof(mention_candidates) <> 'array' then
    return 0;
  end if;

  if jsonb_array_length(mention_candidates) > 10 then
    raise exception 'Too many mentions.';
  end if;

  if surface_input = 'comment' and target_type_input = 'session' then
    select session_comments.body, sessions.user_id
    into source_body, target_owner_id
    from public.session_comments
    join public.sessions on sessions.id = session_comments.session_id
    where session_comments.id = source_id_input
      and session_comments.session_id = target_id_input
      and session_comments.user_id = requesting_user_id;
  elsif surface_input = 'comment' and target_type_input = 'pub_crawl' then
    select pub_crawl_comments.body, pub_crawls.user_id
    into source_body, target_owner_id
    from public.pub_crawl_comments
    join public.pub_crawls on pub_crawls.id = pub_crawl_comments.pub_crawl_id
    where pub_crawl_comments.id = source_id_input
      and pub_crawl_comments.pub_crawl_id = target_id_input
      and pub_crawl_comments.user_id = requesting_user_id;
  elsif surface_input = 'post' and target_type_input = 'session' then
    select sessions.comment, sessions.user_id
    into source_body, target_owner_id
    from public.sessions
    where sessions.id = source_id_input
      and sessions.id = target_id_input
      and sessions.status = 'published'
      and sessions.user_id = requesting_user_id;
  elsif surface_input = 'post' and target_type_input = 'pub_crawl' then
    select sessions.comment, pub_crawls.user_id
    into source_body, target_owner_id
    from public.sessions
    join public.pub_crawls on pub_crawls.id = sessions.pub_crawl_id
    where sessions.id = source_id_input
      and sessions.pub_crawl_id = target_id_input
      and sessions.status = 'published'
      and sessions.user_id = requesting_user_id;
  end if;

  if source_body is null then
    return 0;
  end if;

  for inserted_mention in
    with candidates as (
      select distinct on (candidate."userId")
        candidate."userId" as user_id,
        nullif(btrim(candidate.label), '') as label
      from jsonb_to_recordset(mention_candidates) as candidate("userId" uuid, label text)
      where candidate."userId" is not null
    ),
    valid_candidates as (
      select candidates.user_id, candidates.label
      from candidates
      join auth.users on users.id = candidates.user_id
      where candidates.user_id <> requesting_user_id
        and candidates.label is not null
        and position(candidates.label in source_body) > 0
    )
    insert into public.content_mentions (
      mentioned_user_id,
      actor_id,
      target_type,
      target_id,
      surface,
      source_id,
      mention_label
    )
    select
      valid_candidates.user_id,
      requesting_user_id,
      target_type_input,
      target_id_input,
      surface_input,
      source_id_input,
      valid_candidates.label
    from valid_candidates
    on conflict (mentioned_user_id, surface, source_id) do nothing
    returning *
  loop
    if surface_input <> 'comment'
      or target_owner_id is null
      or target_owner_id <> inserted_mention.mentioned_user_id
    then
      insert into public.notifications (
        user_id,
        actor_id,
        type,
        reference_id,
        metadata
      ) values (
        inserted_mention.mentioned_user_id,
        requesting_user_id,
        'mention',
        target_id_input,
        jsonb_build_object(
          'target_type', target_type_input,
          'surface', surface_input,
          'mention_id', inserted_mention.id,
          'source_id', source_id_input
        )
      );
    end if;

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

revoke execute on function public.create_content_mentions(text, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.create_content_mentions(text, uuid, text, uuid, jsonb) to authenticated;

comment on table public.content_mentions is
  'Stable selected @mentions attached to Beerva post captions and comments.';

comment on function public.create_content_mentions(text, uuid, text, uuid, jsonb) is
  'Validates selected mention candidates against saved content, stores mention rows, and creates mention notifications.';

notify pgrst, 'reload schema';
