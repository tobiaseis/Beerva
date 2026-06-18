update public.challenges
set metric_type = 'alcohol_units'
where challenge_type = 'target'
  and finalized_at is null
  and (
    lower(slug) = 'booze-in-june'
    or lower(slug) like 'booze-in-june-%'
    or regexp_replace(lower(btrim(coalesce(title, ''))), '[^a-z0-9]+', '-', 'g') = 'booze-in-june'
  );

notify pgrst, 'reload schema';
