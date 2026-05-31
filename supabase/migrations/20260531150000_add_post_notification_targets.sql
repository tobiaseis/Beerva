-- Add typed post targets to cheer/comment notifications so taps can open either
-- normal session posts or pub crawl posts. Also allow pub crawl cheer
-- notifications through the existing authenticated insert policy.

create or replace function public.set_notification_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_pub_name text;
  resolved_target_type text;
begin
  if new.metadata is null or jsonb_typeof(new.metadata) <> 'object' then
    new.metadata := '{}'::jsonb;
  end if;

  if new.type = 'session_started' and new.reference_id is not null then
    select nullif(btrim(sessions.pub_name), '')
    into resolved_pub_name
    from public.sessions
    where sessions.id = new.reference_id
      and sessions.user_id = new.actor_id;
  elsif new.type = 'pub_crawl_started' and new.reference_id is not null then
    select nullif(btrim(sessions.pub_name), '')
    into resolved_pub_name
    from public.sessions
    join public.pub_crawls
      on pub_crawls.id = sessions.pub_crawl_id
    where pub_crawls.id = new.reference_id
      and pub_crawls.user_id = new.actor_id
      and sessions.crawl_stop_order = 1
    order by sessions.started_at asc nulls last, sessions.created_at asc nulls last
    limit 1;
  end if;

  if new.type in ('cheer', 'comment') and new.reference_id is not null then
    if exists (
      select 1
      from public.sessions
      where sessions.id = new.reference_id
        and sessions.user_id = new.user_id
    ) then
      resolved_target_type := 'session';
    elsif exists (
      select 1
      from public.pub_crawls
      where pub_crawls.id = new.reference_id
        and pub_crawls.user_id = new.user_id
    ) then
      resolved_target_type := 'pub_crawl';
    end if;
  end if;

  if resolved_pub_name is not null then
    new.metadata := new.metadata || jsonb_build_object('pub_name', resolved_pub_name);
  end if;

  if resolved_target_type is not null then
    new.metadata := new.metadata || jsonb_build_object('target_type', resolved_target_type);
  end if;

  return new;
end;
$$;

drop policy if exists "Users can create valid notifications as themselves" on public.notifications;
create policy "Users can create valid notifications as themselves"
  on public.notifications
  for insert
  to authenticated
  with check (
    (select auth.uid()) = actor_id
    and user_id <> actor_id
    and (
      (
        type = 'cheer'
        and reference_id is not null
        and (
          (
            exists (
              select 1
              from public.sessions
              where sessions.id = notifications.reference_id
                and sessions.user_id = notifications.user_id
            )
            and exists (
              select 1
              from public.session_cheers
              where session_cheers.session_id = notifications.reference_id
                and session_cheers.user_id = notifications.actor_id
            )
          )
          or (
            exists (
              select 1
              from public.pub_crawls
              where pub_crawls.id = notifications.reference_id
                and pub_crawls.user_id = notifications.user_id
                and pub_crawls.status = 'published'
            )
            and exists (
              select 1
              from public.pub_crawl_cheers
              where pub_crawl_cheers.pub_crawl_id = notifications.reference_id
                and pub_crawl_cheers.user_id = notifications.actor_id
            )
          )
        )
      )
      or (
        type = 'invite'
        and reference_id is not null
        and exists (
          select 1
          from public.drinking_invites
          where drinking_invites.id = notifications.reference_id
            and drinking_invites.sender_id = notifications.actor_id
            and drinking_invites.recipient_id = notifications.user_id
            and drinking_invites.status = 'pending'
        )
      )
      or (
        type = 'invite_response'
        and reference_id is not null
        and exists (
          select 1
          from public.drinking_invites
          where drinking_invites.id = notifications.reference_id
            and drinking_invites.sender_id = notifications.user_id
            and drinking_invites.recipient_id = notifications.actor_id
            and drinking_invites.status in ('accepted', 'declined')
        )
      )
      or (
        type = 'session_started'
        and reference_id is not null
        and exists (
          select 1
          from public.sessions
          where sessions.id = notifications.reference_id
            and sessions.user_id = notifications.actor_id
            and sessions.status = 'active'
        )
        and exists (
          select 1
          from public.follows actor_follow
          where actor_follow.follower_id = notifications.actor_id
            and actor_follow.following_id = notifications.user_id
        )
        and exists (
          select 1
          from public.follows recipient_follow
          where recipient_follow.follower_id = notifications.user_id
            and recipient_follow.following_id = notifications.actor_id
        )
      )
      or (
        type = 'pub_crawl_started'
        and reference_id is not null
        and exists (
          select 1
          from public.pub_crawls
          where pub_crawls.id = notifications.reference_id
            and pub_crawls.user_id = notifications.actor_id
            and pub_crawls.status = 'active'
        )
        and exists (
          select 1
          from public.follows actor_follow
          where actor_follow.follower_id = notifications.actor_id
            and actor_follow.following_id = notifications.user_id
        )
        and exists (
          select 1
          from public.follows recipient_follow
          where recipient_follow.follower_id = notifications.user_id
            and recipient_follow.following_id = notifications.actor_id
        )
      )
      or (
        type = 'comment'
        and reference_id is not null
        and (
          exists (
            select 1
            from public.sessions
            where sessions.id = notifications.reference_id
              and sessions.user_id = notifications.user_id
              and sessions.status = 'published'
          )
          or exists (
            select 1
            from public.pub_crawls
            join public.pub_crawl_comments
              on pub_crawl_comments.pub_crawl_id = pub_crawls.id
            where pub_crawls.id = notifications.reference_id
              and pub_crawls.user_id = notifications.user_id
              and pub_crawls.status = 'published'
              and pub_crawl_comments.user_id = notifications.actor_id
          )
        )
        and (
          exists (
            select 1
            from public.session_comments
            where session_comments.session_id = notifications.reference_id
              and session_comments.user_id = notifications.actor_id
          )
          or exists (
            select 1
            from public.pub_crawl_comments
            where pub_crawl_comments.pub_crawl_id = notifications.reference_id
              and pub_crawl_comments.user_id = notifications.actor_id
          )
        )
      )
    )
  );

update public.notifications
set metadata = coalesce(notifications.metadata, '{}'::jsonb) || jsonb_build_object('target_type', 'session')
from public.sessions
where notifications.type in ('cheer', 'comment')
  and notifications.reference_id = sessions.id
  and sessions.user_id = notifications.user_id;

update public.notifications
set metadata = coalesce(notifications.metadata, '{}'::jsonb) || jsonb_build_object('target_type', 'pub_crawl')
from public.pub_crawls
where notifications.type in ('cheer', 'comment')
  and notifications.reference_id = pub_crawls.id
  and pub_crawls.user_id = notifications.user_id;

comment on function public.set_notification_metadata() is 'Snapshots display metadata and typed post targets onto notifications so recipients can open referenced posts directly.';
