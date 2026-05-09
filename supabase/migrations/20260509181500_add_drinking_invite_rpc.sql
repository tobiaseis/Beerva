create or replace function public.create_drinking_invite(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  invite_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_user_id is null or target_user_id = requesting_user_id then
    raise exception 'Choose another user to invite.';
  end if;

  if not exists (
    select 1
    from public.follows sender_follow
    where sender_follow.follower_id = requesting_user_id
      and sender_follow.following_id = target_user_id
  ) or not exists (
    select 1
    from public.follows recipient_follow
    where recipient_follow.follower_id = target_user_id
      and recipient_follow.following_id = requesting_user_id
  ) then
    raise exception 'Invites only work between mutual mates.';
  end if;

  insert into public.drinking_invites (sender_id, recipient_id)
  values (requesting_user_id, target_user_id)
  returning id into invite_id;

  insert into public.notifications (user_id, actor_id, type, reference_id)
  values (target_user_id, requesting_user_id, 'invite', invite_id);

  return invite_id;
end;
$$;

create or replace function public.respond_to_drinking_invite(target_invite_id uuid, response_status text)
returns public.drinking_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  invite_row public.drinking_invites;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if response_status not in ('accepted', 'declined') then
    raise exception 'Choose a valid invite response.';
  end if;

  update public.drinking_invites
  set status = response_status,
      responded_at = now()
  where id = target_invite_id
    and recipient_id = requesting_user_id
    and status = 'pending'
  returning * into invite_row;

  if invite_row.id is null then
    raise exception 'This invite has already been answered.';
  end if;

  insert into public.notifications (user_id, actor_id, type, reference_id)
  values (invite_row.sender_id, requesting_user_id, 'invite_response', invite_row.id);

  return invite_row;
end;
$$;

revoke execute on function public.create_drinking_invite(uuid) from public, anon;
revoke execute on function public.respond_to_drinking_invite(uuid, text) from public, anon;
grant execute on function public.create_drinking_invite(uuid) to authenticated;
grant execute on function public.respond_to_drinking_invite(uuid, text) to authenticated;

comment on function public.create_drinking_invite(uuid) is 'Creates an actionable drinking invite and its notification in one transaction.';
comment on function public.respond_to_drinking_invite(uuid, text) is 'Answers a drinking invite and notifies the original sender in one transaction.';
