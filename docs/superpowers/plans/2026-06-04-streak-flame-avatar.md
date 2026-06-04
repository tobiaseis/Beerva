# Streak Flame Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an animated flame around a user's avatar (feed, post detail, and both profile screens) while they are on a current drinking streak, with the flame's intensity scaling across four tiers and a small streak-count label on profile pages.

**Architecture:** The current streak is computed on read in Postgres by one canonical function `get_current_streaks(user_ids uuid[])`, reused by `get_profile_stats` (profile screens) and `get_session_feed_details` (feed). The post-detail screen, which fetches its own data, reads the streak through a thin client helper that calls the same canonical RPC. On the client, a shared `StreakAvatar` component wraps the existing `CachedImage` and draws an animated SVG flame ring whose appearance is chosen by a pure `streakToFlameTier` mapping.

**Tech Stack:** Expo / React Native (web-first PWA), TypeScript, Supabase Postgres RPCs, `react-native-svg` + React Native `Animated` (both already installed), Node-based source/unit tests in `scripts/*.test.js` run via `node`.

---

## Background the engineer needs

- **Drinking day:** The app buckets activity into a 6am-to-6am window in `Europe/Copenhagen`. In SQL this is
  `(timezone('Europe/Copenhagen', coalesce(started_at, created_at)) - interval '6 hours')::date`
  (see `supabase/migrations/20260531160000_add_common_cocktails_and_wine.sql:137`). In the client it is `localDateKey()` in `src/lib/profileStats.ts` (which subtracts `DAY_ROLLOVER_HOURS = 6`).
- **Current streak (this feature):** the number of consecutive drinking days ending at the user's most recent drinking day, but only if that most recent day is **today or yesterday** (Copenhagen drinking-day). Otherwise 0. Only `status = 'published'` sessions count. Distinct from the existing all-time `longest_day_streak`.
- **Display threshold:** flame shows only when streak ≥ 2.
- **Tiers:** 1 = streak 2–3, 2 = 4–6, 3 = 7–13, 4 = 14+.
- **Tests:** Each `scripts/*.test.js` is a standalone Node script using `node:assert/strict`, run directly (e.g. `node scripts/profileStats.test.js`). TypeScript modules are loaded via the `loadTypeScriptModule` helper already present in `scripts/profileStats.test.js`. Several existing tests assert on **file source strings** (e.g. `scripts/feedCardRedesign.test.js`, `scripts/profileStatsPanel.test.js`) — we follow that convention for SQL migrations and RN components that can't be unit-rendered.
- **Reduced motion:** use `AccessibilityInfo.isReduceMotionEnabled()` (returns a Promise) plus the `reduceMotionChanged` event; on web React Native maps this to `prefers-reduced-motion`.

## File structure

- **Create** `supabase/migrations/20260604150000_add_current_streaks.sql` — canonical `get_current_streaks` + redefine `get_profile_stats` (adds `current_streak`) + redefine `get_session_feed_details` (adds `author_current_streak`).
- **Create** `src/lib/streakFlame.ts` — pure `streakToFlameTier` + `getFlameTierConfig` + tier color/timing config.
- **Create** `src/lib/currentStreaks.ts` — `fetchCurrentStreaks(userIds)` client helper (used by PostDetailScreen).
- **Create** `src/components/StreakAvatar.tsx` — flame-ring avatar wrapper.
- **Create** `scripts/streakFlame.test.js` — unit tests for `streakFlame.ts`, source assertions for the migration, `StreakAvatar`, and the four wiring sites.
- **Modify** `src/lib/profileStats.ts` — add `currentStreak` to `Stats`/`emptyStats`, compute it in `calculateStats` (client fallback parity).
- **Modify** `src/lib/profileStatsApi.ts` — map `current_streak` from the RPC row.
- **Modify** `src/lib/sessionFeedDetails.ts` — add `authorCurrentStreak` to `SessionFeedDetail` + row mapping.
- **Modify** `scripts/profileStats.test.js` — tests for `calculateStats` current streak.
- **Modify** `scripts/sessionFeedDetails.test.js` — test the new mapped field.
- **Modify** `src/screens/FeedScreen.tsx` — `FeedSession.author_current_streak`, populate it, swap `CachedImage` → `StreakAvatar` in `FeedSessionCard`.
- **Modify** `src/screens/PostDetailScreen.tsx` — fetch author streak via `fetchCurrentStreaks`, set `author_current_streak` on the built session.
- **Modify** `src/screens/ProfileScreen.tsx` — swap display avatar to `StreakAvatar` with `streak`/`showCount`.
- **Modify** `src/screens/UserProfileScreen.tsx` — same swap.
- **Modify** `package.json` — add `test:streak-flame` script.

---

## Task 1: Current-streak logic in `calculateStats` (client core, TDD)

This is the algorithmic heart and the only piece that is cleanly unit-testable in JS. The SQL mirrors it.

**Files:**
- Modify: `src/lib/profileStats.ts`
- Test: `scripts/profileStats.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/profileStats.test.js` (before any final summary `console.log`, after the existing `calculateStats` tests). The helper `baseRow` and `calculateStats` are already imported at the top of that file.

```js
// --- Current streak ---
// All rows use 20:00 UTC (= 22:00 Copenhagen, same calendar date, well past the 6am rollover),
// so each row's drinking day equals its UTC calendar date. referenceDate is passed explicitly
// so tests do not depend on the real clock.
const dayRow = (isoDate, id) => baseRow({
  session_id: id,
  created_at: `${isoDate}T20:00:00.000Z`,
  session_started_at: `${isoDate}T20:00:00.000Z`,
});
const REF = new Date('2026-05-10T20:00:00.000Z'); // "today" drinking day = 2026-05-10

// Two consecutive days ending today -> streak 2 (active)
assert.equal(
  calculateStats([dayRow('2026-05-09', 's1'), dayRow('2026-05-10', 's2')], REF).currentStreak,
  2
);

// Ends yesterday (grace day) -> still active
assert.equal(
  calculateStats([dayRow('2026-05-08', 's1'), dayRow('2026-05-09', 's2')], REF).currentStreak,
  2
);

// Ends two days ago -> decayed to 0
assert.equal(
  calculateStats([dayRow('2026-05-07', 's1'), dayRow('2026-05-08', 's2')], REF).currentStreak,
  0
);

// Gap inside the run: only the run ending today counts (08 broken by missing 09... here 10 only)
assert.equal(
  calculateStats([dayRow('2026-05-07', 's1'), dayRow('2026-05-10', 's2')], REF).currentStreak,
  1
);

// Longer active run with an earlier gap -> counts only the trailing consecutive run
assert.equal(
  calculateStats(
    [dayRow('2026-05-05', 's0'), dayRow('2026-05-08', 's1'), dayRow('2026-05-09', 's2'), dayRow('2026-05-10', 's3')],
    REF
  ).currentStreak,
  3
);

// No sessions -> 0
assert.equal(calculateStats([], REF).currentStreak, 0);

console.log('current streak tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/profileStats.test.js`
Expected: FAIL — `calculateStats(...).currentStreak` is `undefined`, so the first `assert.equal(undefined, 2)` throws `AssertionError`.

- [ ] **Step 3: Add `currentStreak` to the `Stats` type and `emptyStats`**

In `src/lib/profileStats.ts`, add the field to the `Stats` type (place it next to the existing streak fields, after `longestDayStreak`):

```ts
  longestDayStreak: number;
  currentStreak: number;
  maxTwoPintWeekStreak: number;
```

And in `emptyStats`:

```ts
  longestDayStreak: 0,
  currentStreak: 0,
  maxTwoPintWeekStreak: 0,
```

- [ ] **Step 4: Implement the computation in `calculateStats`**

Change the signature to accept a reference date (defaults to now):

```ts
export const calculateStats = (
  sessions: ProfileSessionStatsRow[] = [],
  referenceDate: Date = new Date()
): Stats => {
```

The early return for empty input must include the new field. Replace:

```ts
  if (sessions.length === 0) {
    return emptyStats;
  }
```

(no change needed — `emptyStats` now carries `currentStreak: 0`.)

Immediately **after** the existing longest-day-streak loop (the block ending at `prevTime = t;` around `src/lib/profileStats.ts:562`), add:

```ts
  // Current streak: consecutive drinking days ending at the most recent day,
  // counted only if that most recent day is today or yesterday (drinking-day).
  let currentStreak = 0;
  const todayKey = localDateKey(referenceDate.toISOString());
  if (sortedDays.length > 0 && todayKey) {
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const todayTime = new Date(ty, tm - 1, td).getTime();
    const lastKey = sortedDays[sortedDays.length - 1];
    const [ly, lm, ld] = lastKey.split('-').map(Number);
    const lastTime = new Date(ly, lm - 1, ld).getTime();
    const daysSinceLast = Math.round((todayTime - lastTime) / ONE_DAY_MS);
    if (daysSinceLast === 0 || daysSinceLast === 1) {
      currentStreak = 1;
      for (let i = sortedDays.length - 1; i > 0; i -= 1) {
        const [y1, m1, d1] = sortedDays[i].split('-').map(Number);
        const [y0, m0, d0] = sortedDays[i - 1].split('-').map(Number);
        const gap = Math.round(
          (new Date(y1, m1 - 1, d1).getTime() - new Date(y0, m0 - 1, d0).getTime()) / ONE_DAY_MS
        );
        if (gap === 1) currentStreak += 1;
        else break;
      }
    }
  }
```

> Note: the existing longest-streak loop also declares `let currentStreak`. Rename the loop's variable to `runLength` to avoid the redeclaration. The loop currently reads:
> ```ts
>   let longestDayStreak = 0;
>   let currentStreak = 0;
>   let prevTime = -Infinity;
>   const ONE_DAY_MS = 86400000;
>   for (const key of sortedDays) {
>     ...
>     if (currentStreak === 0) { currentStreak = 1; }
>     else if (Math.round((t - prevTime) / ONE_DAY_MS) === 1) { currentStreak += 1; }
>     else { currentStreak = 1; }
>     if (currentStreak > longestDayStreak) longestDayStreak = currentStreak;
>     prevTime = t;
>   }
> ```
> Rename every `currentStreak` inside this loop to `runLength` (5 occurrences). Leave `ONE_DAY_MS` where it is — the new block reuses it.

Finally add `currentStreak` to the returned object (next to `longestDayStreak`):

```ts
    longestDayStreak,
    currentStreak,
    maxTwoPintWeekStreak,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node scripts/profileStats.test.js`
Expected: PASS — ends with `current streak tests passed` and no assertion errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/profileStats.ts scripts/profileStats.test.js
git commit -m "feat: compute current drinking streak in profile stats"
```

---

## Task 2: `streakToFlameTier` pure helper (TDD)

**Files:**
- Create: `src/lib/streakFlame.ts`
- Test: `scripts/streakFlame.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `scripts/streakFlame.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const { streakToFlameTier, getFlameTierConfig, FLAME_TIERS } = loadTypeScriptModule('src/lib/streakFlame.ts');

// Tier boundaries
assert.equal(streakToFlameTier(0), 0);
assert.equal(streakToFlameTier(1), 0);
assert.equal(streakToFlameTier(2), 1);
assert.equal(streakToFlameTier(3), 1);
assert.equal(streakToFlameTier(4), 2);
assert.equal(streakToFlameTier(6), 2);
assert.equal(streakToFlameTier(7), 3);
assert.equal(streakToFlameTier(13), 3);
assert.equal(streakToFlameTier(14), 4);
assert.equal(streakToFlameTier(99), 4);

// Config: null below threshold, present at/above
assert.equal(getFlameTierConfig(1), null);
assert.equal(getFlameTierConfig(2).tier, 1);
assert.equal(getFlameTierConfig(14).tier, 4);

// Each defined tier carries the fields the component relies on
for (const t of [1, 2, 3, 4]) {
  const cfg = FLAME_TIERS[t];
  assert.ok(cfg.colors.core && cfg.colors.mid && cfg.colors.outer, `tier ${t} colors`);
  assert.ok(typeof cfg.flickerDurationMs === 'number' && cfg.flickerDurationMs > 0, `tier ${t} duration`);
  assert.ok(typeof cfg.scale === 'number' && cfg.scale > 0, `tier ${t} scale`);
}

console.log('streakFlame tier tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/streakFlame.test.js`
Expected: FAIL — `Cannot find module '.../src/lib/streakFlame.ts'` (file does not exist yet).

- [ ] **Step 3: Implement `src/lib/streakFlame.ts`**

```ts
// Pure mapping from a current drinking streak to its flame tier and visual config.
// Tier 0 means "no flame" (streak below the display threshold of 2).

export type FlameTier = 0 | 1 | 2 | 3 | 4;

export type FlameTierConfig = {
  tier: Exclude<FlameTier, 0>;
  // Gradient stops from hot center outward.
  colors: { core: string; mid: string; outer: string };
  // Full flicker cycle in ms (lower = faster).
  flickerDurationMs: number;
  // Flame height multiplier relative to the avatar radius.
  scale: number;
};

export const FLAME_DISPLAY_THRESHOLD = 2;

export const streakToFlameTier = (streak: number): FlameTier => {
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 4) return 2;
  if (streak >= FLAME_DISPLAY_THRESHOLD) return 1;
  return 0;
};

export const FLAME_TIERS: Record<Exclude<FlameTier, 0>, FlameTierConfig> = {
  // 2-3 days: small amber/orange, gentle slow flicker.
  1: {
    tier: 1,
    colors: { core: '#FFE08A', mid: '#FFA53C', outer: '#FF6A00' },
    flickerDurationMs: 1600,
    scale: 1.0,
  },
  // 4-6 days: taller, red-ish, livelier flicker.
  2: {
    tier: 2,
    colors: { core: '#FFB37A', mid: '#FF5A2C', outer: '#E11900' },
    flickerDurationMs: 1100,
    scale: 1.12,
  },
  // 7-13 days: roaring blue-hot base, slow flicker.
  3: {
    tier: 3,
    colors: { core: '#FFFFFF', mid: '#6EC6FF', outer: '#1E64FF' },
    flickerDurationMs: 1700,
    scale: 1.22,
  },
  // 14+ days: fully blue flame, fast flicker.
  4: {
    tier: 4,
    colors: { core: '#CFE8FF', mid: '#3D8BFF', outer: '#0A2FFF' },
    flickerDurationMs: 650,
    scale: 1.32,
  },
};

export const getFlameTierConfig = (streak: number): FlameTierConfig | null => {
  const tier = streakToFlameTier(streak);
  return tier === 0 ? null : FLAME_TIERS[tier];
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/streakFlame.test.js`
Expected: PASS — ends with `streakFlame tier tests passed`.

- [ ] **Step 5: Add the npm test script**

In `package.json` `scripts`, add (next to `test:stats`):

```json
    "test:streak-flame": "node scripts/streakFlame.test.js",
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/streakFlame.ts scripts/streakFlame.test.js package.json
git commit -m "feat: add streak flame tier mapping"
```

---

## Task 3: SQL migration — canonical streak RPC + extend the two read RPCs

**Files:**
- Create: `supabase/migrations/20260604150000_add_current_streaks.sql`
- Test: `scripts/streakFlame.test.js` (append source assertions)

- [ ] **Step 1: Write the failing source-assertion test**

Append to `scripts/streakFlame.test.js`:

```js
// --- Migration assertions ---
const migration = readSource('supabase/migrations/20260604150000_add_current_streaks.sql');

assert.match(migration, /create or replace function public\.get_current_streaks\(user_ids uuid\[\]\)/);
// Reuses the 6am Copenhagen drinking-day definition.
assert.match(migration, /timezone\('Europe\/Copenhagen'/);
assert.match(migration, /interval '6 hours'/);
// Active-window guard: most recent drinking day is today or yesterday.
assert.match(migration, /- 1\)\s*\n?\s*then/);
// Only published sessions count.
assert.match(migration, /status = 'published'/);
// Both read RPCs are redefined and reference the canonical function.
assert.match(migration, /create or replace function public\.get_profile_stats\(target_user_id uuid\)/);
assert.match(migration, /current_streak integer/);
assert.match(migration, /create or replace function public\.get_session_feed_details\(session_ids uuid\[\]\)/);
assert.match(migration, /author_current_streak integer/);
assert.ok((migration.match(/public\.get_current_streaks\(/g) || []).length >= 3,
  'get_current_streaks should be defined once and called from both read RPCs');
// Grants follow existing conventions.
assert.match(migration, /grant execute on function public\.get_current_streaks\(uuid\[\]\) to authenticated/);
assert.match(migration, /notify pgrst, 'reload schema'/);

console.log('streak migration assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/streakFlame.test.js`
Expected: FAIL — `ENOENT` reading the migration file (does not exist yet).

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260604150000_add_current_streaks.sql`. This redefines both read functions in full; copy the existing bodies from `supabase/migrations/20260531160000_add_common_cocktails_and_wine.sql` (for `get_profile_stats`) and `supabase/migrations/20260602130000_add_session_feed_details_rpc.sql` (for `get_session_feed_details`) and apply the marked additions.

```sql
-- Adds the canonical current-streak computation and surfaces it on the two
-- read RPCs the app already calls (profile stats + feed details).

-- Canonical: current consecutive drinking-day streak per user.
-- A drinking day is the 6am-6am Europe/Copenhagen window. The streak is the
-- length of the consecutive-day run ending at the user's most recent drinking
-- day, returned only when that day is today or yesterday (else 0). Published
-- sessions only.
create or replace function public.get_current_streaks(user_ids uuid[])
returns table (
  user_id uuid,
  current_streak integer
)
language sql
stable
security definer
set search_path = public
as $$
  with drinking_days as (
    select distinct
      s.user_id as uid,
      (timezone('Europe/Copenhagen', coalesce(s.started_at, s.created_at)) - interval '6 hours')::date as drinking_day
    from public.sessions s
    where s.user_id = any(coalesce(user_ids, array[]::uuid[]))
      and s.status = 'published'
  ),
  grouped as (
    select
      uid,
      drinking_day,
      drinking_day - (row_number() over (partition by uid order by drinking_day))::integer as streak_group
    from drinking_days
  ),
  runs as (
    select
      uid,
      count(*)::integer as run_length,
      max(drinking_day) as run_end
    from grouped
    group by uid, streak_group
  ),
  latest_run as (
    select distinct on (uid)
      uid,
      run_length,
      run_end
    from runs
    order by uid, run_end desc
  )
  select
    latest_run.uid as user_id,
    case
      when latest_run.run_end >= ((timezone('Europe/Copenhagen', now()) - interval '6 hours')::date - 1)
        then latest_run.run_length
      else 0
    end as current_streak
  from latest_run;
$$;

revoke execute on function public.get_current_streaks(uuid[]) from public, anon;
grant execute on function public.get_current_streaks(uuid[]) to authenticated;

comment on function public.get_current_streaks(uuid[]) is
  'Current consecutive drinking-day streak per user (6am Copenhagen day buckets), active only when the most recent day is today or yesterday.';

-- Redefine get_profile_stats to append current_streak.
drop function if exists public.get_profile_stats(uuid);

create or replace function public.get_profile_stats(target_user_id uuid)
returns table (
  total_pints double precision,
  unique_pubs integer,
  avg_abv double precision,
  max_session_pints double precision,
  strongest_abv double precision,
  has_late_night_session boolean,
  max_sessions_in_one_day integer,
  max_pubs_in_one_day integer,
  max_sessions_at_same_pub integer,
  longest_day_streak integer,
  max_two_pint_week_streak integer,
  unique_beers integer,
  max_beers_in_one_day integer,
  has_early_bird_session boolean,
  months_logged integer,
  rtd_count integer,
  unique_rtds integer,
  max_rtds_in_one_day integer,
  jagerbomb_count integer,
  max_jagerbombs_in_one_day integer,
  sambuca_count integer,
  max_sambucas_in_one_day integer,
  current_streak integer        -- ADDED
)
language sql
stable
set search_path = public
as $$
  -- [COPY THE ENTIRE CTE + FINAL SELECT BODY VERBATIM FROM
  --  supabase/migrations/20260531160000_add_common_cocktails_and_wine.sql
  --  lines 92-375, i.e. the `with base as (...) ... from beer_rows` block,
  --  then add the one extra select expression shown below as the LAST column.]
  --
  -- The final SELECT currently ends with:
  --     coalesce((select max(sambuca_count) from sambucas_per_day), 0) as max_sambucas_in_one_day
  --   from beer_rows;
  -- Change it to append the new column BEFORE `from beer_rows;`:
  --     coalesce((select max(sambuca_count) from sambucas_per_day), 0) as max_sambucas_in_one_day,
  --     coalesce((select cs.current_streak from public.get_current_streaks(array[target_user_id]) cs limit 1), 0) as current_streak
  --   from beer_rows;
$$;

grant execute on function public.get_profile_stats(uuid) to authenticated;

comment on function public.get_profile_stats(uuid) is 'Profile aggregate stats with session-based trophy day buckets, normalized drink uniqueness, parsed beverage serving volumes, RTD/Jagerbomb/Sambuca/special mixed drink counters, wine and cocktail exclusions from beer-only strongest ABV calculation, 2+ true-pint weekly streaks, and current drinking-day streak.';

-- Redefine get_session_feed_details to append author_current_streak.
create or replace function public.get_session_feed_details(session_ids uuid[])
returns table (
  session_id uuid,
  author_username text,
  author_avatar_url text,
  cheers_count integer,
  cheers jsonb,
  beers jsonb,
  comments jsonb,
  photos jsonb,
  author_current_streak integer   -- ADDED
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_sessions as (
    select s.id, s.user_id
    from public.sessions s
    where s.id = any(coalesce(session_ids, array[]::uuid[]))
      and s.status = 'published'
      and (
        s.user_id = (select auth.uid())
        or exists (
          select 1
          from public.follows
          where follows.follower_id = (select auth.uid())
            and follows.following_id = s.user_id
        )
      )
  ),
  author_streaks as (                                    -- ADDED
    select cs.user_id, cs.current_streak
    from public.get_current_streaks(
      (select array_agg(distinct vs.user_id) from visible_sessions vs)
    ) cs
  )
  select
    vs.id as session_id,
    author.username as author_username,
    author.avatar_url as author_avatar_url,
    coalesce(cheer_agg.cheers_count, 0) as cheers_count,
    coalesce(cheer_agg.cheers, '[]'::jsonb) as cheers,
    coalesce(beer_agg.beers, '[]'::jsonb) as beers,
    coalesce(comment_agg.comments, '[]'::jsonb) as comments,
    coalesce(photo_agg.photos, '[]'::jsonb) as photos,
    coalesce(author_streaks.current_streak, 0) as author_current_streak   -- ADDED
  from visible_sessions vs
  left join public.profiles author
    on author.id = vs.user_id
  left join author_streaks on author_streaks.user_id = vs.user_id          -- ADDED
  left join lateral (
    select
      count(*)::int as cheers_count,
      jsonb_agg(
        jsonb_build_object(
          'user_id', ch.user_id,
          'username', pr.username,
          'avatar_url', pr.avatar_url,
          'created_at', ch.created_at
        )
        order by ch.created_at asc nulls last
      ) as cheers
    from public.session_cheers ch
    left join public.profiles pr on pr.id = ch.user_id
    where ch.session_id = vs.id
  ) cheer_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', sb.id,
        'session_id', sb.session_id,
        'beer_name', sb.beer_name,
        'volume', sb.volume,
        'quantity', sb.quantity,
        'abv', sb.abv,
        'note', sb.note,
        'consumed_at', sb.consumed_at,
        'created_at', sb.created_at
      )
      order by sb.consumed_at asc nulls last
    ) as beers
    from public.session_beers sb
    where sb.session_id = vs.id
  ) beer_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', co.id,
        'session_id', co.session_id,
        'user_id', co.user_id,
        'body', co.body,
        'created_at', co.created_at,
        'updated_at', co.updated_at,
        'username', pr.username,
        'avatar_url', pr.avatar_url
      )
      order by co.created_at asc nulls last
    ) as comments
    from public.session_comments co
    left join public.profiles pr on pr.id = co.user_id
    where co.session_id = vs.id
  ) comment_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', ph.id,
        'session_id', ph.session_id,
        'image_url', ph.image_url,
        'is_keeper', ph.is_keeper,
        'expires_at', ph.expires_at,
        'created_at', ph.created_at
      )
      order by ph.is_keeper desc, ph.created_at asc nulls last
    ) as photos
    from public.session_photos ph
    where ph.session_id = vs.id
  ) photo_agg on true;
$$;

revoke execute on function public.get_session_feed_details(uuid[]) from public, anon;
grant execute on function public.get_session_feed_details(uuid[]) to authenticated;

comment on function public.get_session_feed_details(uuid[]) is
  'Returns author profile (incl. current streak) plus jsonb cheers/beers/comments/photos for visible published sessions in one round-trip for the feed.';

notify pgrst, 'reload schema';
```

> **Important:** Where the body of `get_profile_stats` is marked with a comment placeholder, paste the real CTE block from `20260531160000_add_common_cocktails_and_wine.sql` (the `with base as ( ... ) ... from beer_rows;` spanning its lines 92–375), then append the `current_streak` select expression exactly as the comment instructs. Do not invent the body.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/streakFlame.test.js`
Expected: PASS — ends with `streak migration assertions passed`.

- [ ] **Step 5: Verify the migration applies against the database**

Run (uses the project's Supabase CLI; if `supabase` is linked):

```bash
supabase db push
```

Expected: migration `20260604150000_add_current_streaks` applies with no error. If the CLI is not available locally, note this step as "verify on next deploy" and confirm the SQL parses by pasting it into the Supabase SQL editor. Spot-check:

```sql
select * from public.get_current_streaks(array[(select id from auth.users limit 1)]);
```

Expected: one row with a non-negative `current_streak`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260604150000_add_current_streaks.sql scripts/streakFlame.test.js
git commit -m "feat: add current streak to profile stats and feed RPCs"
```

---

## Task 4: Client data plumbing (RPC row mapping + feed detail field + helper)

**Files:**
- Modify: `src/lib/profileStatsApi.ts`
- Modify: `src/lib/sessionFeedDetails.ts`
- Create: `src/lib/currentStreaks.ts`
- Test: `scripts/sessionFeedDetails.test.js`

- [ ] **Step 1: Write the failing feed-detail mapping test**

Open `scripts/sessionFeedDetails.test.js` and find the test that calls `mapSessionFeedDetailRow` on a representative row. Add an assertion that the new field is mapped, and add a row case where the RPC omits it (should default to 0). Append near the other `mapSessionFeedDetailRow` assertions:

```js
// author_current_streak maps through, defaulting to 0 when absent
const streakRow = mapSessionFeedDetailRow({
  session_id: 's-streak',
  author_username: 'streaker',
  author_avatar_url: null,
  cheers_count: 0,
  cheers: [],
  beers: [],
  comments: [],
  photos: [],
  author_current_streak: 5,
});
assert.equal(streakRow.authorCurrentStreak, 5);

const noStreakRow = mapSessionFeedDetailRow({
  session_id: 's-nostreak',
  author_username: 'casual',
  author_avatar_url: null,
  cheers_count: 0,
  cheers: [],
  beers: [],
  comments: [],
  photos: [],
});
assert.equal(noStreakRow.authorCurrentStreak, 0);

console.log('author current streak mapping passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/sessionFeedDetails.test.js`
Expected: FAIL — `streakRow.authorCurrentStreak` is `undefined`, assertion `undefined === 5` throws.

- [ ] **Step 3: Add the field to `SessionFeedDetail` and its mapping**

In `src/lib/sessionFeedDetails.ts`:

Add to `SessionFeedDetail` (after `photos`):

```ts
  photos: SessionPhoto[];
  authorCurrentStreak: number;
```

Add to `SessionFeedDetailRow` (after `photos: unknown;`):

```ts
  photos: unknown;
  author_current_streak?: number | null;
```

In `mapSessionFeedDetailRow`, add to the returned object (after `photos`):

```ts
    photos: asArray<SessionPhoto>(row.photos),
    authorCurrentStreak: Number(row.author_current_streak || 0),
```

- [ ] **Step 4: Map `current_streak` in `profileStatsApi.ts`**

In `src/lib/profileStatsApi.ts`, add to `ProfileStatsRpcRow` (after `max_sambucas_in_one_day`):

```ts
  max_sambucas_in_one_day?: number | null;
  current_streak?: number | null;
```

And in `statsFromRpcRow`'s returned object (after `maxSambucasInOneDay`):

```ts
    maxSambucasInOneDay: numberOrZero(row.max_sambucas_in_one_day),
    currentStreak: numberOrZero(row.current_streak),
```

> The `fetchStatsFallback` path already routes through `calculateStats`, which now returns `currentStreak` (Task 1) — no change needed there.

- [ ] **Step 5: Create the standalone client helper**

Create `src/lib/currentStreaks.ts`:

```ts
import { supabase } from './supabase';

type CurrentStreakRow = {
  user_id: string;
  current_streak: number | null;
};

// Returns a map of userId -> current streak. Missing/zero users are simply
// absent (callers should default to 0). Used by surfaces that do not already
// receive the streak through get_profile_stats or get_session_feed_details.
export const fetchCurrentStreaks = async (
  userIds: string[]
): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  const cleanIds = Array.from(new Set(userIds.filter(Boolean)));
  if (cleanIds.length === 0) return result;

  const { data, error } = await supabase.rpc('get_current_streaks', {
    user_ids: cleanIds,
  });

  if (error) {
    console.warn('Current streaks unavailable:', error.message);
    return result;
  }

  ((data || []) as CurrentStreakRow[]).forEach((row) => {
    result.set(row.user_id, Number(row.current_streak || 0));
  });
  return result;
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node scripts/sessionFeedDetails.test.js`
Expected: PASS — ends with `author current streak mapping passed`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/profileStatsApi.ts src/lib/sessionFeedDetails.ts src/lib/currentStreaks.ts scripts/sessionFeedDetails.test.js
git commit -m "feat: thread current streak through client data layer"
```

---

## Task 5: `StreakAvatar` component

**Files:**
- Create: `src/components/StreakAvatar.tsx`
- Test: `scripts/streakFlame.test.js` (append source assertions)

- [ ] **Step 1: Write the failing source-assertion test**

Append to `scripts/streakFlame.test.js`:

```js
// --- StreakAvatar component assertions ---
const streakAvatar = readSource('src/components/StreakAvatar.tsx');

assert.match(streakAvatar, /import \{ CachedImage \} from '\.\/CachedImage'/);
assert.match(streakAvatar, /from '\.\.\/lib\/streakFlame'/);
assert.match(streakAvatar, /react-native-svg/);
assert.match(streakAvatar, /AccessibilityInfo/);
assert.match(streakAvatar, /isReduceMotionEnabled/);
// No-op below threshold: returns a plain CachedImage when there is no flame tier.
assert.match(streakAvatar, /getFlameTierConfig/);
// Count label is gated behind showCount.
assert.match(streakAvatar, /showCount/);
assert.match(streakAvatar, /day streak/);

console.log('StreakAvatar source assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/streakFlame.test.js`
Expected: FAIL — `ENOENT` reading `src/components/StreakAvatar.tsx`.

- [ ] **Step 3: Implement `src/components/StreakAvatar.tsx`**

The flame ring is built from several teardrop "tongue" Paths arranged radially around the avatar inside an `Svg`, filled with a per-tier radial-ish gradient, animated by a single looping `Animated.Value` that drives opacity and vertical scale. Each tongue gets a phase offset so the flicker is not uniform. Reduced motion freezes the animation at its mid value.

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { CachedImage } from './CachedImage';
import { getFlameTierConfig } from '../lib/streakFlame';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type StreakAvatarProps = {
  uri?: string | null;
  fallbackUri?: string;
  size: number;
  style?: StyleProp<any>;
  recyclingKey?: string;
  accessibilityLabel?: string;
  streak: number;
  showCount?: boolean;
};

// One flame tongue, expressed in a 100x100 viewBox, pointing up from the bottom.
// Rendered multiple times rotated around the avatar center.
const TONGUE_PATH =
  'M50 8 C58 28 70 36 70 56 C70 74 60 86 50 86 C40 86 30 74 30 56 C30 36 42 28 50 8 Z';

const TONGUE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export const StreakAvatar = React.memo(({
  uri,
  fallbackUri,
  size,
  style,
  recyclingKey,
  accessibilityLabel,
  streak,
  showCount = false,
}: StreakAvatarProps) => {
  const tier = getFlameTierConfig(streak);
  const [reduceMotion, setReduceMotion] = useState(false);
  const flicker = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      // RN >= 0.65 returns a subscription with remove(); guard for older shapes.
      // @ts-ignore
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!tier || reduceMotion) {
      flicker.stopAnimation();
      flicker.setValue(0.5);
      return;
    }
    flicker.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, {
          toValue: 1,
          duration: tier.flickerDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
          // Driving react-native-svg element props (opacity/scaleY), which the
          // native driver does not support — must be false.
          useNativeDriver: false,
        }),
        Animated.timing(flicker, {
          toValue: 0,
          duration: tier.flickerDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [tier, reduceMotion, flicker]);

  const avatar = (
    <CachedImage
      uri={uri}
      fallbackUri={fallbackUri}
      style={style}
      recyclingKey={recyclingKey}
      accessibilityLabel={accessibilityLabel}
    />
  );

  // No-op when there is no streak flame to show.
  if (!tier) {
    return avatar;
  }

  // Flame layer extends beyond the avatar by `inset` on every side.
  const inset = Math.round(size * 0.34 * tier.scale);
  const flameBox = size + inset * 2;
  const gradientId = `flame-${tier.tier}`;

  const tongues = useMemo(() => TONGUE_ANGLES.map((angle, index) => {
    // Stagger each tongue's phase so the ring flickers organically.
    const phase = (index % 4) / 4; // 0, .25, .5, .75 repeating
    const opacity = flicker.interpolate({
      inputRange: [0, 1],
      outputRange: index % 2 === 0 ? [0.55, 1] : [0.8, 0.5],
    });
    const scaleY = flicker.interpolate({
      inputRange: [0, 1],
      outputRange: index % 2 === 0 ? [0.86, 1.18] : [1.12, 0.9],
    });
    return { angle, phase, opacity, scaleY, key: `t-${angle}` };
  }), [flicker]);

  return (
    <View style={styles.wrap} accessibilityLabel={
      accessibilityLabel ? `${accessibilityLabel}, ${streak} day streak` : `${streak} day streak`
    }>
      <View
        pointerEvents="none"
        style={[
          styles.flameLayer,
          { width: flameBox, height: flameBox, top: -inset, left: -inset },
        ]}
      >
        <Svg width={flameBox} height={flameBox} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={gradientId} x1="50" y1="86" x2="50" y2="8" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={tier.colors.outer} stopOpacity="0.95" />
              <Stop offset="0.55" stopColor={tier.colors.mid} stopOpacity="0.95" />
              <Stop offset="1" stopColor={tier.colors.core} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          {tongues.map((t) => (
            <AnimatedPath
              key={t.key}
              d={TONGUE_PATH}
              fill={`url(#${gradientId})`}
              opacity={t.opacity}
              origin="50, 50"
              rotation={t.angle}
              scaleY={t.scaleY}
            />
          ))}
        </Svg>
      </View>

      {avatar}

      {showCount ? (
        <View pointerEvents="none" style={styles.countPill}>
          <Text style={styles.countText}>{`🔥 ${streak} day streak`}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  countPill: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    zIndex: 2,
  },
  countText: {
    ...typography.caption,
    color: colors.text,
    fontSize: 11,
  },
});
```

> If `typography.caption` does not exist, use the smallest existing text token in `src/theme/typography.ts` (check it) and keep `fontSize: 11`. If `colors.text` / `colors.primaryBorder` are not present, substitute the nearest existing tokens (the file already imports `colors` elsewhere — mirror what `ProfileScreen` uses for muted text and borders).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node scripts/streakFlame.test.js`
Expected: PASS — ends with `StreakAvatar source assertions passed`.

- [ ] **Step 5: Type-check the component**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `StreakAvatar.tsx`. Fix any token/import mismatches surfaced (see the note in Step 3).

- [ ] **Step 6: Commit**

```bash
git add src/components/StreakAvatar.tsx scripts/streakFlame.test.js
git commit -m "feat: add StreakAvatar flame component"
```

---

## Task 6: Wire the flame into the feed card (feed + post detail)

`FeedSessionCard` (exported from `FeedScreen.tsx`) renders the author avatar for both the feed and `PostDetailScreen`. Wiring it once covers both surfaces; we just have to populate `author_current_streak` on the `FeedSession` from each entry point.

**Files:**
- Modify: `src/screens/FeedScreen.tsx`
- Modify: `src/screens/PostDetailScreen.tsx`
- Test: `scripts/streakFlame.test.js` (append wiring assertions)

- [ ] **Step 1: Write the failing wiring assertions**

Append to `scripts/streakFlame.test.js`:

```js
// --- Surface wiring assertions ---
const feedScreen = readSource('src/screens/FeedScreen.tsx');
assert.match(feedScreen, /StreakAvatar/);
assert.match(feedScreen, /author_current_streak/);

const postDetail = readSource('src/screens/PostDetailScreen.tsx');
assert.match(postDetail, /fetchCurrentStreaks/);
assert.match(postDetail, /author_current_streak/);

console.log('feed/post wiring assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/streakFlame.test.js`
Expected: FAIL — `StreakAvatar` not found in `FeedScreen.tsx`.

- [ ] **Step 3: Add `author_current_streak` to the `FeedSession` type**

In `src/screens/FeedScreen.tsx`, add to the `FeedSession` type (after the `profiles?: {...} | null;` block, around line 118):

```ts
  profiles?: {
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  author_current_streak?: number | null;
```

- [ ] **Step 4: Import `StreakAvatar` and swap the author avatar**

Add the import near the other component imports at the top of `src/screens/FeedScreen.tsx`:

```ts
import { StreakAvatar } from '../components/StreakAvatar';
```

Replace the author `CachedImage` block at `src/screens/FeedScreen.tsx:432-438`:

```tsx
          <CachedImage
            uri={item.profiles?.avatar_url}
            fallbackUri={`https://i.pravatar.cc/150?u=${item.user_id}`}
            style={styles.avatar}
            recyclingKey={`avatar-${item.user_id}-${item.profiles?.avatar_url || 'fallback'}`}
            accessibilityLabel={`${username}'s avatar`}
          />
```

with:

```tsx
          <StreakAvatar
            uri={item.profiles?.avatar_url}
            fallbackUri={`https://i.pravatar.cc/150?u=${item.user_id}`}
            size={38}
            style={styles.avatar}
            recyclingKey={`avatar-${item.user_id}-${item.profiles?.avatar_url || 'fallback'}`}
            accessibilityLabel={`${username}'s avatar`}
            streak={item.author_current_streak || 0}
          />
```

> The `38` matches `styles.avatar` (width/height 38). Leave `styles.avatar` unchanged.

- [ ] **Step 5: Populate `author_current_streak` from the feed details RPC**

In `src/screens/FeedScreen.tsx`, find where the feed item is assembled from the session detail (around `src/screens/FeedScreen.tsx:1010-1013`, the `profiles: detail?.author ? {...} : null,` line). Add the streak directly after the `profiles` field:

```ts
            profiles: detail?.author
              ? { username: detail.author.username, avatar_url: detail.author.avatarUrl }
              : null,
            author_current_streak: detail?.authorCurrentStreak ?? 0,
```

- [ ] **Step 6: Populate `author_current_streak` in PostDetailScreen**

In `src/screens/PostDetailScreen.tsx`, add the import:

```ts
import { fetchCurrentStreaks } from '../lib/currentStreaks';
```

The session detail is fetched around `src/screens/PostDetailScreen.tsx:223-296`. After the `profilesById` map is populated (right after the `if (profileIds.length > 0) { ... }` block ends near line 296), fetch the author's streak:

```ts
      const authorStreaks = await fetchCurrentStreaks([sessionRow.user_id]);
      const authorCurrentStreak = authorStreaks.get(sessionRow.user_id) || 0;
```

Then, where the `FeedSession` object passed to `setSession(...)` is built (the object that includes `session_beers`, `profiles`, `cheer_profiles`, etc.), add the field. Locate the `setSession({ ... })` call in this same loader and add:

```ts
        author_current_streak: authorCurrentStreak,
```

> If the built session object spreads `sessionRow`, still add `author_current_streak` explicitly so it is always present. The `FeedSession` type now allows it (Step 3).

- [ ] **Step 7: Run the test to verify it passes**

Run: `node scripts/streakFlame.test.js`
Expected: PASS — ends with `feed/post wiring assertions passed`.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `FeedScreen.tsx` or `PostDetailScreen.tsx`.

- [ ] **Step 9: Commit**

```bash
git add src/screens/FeedScreen.tsx src/screens/PostDetailScreen.tsx scripts/streakFlame.test.js
git commit -m "feat: show streak flame on feed and post detail avatars"
```

---

## Task 7: Wire the flame + count into both profile screens

**Files:**
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/screens/UserProfileScreen.tsx`
- Test: `scripts/streakFlame.test.js` (append wiring assertions)

- [ ] **Step 1: Write the failing wiring assertions**

Append to `scripts/streakFlame.test.js`:

```js
// --- Profile wiring assertions ---
const profileScreen = readSource('src/screens/ProfileScreen.tsx');
assert.match(profileScreen, /StreakAvatar/);
assert.match(profileScreen, /showCount/);
assert.match(profileScreen, /stats\.currentStreak|stats\?\.currentStreak/);

const userProfileScreen = readSource('src/screens/UserProfileScreen.tsx');
assert.match(userProfileScreen, /StreakAvatar/);
assert.match(userProfileScreen, /showCount/);
assert.match(userProfileScreen, /stats\.currentStreak|stats\?\.currentStreak/);

console.log('profile wiring assertions passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/streakFlame.test.js`
Expected: FAIL — `StreakAvatar` not found in `ProfileScreen.tsx`.

- [ ] **Step 3: Wire `ProfileScreen`**

In `src/screens/ProfileScreen.tsx`, add the import (next to the existing `CachedImage` import at line 16):

```ts
import { StreakAvatar } from '../components/StreakAvatar';
```

`Platform` is already imported (it is used in the `avatar` style). Replace the display avatar `CachedImage` at `src/screens/ProfileScreen.tsx:449-455`:

```tsx
          <CachedImage
            uri={profile?.avatar_url}
            fallbackUri={'https://i.pravatar.cc/150?u=' + profile?.id}
            style={styles.avatar}
            recyclingKey={`profile-${profile?.id}-${profile?.avatar_url || 'fallback'}`}
            accessibilityLabel={`${profile?.username || 'Beer Lover'}'s avatar`}
          />
```

with:

```tsx
          <StreakAvatar
            uri={profile?.avatar_url}
            fallbackUri={'https://i.pravatar.cc/150?u=' + profile?.id}
            size={Platform.OS === 'web' ? 104 : 120}
            style={styles.avatar}
            recyclingKey={`profile-${profile?.id}-${profile?.avatar_url || 'fallback'}`}
            accessibilityLabel={`${profile?.username || 'Beer Lover'}'s avatar`}
            streak={stats.currentStreak}
            showCount
          />
```

> `stats` is the component's profile-stats state (typed `Stats`, defaulting to `emptyStats`), so `stats.currentStreak` is always a number. The `editBadge` `TouchableOpacity` sibling at line 456 stays as-is.

- [ ] **Step 4: Wire `UserProfileScreen`**

In `src/screens/UserProfileScreen.tsx`, add the import (near the top component imports, after line 7's `ProfileStatsPanel` import):

```ts
import { StreakAvatar } from '../components/StreakAvatar';
```

Confirm `Platform` is imported from `react-native` in this file; if not, add it to the existing `react-native` import. Replace the avatar `CachedImage` at `src/screens/UserProfileScreen.tsx:394-400`:

```tsx
        <CachedImage
          uri={profile.avatar_url}
          fallbackUri={`https://i.pravatar.cc/150?u=${profile.id}`}
          style={styles.avatar}
          recyclingKey={`profile-${profile.id}-${profile.avatar_url || 'fallback'}`}
          accessibilityLabel={`${profile.username || 'Beer Lover'}'s avatar`}
        />
```

with:

```tsx
        <StreakAvatar
          uri={profile.avatar_url}
          fallbackUri={`https://i.pravatar.cc/150?u=${profile.id}`}
          size={Platform.OS === 'web' ? 104 : 120}
          style={styles.avatar}
          recyclingKey={`profile-${profile.id}-${profile.avatar_url || 'fallback'}`}
          accessibilityLabel={`${profile.username || 'Beer Lover'}'s avatar`}
          streak={stats.currentStreak}
          showCount
        />
```

> `stats` here is the `useState<Stats>(emptyStats)` declared at `src/screens/UserProfileScreen.tsx:132`, so `stats.currentStreak` is always defined.

- [ ] **Step 5: Run the test to verify it passes**

Run: `node scripts/streakFlame.test.js`
Expected: PASS — ends with `profile wiring assertions passed`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in either profile screen (in particular, `Platform` is in scope in both).

- [ ] **Step 7: Commit**

```bash
git add src/screens/ProfileScreen.tsx src/screens/UserProfileScreen.tsx scripts/streakFlame.test.js
git commit -m "feat: show streak flame and count on profile screens"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run all touched test suites**

Run:

```bash
node scripts/profileStats.test.js
node scripts/streakFlame.test.js
node scripts/sessionFeedDetails.test.js
```

Expected: each prints its passing lines and exits 0.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors (or only pre-existing errors unrelated to this feature — compare against a clean checkout if unsure).

- [ ] **Step 3: Manual check in the running PWA**

Run: `npm run web`

Verify:
- A user with a current streak ≥ 2 shows a flame around their avatar in the feed, and the flame matches the tier (orange at 2–3, red at 4–6, blue-hot base at 7–13, full blue at 14+).
- Opening that user's post (PostDetailScreen) shows the same flame.
- Visiting that user's profile (and your own, if on a streak) shows the flame plus the `🔥 N day streak` pill.
- A user with no current streak (or streak < 2) shows the plain avatar, unchanged, on every surface.
- With OS "reduce motion" enabled, the flame renders static (no flicker).

- [ ] **Step 4: Final commit (if any manual fixups were needed)**

```bash
git add -A
git commit -m "fix: streak flame polish from manual verification"
```

(Skip if nothing changed.)

---

## Notes for the implementer

- **Source of truth is SQL.** `calculateStats`' `currentStreak` is the client fallback used only when `get_profile_stats` fails; keep its definition aligned with `get_current_streaks`.
- **Do not touch** cheer-avatar stacks, comment avatars, or people-list avatars — only the four primary avatars in Tasks 6–7.
- **`useNativeDriver: false`** is required for the flicker because it animates `react-native-svg` element props (opacity, scaleY), which the native driver does not support. Keep it false on web and native.
- If `supabase db push` is unavailable in the dev environment, the migration still ships in the repo and applies on deploy; the source-assertion test guarantees its shape in the meantime.
