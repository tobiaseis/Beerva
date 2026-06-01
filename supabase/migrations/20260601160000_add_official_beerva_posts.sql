insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'official_post_images',
  'official_post_images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can view official post images" on storage.objects;
create policy "Authenticated users can view official post images"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'official_post_images');

drop policy if exists "Admins can upload their own official post images" on storage.objects;
create policy "Admins can upload their own official post images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'official_post_images'
    and public.is_current_user_admin()
    and (storage.foldername(name))[1] = 'admins'
    and (storage.foldername(name))[2] = auth.uid()::text
    and (storage.foldername(name))[3] = 'posts'
  );

drop policy if exists "Admins can delete their own official post images" on storage.objects;
create policy "Admins can delete their own official post images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'official_post_images'
    and public.is_current_user_admin()
    and (storage.foldername(name))[1] = 'admins'
    and (storage.foldername(name))[2] = auth.uid()::text
    and (storage.foldername(name))[3] = 'posts'
  );

alter table public.official_feed_posts
  add column if not exists admin_request_key uuid,
  add column if not exists linked_challenge_id uuid references public.challenges(id) on delete set null,
  add column if not exists image_url text;

create unique index if not exists official_feed_posts_admin_request_key_idx
  on public.official_feed_posts(admin_request_key)
  where admin_request_key is not null;

alter table public.notifications
  alter column actor_id drop not null;

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
      'official_post'
    ));
end $$;

create or replace function public.admin_get_official_posts()
returns setof public.official_feed_posts
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
  select official_feed_posts.*
  from public.official_feed_posts
  order by official_feed_posts.published_at desc, official_feed_posts.created_at desc;
end;
$$;

create or replace function public.admin_publish_official_post(
  post_title text default null,
  post_body text default null,
  post_image_url text default null,
  linked_challenge_id uuid default null,
  send_in_app_notification boolean default false,
  notification_body text default null,
  send_push_notification boolean default false,
  push_title text default null,
  push_body text default null,
  post_request_key uuid default null
)
returns public.official_feed_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  clean_title text := nullif(btrim(coalesce(post_title, '')), '');
  clean_body text := nullif(btrim(coalesce(post_body, '')), '');
  clean_image_url text := nullif(btrim(coalesce(post_image_url, '')), '');
  clean_notification_body text := nullif(btrim(coalesce(notification_body, '')), '');
  clean_push_title text := nullif(btrim(coalesce(push_title, '')), '');
  clean_push_body text := nullif(btrim(coalesce(push_body, '')), '');
  expected_image_prefix text;
  linked_challenge public.challenges%rowtype;
  saved_row public.official_feed_posts;
begin
  if requesting_user_id is null or not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if post_request_key is null then
    raise exception 'A publication request key is required.';
  end if;

  select official_feed_posts.*
  into saved_row
  from public.official_feed_posts
  where official_feed_posts.admin_request_key = post_request_key
  limit 1;

  if saved_row.id is not null then
    return saved_row;
  end if;

  if clean_title is null then
    raise exception 'Official post title is required.';
  end if;

  if clean_body is null then
    raise exception 'Official post body is required.';
  end if;

  expected_image_prefix :=
    'https://yzrfihijpusvjypypnip.supabase.co/storage/v1/object/public/official_post_images/admins/'
    || requesting_user_id::text
    || '/posts/';

  if clean_image_url is not null
    and clean_image_url not like expected_image_prefix || '%' then
    raise exception 'Official post image must come from your admin upload folder.';
  end if;

  if linked_challenge_id is not null then
    select challenges.*
    into linked_challenge
    from public.challenges
    where challenges.id = linked_challenge_id;

    if linked_challenge.id is null then
      raise exception 'Linked challenge not found.';
    end if;
  end if;

  if send_push_notification and not send_in_app_notification then
    raise exception 'Push notifications require in-app notifications.';
  end if;

  if send_in_app_notification and clean_notification_body is null then
    raise exception 'Notification body is required.';
  end if;

  if send_push_notification and clean_push_title is null then
    raise exception 'Push title is required.';
  end if;

  if send_push_notification and clean_push_body is null then
    raise exception 'Push body is required.';
  end if;

  insert into public.official_feed_posts (
    kind,
    title,
    body,
    image_url,
    linked_challenge_id,
    metadata,
    admin_request_key,
    published_at
  ) values (
    'announcement',
    clean_title,
    clean_body,
    clean_image_url,
    linked_challenge.id,
    jsonb_strip_nulls(jsonb_build_object(
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug
    )),
    post_request_key,
    now()
  )
  on conflict (admin_request_key)
  where admin_request_key is not null
  do nothing
  returning * into saved_row;

  if saved_row.id is null then
    select official_feed_posts.*
    into saved_row
    from public.official_feed_posts
    where official_feed_posts.admin_request_key = post_request_key
    limit 1;

    if saved_row.id is null then
      raise exception 'Could not resolve publication retry.';
    end if;

    return saved_row;
  end if;

  if send_in_app_notification then
    insert into public.notifications (
      user_id,
      actor_id,
      type,
      reference_id,
      metadata
    )
    select profiles.id,
      null,
      'official_post',
      saved_row.id,
      jsonb_strip_nulls(jsonb_build_object(
        'official_post_id', saved_row.id,
        'official_title', saved_row.title,
        'notification_body', clean_notification_body,
        'push_enabled', send_push_notification,
        'push_title', case when send_push_notification then clean_push_title else null end,
        'push_body', case when send_push_notification then clean_push_body else null end,
        'challenge_id', linked_challenge.id,
        'challenge_slug', linked_challenge.slug
      ))
    from public.profiles as profiles;
  end if;

  return saved_row;
end;
$$;

revoke execute on function public.admin_get_official_posts() from public, anon;
revoke execute on function public.admin_publish_official_post(
  text,
  text,
  text,
  uuid,
  boolean,
  text,
  boolean,
  text,
  text,
  uuid
) from public, anon;

grant execute on function public.admin_get_official_posts() to authenticated;
grant execute on function public.admin_publish_official_post(
  text,
  text,
  text,
  uuid,
  boolean,
  text,
  boolean,
  text,
  text,
  uuid
) to authenticated;

comment on column public.official_feed_posts.admin_request_key
  is 'Client-generated UUID used to make admin announcement publication retry-safe.';
comment on column public.official_feed_posts.linked_challenge_id
  is 'Optional challenge action for general Beerva announcements. Winner posts continue using challenge_id.';
comment on column public.official_feed_posts.image_url
  is 'Optional public URL for one compressed official announcement image.';
comment on function public.admin_get_official_posts()
  is 'Lists official Beerva feed posts for admins.';
comment on function public.admin_publish_official_post(text, text, text, uuid, boolean, text, boolean, text, text, uuid)
  is 'Publishes one retry-safe official Beerva announcement and optionally fans out in-app notifications.';

notify pgrst, 'reload schema';
