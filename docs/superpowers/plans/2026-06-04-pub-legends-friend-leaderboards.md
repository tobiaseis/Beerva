# Pub Legends Friend Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add compact Hottest streak and Most overdue leaderboards for the current viewer plus people they follow to Pub Legends without crowding the default pub ranking.

**Correction, 2026-06-05:** The ranked pool is now `auth.uid()` plus users followed by `auth.uid()`. The current viewer appears as a normal row in the full leaderboards, with no row highlight or `You` label. Spotlight tiles still do not show viewer rank text.

**Architecture:** Add one Supabase RPC scoped to `auth.uid()` that returns both friend leaderboard datasets. Map the SQL rows in `src/lib/pubLegends.ts`, expose the fetch in `src/lib/pubLegendsApi.ts`, and keep `PubLegendsScreen` responsible only for presentation and state switching between the default pub list and one friend leaderboard.

**Tech Stack:** Supabase SQL RPCs, Expo React Native, TypeScript helper mapping, existing `scripts/pubLegends.test.js` source assertions.

---

## File Structure

- Modify: `scripts/pubLegends.test.js`
  - Adds failing source and helper assertions for the new RPC, mapping helpers, formatter, compact tile behavior, and same-screen list switch.
- Modify: `src/lib/pubLegends.ts`
  - Owns friend leaderboard row types, app types, row mapping, and `formatHoursSinceLastDrink`.
- Modify: `src/lib/pubLegendsApi.ts`
  - Adds `fetchFriendPubWatchLeaderboards()` and calls the new Supabase RPC.
- Create: `supabase/migrations/20260604160000_add_pub_legends_friend_leaderboards.sql`
  - Adds `get_friend_pub_watch_leaderboards(result_limit integer default 25)`.
- Modify: `src/screens/PubLegendsScreen.tsx`
  - Adds spotlight tiles, friend leaderboard state, same-screen friend-list view, and hour-boundary refresh while focused.

## Data Contract

The new RPC returns rows shaped like this:

```sql
returns table (
  leaderboard_type text,
  rank integer,
  user_id uuid,
  username text,
  avatar_url text,
  current_streak integer,
  latest_drink_at timestamp with time zone,
  hours_since_last_drink integer
)
```

`leaderboard_type` is either:

- `active_streak`
- `most_overdue`

---

### Task 1: Add Failing Pub Legends Contract Tests

**Files:**
- Modify: `scripts/pubLegends.test.js`

- [ ] **Step 1: Import the new helpers in the test**

In `scripts/pubLegends.test.js`, replace the current helper import:

```js
const { formatTruePints, mapPubKingSessionRow, mapPubLegendRow } = loadTypeScriptModule(helpersPath);
```

with:

```js
const {
  formatHoursSinceLastDrink,
  formatTruePints,
  mapFriendPubWatchRow,
  mapFriendPubWatchRows,
  mapPubKingSessionRow,
  mapPubLegendRow,
} = loadTypeScriptModule(helpersPath);
```

- [ ] **Step 2: Add the new migration path constant**

Near the existing `migrationPath` constants, add:

```js
const friendLeaderboardsMigrationPath = 'supabase/migrations/20260604160000_add_pub_legends_friend_leaderboards.sql';
```

- [ ] **Step 3: Add the migration existence assertion**

After the existing assertion for `migrationPath`, add:

```js
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', friendLeaderboardsMigrationPath)),
  'Pub Legends should add viewer-plus-followed friend leaderboard RPCs'
);
```

- [ ] **Step 4: Add helper mapping assertions**

After the existing `mapPubKingSessionRow` assertion, add:

```js
assert.deepEqual(
  mapFriendPubWatchRow({
    leaderboard_type: 'active_streak',
    rank: '1',
    user_id: 'user-3',
    username: 'Sofie',
    avatar_url: 'https://example.com/sofie.png',
    current_streak: '8',
    latest_drink_at: '2026-06-04T18:00:00.000Z',
    hours_since_last_drink: null,
  }),
  {
    leaderboardType: 'active_streak',
    rank: 1,
    userId: 'user-3',
    username: 'Sofie',
    avatarUrl: 'https://example.com/sofie.png',
    currentStreak: 8,
    latestDrinkAt: '2026-06-04T18:00:00.000Z',
    hoursSinceLastDrink: 0,
  },
  'friend active-streak rows should map snake_case Supabase results to app-friendly data'
);

assert.deepEqual(
  mapFriendPubWatchRows([
    {
      leaderboard_type: 'active_streak',
      rank: 1,
      user_id: 'user-1',
      username: 'Mads',
      avatar_url: null,
      current_streak: 4,
      latest_drink_at: '2026-06-04T19:00:00.000Z',
      hours_since_last_drink: null,
    },
    {
      leaderboard_type: 'most_overdue',
      rank: 1,
      user_id: 'user-2',
      username: 'Nora',
      avatar_url: null,
      current_streak: 0,
      latest_drink_at: '2026-05-30T19:00:00.000Z',
      hours_since_last_drink: '142',
    },
  ]),
  {
    activeStreaks: [
      {
        leaderboardType: 'active_streak',
        rank: 1,
        userId: 'user-1',
        username: 'Mads',
        avatarUrl: null,
        currentStreak: 4,
        latestDrinkAt: '2026-06-04T19:00:00.000Z',
        hoursSinceLastDrink: 0,
      },
    ],
    mostOverdue: [
      {
        leaderboardType: 'most_overdue',
        rank: 1,
        userId: 'user-2',
        username: 'Nora',
        avatarUrl: null,
        currentStreak: 0,
        latestDrinkAt: '2026-05-30T19:00:00.000Z',
        hoursSinceLastDrink: 142,
      },
    ],
  },
  'friend leaderboard rows should split into active streak and most overdue lists'
);

assert.equal(formatHoursSinceLastDrink(0), '0h');
assert.equal(formatHoursSinceLastDrink(1), '1h');
assert.equal(formatHoursSinceLastDrink(142), '142h');
assert.equal(formatHoursSinceLastDrink(Number.NaN), '0h');
```

- [ ] **Step 5: Add SQL source assertions**

After `const migrationSql = ...`, add:

```js
const friendLeaderboardsMigrationSql = fs.readFileSync(
  path.resolve(__dirname, '..', friendLeaderboardsMigrationPath),
  'utf8'
);
```

After the existing Pub Legends SQL assertions, add:

```js
assert.match(
  friendLeaderboardsMigrationSql,
  /create or replace function public\.get_friend_pub_watch_leaderboards\(result_limit integer default 25\)/i,
  'friend watch migration should create get_friend_pub_watch_leaderboards'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /follows\.follower_id\s*=\s*\(select auth\.uid\(\)\)/i,
  'friend watch leaderboard should scope rows to people the viewer follows'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /select\s+\(select auth\.uid\(\)\)\s+as user_id/i,
  'friend watch leaderboard should include the current viewer in the ranked pool'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /public\.get_current_streaks/i,
  'active streak leaderboard should reuse the canonical current streak function'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /coalesce\(session_beers\.consumed_at,\s*sessions\.started_at,\s*sessions\.created_at\)/i,
  'most overdue leaderboard should prefer consumed_at with session timestamp fallbacks'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /round\(extract\(epoch from \(now\(\) - latest_drink_at\)\) \/ 3600\.0\)::integer/i,
  'most overdue leaderboard should round time since last drink to whole hours'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /grant execute on function public\.get_friend_pub_watch_leaderboards\(integer\) to authenticated/i,
  'authenticated users should be able to call friend watch leaderboard RPC'
);
```

- [ ] **Step 6: Add API and screen source assertions**

After the existing `apiSource` assertions, add:

```js
assert.match(
  apiSource,
  /fetchFriendPubWatchLeaderboards/,
  'Pub Legends API should expose a friend watch leaderboard fetch helper'
);
assert.match(
  apiSource,
  /get_friend_pub_watch_leaderboards/,
  'Pub Legends API helper should call the friend watch RPC'
);
```

After the existing `legendsScreenSource` assertion, add:

```js
assert.match(
  legendsScreenSource,
  /Friends on Watch/,
  'Pub Legends screen should label the compact friend watch strip'
);
assert.match(
  legendsScreenSource,
  /Hottest streak/,
  'Pub Legends screen should render the hottest streak spotlight tile'
);
assert.match(
  legendsScreenSource,
  /Most overdue/,
  'Pub Legends screen should render the most overdue spotlight tile'
);
assert.match(
  legendsScreenSource,
  /Back to pubs/,
  'friend leaderboard view should provide a same-screen return control'
);
assert.doesNotMatch(
  legendsScreenSource,
  /your rank|own rank|current user rank/i,
  'spotlight tiles should not render the viewer rank copy'
);
assert.match(
  legendsScreenSource,
  /colors\.dangerSoft/,
  'Most overdue tile should use the light red danger treatment'
);
assert.match(
  legendsScreenSource,
  /colors\.primarySoft/,
  'Hottest streak tile should use the light yellow primary treatment'
);
```

- [ ] **Step 7: Run the failing test**

Run:

```bash
npm run test:pub-legends
```

Expected: FAIL because `formatHoursSinceLastDrink`, `mapFriendPubWatchRow`, the new migration, API helper, and screen strings do not exist yet.

- [ ] **Step 8: Commit the failing test**

```bash
git add scripts/pubLegends.test.js
git commit -m "test: specify pub legends friend leaderboards"
```

---

### Task 2: Add Friend Leaderboard Mapping Helpers

**Files:**
- Modify: `src/lib/pubLegends.ts`
- Test: `scripts/pubLegends.test.js`

- [ ] **Step 1: Add friend leaderboard types**

In `src/lib/pubLegends.ts`, after `export type PubKingSession = { ... };`, add:

```ts
export type FriendPubWatchLeaderboardType = 'active_streak' | 'most_overdue';

export type FriendPubWatchRow = {
  leaderboard_type?: string | null;
  rank?: number | string | null;
  user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  current_streak?: number | string | null;
  latest_drink_at?: string | null;
  hours_since_last_drink?: number | string | null;
};

export type FriendPubWatchEntry = {
  leaderboardType: FriendPubWatchLeaderboardType;
  rank: number;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  currentStreak: number;
  latestDrinkAt: string | null;
  hoursSinceLastDrink: number;
};

export type FriendPubWatchLeaderboards = {
  activeStreaks: FriendPubWatchEntry[];
  mostOverdue: FriendPubWatchEntry[];
};
```

- [ ] **Step 2: Add the leaderboard type normalizer**

Below `const toStringOrNull = ...`, add:

```ts
const toFriendPubWatchLeaderboardType = (
  value: string | null | undefined
): FriendPubWatchLeaderboardType => (
  value === 'most_overdue' ? 'most_overdue' : 'active_streak'
);
```

- [ ] **Step 3: Add the formatter and mappers**

At the end of `src/lib/pubLegends.ts`, after `mapPubKingSessionRow`, add:

```ts
export const formatHoursSinceLastDrink = (value: number | string | null | undefined) => {
  const hours = Math.max(0, toInteger(value));
  return `${hours}h`;
};

export const mapFriendPubWatchRow = (row: FriendPubWatchRow): FriendPubWatchEntry => ({
  leaderboardType: toFriendPubWatchLeaderboardType(toStringOrNull(row.leaderboard_type)),
  rank: toInteger(row.rank),
  userId: toStringOrNull(row.user_id) || 'unknown',
  username: toStringOrNull(row.username),
  avatarUrl: toStringOrNull(row.avatar_url),
  currentStreak: toInteger(row.current_streak),
  latestDrinkAt: toStringOrNull(row.latest_drink_at),
  hoursSinceLastDrink: toInteger(row.hours_since_last_drink),
});

export const mapFriendPubWatchRows = (
  rows: FriendPubWatchRow[]
): FriendPubWatchLeaderboards => rows.reduce<FriendPubWatchLeaderboards>(
  (leaderboards, row) => {
    const entry = mapFriendPubWatchRow(row);
    if (entry.leaderboardType === 'most_overdue') {
      leaderboards.mostOverdue.push(entry);
    } else {
      leaderboards.activeStreaks.push(entry);
    }
    return leaderboards;
  },
  { activeStreaks: [], mostOverdue: [] }
);
```

- [ ] **Step 4: Run the test**

Run:

```bash
npm run test:pub-legends
```

Expected: FAIL only on the missing migration, API helper, and screen source assertions. The helper mapping and formatter assertions now pass.

- [ ] **Step 5: Commit helper mapping**

```bash
git add src/lib/pubLegends.ts
git commit -m "feat: map pub legends friend leaderboard rows"
```

---

### Task 3: Add the Follows-Scoped Friend Leaderboard RPC

**Files:**
- Create: `supabase/migrations/20260604160000_add_pub_legends_friend_leaderboards.sql`
- Test: `scripts/pubLegends.test.js`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260604160000_add_pub_legends_friend_leaderboards.sql` with:

```sql
create or replace function public.get_friend_pub_watch_leaderboards(result_limit integer default 25)
returns table (
  leaderboard_type text,
  rank integer,
  user_id uuid,
  username text,
  avatar_url text,
  current_streak integer,
  latest_drink_at timestamp with time zone,
  hours_since_last_drink integer
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(result_limit, 25), 1), 50) as limit_value
  ),
  followed_users as (
    select
      follows.following_id as user_id,
      profiles.username,
      profiles.avatar_url
    from public.follows
    left join public.profiles on profiles.id = follows.following_id
    where follows.follower_id = (select auth.uid())
  ),
  latest_drinks as (
    select
      sessions.user_id,
      max(coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) as latest_drink_at
    from public.sessions
    left join public.session_beers on session_beers.session_id = sessions.id
    where sessions.status = 'published'
      and sessions.user_id in (select followed_users.user_id from followed_users)
    group by sessions.user_id
  ),
  streak_rows as (
    select
      followed_users.user_id,
      followed_users.username,
      followed_users.avatar_url,
      coalesce(current_streaks.current_streak, 0) as current_streak,
      latest_drinks.latest_drink_at
    from followed_users
    left join public.get_current_streaks(
      (select coalesce(array_agg(followed_users.user_id), array[]::uuid[]) from followed_users)
    ) current_streaks on current_streaks.user_id = followed_users.user_id
    left join latest_drinks on latest_drinks.user_id = followed_users.user_id
  ),
  active_streak_ranked as (
    select
      'active_streak'::text as leaderboard_type,
      row_number() over (
        order by
          streak_rows.current_streak desc,
          streak_rows.latest_drink_at desc nulls last,
          lower(coalesce(streak_rows.username, '')) asc,
          streak_rows.user_id asc
      )::integer as rank,
      streak_rows.user_id,
      streak_rows.username,
      streak_rows.avatar_url,
      streak_rows.current_streak,
      streak_rows.latest_drink_at,
      null::integer as hours_since_last_drink
    from streak_rows
  ),
  most_overdue_ranked as (
    select
      'most_overdue'::text as leaderboard_type,
      row_number() over (
        order by
          greatest(round(extract(epoch from (now() - latest_drinks.latest_drink_at)) / 3600.0)::integer, 0) desc,
          latest_drinks.latest_drink_at asc,
          lower(coalesce(followed_users.username, '')) asc,
          followed_users.user_id asc
      )::integer as rank,
      followed_users.user_id,
      followed_users.username,
      followed_users.avatar_url,
      coalesce(current_streaks.current_streak, 0) as current_streak,
      latest_drinks.latest_drink_at,
      greatest(round(extract(epoch from (now() - latest_drinks.latest_drink_at)) / 3600.0)::integer, 0) as hours_since_last_drink
    from followed_users
    join latest_drinks on latest_drinks.user_id = followed_users.user_id
    left join public.get_current_streaks(
      (select coalesce(array_agg(followed_users.user_id), array[]::uuid[]) from followed_users)
    ) current_streaks on current_streaks.user_id = followed_users.user_id
  )
  select
    active_streak_ranked.leaderboard_type,
    active_streak_ranked.rank,
    active_streak_ranked.user_id,
    active_streak_ranked.username,
    active_streak_ranked.avatar_url,
    active_streak_ranked.current_streak,
    active_streak_ranked.latest_drink_at,
    active_streak_ranked.hours_since_last_drink
  from active_streak_ranked, params
  where active_streak_ranked.rank <= params.limit_value

  union all

  select
    most_overdue_ranked.leaderboard_type,
    most_overdue_ranked.rank,
    most_overdue_ranked.user_id,
    most_overdue_ranked.username,
    most_overdue_ranked.avatar_url,
    most_overdue_ranked.current_streak,
    most_overdue_ranked.latest_drink_at,
    most_overdue_ranked.hours_since_last_drink
  from most_overdue_ranked, params
  where most_overdue_ranked.rank <= params.limit_value

  order by leaderboard_type asc, rank asc;
$$;

revoke execute on function public.get_friend_pub_watch_leaderboards(integer) from public, anon;
grant execute on function public.get_friend_pub_watch_leaderboards(integer) to authenticated;

comment on function public.get_friend_pub_watch_leaderboards(integer) is
  'Returns viewer-plus-followed active streak and most-overdue friend leaderboards for the current Pub Legends viewer.';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Run the test**

Run:

```bash
npm run test:pub-legends
```

Expected: FAIL only on missing API helper and screen source assertions.

- [ ] **Step 3: Commit the migration**

```bash
git add supabase/migrations/20260604160000_add_pub_legends_friend_leaderboards.sql
git commit -m "feat: add pub legends friend leaderboard rpc"
```

---

### Task 4: Add the Pub Legends API Fetch Helper

**Files:**
- Modify: `src/lib/pubLegendsApi.ts`
- Test: `scripts/pubLegends.test.js`

- [ ] **Step 1: Extend imports**

In `src/lib/pubLegendsApi.ts`, update the Pub Legends imports to include the friend leaderboard helpers:

```ts
import {
  FriendPubWatchLeaderboards,
  FriendPubWatchRow,
  mapFriendPubWatchRows,
  mapPubKingSessionRow,
  mapPubLegendRow,
  PubKingSession,
  PubKingSessionRow,
  PubLegend,
  PubLegendRow,
} from './pubLegends';
```

- [ ] **Step 2: Add the fetch helper**

After `fetchKingOfThePub`, add:

```ts
export const fetchFriendPubWatchLeaderboards = async (): Promise<FriendPubWatchLeaderboards> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_friend_pub_watch_leaderboards', { result_limit: 25 }),
      PUB_LEGENDS_TIMEOUT_MS,
      'Friend leaderboards are taking too long to load.'
    );

    if (error) throw error;
    return mapFriendPubWatchRows((data || []) as FriendPubWatchRow[]);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load friend leaderboards.'));
  }
};
```

- [ ] **Step 3: Run the test**

Run:

```bash
npm run test:pub-legends
```

Expected: FAIL only on missing screen source assertions.

- [ ] **Step 4: Commit the API helper**

```bash
git add src/lib/pubLegendsApi.ts
git commit -m "feat: fetch pub legends friend leaderboards"
```

---

### Task 5: Add Compact Spotlight Tiles and Friend List State

**Files:**
- Modify: `src/screens/PubLegendsScreen.tsx`
- Test: `scripts/pubLegends.test.js`

- [ ] **Step 1: Update imports**

In `src/screens/PubLegendsScreen.tsx`, replace:

```ts
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
```

with:

```ts
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
```

Replace the lucide import:

```ts
import { Beer, ChevronRight, Crown, MapPin, Trophy, Users } from 'lucide-react-native';
```

with:

```ts
import { ArrowLeft, Beer, ChevronRight, Clock, Crown, Flame, MapPin, Trophy, Users } from 'lucide-react-native';
```

Replace:

```ts
import { EmptyIllustration } from '../components/EmptyIllustration';
```

with:

```ts
import { CachedImage } from '../components/CachedImage';
import { EmptyIllustration } from '../components/EmptyIllustration';
```

Replace:

```ts
import { formatTruePints, PubLegend } from '../lib/pubLegends';
import { fetchPubLegends } from '../lib/pubLegendsApi';
```

with:

```ts
import {
  formatHoursSinceLastDrink,
  formatTruePints,
  FriendPubWatchEntry,
  FriendPubWatchLeaderboards,
  PubLegend,
} from '../lib/pubLegends';
import { fetchFriendPubWatchLeaderboards, fetchPubLegends } from '../lib/pubLegendsApi';
```

- [ ] **Step 2: Add local constants and helpers**

Below `formatChampion`, add:

```ts
type FriendLeaderboardMode = 'pubs' | 'active-streaks' | 'most-overdue';

const emptyFriendLeaderboards: FriendPubWatchLeaderboards = {
  activeStreaks: [],
  mostOverdue: [],
};

const getDisplayName = (entry?: FriendPubWatchEntry | null) => entry?.username || 'Beer Lover';

const formatStreakDays = (value: number) => `${value} ${value === 1 ? 'day' : 'days'}`;

const formatLastDrinkDate = (value?: string | null) => {
  if (!value) return 'Last beer unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Last beer unknown';
  return `Last beer: ${date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};
```

- [ ] **Step 3: Add screen state**

Inside `PubLegendsScreen`, after the `challenges` state, add:

```ts
const [friendLeaderboards, setFriendLeaderboards] = useState<FriendPubWatchLeaderboards>(emptyFriendLeaderboards);
const [friendLeaderboardMode, setFriendLeaderboardMode] = useState<FriendLeaderboardMode>('pubs');
const [friendLoading, setFriendLoading] = useState(false);
const [friendErrorMessage, setFriendErrorMessage] = useState<string | null>(null);
```

- [ ] **Step 4: Add derived spotlight entries**

After `const hasLoadedOnce = useRef(false);`, add:

```ts
const hottestStreak = useMemo(
  () => friendLeaderboards.activeStreaks.find((entry) => entry.currentStreak > 0) || null,
  [friendLeaderboards.activeStreaks]
);

const mostOverdue = friendLeaderboards.mostOverdue[0] || null;

const activeFriendRows = friendLeaderboardMode === 'active-streaks'
  ? friendLeaderboards.activeStreaks
  : friendLeaderboardMode === 'most-overdue'
    ? friendLeaderboards.mostOverdue
    : [];
```

- [ ] **Step 5: Add the friend leaderboard loader**

After `loadChallenges`, add:

```ts
const loadFriendLeaderboards = useCallback(async () => {
  try {
    setFriendLoading(true);
    setFriendErrorMessage(null);
    const rows = await fetchFriendPubWatchLeaderboards();
    setFriendLeaderboards(rows);
  } catch (error) {
    console.error('Friend leaderboards fetch error:', error);
    setFriendErrorMessage(error instanceof Error ? error.message : 'Could not load friend leaderboards.');
  } finally {
    setFriendLoading(false);
  }
}, []);
```

- [ ] **Step 6: Load friend leaderboards on focus**

Inside the existing `useFocusEffect`, change:

```ts
loadLegends();
loadChallenges();
```

to:

```ts
loadLegends();
loadChallenges();
loadFriendLeaderboards();
```

and update the dependency array from:

```ts
}, [loadChallenges, loadLegends])
```

to:

```ts
}, [loadChallenges, loadFriendLeaderboards, loadLegends])
```

- [ ] **Step 7: Refresh friend data with the pub list**

In `onRefresh`, change:

```ts
loadLegends();
```

to:

```ts
loadLegends();
loadFriendLeaderboards();
```

and update the dependency array to:

```ts
}, [loadFriendLeaderboards, loadLegends]);
```

- [ ] **Step 8: Add tile press handlers**

After `openChallenge`, add:

```ts
const openFriendLeaderboard = useCallback((mode: Exclude<FriendLeaderboardMode, 'pubs'>) => {
  hapticLight();
  setFriendLeaderboardMode(mode);
}, []);

const closeFriendLeaderboard = useCallback(() => {
  hapticLight();
  setFriendLeaderboardMode('pubs');
}, []);
```

- [ ] **Step 9: Add the spotlight tile renderer**

Before `renderLegend`, add:

```tsx
const renderFriendSpotlightTile = useCallback((
  mode: Exclude<FriendLeaderboardMode, 'pubs'>,
  label: string,
  entry: FriendPubWatchEntry | null,
  emptyLabel: string
) => {
  const isStreak = mode === 'active-streaks';
  const Icon = isStreak ? Flame : Clock;
  const metric = entry
    ? isStreak
      ? formatStreakDays(entry.currentStreak)
      : formatHoursSinceLastDrink(entry.hoursSinceLastDrink)
    : emptyLabel;

  return (
    <Pressable
      onPress={() => openFriendLeaderboard(mode)}
      style={({ pressed }) => [
        styles.friendSpotlightTile,
        isStreak ? styles.friendSpotlightTileStreak : styles.friendSpotlightTileOverdue,
        pressed ? styles.pressed : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${entry ? `${getDisplayName(entry)}, ${metric}` : emptyLabel}`}
    >
      <View style={styles.friendTileLabelRow}>
        <Icon color={isStreak ? colors.primary : colors.danger} size={13} />
        <Text style={[styles.friendTileLabel, isStreak ? styles.friendTileLabelStreak : styles.friendTileLabelOverdue]}>
          {label}
        </Text>
      </View>
      <View style={styles.friendTileMain}>
        {entry ? (
          <CachedImage
            uri={entry.avatarUrl}
            fallbackUri={`https://i.pravatar.cc/150?u=${entry.userId}`}
            style={styles.friendTileAvatar}
            recyclingKey={`friend-watch-${mode}-${entry.userId}-${entry.avatarUrl || 'fallback'}`}
            accessibilityLabel={`${getDisplayName(entry)}'s avatar`}
          />
        ) : (
          <View style={styles.friendTileAvatarEmpty}>
            <Icon color={isStreak ? colors.primary : colors.danger} size={16} />
          </View>
        )}
        <View style={styles.friendTileCopy}>
          <Text style={styles.friendTileName} numberOfLines={1}>
            {entry ? getDisplayName(entry) : emptyLabel}
          </Text>
          {entry ? (
            <Text
              style={[styles.friendTileMetric, isStreak ? styles.friendTileMetricStreak : styles.friendTileMetricOverdue]}
              numberOfLines={1}
            >
              {metric}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}, [openFriendLeaderboard]);
```

- [ ] **Step 10: Add the friend row renderer**

Before `renderChallenge`, add:

```tsx
const renderFriendLeader = useCallback(({ item }: { item: FriendPubWatchEntry }) => {
  const isStreak = friendLeaderboardMode === 'active-streaks';
  const metric = isStreak
    ? formatStreakDays(item.currentStreak)
    : formatHoursSinceLastDrink(item.hoursSinceLastDrink);
  const secondary = isStreak
    ? formatLastDrinkDate(item.latestDrinkAt)
    : formatLastDrinkDate(item.latestDrinkAt);

  return (
    <Pressable
      onPress={() => {
        if (item.userId === 'unknown') return;
        hapticLight();
        navigation.getParent()?.navigate('UserProfile', { userId: item.userId });
      }}
      style={({ pressed }) => [styles.friendLeaderRow, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`${getDisplayName(item)}, rank ${item.rank}, ${metric}`}
    >
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>{item.rank}</Text>
      </View>
      <CachedImage
        uri={item.avatarUrl}
        fallbackUri={`https://i.pravatar.cc/150?u=${item.userId}`}
        style={styles.friendLeaderAvatar}
        recyclingKey={`friend-leader-${friendLeaderboardMode}-${item.userId}-${item.avatarUrl || 'fallback'}`}
        accessibilityLabel={`${getDisplayName(item)}'s avatar`}
      />
      <View style={styles.friendLeaderBody}>
        <Text style={styles.username} numberOfLines={1}>{getDisplayName(item)}</Text>
        <Text style={styles.metaText} numberOfLines={1}>{secondary}</Text>
      </View>
      <Text
        style={[styles.friendLeaderMetric, isStreak ? styles.friendTileMetricStreak : styles.friendTileMetricOverdue]}
        numberOfLines={1}
      >
        {metric}
      </Text>
    </Pressable>
  );
}, [friendLeaderboardMode, navigation]);
```

- [ ] **Step 11: Update the header**

Inside `renderHeader`, after the segmented control and before `{legends[0] ? (`, insert:

```tsx
{activeSegment === 'pub-legends' ? (
  <View style={styles.friendWatchBlock}>
    <View style={styles.friendWatchHeader}>
      <Text style={styles.friendWatchTitle}>Friends on Watch</Text>
      {friendLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
    </View>
    {friendErrorMessage ? (
      <View style={styles.friendWatchError}>
        <Text style={styles.friendWatchErrorText}>{friendErrorMessage}</Text>
      </View>
    ) : (
      <View style={styles.friendSpotlightGrid}>
        {renderFriendSpotlightTile('active-streaks', 'Hottest streak', hottestStreak, 'No active streaks')}
        {renderFriendSpotlightTile('most-overdue', 'Most overdue', mostOverdue, 'No one exposed')}
      </View>
    )}
  </View>
) : null}
```

Update `renderHeader` dependencies from:

```ts
), [activeSegment, legends]);
```

to:

```ts
), [
  activeSegment,
  friendErrorMessage,
  friendLoading,
  hottestStreak,
  legends,
  mostOverdue,
  renderFriendSpotlightTile,
]);
```

- [ ] **Step 12: Add the friend leaderboard header**

After `renderHeader`, add:

```tsx
const renderFriendListHeader = useCallback(() => {
  const title = friendLeaderboardMode === 'active-streaks'
    ? 'Active streaks among friends'
    : 'Most overdue among friends';
  return (
    <View style={styles.friendListHeader}>
      {renderHeader()}
      <View style={styles.friendListToolbar}>
        <Pressable
          onPress={closeFriendLeaderboard}
          style={({ pressed }) => [styles.backToPubsChip, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Back to pubs"
        >
          <ArrowLeft color={colors.primary} size={15} />
          <Text style={styles.backToPubsText}>Back to pubs</Text>
        </Pressable>
        <Text style={styles.friendListTitle}>{title}</Text>
      </View>
    </View>
  );
}, [closeFriendLeaderboard, friendLeaderboardMode, renderHeader]);
```

- [ ] **Step 13: Add the friend list branch in the return**

In the `return`, replace:

```tsx
) : activeSegment === 'pub-legends' ? (
  <FlatList
    data={legends}
```

with:

```tsx
) : activeSegment === 'pub-legends' && friendLeaderboardMode !== 'pubs' ? (
  <FlatList
    data={activeFriendRows}
    keyExtractor={(item) => `${item.leaderboardType}-${item.userId}`}
    renderItem={renderFriendLeader}
    initialNumToRender={10}
    maxToRenderPerBatch={10}
    windowSize={5}
    removeClippedSubviews={Platform.OS !== 'web'}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={[styles.listContent, activeFriendRows.length === 0 ? styles.emptyContent : null]}
    refreshControl={<RefreshControl refreshing={refreshing || friendLoading} onRefresh={onRefresh} tintColor={colors.primary} />}
    ListHeaderComponent={renderFriendListHeader}
    ListEmptyComponent={
      <View style={styles.emptyState}>
        <EmptyIllustration kind="trophy" size={170} />
        <Text style={styles.emptyTitle}>{friendErrorMessage ? 'Could not load friend leaderboards' : 'No friend data yet'}</Text>
        <Text style={styles.emptyText}>{friendErrorMessage || 'Follow friends to start the watchlist.'}</Text>
      </View>
    }
  />
) : activeSegment === 'pub-legends' ? (
  <FlatList
    data={legends}
```

- [ ] **Step 14: Add styles**

At the end of `StyleSheet.create`, before `emptyState`, add:

```ts
friendWatchBlock: {
  gap: 8,
},
friendWatchHeader: {
  minHeight: 20,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},
friendWatchTitle: {
  ...typography.tiny,
  color: colors.textMuted,
  textTransform: 'uppercase',
},
friendWatchError: {
  minHeight: 42,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.cardMuted,
  paddingHorizontal: 10,
  alignItems: 'center',
  justifyContent: 'center',
},
friendWatchErrorText: {
  ...typography.caption,
  color: colors.textMuted,
  textAlign: 'center',
},
friendSpotlightGrid: {
  flexDirection: 'row',
  gap: 8,
},
friendSpotlightTile: {
  flex: 1,
  minWidth: 0,
  minHeight: 92,
  borderRadius: radius.lg,
  borderWidth: 1,
  padding: 10,
  gap: 8,
},
friendSpotlightTileStreak: {
  backgroundColor: colors.primarySoft,
  borderColor: colors.primaryBorder,
},
friendSpotlightTileOverdue: {
  backgroundColor: colors.dangerSoft,
  borderColor: 'rgba(239, 68, 68, 0.28)',
},
friendTileLabelRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
},
friendTileLabel: {
  ...typography.tiny,
  textTransform: 'uppercase',
  fontWeight: '900',
  flex: 1,
  minWidth: 0,
},
friendTileLabelStreak: {
  color: colors.primary,
},
friendTileLabelOverdue: {
  color: colors.danger,
},
friendTileMain: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},
friendTileAvatar: {
  width: 34,
  height: 34,
  borderRadius: 17,
  borderWidth: 2,
  borderColor: colors.primaryBorder,
},
friendTileAvatarEmpty: {
  width: 34,
  height: 34,
  borderRadius: 17,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.surface,
  alignItems: 'center',
  justifyContent: 'center',
},
friendTileCopy: {
  flex: 1,
  minWidth: 0,
},
friendTileName: {
  ...typography.caption,
  color: colors.text,
  fontWeight: '800',
},
friendTileMetric: {
  ...typography.h3,
  marginTop: 1,
  fontVariant: ['tabular-nums'],
},
friendTileMetricStreak: {
  color: colors.primary,
},
friendTileMetricOverdue: {
  color: colors.danger,
},
friendListHeader: {
  gap: spacing.md,
},
friendListToolbar: {
  gap: 8,
},
backToPubsChip: {
  alignSelf: 'flex-start',
  minHeight: 32,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: colors.primaryBorder,
  backgroundColor: colors.primarySoft,
  paddingHorizontal: 10,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
},
backToPubsText: {
  ...typography.tiny,
  color: colors.primary,
  fontWeight: '900',
},
friendListTitle: {
  ...typography.tiny,
  color: colors.textMuted,
  textTransform: 'uppercase',
},
friendLeaderRow: {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  padding: 12,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  ...shadows.card,
},
friendLeaderAvatar: {
  width: 42,
  height: 42,
  borderRadius: 21,
  borderWidth: 2,
  borderColor: colors.primaryBorder,
},
friendLeaderBody: {
  flex: 1,
  minWidth: 0,
},
friendLeaderMetric: {
  ...typography.h3,
  minWidth: 54,
  textAlign: 'right',
  fontVariant: ['tabular-nums'],
},
```

- [ ] **Step 15: Run the Pub Legends test**

Run:

```bash
npm run test:pub-legends
```

Expected: PASS with `Pub Legends tests passed`.

- [ ] **Step 16: Commit the screen changes**

```bash
git add src/screens/PubLegendsScreen.tsx
git commit -m "feat: add pub legends friend watch spotlight"
```

---

### Task 6: Add Hour-Boundary Refresh While Focused

**Files:**
- Modify: `src/screens/PubLegendsScreen.tsx`
- Test: `scripts/pubLegends.test.js`

- [ ] **Step 1: Update React imports**

Replace:

```ts
import React, { useCallback, useMemo, useRef, useState } from 'react';
```

with:

```ts
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: Add the hour timer helper**

Below `formatLastDrinkDate`, add:

```ts
const getMsUntilNextHour = () => {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  return Math.max(1000, nextHour.getTime() - now.getTime());
};
```

- [ ] **Step 3: Add focused state**

Inside `PubLegendsScreen`, after `friendLeaderboardMode` state, add:

```ts
const [screenFocused, setScreenFocused] = useState(false);
```

- [ ] **Step 4: Track focus lifecycle**

At the start of the existing `useFocusEffect` callback, change:

```ts
useFocusEffect(
  useCallback(() => {
    loadLegends();
    loadChallenges();
    loadFriendLeaderboards();
  }, [loadChallenges, loadFriendLeaderboards, loadLegends])
);
```

to:

```ts
useFocusEffect(
  useCallback(() => {
    setScreenFocused(true);
    loadLegends();
    loadChallenges();
    loadFriendLeaderboards();
    return () => setScreenFocused(false);
  }, [loadChallenges, loadFriendLeaderboards, loadLegends])
);
```

- [ ] **Step 5: Add the hour-boundary timer**

After the `useFocusEffect`, add:

```ts
useEffect(() => {
  if (!screenFocused || activeSegment !== 'pub-legends') return undefined;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  const timeoutId = setTimeout(() => {
    loadFriendLeaderboards();
    intervalId = setInterval(loadFriendLeaderboards, 60 * 60 * 1000);
  }, getMsUntilNextHour());

  return () => {
    clearTimeout(timeoutId);
    if (intervalId) clearInterval(intervalId);
  };
}, [activeSegment, loadFriendLeaderboards, screenFocused]);
```

- [ ] **Step 6: Add source assertions for the timer**

In `scripts/pubLegends.test.js`, after the existing `colors.primarySoft` screen assertion from Task 1, add:

```js
assert.match(
  legendsScreenSource,
  /getMsUntilNextHour/,
  'Pub Legends screen should calculate the next whole-hour refresh boundary'
);
assert.match(
  legendsScreenSource,
  /setInterval\(loadFriendLeaderboards,\s*60 \* 60 \* 1000\)/,
  'friend watch leaderboards should refresh hourly while the screen is focused'
);
```

- [ ] **Step 7: Run the Pub Legends test**

Run:

```bash
npm run test:pub-legends
```

Expected: PASS with `Pub Legends tests passed`.

- [ ] **Step 8: Commit the refresh behavior**

```bash
git add src/screens/PubLegendsScreen.tsx scripts/pubLegends.test.js
git commit -m "feat: refresh friend watch leaderboards hourly"
```

---

### Task 7: Final Verification

**Files:**
- Verify: `src/lib/pubLegends.ts`
- Verify: `src/lib/pubLegendsApi.ts`
- Verify: `src/screens/PubLegendsScreen.tsx`
- Verify: `supabase/migrations/20260604160000_add_pub_legends_friend_leaderboards.sql`
- Verify: `scripts/pubLegends.test.js`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:pub-legends
npm run test:streak-flame
```

Expected:

```text
Pub Legends tests passed
streakFlame tier tests passed
streak migration assertions passed
StreakAvatar source assertions passed
feed/post wiring assertions passed
profile wiring assertions passed
```

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Review migration safety**

Run:

```bash
rg -n "get_friend_pub_watch_leaderboards|auth.uid|session_beers.consumed_at|grant execute" supabase/migrations/20260604160000_add_pub_legends_friend_leaderboards.sql
```

Expected output includes:

```text
create or replace function public.get_friend_pub_watch_leaderboards(result_limit integer default 25)
where follows.follower_id = (select auth.uid())
max(coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)) as latest_drink_at
grant execute on function public.get_friend_pub_watch_leaderboards(integer) to authenticated;
```

- [ ] **Step 4: Review UI source for compact tile constraints**

Run:

```bash
rg -n "Friends on Watch|Hottest streak|Most overdue|Back to pubs|your rank|own rank|current user rank" src/screens/PubLegendsScreen.tsx
```

Expected:

```text
Friends on Watch
Hottest streak
Most overdue
Back to pubs
```

Expected: no matches for `your rank`, `own rank`, or `current user rank`.

- [ ] **Step 5: Check git status**

Run:

```bash
git status --short
```

Expected: clean working tree.

If the working tree is not clean, inspect the remaining files with:

```bash
git diff --name-only
```

Only commit files intentionally changed by this plan.

---

## Manual QA

Use Expo web or a device build after the Supabase migration is applied.

- Open Pub Legends as a user who follows people with published sessions.
- Confirm the default list is still the pub leaderboard.
- Confirm the **Hottest streak** tile is light yellow and shows only label, avatar, username, and `N day(s)`.
- Confirm the **Most overdue** tile is light red and shows only label, avatar, username, and `Nh`.
- Tap **Hottest streak** and confirm the same screen shows `Active streaks among friends`.
- Tap **Back to pubs** and confirm the pub leaderboard returns.
- Tap **Most overdue** and confirm the same screen shows `Most overdue among friends`.
- Confirm pulling to refresh updates pub and friend data.
- Confirm a user with no followed people sees compact empty states instead of a broken page.

## Self-Review Checklist

- Spec coverage:
  - Viewer + followed-users scope: Task 3 SQL plus the 2026-06-05 correction.
  - No current viewer rank in tiles: Task 1 and Task 5.
  - Yellow and red tile treatments: Task 5.
  - Same-screen full leaderboard with back chip: Task 5.
  - Whole-hour overdue display and hourly refresh: Task 3 and Task 6.
  - Existing Pub Legends still default: Task 5 and Manual QA.
- Placeholder scan:
  - No unresolved markers or incomplete task steps remain.
- Type consistency:
  - `FriendPubWatchRow`, `FriendPubWatchEntry`, `FriendPubWatchLeaderboards`, and `fetchFriendPubWatchLeaderboards` are defined before use.
