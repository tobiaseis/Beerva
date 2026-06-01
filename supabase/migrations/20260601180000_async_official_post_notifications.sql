-- Migration: Async official post notifications

alter table public.official_feed_posts
  add column if not exists notifications_fanned_out boolean not null default false;

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
    published_at,
    notifications_fanned_out
  ) values (
    'announcement',
    clean_title,
    clean_body,
    clean_image_url,
    linked_challenge.id,
    jsonb_strip_nulls(jsonb_build_object(
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug,
      'send_in_app_notification', send_in_app_notification,
      'notification_body', clean_notification_body,
      'push_enabled', send_push_notification,
      'push_title', case when send_push_notification then clean_push_title else null end,
      'push_body', case when send_push_notification then clean_push_body else null end
    )),
    post_request_key,
    now(),
    -- Mark as already fanned out if no notification is requested
    not send_in_app_notification
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
  end if;

  return saved_row;
end;
$$;

create or replace function public.fanout_pending_official_posts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  post_row public.official_feed_posts%rowtype;
begin
  for post_row in
    select *
    from public.official_feed_posts
    where not notifications_fanned_out
    order by created_at asc
  loop
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
      post_row.id,
      jsonb_strip_nulls(jsonb_build_object(
        'official_post_id', post_row.id,
        'official_title', post_row.title,
        'notification_body', post_row.metadata->>'notification_body',
        'push_enabled', (post_row.metadata->>'push_enabled')::boolean,
        'push_title', post_row.metadata->>'push_title',
        'push_body', post_row.metadata->>'push_body',
        'challenge_id', post_row.metadata->>'challenge_id',
        'challenge_slug', post_row.metadata->>'challenge_slug'
      ))
    from public.profiles as profiles;

    update public.official_feed_posts
    set notifications_fanned_out = true
    where id = post_row.id;
  end loop;
end;
$$;

do $$
begin
  perform cron.schedule(
    'beerva-fanout-official-posts',
    '* * * * *',
    'select public.fanout_pending_official_posts();'
  );
end $$;

notify pgrst, 'reload schema';
