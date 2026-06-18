update public.challenges
set metric_type = 'alcohol_units'
where challenge_type in ('leaderboard', 'target')
  and (
    lower(slug) = 'booze-in-june'
    or lower(slug) like 'booze-in-june-%'
    or btrim(
      regexp_replace(lower(btrim(coalesce(title, ''))), '[^a-z0-9]+', '-', 'g'),
      '-'
    ) = 'booze-in-june'
  );

notify pgrst, 'reload schema';
