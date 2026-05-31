-- Move follow-notification creation into database triggers so it can't
-- half-fail and isn't duplicated across client screens (UserProfileScreen /
-- PeopleScreen now just write the follow row). Runs as SECURITY DEFINER, so it
-- bypasses RLS; the additive follow insert policy from the previous migration
-- is now redundant but harmless.

create or replace function public.create_follow_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follower_id = new.following_id then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type)
  values (new.following_id, new.follower_id, 'follow');

  return new;
end;
$$;

drop trigger if exists follows_create_notification on public.follows;
create trigger follows_create_notification
  after insert on public.follows
  for each row
  execute function public.create_follow_notification();

create or replace function public.delete_follow_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where notifications.user_id = old.following_id
    and notifications.actor_id = old.follower_id
    and notifications.type = 'follow';

  return old;
end;
$$;

drop trigger if exists follows_delete_notification on public.follows;
create trigger follows_delete_notification
  after delete on public.follows
  for each row
  execute function public.delete_follow_notification();

comment on function public.create_follow_notification() is 'Creates a follow notification for the followed user when a follow row is inserted.';
comment on function public.delete_follow_notification() is 'Removes the follow notification when a follow is undone.';
