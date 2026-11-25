-- Records which signed-in users have seen a published session or pub crawl
-- post, so the author (and only the author) can see who has seen it.
-- Writes only go through public.record_post_views; reads only go through the
-- author-only RPCs below.

create table if not exists public.session_views (
  session_id uuid not null references public.sessions(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  primary key (session_id, viewer_id)
);

create table if not exists public.pub_crawl_views (
  pub_crawl_id uuid not null references public.pub_crawls(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  primary key (pub_crawl_id, viewer_id)
);

-- The primary keys cover lookups by post. These cover cascade deletes when a
-- viewer account is removed.
create index if not exists session_views_viewer_id_idx
  on public.session_views(viewer_id);

create index if not exists pub_crawl_views_viewer_id_idx
  on public.pub_crawl_views(viewer_id);

alter table public.session_views enable row level security;
alter table public.pub_crawl_views enable row level security;

drop policy if exists "Authors can see who viewed their sessions" on public.session_views;
create policy "Authors can see who viewed their sessions"
  on public.session_views
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_views.session_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "Authors can see who viewed their pub crawls" on public.pub_crawl_views;
create policy "Authors can see who viewed their pub crawls"
  on public.pub_crawl_views
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pub_crawls c
      where c.id = pub_crawl_views.pub_crawl_id
        and c.user_id = (select auth.uid())
    )
  );

create or replace function public.record_post_views(
  session_ids uuid[] default array[]::uuid[],
  pub_crawl_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := (select auth.uid());
begin
  if viewer is null then
    return;
  end if;

  if coalesce(cardinality(session_ids), 0) + coalesce(cardinality(pub_crawl_ids), 0) > 100 then
    raise exception 'Too many post views in one batch';
  end if;

  insert into public.session_views (session_id, viewer_id)
  select s.id, viewer
  from public.sessions s
  where s.id = any(coalesce(session_ids, array[]::uuid[]))
    and s.status = 'published'
    and s.user_id <> viewer
  on conflict (session_id, viewer_id)
  do update set last_seen_at = now();

  insert into public.pub_crawl_views (pub_crawl_id, viewer_id)
  select c.id, viewer
  from public.pub_crawls c
  where c.id = any(coalesce(pub_crawl_ids, array[]::uuid[]))
    and c.status = 'published'
    and c.user_id <> viewer
  on conflict (pub_crawl_id, viewer_id)
  do update set last_seen_at = now();
end;
$$;

create or replace function public.get_my_post_view_counts(
  session_ids uuid[] default array[]::uuid[],
  pub_crawl_ids uuid[] default array[]::uuid[]
)
returns table (
  target_type text,
  target_id uuid,
  views_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select 'session'::text, s.id, count(v.viewer_id)::int
  from public.sessions s
  left join public.session_views v
    on v.session_id = s.id
  where s.id = any(coalesce(session_ids, array[]::uuid[]))
    and s.user_id = (select auth.uid())
  group by s.id
  union all
  select 'pub_crawl'::text, c.id, count(v.viewer_id)::int
  from public.pub_crawls c
  left join public.pub_crawl_views v
    on v.pub_crawl_id = c.id
  where c.id = any(coalesce(pub_crawl_ids, array[]::uuid[]))
    and c.user_id = (select auth.uid())
  group by c.id;
$$;

create or replace function public.get_post_viewers(
  post_type text,
  post_id uuid
)
returns table (
  viewer_id uuid,
  username text,
  avatar_url text,
  first_seen_at timestamp with time zone,
  last_seen_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from (
    select v.viewer_id, pr.username, pr.avatar_url, v.first_seen_at, v.last_seen_at
    from public.session_views v
    join public.sessions s
      on s.id = v.session_id
    left join public.profiles pr
      on pr.id = v.viewer_id
    where post_type = 'session'
      and v.session_id = post_id
      and s.user_id = (select auth.uid())
    union all
    select v.viewer_id, pr.username, pr.avatar_url, v.first_seen_at, v.last_seen_at
    from public.pub_crawl_views v
    join public.pub_crawls c
      on c.id = v.pub_crawl_id
    left join public.profiles pr
      on pr.id = v.viewer_id
    where post_type = 'pub_crawl'
      and v.pub_crawl_id = post_id
      and c.user_id = (select auth.uid())
  ) viewers
  order by last_seen_at desc nulls last;
$$;

revoke execute on function public.record_post_views(uuid[], uuid[]) from public, anon;
grant execute on function public.record_post_views(uuid[], uuid[]) to authenticated;

revoke execute on function public.get_my_post_view_counts(uuid[], uuid[]) from public, anon;
grant execute on function public.get_my_post_view_counts(uuid[], uuid[]) to authenticated;

revoke execute on function public.get_post_viewers(text, uuid) from public, anon;
grant execute on function public.get_post_viewers(text, uuid) to authenticated;

comment on table public.session_views is 'One row per viewer per published session post. Readable only by the post author.';
comment on table public.pub_crawl_views is 'One row per viewer per published pub crawl post. Readable only by the post author.';
comment on function public.record_post_views(uuid[], uuid[]) is 'Records that the caller has seen these published posts. Ignores the caller''s own posts.';
comment on function public.get_my_post_view_counts(uuid[], uuid[]) is 'Returns view counts for the given posts that the caller authored.';
comment on function public.get_post_viewers(text, uuid) is 'Returns who has seen a post, newest first. Empty unless the caller is the author.';

notify pgrst, 'reload schema';
