drop trigger if exists challenges_create_karnevalsdruk_hangover_prompts_after_finalize
  on public.challenges;

drop function if exists public.create_karnevalsdruk_hangover_prompts_after_finalize();

create or replace function public.invoke_challenge_finalizer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
  from public.finalize_due_challenges(10);
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

do $$
declare
  target_challenge_id uuid;
begin
  select challenges.id
  into target_challenge_id
  from public.challenges as challenges
  where challenges.slug = 'karnevalsdruk-2026'
    and challenges.ends_at <= now()
  limit 1;

  if target_challenge_id is not null
    and (
      not exists (
        select 1
        from public.challenge_awards as challenge_awards
        where challenge_awards.challenge_id = target_challenge_id
          and challenge_awards.award_slug = 'king-of-karneval-pints'
      )
      or not exists (
        select 1
        from public.challenge_awards as challenge_awards
        where challenge_awards.challenge_id = target_challenge_id
          and challenge_awards.award_slug = 'king-of-karneval-abv'
      )
      or not exists (
        select 1
        from public.official_feed_posts as official_feed_posts
        where official_feed_posts.challenge_id = target_challenge_id
          and official_feed_posts.kind = 'challenge_winner'
      )
    ) then
    update public.challenges
    set finalized_at = null,
        winner_user_id = null,
        winner_progress_value = null
    where id = target_challenge_id;
  end if;
end;
$$;

select *
from public.finalize_due_challenges(10);

revoke execute on function public.invoke_challenge_finalizer()
  from public, anon, authenticated;

comment on function public.invoke_challenge_finalizer()
  is 'Cron target that finalizes due challenges directly in the database without depending on Edge Function gateway configuration.';

notify pgrst, 'reload schema';
