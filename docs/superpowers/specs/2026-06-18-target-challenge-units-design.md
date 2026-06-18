# Target Challenge Units Design

## Summary

Target-style Beerva challenges should score progress by Danish alcohol units instead of true pints. This makes challenges fairer when someone chooses a stronger beer, wine, or drink: a small high-ABV serving can contribute appropriately, while a low-ABV pint contributes less.

Leaderboard challenges, including KarnevalsDruk, stay on their current true-pint scoring unless a later change explicitly moves them. This keeps winner trophies and existing leaderboard finalization behavior stable.

## Requirements

- All future target challenges use alcohol units as their progress metric.
- Booze-in-June and any active or upcoming target challenges should move to alcohol units.
- Completed or finalized historical target challenges should keep their stored metric to avoid rewriting old results.
- Leaderboard challenges remain true-pint based.
- Admin-created target challenges should be saved with `metric_type = 'alcohol_units'`.
- Challenge UI should show units copy for unit-based target challenges.
- Existing true-pint challenge rows should still display and calculate correctly if their `metric_type` remains `true_pints`.
- Progress should still count only joined users and only drinks inside each challenge window.
- Legacy sessions without `session_beers` rows should keep the existing fallback behavior.

## Data Model

Use the existing `public.challenges.metric_type` column as the metric switch.

The new supported metric values are:

- `true_pints`
- `alcohol_units`

A Supabase migration will update the metric constraint to allow both values. It will update active and upcoming target challenges, including `booze-in-june`, to `alcohol_units`. It will not mutate finalized or already-ended historical target rows.

Admin challenge saving should insert and update target challenges with:

```sql
metric_type = 'alcohol_units'
```

Leaderboard challenge rows should continue using:

```sql
metric_type = 'true_pints'
```

## Progress Calculation

Challenge progress should branch on `metric_type`.

For `true_pints`, keep the current calculation:

```text
serving_volume_ml * quantity / 568
```

For `alcohol_units`, use the same Danish alcohol unit formula already used by feed stats:

```text
serving_volume_ml * quantity * (abv / 100) * 0.789 / 12
```

Where:

- `serving_volume_ml` comes from `public.beerva_serving_volume_ml(...)`
- `quantity` is clamped with `greatest(coalesce(quantity, 1), 0)`
- `abv` defaults to `0` when missing
- `0.789` is grams of ethanol per ml
- `12` is grams per Danish alcohol unit

Progress can stay as `double precision` internally. UI formatting should round to one decimal, matching the existing challenge progress behavior.

## RPC Changes

The migration should replace the latest challenge RPC definitions that calculate progress:

- `get_challenge_leaderboard(uuid)`
- `get_official_challenges()`
- `get_challenge_detail(text)` if its embedded progress depends on replaced helper queries
- any local/global challenge summary definitions that duplicate target progress calculations
- `admin_save_challenge(...)`

The canonical progress calculation should be reused or kept structurally identical wherever the RPCs need progress so local and global challenge views cannot drift.

Generic finalization for admin-created leaderboard challenges should continue to use the canonical leaderboard RPC. KarnevalsDruk-specific finalization should stay unchanged, because it is a leaderboard challenge and still awards true-pint and ABV trophies.

## Client Changes

`src/lib/challenges.ts` should support:

```ts
type ChallengeMetricType = 'true_pints' | 'alcohol_units';
```

Formatting should use metric-aware labels:

- Unit target challenge: `6.2/30 units`
- True-pint target challenge: `6.2/15`
- Leaderboard challenge: `8.4 true pints`

Target challenge admin copy should change from true-pint language to units:

- `Target units`
- `Target units must be greater than 0.`
- list rows should show `30 units` for target challenges

Existing true-pint rows should remain readable for historical data.

## Testing

Add regression tests before implementation.

SQL/source tests should verify:

- New migration exists.
- `metric_type` constraint allows `alcohol_units`.
- Active/upcoming target challenges are updated to `alcohol_units`.
- Admin target challenge saves use `metric_type = 'alcohol_units'`.
- Leaderboard challenge saves keep `metric_type = 'true_pints'`.
- Challenge progress SQL includes the unit formula with `0.789` and `12.0`.
- True-pint progress formula remains present for `true_pints`.
- KarnevalsDruk finalizer remains scoped to leaderboard true-pint behavior.

Client tests should verify:

- `mapChallengeSummaryRow` maps `alcohol_units`.
- `formatChallengeProgress` renders units for unit-based target challenges.
- true-pint and leaderboard formatting remain unchanged where appropriate.
- Admin tools validation and labels use units for target challenges.

## Rollout Notes

Because this changes active challenge scoring, the migration should reload the PostgREST schema cache after replacing RPCs:

```sql
notify pgrst, 'reload schema';
```

Users may see Booze-in-June totals change immediately after deployment because the metric changes from volume-based true pints to ABV-aware units. That is intentional and should better reflect stronger beverages.
