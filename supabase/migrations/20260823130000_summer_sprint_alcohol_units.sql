-- Summer Sprint is scored on how much alcohol people drink, not on how much
-- liquid they get through, so it moves from true pints to Danish alcohol units.
--
-- Challenge progress is always recomputed from the logged drinks, so flipping
-- the metric re-scores every entrant from their existing sessions. Nothing has
-- to be backfilled and no entry is lost.
--
-- Scoped to the running challenge: finalized or already-ended Summer Sprints
-- keep the metric they were scored on.
update public.challenges
set metric_type = 'alcohol_units'
where metric_type is distinct from 'alcohol_units'
  and finalized_at is null
  and ends_at > now()
  and (
    lower(slug) = 'summer-sprint'
    or lower(slug) like 'summer-sprint-%'
    or btrim(
      regexp_replace(lower(btrim(coalesce(title, ''))), '[^a-z0-9]+', '-', 'g'),
      '-'
    ) = 'summer-sprint'
  );

notify pgrst, 'reload schema';
