-- Migration: Admin official post editing

create or replace function public.admin_update_official_post(
  target_post_id uuid default null,
  post_title text default null,
  post_body text default null,
  post_image_url text default null,
  linked_challenge_id uuid default null,
  notification_body text default null
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
  expected_image_prefix text;
  linked_challenge public.challenges%rowtype;
  current_post public.official_feed_posts%rowtype;
  updated_row public.official_feed_posts;
  next_metadata jsonb;
begin
  if requesting_user_id is null or not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if target_post_id is null then
    raise exception 'Official post id is required.';
  end if;

  select official_feed_posts.*
  into current_post
  from public.official_feed_posts
  where official_feed_posts.id = target_post_id;

  if current_post.id is null then
    raise exception 'Official post not found.';
  end if;

  if current_post.kind <> 'announcement' then
    raise exception 'Only announcement posts can be edited.';
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
    and clean_image_url is distinct from current_post.image_url
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

  if current_post.metadata ? 'notification_body'
    and clean_notification_body is null then
    raise exception 'Notification body is required.';
  end if;

  next_metadata := jsonb_strip_nulls(
    coalesce(current_post.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug,
      'notification_body', case
        when current_post.metadata ? 'notification_body' then clean_notification_body
        else null
      end
    )
  );

  update public.official_feed_posts
  set title = clean_title,
    body = clean_body,
    image_url = clean_image_url,
    linked_challenge_id = linked_challenge.id,
    metadata = next_metadata
  where id = target_post_id
  returning * into updated_row;

  update public.notifications
  set metadata = jsonb_strip_nulls(
    coalesce(notifications.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'official_title', clean_title,
      'notification_body', clean_notification_body,
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug,
      'push_enabled', notifications.metadata->'push_enabled',
      'push_title', notifications.metadata->'push_title',
      'push_body', notifications.metadata->'push_body'
    )
  )
  where notifications.type = 'official_post'
    and notifications.reference_id = target_post_id
    and current_post.metadata ? 'notification_body'
    and notifications.metadata ? 'push_enabled';

  update public.notifications
  set metadata = jsonb_strip_nulls(
    coalesce(notifications.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'official_title', clean_title,
      'notification_body', clean_notification_body,
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug
    )
  )
  where notifications.type = 'official_post'
    and notifications.reference_id = target_post_id
    and current_post.metadata ? 'notification_body'
    and not (notifications.metadata ? 'push_enabled');

  return updated_row;
end;
$$;

revoke execute on function public.admin_update_official_post(uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.admin_update_official_post(uuid, text, text, text, uuid, text) to authenticated;

comment on function public.admin_update_official_post(uuid, text, text, text, uuid, text)
  is 'Allows admins to edit published official announcement posts without creating new notifications or re-sending pushes.';

notify pgrst, 'reload schema';
