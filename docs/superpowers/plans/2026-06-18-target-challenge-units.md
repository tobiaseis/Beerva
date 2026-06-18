# Target Challenge Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change target-style challenges to score by Danish alcohol units going forward while preserving true-pint leaderboard challenges.

**Architecture:** Use the existing `challenges.metric_type` column as the source of truth, adding `alcohol_units` as a supported metric. Add a shared SQL helper for challenge progress so canonical global leaderboards and compact challenge summaries use the same formula. Update client formatting and admin target challenge copy so unit-based target challenges read as units instead of true pints.

**Tech Stack:** Expo React Native, TypeScript, Supabase/Postgres SQL migrations and RPCs, Node assertion scripts.

---

## File Structure

- Create `supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql`: add `alcohol_units` metric support, add shared challenge progress helper, update active/upcoming target challenge rows, replace challenge progress RPCs, and replace `admin_save_challenge`.
- Modify `scripts/challenges.test.js`: regression coverage for unit metric mapping, formatting, source wiring, and SQL migration expectations.
- Modify `scripts/adminTools.test.js`: regression coverage for admin challenge unit copy and target challenge metric persistence.
- Modify `src/lib/challenges.ts`: support `alcohol_units` metric type and metric-aware challenge progress formatting.
- Modify `src/screens/ChallengeDetailScreen.tsx`: pass `metricType` into progress formatting.
- Modify `src/screens/PubLegendsScreen.tsx`: pass `metricType` into challenge row progress formatting.
- Modify `src/screens/FeedScreen.tsx`: pass `metricType` into the active challenge strip progress formatting.
- Modify `src/lib/adminTools.ts`: change target challenge validation copy from true pints to units.
- Modify `src/screens/AdminToolsScreen.tsx`: change target challenge labels and row metadata from true pints to units.

---

### Task 1: Challenge Client and Migration Failing Tests

**Files:**
- Modify: `scripts/challenges.test.js`

- [ ] **Step 1: Add the new migration path and metric assertions**

Near the other migration path constants, add:

```js
const targetChallengeUnitsMigrationPath = 'supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql';
```

Near the existing `assert.ok(exists(...))` migration checks, add:

```js
assert.ok(exists(targetChallengeUnitsMigrationPath), 'target challenge units migration should exist');
```

After `const archiveMigrationSql = read(archiveMigrationPath);`, add:

```js
const targetChallengeUnitsMigrationSql = read(targetChallengeUnitsMigrationPath);
```

After the existing `formatChallengeProgress` assertions near the top, add:

```js
assert.equal(
  formatChallengeProgress(6.234, 30, 'target', 'alcohol_units'),
  '6.2/30 units',
  'unit target challenges should show units in progress copy'
);
assert.equal(
  formatChallengeProgress(6.234, 15, 'target', 'true_pints'),
  '6.2/15',
  'legacy true-pint target challenges should keep compact fraction formatting'
);
assert.equal(
  formatChallengeProgress(8.44, null, 'leaderboard', 'alcohol_units'),
  '8.4 true pints',
  'leaderboard challenges should keep true-pint copy even if a bad metric arrives'
);
```

After the existing `summary` assertions, add:

```js
const unitSummary = mapChallengeSummaryRow({
  ...summaryRow,
  slug: 'booze-in-june',
  title: 'Booze-in-June',
  description: 'Reach 30 units in June.',
  metric_type: 'alcohol_units',
  target_value: '30',
  current_user_progress: '6.234',
});

assert.equal(unitSummary.metricType, 'alcohol_units');
assert.equal(unitSummary.targetValue, 30);
assert.equal(
  formatChallengeProgress(unitSummary.currentUserProgress, unitSummary.targetValue, unitSummary.challengeType, unitSummary.metricType),
  '6.2/30 units'
);
```

Near the existing archive migration assertions, add:

```js
assert.match(
  targetChallengeUnitsMigrationSql,
  /drop constraint if exists challenges_metric_type_check/i,
  'unit migration should replace the old metric_type constraint'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /metric_type in \('true_pints', 'alcohol_units'\)/i,
  'metric_type constraint should allow alcohol_units'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /create or replace function public\.beerva_challenge_progress_value/i,
  'unit migration should add a shared challenge progress helper'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /0\.789[\s\S]*12\.0/i,
  'unit progress should use Danish alcohol unit conversion constants'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /\/ 568\.0/i,
  'true-pint progress should remain available'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /set metric_type = 'alcohol_units'[\s\S]*challenge_type = 'target'[\s\S]*ends_at > now\(\)/i,
  'active and upcoming target challenges should move to alcohol units'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /finalized_at is null/i,
  'metric migration should not rewrite finalized historical challenges'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /target_challenge_type = 'target'[\s\S]*'alcohol_units'[\s\S]*'true_pints'/i,
  'admin target challenges should save as alcohol_units while leaderboard challenges stay true_pints'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /create or replace function public\.get_challenge_leaderboard/i,
  'unit migration should replace canonical global challenge leaderboard'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /create or replace function public\.get_official_challenges/i,
  'unit migration should replace compact official challenge summaries'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /notify pgrst,\s*'reload schema'/i,
  'unit migration should reload PostgREST schema cache'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /where challenges\.challenge_type = 'leaderboard'[\s\S]*and challenges\.slug = 'karnevalsdruk-2026'/i,
  'KarnevalsDruk finalizer should remain leaderboard scoped'
);
```

Near the existing `detailScreenSource`, `feedScreenSource`, and Pub Legends source assertions, add:

```js
assert.match(
  detailScreenSource,
  /formatChallengeProgress\(item\.progressValue,\s*challenge\?\.targetValue,\s*challenge\?\.challengeType,\s*challenge\?\.metricType\)/,
  'detail leaderboard rows should pass challenge metric into progress formatting'
);
assert.match(
  detailScreenSource,
  /formatChallengeProgress\(challenge\.currentUserProgress,\s*challenge\.targetValue,\s*challenge\.challengeType,\s*challenge\.metricType\)/,
  'detail progress summary should pass challenge metric into progress formatting'
);
assert.match(
  pubLegendsSource,
  /formatChallengeProgress\(item\.currentUserProgress,\s*item\.targetValue,\s*item\.challengeType,\s*item\.metricType\)/,
  'Pub Legends challenge rows should pass metric type into progress formatting'
);
assert.match(
  feedScreenSource,
  /formatChallengeProgress\(activeChallengeSummary\.currentUserProgress,\s*activeChallengeSummary\.targetValue,\s*activeChallengeSummary\.challengeType,\s*activeChallengeSummary\.metricType\)/,
  'feed challenge strip should pass metric type into progress formatting'
);
```

- [ ] **Step 2: Run the challenge test to verify it fails**

Run:

```bash
npm run test:challenges
```

Expected: FAIL with `target challenge units migration should exist`.

---

### Task 2: Admin Tools Failing Tests

**Files:**
- Modify: `scripts/adminTools.test.js`

- [ ] **Step 1: Add unit-metric admin assertions**

Near the existing migration path constants, add:

```js
const targetChallengeUnitsMigrationPath = 'supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql';
```

Near the existing migration existence checks, add:

```js
assert.ok(exists(targetChallengeUnitsMigrationPath), 'target challenge units migration should exist');
```

After `const archiveMigrationSql = read(archiveMigrationPath);`, add:

```js
const targetChallengeUnitsMigrationSql = read(targetChallengeUnitsMigrationPath);
```

After the existing challenge migration assertions, add:

```js
assert.match(
  targetChallengeUnitsMigrationSql,
  /Target units must be greater than 0\./,
  'database admin save validation should use target unit wording'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /case[\s\S]*when target_challenge_type = 'target' then 'alcohol_units'[\s\S]*else 'true_pints'[\s\S]*end/i,
  'admin save challenge should store metric type from challenge type'
);
```

Replace the existing validation assertion:

```js
assert.equal(adminTools.validateChallengeDraft({ ...baseChallengeDraft, targetValue: '0' }), 'Target true pints must be greater than 0.');
```

with:

```js
assert.equal(adminTools.validateChallengeDraft({ ...baseChallengeDraft, targetValue: '0' }), 'Target units must be greater than 0.');
```

Near the existing `adminScreenSource` assertions, add:

```js
assert.match(adminScreenSource, /Target units/, 'admin target challenge form should use units wording');
assert.match(adminScreenSource, /\$\{item\.targetValue\} units/, 'admin challenge rows should label target values as units');
assert.doesNotMatch(adminScreenSource, /Target true pints/);
assert.doesNotMatch(adminScreenSource, /targetValue\} true pints/);
```

Near the existing `adminToolsSource` assertions, add:

```js
assert.match(adminToolsSource, /Target units must be greater than 0\./);
assert.doesNotMatch(adminToolsSource, /Target true pints must be greater than 0\./);
```

- [ ] **Step 2: Run the admin tools test to verify it fails**

Run:

```bash
npm run test:admin-tools
```

Expected: FAIL with `target challenge units migration should exist` or the old target true-pint validation copy.

---

### Task 3: Add Unit-Aware Challenge SQL

**Files:**
- Create: `supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql`
- Modify: `scripts/challenges.test.js`
- Modify: `scripts/adminTools.test.js`

- [ ] **Step 1: Create migration opening with metric constraint and shared helper**

Create `supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql` with this opening section:

```sql
alter table public.challenges
  drop constraint if exists challenges_metric_type_check;

alter table public.challenges
  add constraint challenges_metric_type_check
  check (metric_type in ('true_pints', 'alcohol_units'));

create or replace function public.beerva_challenge_progress_value(
  challenge_metric_type text,
  serving_volume text,
  quantity_value numeric,
  abv_value numeric
)
returns double precision
language sql
immutable
set search_path = public
as $$
  select case
    when challenge_metric_type = 'alcohol_units' then
      (
        public.beerva_serving_volume_ml(serving_volume)
        * greatest(coalesce(quantity_value, 1), 0)::double precision
        * (greatest(coalesce(abv_value, 0), 0)::double precision / 100.0)
        * 0.789
        / 12.0
      )::double precision
    else
      (
        public.beerva_serving_volume_ml(serving_volume)
        * greatest(coalesce(quantity_value, 1), 0)::double precision
        / 568.0
      )::double precision
  end;
$$;

comment on function public.beerva_challenge_progress_value(text, text, numeric, numeric) is
  'Calculates challenge progress for true-pint and Danish alcohol-unit challenge metrics.';

grant execute on function public.beerva_challenge_progress_value(text, text, numeric, numeric) to authenticated;

update public.challenges
set metric_type = 'alcohol_units'
where challenge_type = 'target'
  and finalized_at is null
  and ends_at > now();
```

- [ ] **Step 2: Replace `admin_save_challenge` in the migration**

In the same migration, copy the current `public.admin_save_challenge(...)` definition from `supabase/migrations/20260531180000_make_admin_challenge_save_retryable.sql`, including its revoke/grant block.

Make these exact changes inside the copied function:

```sql
raise exception 'Target units must be greater than 0.';
```

Use this expression for `metric_type` in the `insert into public.challenges (...) values (...)` block:

```sql
case
  when target_challenge_type = 'target' then 'alcohol_units'
  else 'true_pints'
end,
```

Use this expression in the `update public.challenges set` block:

```sql
metric_type = case
  when target_challenge_type = 'target' then 'alcohol_units'
  else 'true_pints'
end,
```

Do not change the function signature.

- [ ] **Step 3: Replace `get_challenge_leaderboard` in the migration**

In the same migration, copy the current `public.get_challenge_leaderboard(uuid)` definition from `supabase/migrations/20260603120000_add_admin_challenge_archive.sql`.

Inside the copied `beer_events` CTE, replace the current true-pint expression with:

```sql
public.beerva_challenge_progress_value(
  target_challenge.metric_type,
  session_beers.volume,
  session_beers.quantity,
  session_beers.abv
) as progress_value
```

Inside the copied `legacy_session_events` CTE, replace the current true-pint expression with:

```sql
public.beerva_challenge_progress_value(
  target_challenge.metric_type,
  sessions.volume,
  sessions.quantity,
  sessions.abv
) as progress_value
```

In `beverage_progress`, change every `true_pints` reference in that CTE to `progress_value`:

```sql
sum(drink_events.progress_value) as progress_value
```

and:

```sql
select beer_events.user_id, beer_events.progress_value
from beer_events
union all
select legacy_session_events.user_id, legacy_session_events.progress_value
from legacy_session_events
```

Leave the result columns unchanged.

- [ ] **Step 4: Replace `get_official_challenges` in the migration**

In the same migration, copy the current `public.get_official_challenges()` definition from `supabase/migrations/20260603120000_add_admin_challenge_archive.sql`.

Inside the copied `beer_events` CTE, replace the current true-pint expression with:

```sql
public.beerva_challenge_progress_value(
  challenges.metric_type,
  session_beers.volume,
  session_beers.quantity,
  session_beers.abv
) as progress_value
```

Inside the copied `legacy_session_events` CTE, replace the current true-pint expression with:

```sql
public.beerva_challenge_progress_value(
  challenges.metric_type,
  sessions.volume,
  sessions.quantity,
  sessions.abv
) as progress_value
```

In `beverage_progress`, change every `true_pints` reference in that CTE to `progress_value` exactly as in Step 3.

Leave the return columns unchanged.

- [ ] **Step 5: Preserve detail and finalizer behavior**

Do not replace `get_challenge_detail(text)`: it derives progress from `get_challenge_leaderboard(uuid)` and already returns `metric_type`.

Do not replace `finalize_due_challenges(integer)`: it is KarnevalsDruk-specific and must stay true-pint based.

Do not replace `finalize_generic_due_challenges(integer)`: it only finalizes leaderboard challenges and continues to use the canonical leaderboard RPC.

Append the existing grants from the copied function blocks and end the migration with:

```sql
notify pgrst, 'reload schema';
```

- [ ] **Step 6: Run SQL/source tests**

Run:

```bash
npm run test:challenges
npm run test:admin-tools
```

Expected: tests move past migration-exists failures. `test:challenges` still fails on metric-aware client formatting, and `test:admin-tools` still fails on admin UI/client copy that still says true pints.

- [ ] **Step 7: Leave SQL changes uncommitted until client and admin tests are green**

Do not commit at this point. Continue directly to Task 4 and Task 5 so the red tests added in Tasks 1 and 2 are made green before any implementation commit.

Keep these files modified:

```
supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql
scripts/challenges.test.js
scripts/adminTools.test.js
```

---

### Task 4: Metric-Aware Challenge Formatting

**Files:**
- Modify: `src/lib/challenges.ts`
- Modify: `src/screens/ChallengeDetailScreen.tsx`
- Modify: `src/screens/PubLegendsScreen.tsx`
- Modify: `src/screens/FeedScreen.tsx`
- Test: `scripts/challenges.test.js`

- [ ] **Step 1: Update metric type and formatter in `src/lib/challenges.ts`**

Change:

```ts
export type ChallengeMetricType = 'true_pints';
```

to:

```ts
export type ChallengeMetricType = 'true_pints' | 'alcohol_units';
```

Replace `toMetricType` with:

```ts
const toMetricType = (value: string | null | undefined): ChallengeMetricType => (
  value === 'alcohol_units' ? 'alcohol_units' : 'true_pints'
);
```

Replace `formatChallengeProgress` with:

```ts
export const formatChallengeProgress = (
  progress: number | string | null | undefined,
  target: number | string | null | undefined,
  challengeType: ChallengeType = CHALLENGE_TYPE.TARGET,
  metricType: ChallengeMetricType | string | null | undefined = 'true_pints'
) => {
  const progressValue = toNumber(progress).toFixed(1);
  if (challengeType === CHALLENGE_TYPE.LEADERBOARD) {
    return `${progressValue} true pints`;
  }

  const targetValue = toNumber(target).toFixed(0);
  if (metricType === 'alcohol_units') {
    return `${progressValue}/${targetValue} units`;
  }

  return `${progressValue}/${targetValue}`;
};
```

Change the `getLeaderboardEntryMeta` challenge parameter type from:

```ts
Pick<ChallengeSummary, 'challengeType'> | { challengeType?: ChallengeType | string | null }
```

to:

```ts
Pick<ChallengeSummary, 'challengeType' | 'metricType'> | { challengeType?: ChallengeType | string | null; metricType?: ChallengeMetricType | string | null }
```

Leave the target-challenge return value as `Completed`/`In progress`.

- [ ] **Step 2: Pass metric type from challenge detail screen**

In `src/screens/ChallengeDetailScreen.tsx`, replace:

```tsx
{formatChallengeProgress(item.progressValue, challenge?.targetValue, challenge?.challengeType)}
```

with:

```tsx
{formatChallengeProgress(item.progressValue, challenge?.targetValue, challenge?.challengeType, challenge?.metricType)}
```

Replace:

```tsx
{formatChallengeProgress(challenge.currentUserProgress, challenge.targetValue, challenge.challengeType)}
```

with:

```tsx
{formatChallengeProgress(challenge.currentUserProgress, challenge.targetValue, challenge.challengeType, challenge.metricType)}
```

- [ ] **Step 3: Pass metric type from Pub Legends**

In `src/screens/PubLegendsScreen.tsx`, replace both occurrences of:

```tsx
formatChallengeProgress(item.currentUserProgress, item.targetValue, item.challengeType)
```

with:

```tsx
formatChallengeProgress(item.currentUserProgress, item.targetValue, item.challengeType, item.metricType)
```

- [ ] **Step 4: Pass metric type from Feed**

In `src/screens/FeedScreen.tsx`, replace:

```tsx
formatChallengeProgress(activeChallengeSummary.currentUserProgress, activeChallengeSummary.targetValue, activeChallengeSummary.challengeType)
```

with:

```tsx
formatChallengeProgress(
  activeChallengeSummary.currentUserProgress,
  activeChallengeSummary.targetValue,
  activeChallengeSummary.challengeType,
  activeChallengeSummary.metricType
)
```

- [ ] **Step 5: Run challenge tests and TypeScript**

Run:

```bash
npm run test:challenges
npx tsc --noEmit
```

Expected:

```text
official challenge checks passed
```

and TypeScript exits with no errors.

- [ ] **Step 6: Commit challenge SQL and client formatting**

Run:

```bash
git add supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql src/lib/challenges.ts src/screens/ChallengeDetailScreen.tsx src/screens/PubLegendsScreen.tsx src/screens/FeedScreen.tsx scripts/challenges.test.js
git commit -m "feat: score target challenges by alcohol units"
```

---

### Task 5: Admin Target Challenge Unit Copy

**Files:**
- Modify: `src/lib/adminTools.ts`
- Modify: `src/screens/AdminToolsScreen.tsx`
- Test: `scripts/adminTools.test.js`

- [ ] **Step 1: Update validation copy in `src/lib/adminTools.ts`**

Replace:

```ts
return 'Target true pints must be greater than 0.';
```

with:

```ts
return 'Target units must be greater than 0.';
```

- [ ] **Step 2: Update admin challenge row metadata**

In `src/screens/AdminToolsScreen.tsx`, replace:

```tsx
{item.challengeType === 'target' ? `${item.targetValue} true pints` : 'Leaderboard'} - {formatChallengeWindow(item)}
```

with:

```tsx
{item.challengeType === 'target' ? `${item.targetValue} units` : 'Leaderboard'} - {formatChallengeWindow(item)}
```

- [ ] **Step 3: Update admin challenge form label**

In `src/screens/AdminToolsScreen.tsx`, replace:

```tsx
<FormLabel>Target true pints</FormLabel>
```

with:

```tsx
<FormLabel>Target units</FormLabel>
```

- [ ] **Step 4: Run admin tests and TypeScript**

Run:

```bash
npm run test:admin-tools
npx tsc --noEmit
```

Expected:

```text
admin tools checks passed
```

and TypeScript exits with no errors.

- [ ] **Step 5: Commit admin copy**

Run:

```bash
git add src/lib/adminTools.ts src/screens/AdminToolsScreen.tsx scripts/adminTools.test.js
git commit -m "feat: label admin target challenges as units"
```

---

### Task 6: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:challenges
npm run test:admin-tools
npm run test:session-units
npx tsc --noEmit
```

Expected:

```text
official challenge checks passed
admin tools checks passed
alcohol unit checks passed
```

and TypeScript exits with no errors.

- [ ] **Step 2: Build web app**

Run:

```bash
npm run build:web
```

Expected: Expo export completes and `scripts/versionServiceWorker.js` exits without errors.

- [ ] **Step 3: Review diff and status**

Run:

```bash
git status --short
git diff --stat HEAD
git diff -- supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql src/lib/challenges.ts src/screens/ChallengeDetailScreen.tsx src/screens/PubLegendsScreen.tsx src/screens/FeedScreen.tsx src/lib/adminTools.ts src/screens/AdminToolsScreen.tsx scripts/challenges.test.js scripts/adminTools.test.js
```

Expected: no uncommitted source changes after the task commits, unless final verification required a small fix.

- [ ] **Step 4: Commit final verification fixes if needed**

If Step 1 or Step 2 required small fixes, run:

```bash
git add supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql src/lib/challenges.ts src/screens/ChallengeDetailScreen.tsx src/screens/PubLegendsScreen.tsx src/screens/FeedScreen.tsx src/lib/adminTools.ts src/screens/AdminToolsScreen.tsx scripts/challenges.test.js scripts/adminTools.test.js
git commit -m "fix: finalize target challenge unit scoring"
```

If `git status --short` is empty after Step 3, do not create another commit.
