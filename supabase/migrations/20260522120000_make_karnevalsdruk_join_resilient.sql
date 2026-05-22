create or replace function public.suppress_karnevalsdruk_hangover_prompts_after_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.challenges as challenges
    where challenges.id = new.challenge_id
      and challenges.slug = 'karnevalsdruk-2026'
  ) then
    perform public.suppress_karnevalsdruk_normal_hangover_prompts(new.user_id);
  end if;

  return new;
exception
  when others then
    raise warning 'KarnevalsDruk after-join hangover cleanup failed for challenge %, user % [%]: %',
      new.challenge_id,
      new.user_id,
      sqlstate,
      sqlerrm;
    return new;
end;
$$;

drop trigger if exists challenge_entries_suppress_karnevalsdruk_hangover_prompts_after_join
  on public.challenge_entries;
create trigger challenge_entries_suppress_karnevalsdruk_hangover_prompts_after_join
  after insert on public.challenge_entries
  for each row
  execute function public.suppress_karnevalsdruk_hangover_prompts_after_join();

revoke execute on function public.suppress_karnevalsdruk_hangover_prompts_after_join()
  from public, anon, authenticated;

comment on function public.suppress_karnevalsdruk_hangover_prompts_after_join()
  is 'Best-effort cleanup of stale normal hangover prompts after joining KarnevalsDruk; cleanup failures are logged and must not block challenge entry inserts.';

notify pgrst, 'reload schema';
