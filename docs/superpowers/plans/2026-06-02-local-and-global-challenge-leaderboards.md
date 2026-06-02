# Local And Global Challenge Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local challenge leaderboard for the signed-in user and joined mutual followers, keep the global leaderboard as the official competition result, and default challenge UI summaries to the local comparison.

**Architecture:** Preserve `public.get_challenge_leaderboard(uuid)` as the canonical global ranking used by winners and trophies. Add one viewer-aware local RPC that filters canonical rows with `auth.uid()` and `public.is_mutual_follower`, then update challenge list/detail RPCs so compact surfaces receive local defaults while detail receives both scopes in one request. Map the nested scopes in TypeScript and add a compact `Local | Global` detail toggle without changing Feed or Pub Legends components.

**Tech Stack:** Supabase Postgres SQL/RPC, Expo React Native, TypeScript, React hooks, Node source-level regression scripts.

---

## File Structure

### Create

- `supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql`
  - Adds the viewer-aware local leaderboard and replaces the challenge summary/detail RPCs while leaving canonical global ranking and finalizers untouched. Keeps a top-level local leaderboard alias so cached older clients still render rows during rollout.

### Modify

- `scripts/challenges.test.js`
  - Adds SQL contract checks, scoped mapper assertions, and detail-screen source checks.
- `src/lib/challenges.ts`
  - Adds scoped leaderboard row/model types and maps `leaderboards.local` plus `leaderboards.global`.
- `src/screens/ChallengeDetailScreen.tsx`
  - Defaults to local comparison and switches list, rank, entrant count, and empty copy together.

### Intentionally Unchanged

- `src/lib/challengesApi.ts`
  - Existing `get_official_challenges` and `get_challenge_detail` calls remain the correct API boundary.
- `src/screens/PubLegendsScreen.tsx`
  - Already renders `entrantsCount` and `currentUserRank`; the replaced summary RPC makes those values local.
- `src/screens/FeedScreen.tsx`
  - Already renders the active summary `currentUserRank`; the replaced summary RPC makes that value local.
- Existing finalizer migrations and functions
  - Continue calling `public.get_challenge_leaderboard(uuid)` so official winners and trophies stay global.

## Task 1: Add Local And Global Database Scopes

**Files:**
- Create: `supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql`
- Modify: `scripts/challenges.test.js`

- [ ] **Step 1: Write the failing SQL contract checks**

In `scripts/challenges.test.js`, add the new migration path beside the existing challenge migration constants:

```js
const localChallengeLeaderboardsMigrationPath = 'supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql';
const adminChallengesMigrationPath = 'supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql';
```

Add the existence assertion beside the existing migration existence checks:

```js
assert.ok(exists(localChallengeLeaderboardsMigrationPath), 'local challenge leaderboards migration should exist');
```

After the existing `challengeLeaderboardWindowFixSql` assertions, add:

```js
const localChallengeLeaderboardsMigrationSql = read(localChallengeLeaderboardsMigrationPath);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /create or replace function public\.get_local_challenge_leaderboard\(target_challenge_id uuid\)/i,
  'local leaderboard migration should expose a viewer-aware local RPC'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /from public\.get_challenge_leaderboard\(target_challenge_id\) as global_leaderboard/i,
  'local leaderboard should derive progress and order from the canonical global RPC'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /global_leaderboard\.user_id\s*=\s*\(select auth\.uid\(\)\)[\s\S]*public\.is_mutual_follower\(\(select auth\.uid\(\)\), global_leaderboard\.user_id\)/i,
  'local leaderboard should include the signed-in joined user and joined mutual followers'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /row_number\(\) over \(\s*order by local_entries\.rank asc\s*\)::integer as rank/i,
  'local leaderboard should recalculate rank inside the filtered comparison group'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /create or replace function public\.get_official_challenges\(\)[\s\S]*public\.get_local_challenge_leaderboard\(challenges\.id\)/i,
  'compact challenge summaries should use local leaderboard defaults'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /create or replace function public\.get_challenge_detail\(target_challenge_slug text\)[\s\S]*'leaderboards'[\s\S]*'local'[\s\S]*'global'/i,
  'detail RPC should return both leaderboard scopes in one response'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /'current_user_progress', global_scope\.current_user_progress/i,
  'shared detail progress should remain independent of the selected local or global scope'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /'leaderboard', local_scope\.leaderboard/i,
  'detail RPC should keep a top-level local leaderboard alias for cached older clients'
);
assert.doesNotMatch(
  localChallengeLeaderboardsMigrationSql,
  /create or replace function public\.get_challenge_leaderboard\(/i,
  'local scopes must not replace the canonical global leaderboard RPC'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /notify pgrst,\s*'reload schema'/i,
  'local leaderboard migration should reload the PostgREST schema cache'
);

const adminChallengesMigrationSql = read(adminChallengesMigrationPath);
assert.match(
  adminChallengesMigrationSql,
  /create or replace function public\.finalize_generic_due_challenges[\s\S]*from public\.get_challenge_leaderboard\(challenge_row\.id\) as leaderboard/i,
  'generic finalization should continue using the canonical global leaderboard'
);
assert.doesNotMatch(
  adminChallengesMigrationSql,
  /get_local_challenge_leaderboard/i,
  'generic finalization must not use viewer-specific local ranks'
);
```

- [ ] **Step 2: Run the challenge script to verify it fails**

Run:

```powershell
npm run test:challenges
```

Expected: FAIL with `local challenge leaderboards migration should exist`.

- [ ] **Step 3: Create the local leaderboard migration**

Create `supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql`:

```sql
create or replace function public.get_local_challenge_leaderboard(target_challenge_id uuid)
returns table (
  rank integer,
  user_id uuid,
  username text,
  avatar_url text,
  progress_value double precision,
  completed boolean
)
language sql
stable
set search_path = public
as $$
  with local_entries as (
    select global_leaderboard.*
    from public.get_challenge_leaderboard(target_challenge_id) as global_leaderboard
    where global_leaderboard.user_id = (select auth.uid())
       or public.is_mutual_follower((select auth.uid()), global_leaderboard.user_id)
  )
  select
    row_number() over (
      order by local_entries.rank asc
    )::integer as rank,
    local_entries.user_id,
    local_entries.username,
    local_entries.avatar_url,
    local_entries.progress_value,
    local_entries.completed
  from local_entries
  order by local_entries.rank asc;
$$;

create or replace function public.get_official_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  metric_type text,
  challenge_type text,
  target_value numeric,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  join_closes_at timestamp with time zone,
  joined_at timestamp with time zone,
  entrants_count integer,
  current_user_rank integer,
  current_user_progress double precision
)
language sql
stable
set search_path = public
as $$
  with all_local_leaderboards as (
    select
      challenges.id as challenge_id,
      local_leaderboard.rank,
      local_leaderboard.user_id,
      local_leaderboard.progress_value
    from public.challenges
    cross join lateral public.get_local_challenge_leaderboard(challenges.id) as local_leaderboard
  ),
  local_challenge_rollups as (
    select
      challenges.id,
      count(all_local_leaderboards.user_id)::integer as entrants_count
    from public.challenges
    left join all_local_leaderboards
      on all_local_leaderboards.challenge_id = challenges.id
    group by challenges.id
  ),
  current_user_entries as (
    select
      challenge_entries.challenge_id,
      challenge_entries.joined_at
    from public.challenge_entries
    where challenge_entries.user_id = (select auth.uid())
  ),
  local_current_user_ranks as (
    select
      all_local_leaderboards.challenge_id,
      all_local_leaderboards.rank,
      all_local_leaderboards.progress_value
    from all_local_leaderboards
    where all_local_leaderboards.user_id = (select auth.uid())
  )
  select
    challenges.id,
    challenges.slug,
    challenges.title,
    challenges.description,
    challenges.metric_type,
    challenges.challenge_type,
    challenges.target_value,
    challenges.starts_at,
    challenges.ends_at,
    challenges.join_closes_at,
    current_user_entries.joined_at,
    coalesce(local_challenge_rollups.entrants_count, 0) as entrants_count,
    local_current_user_ranks.rank as current_user_rank,
    local_current_user_ranks.progress_value as current_user_progress
  from public.challenges
  left join local_challenge_rollups
    on local_challenge_rollups.id = challenges.id
  left join current_user_entries
    on current_user_entries.challenge_id = challenges.id
  left join local_current_user_ranks
    on local_current_user_ranks.challenge_id = challenges.id
  order by
    case
      when now() >= challenges.starts_at and now() < challenges.ends_at then 0
      when now() < challenges.starts_at then 1
      else 2
    end,
    challenges.starts_at desc;
$$;

create or replace function public.get_challenge_detail(target_challenge_slug text)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target_challenge as (
    select *
    from public.challenges
    where challenges.slug = target_challenge_slug
       or challenges.id::text = target_challenge_slug
    limit 1
  ),
  current_user_entry as (
    select challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge
      on target_challenge.id = challenge_entries.challenge_id
    where challenge_entries.user_id = (select auth.uid())
  ),
  global_leaderboard as (
    select global_rows.*
    from target_challenge
    cross join lateral public.get_challenge_leaderboard(target_challenge.id) as global_rows
  ),
  local_leaderboard as (
    select local_rows.*
    from target_challenge
    cross join lateral public.get_local_challenge_leaderboard(target_challenge.id) as local_rows
  ),
  local_scope as (
    select
      count(*)::integer as entrants_count,
      max(local_leaderboard.rank)
        filter (where local_leaderboard.user_id = (select auth.uid())) as current_user_rank,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', local_leaderboard.rank,
            'user_id', local_leaderboard.user_id,
            'username', local_leaderboard.username,
            'avatar_url', local_leaderboard.avatar_url,
            'progress_value', local_leaderboard.progress_value,
            'completed', local_leaderboard.completed
          )
          order by local_leaderboard.rank asc
        ) filter (where local_leaderboard.user_id is not null),
        '[]'::jsonb
      ) as leaderboard
    from local_leaderboard
  ),
  global_scope as (
    select
      count(*)::integer as entrants_count,
      max(global_leaderboard.rank)
        filter (where global_leaderboard.user_id = (select auth.uid())) as current_user_rank,
      max(global_leaderboard.progress_value)
        filter (where global_leaderboard.user_id = (select auth.uid())) as current_user_progress,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'rank', global_leaderboard.rank,
            'user_id', global_leaderboard.user_id,
            'username', global_leaderboard.username,
            'avatar_url', global_leaderboard.avatar_url,
            'progress_value', global_leaderboard.progress_value,
            'completed', global_leaderboard.completed
          )
          order by global_leaderboard.rank asc
        ) filter (where global_leaderboard.user_id is not null),
        '[]'::jsonb
      ) as leaderboard
    from global_leaderboard
  )
  select jsonb_build_object(
    'id', target_challenge.id,
    'slug', target_challenge.slug,
    'title', target_challenge.title,
    'description', target_challenge.description,
    'metric_type', target_challenge.metric_type,
    'challenge_type', target_challenge.challenge_type,
    'target_value', target_challenge.target_value,
    'starts_at', target_challenge.starts_at,
    'ends_at', target_challenge.ends_at,
    'join_closes_at', target_challenge.join_closes_at,
    'joined_at', (select joined_at from current_user_entry),
    'entrants_count', local_scope.entrants_count,
    'current_user_rank', local_scope.current_user_rank,
    'current_user_progress', global_scope.current_user_progress,
    'leaderboard', local_scope.leaderboard,
    'leaderboards', jsonb_build_object(
      'local', jsonb_build_object(
        'entrants_count', local_scope.entrants_count,
        'current_user_rank', local_scope.current_user_rank,
        'leaderboard', local_scope.leaderboard
      ),
      'global', jsonb_build_object(
        'entrants_count', global_scope.entrants_count,
        'current_user_rank', global_scope.current_user_rank,
        'leaderboard', global_scope.leaderboard
      )
    )
  )
  from target_challenge
  cross join local_scope
  cross join global_scope;
$$;

revoke execute on function public.get_local_challenge_leaderboard(uuid) from public, anon;
grant execute on function public.get_local_challenge_leaderboard(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;
grant execute on function public.get_challenge_detail(text) to authenticated;

comment on function public.get_local_challenge_leaderboard(uuid)
  is 'Returns joined challenge users limited to the signed-in user and mutual followers, reranked inside that local comparison group.';

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the SQL contract checks**

Run:

```powershell
npm run test:challenges
```

Expected: PASS with `official challenge checks passed`.

- [ ] **Step 5: Commit the database scope**

```powershell
git add scripts/challenges.test.js supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql
git commit -m "feat: add local challenge leaderboard RPC"
```

## Task 2: Map Both Leaderboard Scopes In TypeScript

**Files:**
- Modify: `scripts/challenges.test.js`
- Modify: `src/lib/challenges.ts`

- [ ] **Step 1: Replace the mapper fixture with failing scoped assertions**

In `scripts/challenges.test.js`, replace the existing `const detail = mapChallengeDetailRow(...)` fixture and its four assertions with:

```js
const detail = mapChallengeDetailRow({
  ...summaryRow,
  entrants_count: '2',
  current_user_rank: '2',
  leaderboards: {
    local: {
      entrants_count: '2',
      current_user_rank: '2',
      leaderboard: [
        {
          rank: '1',
          user_id: 'user-2',
          username: 'Mads',
          avatar_url: null,
          progress_value: '15.4',
          completed: true,
        },
        {
          rank: '2',
          user_id: 'user-1',
          username: null,
          avatar_url: 'https://example.com/avatar.png',
          progress_value: '8',
          completed: false,
        },
      ],
    },
    global: {
      entrants_count: '4',
      current_user_rank: '3',
      leaderboard: [
        {
          rank: '1',
          user_id: 'user-3',
          username: 'Line',
          avatar_url: null,
          progress_value: '18',
          completed: true,
        },
        {
          rank: '2',
          user_id: 'user-2',
          username: 'Mads',
          avatar_url: null,
          progress_value: '15.4',
          completed: true,
        },
        {
          rank: '3',
          user_id: 'user-1',
          username: null,
          avatar_url: 'https://example.com/avatar.png',
          progress_value: '8',
          completed: false,
        },
        {
          rank: '4',
          user_id: 'user-4',
          username: 'Sofie',
          avatar_url: null,
          progress_value: '4',
          completed: false,
        },
      ],
    },
  },
});

assert.equal(detail.entrantsCount, 2);
assert.equal(detail.currentUserRank, 2);
assert.equal(detail.leaderboards.local.entrantsCount, 2);
assert.equal(detail.leaderboards.local.currentUserRank, 2);
assert.equal(detail.leaderboards.local.entries.length, 2);
assert.equal(detail.leaderboards.local.entries[0].rank, 1);
assert.equal(detail.leaderboards.local.entries[1].username, null);
assert.equal(detail.leaderboards.global.entrantsCount, 4);
assert.equal(detail.leaderboards.global.currentUserRank, 3);
assert.equal(detail.leaderboards.global.entries.length, 4);
assert.equal(detail.leaderboards.global.entries[2].userId, 'user-1');
```

- [ ] **Step 2: Run the mapper checks to verify they fail**

Run:

```powershell
npm run test:challenges
```

Expected: FAIL because `detail.leaderboards` is undefined.

- [ ] **Step 3: Add scoped leaderboard types and mapping**

In `src/lib/challenges.ts`, add the scope constants after `CHALLENGE_TYPE`:

```ts
export const CHALLENGE_LEADERBOARD_SCOPE = {
  LOCAL: 'local',
  GLOBAL: 'global',
} as const;
```

Add the scope type after `ChallengeType`:

```ts
export type ChallengeLeaderboardScope = typeof CHALLENGE_LEADERBOARD_SCOPE[keyof typeof CHALLENGE_LEADERBOARD_SCOPE];
```

Replace the existing `ChallengeDetailRow` type with:

```ts
export type ChallengeLeaderboardScopeRow = {
  entrants_count?: number | string | null;
  current_user_rank?: number | string | null;
  leaderboard?: ChallengeLeaderboardRow[] | null;
};

export type ChallengeDetailRow = ChallengeSummaryRow & {
  leaderboards?: {
    local?: ChallengeLeaderboardScopeRow | null;
    global?: ChallengeLeaderboardScopeRow | null;
  } | null;
};
```

Replace the existing `ChallengeDetail` type with:

```ts
export type ChallengeLeaderboard = {
  entrantsCount: number;
  currentUserRank: number | null;
  entries: ChallengeLeaderboardEntry[];
};

export type ChallengeDetail = ChallengeSummary & {
  leaderboards: Record<ChallengeLeaderboardScope, ChallengeLeaderboard>;
};
```

Keep `mapChallengeLeaderboardRow` unchanged. Replace `mapChallengeDetailRow` with:

```ts
const mapChallengeLeaderboardScopeRow = (
  row: ChallengeLeaderboardScopeRow | null | undefined
): ChallengeLeaderboard => ({
  entrantsCount: toInteger(row?.entrants_count),
  currentUserRank: toIntegerOrNull(row?.current_user_rank),
  entries: (row?.leaderboard || []).map(mapChallengeLeaderboardRow),
});

export const mapChallengeDetailRow = (row: ChallengeDetailRow): ChallengeDetail => ({
  ...mapChallengeSummaryRow(row),
  leaderboards: {
    [CHALLENGE_LEADERBOARD_SCOPE.LOCAL]: mapChallengeLeaderboardScopeRow(row.leaderboards?.local),
    [CHALLENGE_LEADERBOARD_SCOPE.GLOBAL]: mapChallengeLeaderboardScopeRow(row.leaderboards?.global),
  },
});
```

- [ ] **Step 4: Run the mapper checks**

Run:

```powershell
npm run test:challenges
```

Expected: PASS with `official challenge checks passed`.

- [ ] **Step 5: Commit the scoped mapper**

```powershell
git add scripts/challenges.test.js src/lib/challenges.ts
git commit -m "feat: map scoped challenge leaderboards"
```

## Task 3: Add The Local And Global Detail Toggle

**Files:**
- Modify: `scripts/challenges.test.js`
- Modify: `src/screens/ChallengeDetailScreen.tsx`

- [ ] **Step 1: Add failing detail-screen source checks**

In `scripts/challenges.test.js`, append these assertions beside the existing `detailScreenSource` checks:

```js
assert.match(
  detailScreenSource,
  /useState<ChallengeLeaderboardScope>\(CHALLENGE_LEADERBOARD_SCOPE\.LOCAL\)/,
  'detail leaderboard scope should default to local'
);
assert.match(
  detailScreenSource,
  /challenge\?\.leaderboards\[leaderboardScope\]/,
  'detail screen should render the selected scoped leaderboard'
);
assert.match(
  detailScreenSource,
  /Local[\s\S]*Global/,
  'detail screen should expose Local and Global leaderboard controls'
);
assert.match(
  detailScreenSource,
  /setLeaderboardScope\(scope\.key\)/,
  'detail scope controls should switch the selected leaderboard'
);
assert.match(
  detailScreenSource,
  /formatChallengeRank\(activeLeaderboard\?\.currentUserRank\)/,
  'detail rank summary should follow the selected leaderboard'
);
assert.match(
  detailScreenSource,
  /\{activeLeaderboard\?\.entrantsCount \?\? 0\}/,
  'detail entrant summary should follow the selected leaderboard'
);
assert.match(
  detailScreenSource,
  /No local entrants yet[\s\S]*Mutual followers who join this challenge will appear here\./,
  'detail local scope should explain an empty mutual-follower leaderboard'
);
```

- [ ] **Step 2: Run the detail-screen checks to verify they fail**

Run:

```powershell
npm run test:challenges
```

Expected: FAIL with `detail leaderboard scope should default to local`.

- [ ] **Step 3: Add scope state and derive the active leaderboard**

In `src/screens/ChallengeDetailScreen.tsx`, add `useEffect` to the React import:

```ts
import React, { useCallback, useEffect, useRef, useState } from 'react';
```

Add the new challenge imports:

```ts
  CHALLENGE_LEADERBOARD_SCOPE,
  ChallengeLeaderboardScope,
```

After `CHALLENGE_AUTO_REFRESH_INTERVAL_MS`, add:

```ts
const CHALLENGE_LEADERBOARD_SCOPES: { key: ChallengeLeaderboardScope; label: string }[] = [
  { key: CHALLENGE_LEADERBOARD_SCOPE.LOCAL, label: 'Local' },
  { key: CHALLENGE_LEADERBOARD_SCOPE.GLOBAL, label: 'Global' },
];
```

After the `challenge` state, add:

```ts
  const [leaderboardScope, setLeaderboardScope] = useState<ChallengeLeaderboardScope>(CHALLENGE_LEADERBOARD_SCOPE.LOCAL);
```

After the request refs, add:

```ts
  const activeLeaderboard = challenge?.leaderboards[leaderboardScope] || null;

  useEffect(() => {
    setLeaderboardScope(CHALLENGE_LEADERBOARD_SCOPE.LOCAL);
  }, [challengeSlug]);
```

This resets a newly opened challenge to local while leaving scope untouched during polling and manual refresh.

- [ ] **Step 4: Switch header summaries and add the segmented control**

Inside `renderHeader`, replace all three summary uses of `challenge.currentUserRank` or `challenge.entrantsCount` with:

```tsx
{formatChallengeRank(activeLeaderboard?.currentUserRank)}
```

and:

```tsx
{activeLeaderboard?.entrantsCount ?? 0}
```

Immediately before the existing `leaderboardHeading`, add:

```tsx
          <View style={styles.leaderboardScopeControl}>
            {CHALLENGE_LEADERBOARD_SCOPES.map((scope) => {
              const selected = leaderboardScope === scope.key;
              return (
                <Pressable
                  key={scope.key}
                  style={[styles.leaderboardScopeButton, selected ? styles.leaderboardScopeButtonActive : null]}
                  onPress={() => setLeaderboardScope(scope.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${scope.label.toLowerCase()} leaderboard`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.leaderboardScopeText, selected ? styles.leaderboardScopeTextActive : null]}>
                    {scope.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
```

Add `activeLeaderboard` and `leaderboardScope` to the `renderHeader` dependency array.

- [ ] **Step 5: Switch the list and empty state together**

Before the loading early return, add:

```ts
  const emptyTitle = errorMessage
    ? 'Could not load leaderboard'
    : leaderboardScope === CHALLENGE_LEADERBOARD_SCOPE.LOCAL
      ? 'No local entrants yet'
      : 'No entrants yet';
  const emptyText = errorMessage
    || (
      leaderboardScope === CHALLENGE_LEADERBOARD_SCOPE.LOCAL
        ? 'Mutual followers who join this challenge will appear here.'
        : 'Joined users will appear here.'
    );
```

In `FlatList`, replace the old leaderboard references:

```tsx
        data={activeLeaderboard?.entries || []}
```

```tsx
        contentContainerStyle={[styles.content, !activeLeaderboard?.entries.length ? styles.emptyContent : null]}
```

Replace `ListEmptyComponent` with:

```tsx
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        }
```

- [ ] **Step 6: Add compact scope-control styles**

In `StyleSheet.create`, add:

```ts
  leaderboardScopeControl: {
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 3,
    flexDirection: 'row',
  },
  leaderboardScopeButton: {
    flex: 1,
    minHeight: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardScopeButtonActive: {
    backgroundColor: colors.primarySoft,
  },
  leaderboardScopeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  leaderboardScopeTextActive: {
    color: colors.primary,
  },
```

- [ ] **Step 7: Run challenge and theme checks**

Run:

```powershell
npm run test:challenges
npm run test:app-theme-screens
```

Expected: both commands PASS.

- [ ] **Step 8: Commit the detail toggle**

```powershell
git add scripts/challenges.test.js src/screens/ChallengeDetailScreen.tsx
git commit -m "feat: add challenge leaderboard scope toggle"
```

## Task 4: Verify The Complete Feature

**Files:**
- Verify only.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
npm run test:challenges
npm run test:admin-tools
npm run test:official-posts
npm run test:app-theme-screens
npm run test:feed-redesign
```

Expected: all commands PASS.

- [ ] **Step 2: Run the web build**

Run:

```powershell
npm run build:web
```

Expected: Expo web export succeeds.

- [ ] **Step 3: Inspect the working tree**

Run:

```powershell
git status --short
```

Expected: no uncommitted implementation files.

- [ ] **Step 4: Report the migration deployment note**

Do not push the migration automatically. Report that:

```text
supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql
```

must be applied to the linked Supabase project before deployed clients can use local challenge summaries or switch leaderboard scopes.

## Spec Coverage Checklist

- Local means joined mutual followers plus the signed-in user after joining: Task 1 local RPC.
- Pre-join local view still shows joined mutual followers: Task 1 local RPC membership rule.
- Local rank is freshly calculated inside the filtered subset: Task 1 `row_number()`.
- Global competition ranking remains canonical: Task 1 leaves `get_challenge_leaderboard` unchanged and asserts generic finalization still uses it.
- Both scopes arrive in one detail request: Task 1 nested detail JSON.
- Cached older clients keep rendering local detail rows during rollout: Task 1 top-level local leaderboard alias.
- Compact Pub Legends and Feed summaries default to local: Task 1 replaces `get_official_challenges`; their existing consumers stay unchanged.
- Challenge detail defaults to Local and switches rows, rank, entrant count, and empty state together: Task 3.
- Refresh remains one detail request and retains the selected scope: Task 3 keeps the existing polling call and stores scope separately from fetched data.
- Verification and migration rollout note: Task 4.
