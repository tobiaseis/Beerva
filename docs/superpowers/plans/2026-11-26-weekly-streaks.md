# Weekly Streaks And "Nights In A Row" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the weekly streak (consecutive weeks with at least one night out) Beerva's main streak, shown on profiles. Keep acknowledging nights in a row through the existing avatar flame plus a "🔥 3 nights in a row" label on the post itself.

**Architecture:** Two new read-only RPCs sit next to the existing `get_current_streaks`: `get_weekly_streaks(user_ids)` and `get_session_night_runs(session_ids)`. Both use the app's existing drinking-day definition (06:00–06:00 Europe/Copenhagen) through two small shared SQL helpers. The client adds a pure `weeklyStreaks.ts` module, a focus-aware `useWeeklyStreak` hook, a `WeeklyStreakBadge` under the username on both profile screens, and the label on feed and post-detail cards. The daily flame on avatars is unchanged.

**Tech Stack:** Expo React Native + react-native-web PWA, TypeScript, Supabase Postgres (`security definer` SQL RPCs), Node assertion test scripts in `scripts/`.

**Plan order:** This is plan 1 of 3. The Friday nudge plan (`2026-11-26-friday-nudge.md`) and the weekly recap plan (`2026-11-26-weekly-recap.md`) both call `get_weekly_streaks` and `beerva_drinking_week`, so ship this one first.

---

## Decisions Baked Into This Plan

| Decision | Default | Where to change |
| --- | --- | --- |
| Night out | A 06:00–06:00 Copenhagen drinking day with a published session. This is the same bucket the daily streak already uses. | `beerva_drinking_day` in Task 2 |
| Week | Monday to Sunday, using the drinking day, so Sunday 02:00 still counts as Saturday night. | `beerva_drinking_week` in Task 2 |
| Weekly streak | Consecutive weeks with at least one night out. A streak stays alive until the current week ends, so nobody "loses" it on a Tuesday. | `get_weekly_streaks` in Task 2 |
| Nights in a row | Shown on a post when that post's night was the 2nd or later consecutive night for its author. It reflects the post's own night, not the author's current run. | `NIGHTS_IN_A_ROW_THRESHOLD` in Task 3 |
| Daily flame | Unchanged: avatars still flame from 2 consecutive nights. | `src/lib/streakFlame.ts` (untouched) |
| Badge on other people's profiles | Shown only when they have a streak. Your own profile also nudges you when the streak needs a night this week. | `getWeeklyStreakBadgeCopy` in Task 3 |

---

## File Structure

- Create `supabase/migrations/20261127120000_add_weekly_streaks.sql`
  - Helpers `beerva_drinking_day(timestamptz)` and `beerva_drinking_week(timestamptz)`.
  - RPCs `get_weekly_streaks(uuid[])` and `get_session_night_runs(uuid[])`.
- Create `src/lib/weeklyStreaks.ts`: types, row mappers, copy helpers and RPC wrappers. It has no React imports, so the Node tests can load it.
- Create `src/lib/useWeeklyStreak.ts`: a hook that refetches a user's weekly streak whenever the screen gains focus.
- Create `src/components/WeeklyStreakBadge.tsx`: the pill under the username.
- Modify `src/screens/ProfileScreen.tsx` and `src/screens/UserProfileScreen.tsx`: render the badge.
- Modify `src/lib/feedTypes.ts`, `src/lib/feedApi.ts` and `src/screens/FeedScreen.tsx`: hydrate `nights_in_a_row` and show the label.
- Modify `src/screens/PostDetailScreen.tsx`: the same label on the post page.
- Create `scripts/weeklyStreaks.test.js` and add `test:weekly-streaks` to `package.json`.

---

### Task 1: Add The Failing Weekly Streak Test

**Files:**
- Create: `scripts/weeklyStreaks.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

In `package.json`, replace:

```json
    "test:challenge-nights-out": "node scripts/challengeNightsOut.test.js"
```

with:

```json
    "test:challenge-nights-out": "node scripts/challengeNightsOut.test.js",
    "test:weekly-streaks": "node scripts/weeklyStreaks.test.js"
```

- [ ] **Step 2: Write the failing test**

Create `scripts/weeklyStreaks.test.js` with this complete content:

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

const loadWithMocks = (relativePath, mocks) => {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = (request) => (
    Object.prototype.hasOwnProperty.call(mocks, request) ? mocks[request] : Module.prototype.require.call(compiled, request)
  );
  compiled._compile(outputText, filename);
  return compiled.exports;
};

const main = async () => {
  // Migration.
  const sql = read('supabase/migrations/20261127120000_add_weekly_streaks.sql');
  assert.ok(sql, 'weekly streak migration should exist');
  assert.match(sql, /create or replace function public\.beerva_drinking_day\(event_at timestamp with time zone\)/i);
  assert.match(sql, /timezone\('Europe\/Copenhagen', event_at\) - interval '6 hours'/i, 'drinking day is 06:00-06:00 Copenhagen');
  assert.match(sql, /create or replace function public\.beerva_drinking_week\(event_at timestamp with time zone\)/i);
  assert.match(sql, /date_trunc\('week', public\.beerva_drinking_day\(event_at\)::timestamp\)::date/i, 'weeks start on Monday');
  assert.match(sql, /create or replace function public\.get_weekly_streaks\(user_ids uuid\[\]\)/i);
  assert.match(sql, /returns table \(\s*user_id uuid,\s*weekly_streak integer,\s*active_this_week boolean,\s*nights_this_week integer\s*\)/i);
  assert.match(sql, /latest_run\.run_end >= current_week\.week_start - 7/i, 'a streak survives until the current week ends');
  assert.match(sql, /create or replace function public\.get_session_night_runs\(session_ids uuid\[\]\)/i);
  assert.match(sql, /returns table \(\s*session_id uuid,\s*nights_in_a_row integer\s*\)/i);
  assert.match(sql, /requested\.drinking_day - island_starts\.island_start \+ 1/i, 'nights in a row counts up to the post\'s own night');
  assert.doesNotMatch(sql, /drop function[^;]*get_current_streaks/i, 'the daily streak RPC stays as it is');
  ['get_weekly_streaks(uuid[])', 'get_session_night_runs(uuid[])'].forEach((signature) => {
    const escaped = signature.replace(/[()[\]]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke execute on function public\\.${escaped} from public, anon`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped} to authenticated`, 'i'));
  });
  assert.match(sql, /notify pgrst, 'reload schema'/i);

  // Client module.
  const rpcCalls = [];
  let rpcResponse = { data: [], error: null };
  const streaks = loadWithMocks('src/lib/weeklyStreaks.ts', {
    './supabase': { supabase: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpcResponse; } } },
  });

  assert.equal(streaks.formatWeeklyStreak(1), '1-week streak');
  assert.equal(streaks.formatWeeklyStreak(6), '6-week streak');
  assert.equal(streaks.formatNightsInARow(3), '3 nights in a row');
  assert.equal(streaks.shouldShowNightsInARow(1), false);
  assert.equal(streaks.shouldShowNightsInARow(2), true);
  assert.equal(streaks.shouldShowNightsInARow(null), false);
  assert.equal(streaks.shouldShowNightsInARow(undefined), false);

  assert.deepEqual(streaks.mapWeeklyStreakRow({ weekly_streak: '4', active_this_week: true, nights_this_week: '2' }), { weeklyStreak: 4, activeThisWeek: true, nightsThisWeek: 2 });
  assert.deepEqual(streaks.mapWeeklyStreakRow({}), { weeklyStreak: 0, activeThisWeek: false, nightsThisWeek: 0 });

  assert.equal(streaks.getWeeklyStreakBadgeCopy(0, false, false), null, 'no badge on other profiles without a streak');
  assert.deepEqual(streaks.getWeeklyStreakBadgeCopy(0, false, true), { title: 'No weekly streak yet', hint: 'One night out this week starts one' });
  assert.deepEqual(streaks.getWeeklyStreakBadgeCopy(5, true, true), { title: '5-week streak', hint: null });
  assert.deepEqual(streaks.getWeeklyStreakBadgeCopy(5, false, true), { title: '5-week streak', hint: 'Log a night out this week to keep it' });
  assert.deepEqual(streaks.getWeeklyStreakBadgeCopy(5, false, false), { title: '5-week streak', hint: null }, 'no nagging on other people\'s profiles');

  rpcResponse = { data: [{ user_id: 'u1', weekly_streak: 3, active_this_week: false, nights_this_week: 0 }], error: null };
  const weekly = await streaks.fetchWeeklyStreaks(['u1', 'u1', '']);
  assert.deepEqual(rpcCalls.pop(), { name: 'get_weekly_streaks', args: { user_ids: ['u1'] } }, 'ids are deduped and blanks dropped');
  assert.deepEqual(weekly.get('u1'), { weeklyStreak: 3, activeThisWeek: false, nightsThisWeek: 0 });

  assert.equal((await streaks.fetchWeeklyStreaks([])).size, 0);
  assert.equal(rpcCalls.length, 0, 'no ids means no request');

  const originalWarn = console.warn;
  console.warn = () => {};
  rpcResponse = { data: null, error: { message: 'function does not exist' } };
  assert.equal((await streaks.fetchWeeklyStreaks(['u1'])).size, 0, 'a missing RPC degrades to no streaks');
  console.warn = originalWarn;
  rpcCalls.length = 0;

  rpcResponse = { data: [{ session_id: 's1', nights_in_a_row: '3' }, { session_id: null, nights_in_a_row: 9 }], error: null };
  const runs = await streaks.fetchSessionNightRuns(['s1', 's2']);
  assert.deepEqual(rpcCalls.pop(), { name: 'get_session_night_runs', args: { session_ids: ['s1', 's2'] } });
  assert.equal(runs.get('s1'), 3);
  assert.equal(runs.size, 1);

  // Wiring.
  const hook = read('src/lib/useWeeklyStreak.ts');
  assert.match(hook, /useFocusEffect\(/, 'the profile streak refreshes on focus');
  assert.match(hook, /fetchWeeklyStreaks\(\[userId\]\)/);

  const badge = read('src/components/WeeklyStreakBadge.tsx');
  assert.match(badge, /getWeeklyStreakBadgeCopy\(weeks, activeThisWeek, isOwnProfile\)/);
  assert.match(badge, /if \(!copy\) return null;/);

  const profile = read('src/screens/ProfileScreen.tsx');
  assert.match(profile, /const weeklyStreak = useWeeklyStreak\(profile\?\.id \?\? null\);/);
  assert.match(profile, /<WeeklyStreakBadge[\s\S]*?isOwnProfile/);

  const userProfile = read('src/screens/UserProfileScreen.tsx');
  assert.match(userProfile, /const weeklyStreak = useWeeklyStreak\(profileId \?\? null\);/);
  assert.match(userProfile, /<WeeklyStreakBadge/);

  assert.match(read('src/lib/feedTypes.ts'), /nights_in_a_row\?: number \| null;/);
  const feedApi = read('src/lib/feedApi.ts');
  assert.match(feedApi, /fetchSessionNightRuns\(sessionIds\)/);
  assert.match(feedApi, /nights_in_a_row: nightRunsBySession\.get\(session\.id\) \?\? null,/);

  const feedScreen = read('src/screens/FeedScreen.tsx');
  assert.match(feedScreen, /shouldShowNightsInARow\(item\.nights_in_a_row\)/);
  assert.match(feedScreen, /formatNightsInARow\(item\.nights_in_a_row as number\)/);
  assert.match(feedScreen, /streak=\{item\.author_current_streak \|\| 0\}/, 'the daily avatar flame stays');

  const postDetail = read('src/screens/PostDetailScreen.tsx');
  assert.match(postDetail, /fetchSessionNightRuns\(\[sessionIdForRun\]\)/);
  assert.match(postDetail, /nights_in_a_row: nightsInARow \?\? session\.nights_in_a_row \?\? null/);
};

main()
  .then(() => console.log('weekly streak checks passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `npm run test:weekly-streaks`
Expected: FAIL with `weekly streak migration should exist`.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/weeklyStreaks.test.js
git commit -m "test: add failing weekly streak checks"
```

---

### Task 2: Add The Streak RPCs

**Files:**
- Create: `supabase/migrations/20261127120000_add_weekly_streaks.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261127120000_add_weekly_streaks.sql` with this complete content:

```sql
-- Weekly streaks (the main streak) and per-post "nights in a row".
--
-- A night out is a 06:00-06:00 Europe/Copenhagen drinking day with a
-- published session, the same bucket get_current_streaks already uses for
-- the daily avatar flame. Weeks run Monday to Sunday on drinking days.

create or replace function public.beerva_drinking_day(event_at timestamp with time zone)
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Europe/Copenhagen', event_at) - interval '6 hours')::date;
$$;

create or replace function public.beerva_drinking_week(event_at timestamp with time zone)
returns date
language sql
stable
set search_path = public
as $$
  select date_trunc('week', public.beerva_drinking_day(event_at)::timestamp)::date;
$$;

grant execute on function public.beerva_drinking_day(timestamp with time zone) to authenticated;
grant execute on function public.beerva_drinking_week(timestamp with time zone) to authenticated;

comment on function public.beerva_drinking_day(timestamp with time zone) is
  'The 06:00-06:00 Europe/Copenhagen drinking day a timestamp belongs to.';
comment on function public.beerva_drinking_week(timestamp with time zone) is
  'Monday of the drinking week a timestamp belongs to.';

-- Consecutive weeks with at least one night out. The latest run counts while
-- it ends this week or last week, so a streak stays alive until the current
-- week is over. Returns a row for every requested user.
create or replace function public.get_weekly_streaks(user_ids uuid[])
returns table (
  user_id uuid,
  weekly_streak integer,
  active_this_week boolean,
  nights_this_week integer
)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select distinct requested_id as uid
    from unnest(coalesce(user_ids, array[]::uuid[])) as requested_id
  ),
  current_week as (
    select public.beerva_drinking_week(now()) as week_start
  ),
  drinking_days as (
    select distinct
      s.user_id as uid,
      public.beerva_drinking_day(coalesce(s.started_at, s.created_at)) as drinking_day
    from public.sessions s
    where s.user_id in (select requested.uid from requested)
      and s.status = 'published'
  ),
  weeks as (
    select distinct
      drinking_days.uid,
      date_trunc('week', drinking_days.drinking_day::timestamp)::date as week_start
    from drinking_days
  ),
  grouped as (
    select
      weeks.uid,
      weeks.week_start,
      weeks.week_start - (7 * row_number() over (partition by weeks.uid order by weeks.week_start))::integer as streak_group
    from weeks
  ),
  runs as (
    select grouped.uid, count(*)::integer as run_length, max(grouped.week_start) as run_end
    from grouped
    group by grouped.uid, grouped.streak_group
  ),
  latest_run as (
    select distinct on (runs.uid) runs.uid, runs.run_length, runs.run_end
    from runs
    order by runs.uid, runs.run_end desc
  ),
  this_week as (
    select drinking_days.uid, count(*)::integer as nights
    from drinking_days
    cross join current_week
    where date_trunc('week', drinking_days.drinking_day::timestamp)::date = current_week.week_start
    group by drinking_days.uid
  )
  select
    requested.uid as user_id,
    case
      when latest_run.run_end >= current_week.week_start - 7 then latest_run.run_length
      else 0
    end as weekly_streak,
    coalesce(latest_run.run_end = current_week.week_start, false) as active_this_week,
    coalesce(this_week.nights, 0) as nights_this_week
  from requested
  cross join current_week
  left join latest_run on latest_run.uid = requested.uid
  left join this_week on this_week.uid = requested.uid;
$$;

-- For each requested post: how many consecutive nights its author had been
-- out, ending at that post's own night (1 = no run).
create or replace function public.get_session_night_runs(session_ids uuid[])
returns table (
  session_id uuid,
  nights_in_a_row integer
)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select
      s.id,
      s.user_id,
      public.beerva_drinking_day(coalesce(s.started_at, s.created_at)) as drinking_day
    from public.sessions s
    where s.id = any(coalesce(session_ids, array[]::uuid[]))
      and s.status = 'published'
  ),
  author_days as (
    select distinct
      s.user_id as uid,
      public.beerva_drinking_day(coalesce(s.started_at, s.created_at)) as drinking_day
    from public.sessions s
    where s.user_id in (select requested.user_id from requested)
      and s.status = 'published'
  ),
  islands as (
    select
      author_days.uid,
      author_days.drinking_day,
      author_days.drinking_day - (row_number() over (partition by author_days.uid order by author_days.drinking_day))::integer as island
    from author_days
  ),
  island_starts as (
    select islands.uid, islands.island, min(islands.drinking_day) as island_start
    from islands
    group by islands.uid, islands.island
  )
  select
    requested.id as session_id,
    (requested.drinking_day - island_starts.island_start + 1)::integer as nights_in_a_row
  from requested
  join islands
    on islands.uid = requested.user_id
   and islands.drinking_day = requested.drinking_day
  join island_starts
    on island_starts.uid = islands.uid
   and island_starts.island = islands.island;
$$;

revoke execute on function public.get_weekly_streaks(uuid[]) from public, anon;
grant execute on function public.get_weekly_streaks(uuid[]) to authenticated;
revoke execute on function public.get_session_night_runs(uuid[]) from public, anon;
grant execute on function public.get_session_night_runs(uuid[]) to authenticated;

comment on function public.get_weekly_streaks(uuid[]) is
  'Consecutive weeks with a night out per user, whether this week already counts, and nights out this week.';
comment on function public.get_session_night_runs(uuid[]) is
  'Consecutive nights out per post, ending at that post''s own drinking day.';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Run the test**

Run: `npm run test:weekly-streaks`
Expected: FAIL at the client module (`Cannot find module .../src/lib/weeklyStreaks.ts`). The migration checks pass.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261127120000_add_weekly_streaks.sql
git commit -m "feat: add weekly streak and nights-in-a-row RPCs"
```

---

### Task 3: Add The Client Module, Hook And Badge

**Files:**
- Create: `src/lib/weeklyStreaks.ts`
- Create: `src/lib/useWeeklyStreak.ts`
- Create: `src/components/WeeklyStreakBadge.tsx`

- [ ] **Step 1: Write the module**

Create `src/lib/weeklyStreaks.ts` with this complete content:

```typescript
import { supabase } from './supabase';

export type WeeklyStreak = {
  weeklyStreak: number;
  activeThisWeek: boolean;
  nightsThisWeek: number;
};

type WeeklyStreakRow = {
  user_id?: string | null;
  weekly_streak?: number | string | null;
  active_this_week?: boolean | null;
  nights_this_week?: number | string | null;
};

type SessionNightRunRow = {
  session_id?: string | null;
  nights_in_a_row?: number | string | null;
};

export const EMPTY_WEEKLY_STREAK: WeeklyStreak = {
  weeklyStreak: 0,
  activeThisWeek: false,
  nightsThisWeek: 0,
};

// A post shows "N nights in a row" from the second consecutive night.
export const NIGHTS_IN_A_ROW_THRESHOLD = 2;

const toCount = (value: number | string | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const mapWeeklyStreakRow = (row: WeeklyStreakRow): WeeklyStreak => ({
  weeklyStreak: toCount(row.weekly_streak),
  activeThisWeek: row.active_this_week === true,
  nightsThisWeek: toCount(row.nights_this_week),
});

export const formatWeeklyStreak = (weeks: number) => `${weeks}-week streak`;

export const formatNightsInARow = (nights: number) => `${nights} nights in a row`;

export const shouldShowNightsInARow = (nights: number | null | undefined): nights is number => (
  typeof nights === 'number' && nights >= NIGHTS_IN_A_ROW_THRESHOLD
);

export type WeeklyStreakBadgeCopy = {
  title: string;
  hint: string | null;
};

export const getWeeklyStreakBadgeCopy = (
  weeks: number,
  activeThisWeek: boolean,
  isOwnProfile: boolean
): WeeklyStreakBadgeCopy | null => {
  if (weeks <= 0) {
    return isOwnProfile
      ? { title: 'No weekly streak yet', hint: 'One night out this week starts one' }
      : null;
  }
  return {
    title: formatWeeklyStreak(weeks),
    hint: isOwnProfile && !activeThisWeek ? 'Log a night out this week to keep it' : null,
  };
};

export const fetchWeeklyStreaks = async (userIds: string[]): Promise<Map<string, WeeklyStreak>> => {
  const result = new Map<string, WeeklyStreak>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return result;

  const { data, error } = await supabase.rpc('get_weekly_streaks', { user_ids: ids });
  if (error) {
    console.warn('Weekly streaks unavailable:', error.message);
    return result;
  }

  ((data || []) as WeeklyStreakRow[]).forEach((row) => {
    if (row.user_id) result.set(row.user_id, mapWeeklyStreakRow(row));
  });
  return result;
};

export const fetchSessionNightRuns = async (sessionIds: string[]): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  const ids = Array.from(new Set(sessionIds.filter(Boolean)));
  if (ids.length === 0) return result;

  const { data, error } = await supabase.rpc('get_session_night_runs', { session_ids: ids });
  if (error) {
    console.warn('Nights in a row unavailable:', error.message);
    return result;
  }

  ((data || []) as SessionNightRunRow[]).forEach((row) => {
    if (row.session_id) result.set(row.session_id, toCount(row.nights_in_a_row));
  });
  return result;
};
```

- [ ] **Step 2: Write the hook**

Create `src/lib/useWeeklyStreak.ts` with this complete content:

```typescript
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { EMPTY_WEEKLY_STREAK, fetchWeeklyStreaks, WeeklyStreak } from './weeklyStreaks';

// Refetches whenever the screen gains focus, so a newly logged night shows up
// as soon as the user returns to a profile.
export const useWeeklyStreak = (userId: string | null | undefined): WeeklyStreak => {
  const [streak, setStreak] = useState<WeeklyStreak>(EMPTY_WEEKLY_STREAK);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setStreak(EMPTY_WEEKLY_STREAK);
        return undefined;
      }

      let cancelled = false;
      fetchWeeklyStreaks([userId]).then((streaks) => {
        if (!cancelled) setStreak(streaks.get(userId) || EMPTY_WEEKLY_STREAK);
      });

      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return streak;
};
```

- [ ] **Step 3: Write the badge**

Create `src/components/WeeklyStreakBadge.tsx` with this complete content:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarCheck } from 'lucide-react-native';
import { getWeeklyStreakBadgeCopy } from '../lib/weeklyStreaks';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';
import { typography } from '../theme/typography';

type Props = {
  weeks: number;
  activeThisWeek: boolean;
  isOwnProfile?: boolean;
};

export const WeeklyStreakBadge = ({ weeks, activeThisWeek, isOwnProfile = false }: Props) => {
  const copy = getWeeklyStreakBadgeCopy(weeks, activeThisWeek, isOwnProfile);
  if (!copy) return null;

  return (
    <View style={styles.container} accessibilityLabel={copy.hint ? `${copy.title}. ${copy.hint}` : copy.title}>
      <View style={styles.pill}>
        <CalendarCheck color={colors.primary} size={15} />
        <Text style={styles.title}>{copy.title}</Text>
      </View>
      {copy.hint ? <Text style={styles.hint}>{copy.hint}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  title: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
```

- [ ] **Step 4: Run the test and type-check**

Run: `npm run test:weekly-streaks`
Expected: FAIL at `the profile streak refreshes on focus` only if the hook file is missing. Otherwise it fails at `const weeklyStreak = useWeeklyStreak(profile?.id ?? null);`, which Task 4 adds.

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/weeklyStreaks.ts src/lib/useWeeklyStreak.ts src/components/WeeklyStreakBadge.tsx
git commit -m "feat: add weekly streak client module, hook and badge"
```

---

### Task 4: Show The Weekly Streak On Profiles

**Files:**
- Modify: `src/screens/ProfileScreen.tsx` (imports, hooks around line 104, header around line 470)
- Modify: `src/screens/UserProfileScreen.tsx` (imports, hooks around line 134, header around line 413)

- [ ] **Step 1: Own profile**

In `src/screens/ProfileScreen.tsx`, after the line `import { StreakAvatar } from '../components/StreakAvatar';` add:

```typescript
import { WeeklyStreakBadge } from '../components/WeeklyStreakBadge';
import { useWeeklyStreak } from '../lib/useWeeklyStreak';
```

In `src/screens/ProfileScreen.tsx`, replace:

```tsx
  const [profile, setProfile] = useState<any>(null);
```

with:

```tsx
  const [profile, setProfile] = useState<any>(null);
  const weeklyStreak = useWeeklyStreak(profile?.id ?? null);
```

The hook goes right after the `profile` state (around line 106). The component returns early while loading (around line 437), so it can't sit next to `joinDate`.

In `src/screens/ProfileScreen.tsx`, replace:

```tsx
        <Text style={typography.bodyMuted}>Joined {joinDate}</Text>
```

with:

```tsx
        <Text style={typography.bodyMuted}>Joined {joinDate}</Text>
        <WeeklyStreakBadge
          weeks={weeklyStreak.weeklyStreak}
          activeThisWeek={weeklyStreak.activeThisWeek}
          isOwnProfile
        />
```

- [ ] **Step 2: Other people's profiles**

In `src/screens/UserProfileScreen.tsx`, after the line `import { StreakAvatar } from '../components/StreakAvatar';` add:

```typescript
import { WeeklyStreakBadge } from '../components/WeeklyStreakBadge';
import { useWeeklyStreak } from '../lib/useWeeklyStreak';
```

In `src/screens/UserProfileScreen.tsx`, replace:

```tsx
  const profileId = route?.params?.userId as string | undefined;
```

with:

```tsx
  const profileId = route?.params?.userId as string | undefined;
  const weeklyStreak = useWeeklyStreak(profileId ?? null);
```

In `src/screens/UserProfileScreen.tsx`, replace:

```tsx
        <Text style={typography.bodyMuted}>Joined {joinDate}</Text>
```

with:

```tsx
        <Text style={typography.bodyMuted}>Joined {joinDate}</Text>
        <WeeklyStreakBadge
          weeks={weeklyStreak.weeklyStreak}
          activeThisWeek={weeklyStreak.activeThisWeek}
        />
```

- [ ] **Step 3: Run the test and type-check**

Run: `npm run test:weekly-streaks`
Expected: FAIL at `nights_in_a_row?: number | null;` (Task 5).

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ProfileScreen.tsx src/screens/UserProfileScreen.tsx
git commit -m "feat: show weekly streak badge on profiles"
```

---

### Task 5: Label Posts With Nights In A Row

**Files:**
- Modify: `src/lib/feedTypes.ts`, `src/lib/feedApi.ts`, `src/screens/FeedScreen.tsx`, `src/screens/PostDetailScreen.tsx`

- [ ] **Step 1: Type**

In `src/lib/feedTypes.ts`, replace:

```typescript
  author_current_streak?: number | null;
```

with:

```typescript
  author_current_streak?: number | null;
  nights_in_a_row?: number | null;
```

- [ ] **Step 2: Hydrate in the feed**

In `src/lib/feedApi.ts`, after the line `import { ChallengeSummary } from './challenges';` add:

```typescript
import { fetchSessionNightRuns } from './weeklyStreaks';
```

In `src/lib/feedApi.ts`, replace:

```typescript
  const [detailsBySession, chugsResult, buddiesBySession, officialPostChallengeSummaries] = await withTimeout(
```

with:

```typescript
  const [detailsBySession, chugsResult, buddiesBySession, officialPostChallengeSummaries, nightRunsBySession] = await withTimeout(
```

In `src/lib/feedApi.ts`, replace:

```typescript
      fetchOfficialPostLinkedChallengeSummaries(officialPosts).catch((error) => {
        console.error('Official challenge actions fetch error:', error);
        return new Map<string, ChallengeSummary>();
      }),
    ]),
```

with:

```typescript
      fetchOfficialPostLinkedChallengeSummaries(officialPosts).catch((error) => {
        console.error('Official challenge actions fetch error:', error);
        return new Map<string, ChallengeSummary>();
      }),
      sessionIds.length > 0
        ? fetchSessionNightRuns(sessionIds)
        : Promise.resolve(new Map<string, number>()),
    ]),
```

In `src/lib/feedApi.ts`, replace:

```typescript
        author_current_streak: detail?.authorCurrentStreak ?? 0,
```

with:

```typescript
        author_current_streak: detail?.authorCurrentStreak ?? 0,
        nights_in_a_row: nightRunsBySession.get(session.id) ?? null,
```

- [ ] **Step 3: Show the label on feed cards**

In `src/screens/FeedScreen.tsx`, after the line `import { usePostViewTracking } from '../lib/usePostViewTracking';` add:

```typescript
import { formatNightsInARow, shouldShowNightsInARow } from '../lib/weeklyStreaks';
```

In `src/screens/FeedScreen.tsx`, replace:

```tsx
            <Text style={styles.timeText}>{getTimeAgo(item.created_at)}</Text>
```

with:

```tsx
            <Text style={styles.timeText}>{getTimeAgo(item.created_at)}</Text>
            {shouldShowNightsInARow(item.nights_in_a_row) ? (
              <Text style={styles.nightsInARowText} numberOfLines={1}>
                🔥 {formatNightsInARow(item.nights_in_a_row as number)}
              </Text>
            ) : null}
```

In `src/screens/FeedScreen.tsx`, replace:

```typescript
  timeText: {
    ...typography.caption,
    marginTop: 2,
  },
```

with:

```typescript
  timeText: {
    ...typography.caption,
    marginTop: 2,
  },
  nightsInARowText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
```

- [ ] **Step 4: Show it on the post page**

In `src/screens/PostDetailScreen.tsx`, after the line `import { PostViewersModal } from '../components/PostViewersModal';` add:

```typescript
import { fetchSessionNightRuns } from '../lib/weeklyStreaks';
```

In `src/screens/PostDetailScreen.tsx`, replace:

```typescript
  const [ownViewsCount, setOwnViewsCount] = useState<number | null>(null);
```

with:

```typescript
  const [ownViewsCount, setOwnViewsCount] = useState<number | null>(null);
  const [nightsInARow, setNightsInARow] = useState<number | null>(null);
```

In `src/screens/PostDetailScreen.tsx`, replace:

```typescript
  }, [currentUserId, loadedAuthorId, viewTarget]);
```

with:

```typescript
  }, [currentUserId, loadedAuthorId, viewTarget]);

  const sessionIdForRun = session?.id ?? null;
  useEffect(() => {
    setNightsInARow(null);
    if (!sessionIdForRun) return undefined;

    let cancelled = false;
    fetchSessionNightRuns([sessionIdForRun]).then((runs) => {
      if (!cancelled) setNightsInARow(runs.get(sessionIdForRun) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionIdForRun]);
```

In `src/screens/PostDetailScreen.tsx`, replace:

```tsx
          item={ownViewsCount === null ? session : { ...session, views_count: ownViewsCount }}
```

with:

```tsx
          item={{
            ...session,
            ...(ownViewsCount === null ? {} : { views_count: ownViewsCount }),
            nights_in_a_row: nightsInARow ?? session.nights_in_a_row ?? null,
          }}
```

In `src/screens/PostDetailScreen.tsx`, replace:

```typescript
  }, [cheering, crawl, currentUserId, deleteSession, editSession, openComments, openProfile, ownViewsCount, session, toggleCheers, toggleCrawlCheers]);
```

with:

```typescript
  }, [cheering, crawl, currentUserId, deleteSession, editSession, nightsInARow, openComments, openProfile, ownViewsCount, session, toggleCheers, toggleCrawlCheers]);
```

- [ ] **Step 5: Run all related checks**

Run: `npm run test:weekly-streaks && npm run test:feed-api && npm run test:feed-redesign && npm run test:native-pwa-parity && npm run test:post-views && npm run test:streak-flame`
Expected: every script prints its "passed" line.

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/feedTypes.ts src/lib/feedApi.ts src/screens/FeedScreen.tsx src/screens/PostDetailScreen.tsx
git commit -m "feat: label posts with nights in a row"
```

---

### Task 6: Verify

- [ ] **Step 1: Run every test script**

Run: `for t in $(node -e "console.log(Object.keys(require('./package.json').scripts).filter(k=>k.startsWith('test:')).join(' '))"); do npm run -s $t >/dev/null 2>&1 || echo "FAIL $t"; done`
Expected: no `FAIL` lines.

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push`

- [ ] **Step 3: Spot-check in the Supabase SQL editor**

Use your own user id. It is fine to paste it into the editor, but do not commit it.

```sql
select * from public.get_weekly_streaks(array['<your user id>']::uuid[]);
select s.pub_name, r.nights_in_a_row
from public.sessions s
join public.get_session_night_runs(array(select id from public.sessions where user_id = '<your user id>' and status = 'published' order by started_at desc limit 10)) r on r.session_id = s.id;
```

Expected: the weekly streak matches the weeks you remember going out. A post from the second night of a weekend shows `nights_in_a_row = 2`.

- [ ] **Step 4: Check in the app**

Your profile shows the badge under "Joined …". A friend's profile shows theirs only if they have a streak. A Saturday post after a Friday post shows "🔥 2 nights in a row" under the time. The avatar flame behaves as before.

---

## Notes

- Weekly streaks count sessions by start time, the same as the daily streak. Challenge "nights out" counts by drink time. They differ only when a session's first drink lands on a different drinking day from its start time, which is rare.
- `get_weekly_streaks` returns a row for every requested user, including zeros, so the Friday nudge and the weekly recap can use it for anyone.
