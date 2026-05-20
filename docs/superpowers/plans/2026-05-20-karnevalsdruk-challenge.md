# KarnevalsDruk Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add KarnevalsDruk as a one-day winner-takes-most true-pints challenge, then automatically award the winner and publish an official Beerva feed announcement with stats.

**Architecture:** Extend the existing official challenges system with a `challenge_type` so target challenges and leaderboard challenges share one API while rendering differently. Add database-owned finalization for ended leaderboard challenges, storing persistent challenge awards and official feed posts. Keep UI changes focused: challenge display helpers, an official feed card, and profile trophy-cabinet award merging.

**Tech Stack:** Expo React Native, React Navigation, Supabase SQL/RPC/RLS, Supabase Edge Functions, Node source-level tests, TypeScript helper mappers.

---

## File Structure

- Modify `scripts/challenges.test.js`
  - Guard challenge type mapping, KarnevalsDruk seed data, finalization SQL, official feed post support, and scheduled Edge Function source.
- Modify `scripts/profileStats.test.js`
  - Guard challenge award trophy rendering and profile award fetching.
- Modify `src/lib/challenges.ts`
  - Own challenge type parsing, leaderboard formatting, and challenge-specific copy helpers.
- Modify `src/lib/challengesApi.ts`
  - Continue mapping RPC rows; no direct finalization client API is needed.
- Modify `src/screens/PubLegendsScreen.tsx`
  - Render leaderboard challenge summaries without target/completion language.
- Modify `src/screens/ChallengeDetailScreen.tsx`
  - Render leaderboard detail summaries and rows without target/completion language.
- Modify `src/screens/FeedScreen.tsx`
  - Fetch and merge official posts into the existing feed item stream.
- Create `src/lib/officialFeedPosts.ts`
  - Map database rows into app-friendly official post objects.
- Create `src/lib/officialFeedPostsApi.ts`
  - Fetch official posts for feed pagination.
- Create `src/components/OfficialFeedPostCard.tsx`
  - Render official Beerva challenge winner announcements.
- Create `src/lib/challengeAwards.ts`
  - Map challenge award rows into earned trophy definitions.
- Create `src/lib/challengeAwardsApi.ts`
  - Fetch a user's challenge awards.
- Modify `src/lib/profileStats.ts`
  - Add `challenge` to `TrophyKind`.
- Modify `src/components/ProfileStatsPanel.tsx`
  - Accept challenge awards and merge them into the trophy cabinet.
- Modify `src/screens/ProfileScreen.tsx`
  - Fetch current user's challenge awards and pass them into `ProfileStatsPanel`.
- Modify `src/screens/UserProfileScreen.tsx`
  - Fetch viewed user's challenge awards and pass them into `ProfileStatsPanel`.
- Create `supabase/migrations/20260520120000_add_karnevalsdruk_challenge.sql`
  - Add challenge type, seed KarnevalsDruk, add awards/posts tables, update RPCs, and add finalization RPC/schedule.
- Create `supabase/functions/finalize-challenges/index.ts`
  - Scheduled function that calls `finalize_due_challenges`.

---

### Task 1: Challenge Type And Formatting Tests

**Files:**
- Modify: `scripts/challenges.test.js`
- Test command: `npm run test:challenges`

- [ ] **Step 1: Write the failing test**

Add the new exports to the destructuring near the top of `scripts/challenges.test.js`:

```js
const {
  CHALLENGE_STATUS,
  CHALLENGE_TYPE,
  formatChallengeProgress,
  formatChallengeRank,
  formatChallengeStatusLabel,
  getChallengePreJoinCopy,
  getChallengeStatus,
  getLeaderboardEntryMeta,
  isLeaderboardChallenge,
  mapChallengeDetailRow,
  mapChallengeSummaryRow,
} = loadTypeScriptModule(challengesHelperPath);
```

Add these assertions after the existing `formatChallengeStatusLabel` assertions:

```js
assert.equal(CHALLENGE_TYPE.TARGET, 'target');
assert.equal(CHALLENGE_TYPE.LEADERBOARD, 'leaderboard');
assert.equal(formatChallengeProgress(8.44, null, 'leaderboard'), '8.4 true pints');
assert.equal(
  getChallengePreJoinCopy({ challengeType: 'leaderboard', slug: 'karnevalsdruk-2026' }),
  'Join to count your Karneval drinks from the full 06:00 to 06:00 window.'
);
assert.equal(
  getLeaderboardEntryMeta({ completed: true, progressValue: 8.44 }, { challengeType: 'leaderboard' }),
  '8.4 true pints'
);
assert.equal(
  getLeaderboardEntryMeta({ completed: true, progressValue: 15.1 }, { challengeType: 'target' }),
  'Completed'
);
assert.equal(isLeaderboardChallenge({ challengeType: 'leaderboard' }), true);
assert.equal(isLeaderboardChallenge({ challengeType: 'target' }), false);
```

Add `challenge_type: 'target'` to the existing `summaryRow` object. Then add this leaderboard row mapping test after `const summary = mapChallengeSummaryRow(summaryRow);`:

```js
const leaderboardSummary = mapChallengeSummaryRow({
  ...summaryRow,
  slug: 'karnevalsdruk-2026',
  title: 'KarnevalsDruk',
  description: 'Log drinks from 06:00 May 23 to 06:00 May 24. Highest true-pint total wins among joined drinkers.',
  challenge_type: 'leaderboard',
  target_value: null,
  starts_at: '2026-05-23T04:00:00Z',
  ends_at: '2026-05-24T04:00:00Z',
  join_closes_at: '2026-05-24T04:00:00Z',
  current_user_progress: '8.44',
});

assert.equal(leaderboardSummary.challengeType, 'leaderboard');
assert.equal(leaderboardSummary.targetValue, null);
assert.equal(formatChallengeProgress(leaderboardSummary.currentUserProgress, leaderboardSummary.targetValue, leaderboardSummary.challengeType), '8.4 true pints');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:challenges
```

Expected: FAIL because `CHALLENGE_TYPE`, `getChallengePreJoinCopy`, `getLeaderboardEntryMeta`, `isLeaderboardChallenge`, and `challengeType` mapping do not exist.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/challenges.test.js
git commit -m "test: guard leaderboard challenge formatting"
```

---

### Task 2: Challenge Type Helpers And Existing Challenge UI

**Files:**
- Modify: `src/lib/challenges.ts`
- Modify: `src/screens/PubLegendsScreen.tsx`
- Modify: `src/screens/ChallengeDetailScreen.tsx`
- Modify: `src/screens/FeedScreen.tsx`
- Test command: `npm run test:challenges`

- [ ] **Step 1: Implement challenge type helpers**

In `src/lib/challenges.ts`, add the challenge type constants after `CHALLENGE_STATUS`:

```ts
export const CHALLENGE_TYPE = {
  TARGET: 'target',
  LEADERBOARD: 'leaderboard',
} as const;

export type ChallengeType = typeof CHALLENGE_TYPE[keyof typeof CHALLENGE_TYPE];
```

Update row and app types:

```ts
export type ChallengeSummaryRow = {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  metric_type?: ChallengeMetricType | string | null;
  challenge_type?: ChallengeType | string | null;
  target_value?: number | string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  join_closes_at?: string | null;
  joined_at?: string | null;
  entrants_count?: number | string | null;
  current_user_rank?: number | string | null;
  current_user_progress?: number | string | null;
};
```

```ts
export type ChallengeSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  metricType: ChallengeMetricType;
  challengeType: ChallengeType;
  targetValue: number | null;
  startsAt: string;
  endsAt: string;
  joinClosesAt: string;
  joinedAt: string | null;
  joined: boolean;
  entrantsCount: number;
  currentUserRank: number | null;
  currentUserProgress: number;
  status: ChallengeStatus;
  joinOpen: boolean;
  raw: ChallengeSummaryRow;
};
```

Add parsing and formatting helpers:

```ts
const toTargetValue = (value: number | string | null | undefined, challengeType: ChallengeType) => {
  if (challengeType === CHALLENGE_TYPE.LEADERBOARD) return null;
  return toNumber(value);
};

const toChallengeType = (value: string | null | undefined): ChallengeType => (
  value === CHALLENGE_TYPE.LEADERBOARD ? CHALLENGE_TYPE.LEADERBOARD : CHALLENGE_TYPE.TARGET
);

export const isLeaderboardChallenge = (challenge: { challengeType?: ChallengeType | string | null }) => (
  challenge.challengeType === CHALLENGE_TYPE.LEADERBOARD
);
```

Replace `formatChallengeProgress` with the backward-compatible overload:

```ts
export const formatChallengeProgress = (
  progress: number | string | null | undefined,
  target: number | string | null | undefined,
  challengeType: ChallengeType = CHALLENGE_TYPE.TARGET
) => {
  const progressValue = toNumber(progress).toFixed(1);
  if (challengeType === CHALLENGE_TYPE.LEADERBOARD) {
    return `${progressValue} true pints`;
  }

  const targetValue = toNumber(target).toFixed(0);
  return `${progressValue}/${targetValue}`;
};
```

Add row-copy helpers:

```ts
export const getChallengePreJoinCopy = (challenge: Pick<ChallengeSummary, 'challengeType' | 'slug'> | { challengeType?: ChallengeType | string | null; slug?: string | null }) => (
  isLeaderboardChallenge(challenge)
    ? 'Join to count your Karneval drinks from the full 06:00 to 06:00 window.'
    : 'Join to see your retroactive progress from May 1.'
);

export const getLeaderboardEntryMeta = (
  entry: Pick<ChallengeLeaderboardEntry, 'completed' | 'progressValue'> | { completed?: boolean | null; progressValue?: number | string | null },
  challenge: Pick<ChallengeSummary, 'challengeType'> | { challengeType?: ChallengeType | string | null }
) => {
  if (isLeaderboardChallenge(challenge)) {
    return formatChallengeProgress(entry.progressValue, null, CHALLENGE_TYPE.LEADERBOARD);
  }

  return entry.completed ? 'Completed' : 'In progress';
};
```

Update `mapChallengeSummaryRow` so it maps `challengeType` before `targetValue`:

```ts
export const mapChallengeSummaryRow = (row: ChallengeSummaryRow): ChallengeSummary => {
  const challengeType = toChallengeType(row.challenge_type);
  const mapped = {
    id: toStringOrNull(row.id) || 'unknown',
    slug: toStringOrNull(row.slug) || 'unknown',
    title: toStringOrNull(row.title) || 'Challenge',
    description: toStringOrNull(row.description) || '',
    metricType: toMetricType(row.metric_type),
    challengeType,
    targetValue: toTargetValue(row.target_value, challengeType),
    startsAt: toStringOrNull(row.starts_at) || '',
    endsAt: toStringOrNull(row.ends_at) || '',
    joinClosesAt: toStringOrNull(row.join_closes_at) || '',
    joinedAt: toStringOrNull(row.joined_at),
    joined: Boolean(toStringOrNull(row.joined_at)),
    entrantsCount: toInteger(row.entrants_count),
    currentUserRank: toIntegerOrNull(row.current_user_rank),
    currentUserProgress: toNumber(row.current_user_progress),
    raw: row,
  };

  return {
    ...mapped,
    status: getChallengeStatus(mapped),
    joinOpen: isChallengeJoinOpen(mapped),
  };
};
```

- [ ] **Step 2: Update Pub Legends challenge rows**

In `src/screens/PubLegendsScreen.tsx`, update imports:

```ts
import {
  ChallengeSummary,
  formatChallengeProgress,
  formatChallengeRank,
  formatChallengeStatusLabel,
  isLeaderboardChallenge,
} from '../lib/challenges';
```

Replace `progressLabel` calculation in `renderChallenge`:

```ts
const progressLabel = item.joined
  ? (
      isLeaderboardChallenge(item)
        ? ` - ${formatChallengeRank(item.currentUserRank)} - ${formatChallengeProgress(item.currentUserProgress, item.targetValue, item.challengeType)}`
        : ` - ${formatChallengeRank(item.currentUserRank)} - ${formatChallengeProgress(item.currentUserProgress, item.targetValue, item.challengeType)}`
    )
  : '';
```

This keeps the same compact row shape while allowing leaderboard challenges to render `8.4 true pints`.

- [ ] **Step 3: Update Challenge Detail display**

In `src/screens/ChallengeDetailScreen.tsx`, update imports:

```ts
import {
  ChallengeDetail,
  ChallengeLeaderboardEntry,
  formatChallengeProgress,
  formatChallengeRank,
  getChallengePreJoinCopy,
  getLeaderboardEntryMeta,
} from '../lib/challenges';
```

In `renderLeader`, replace the meta and progress display:

```tsx
<Text style={styles.leaderMeta}>{getLeaderboardEntryMeta(item, challenge || { challengeType: 'target' })}</Text>
```

```tsx
<Text style={styles.progressText}>
  {formatChallengeProgress(item.progressValue, challenge?.targetValue, challenge?.challengeType)}
</Text>
```

In the joined summary, replace:

```tsx
<Text style={styles.summaryLabel}>Your progress</Text>
<Text style={styles.summaryValue}>{formatChallengeProgress(challenge.currentUserProgress, challenge.targetValue)}</Text>
```

with:

```tsx
<Text style={styles.summaryLabel}>{challenge.challengeType === 'leaderboard' ? 'Your total' : 'Your progress'}</Text>
<Text style={styles.summaryValue}>
  {formatChallengeProgress(challenge.currentUserProgress, challenge.targetValue, challenge.challengeType)}
</Text>
```

In the pre-join block, replace the hard-coded copy with:

```tsx
<Text style={styles.preJoinText}>{getChallengePreJoinCopy(challenge)}</Text>
```

- [ ] **Step 4: Update Feed challenge preview strip**

In `src/screens/FeedScreen.tsx`, replace the preview text expression:

```tsx
{activeChallengeSummary.title} - {formatChallengeRank(activeChallengeSummary.currentUserRank)} - {formatChallengeProgress(activeChallengeSummary.currentUserProgress, activeChallengeSummary.targetValue)}
```

with:

```tsx
{activeChallengeSummary.title} - {formatChallengeRank(activeChallengeSummary.currentUserRank)} - {formatChallengeProgress(activeChallengeSummary.currentUserProgress, activeChallengeSummary.targetValue, activeChallengeSummary.challengeType)}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:challenges
```

Expected: PASS with `official challenge checks passed`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/challenges.ts src/screens/PubLegendsScreen.tsx src/screens/ChallengeDetailScreen.tsx src/screens/FeedScreen.tsx
git commit -m "feat: support leaderboard challenge display"
```

---

### Task 3: Database Finalization Tests

**Files:**
- Modify: `scripts/challenges.test.js`
- Test command: `npm run test:challenges`

- [ ] **Step 1: Write the failing migration and Edge Function guards**

Add paths near the existing migration path constants:

```js
const karnevalsdrukMigrationPath = 'supabase/migrations/20260520120000_add_karnevalsdruk_challenge.sql';
const challengeFinalizerPath = 'supabase/functions/finalize-challenges/index.ts';
```

Add existence checks near the existing migration check:

```js
assert.ok(exists(karnevalsdrukMigrationPath), 'KarnevalsDruk migration should exist');
assert.ok(exists(challengeFinalizerPath), 'challenge finalizer Edge Function should exist');
```

Add this source block after the existing migration assertions:

```js
const karnevalsdrukMigrationSql = read(karnevalsdrukMigrationPath);
assert.match(karnevalsdrukMigrationSql, /add column if not exists challenge_type text not null default 'target'/i, 'challenges should support challenge_type');
assert.match(karnevalsdrukMigrationSql, /alter column target_value drop not null/i, 'leaderboard challenges should allow null target values');
assert.match(karnevalsdrukMigrationSql, /challenge_type in \('target', 'leaderboard'\)/i, 'challenge_type should be constrained');
assert.match(karnevalsdrukMigrationSql, /karnevalsdruk-2026/, 'migration should seed KarnevalsDruk slug');
assert.match(karnevalsdrukMigrationSql, /KarnevalsDruk/, 'migration should seed KarnevalsDruk title');
assert.match(karnevalsdrukMigrationSql, /2026-05-23 04:00:00\+00/, 'migration should store May 23 06:00 Copenhagen start in UTC');
assert.match(karnevalsdrukMigrationSql, /2026-05-24 04:00:00\+00/, 'migration should store May 24 06:00 Copenhagen end in UTC');
assert.match(karnevalsdrukMigrationSql, /create table if not exists public\.challenge_awards/i, 'migration should create challenge awards table');
assert.match(karnevalsdrukMigrationSql, /Winner of Karneval 2026/, 'migration should award the requested trophy title');
assert.match(karnevalsdrukMigrationSql, /create table if not exists public\.official_feed_posts/i, 'migration should create official feed posts table');
assert.match(karnevalsdrukMigrationSql, /average_abv/, 'winner announcement metadata should include average ABV');
assert.match(karnevalsdrukMigrationSql, /drink_count/, 'winner announcement metadata should include drink count');
assert.match(karnevalsdrukMigrationSql, /session_count/, 'winner announcement metadata should include session count');
assert.match(karnevalsdrukMigrationSql, /progress_value <= 0/i, 'finalizer should not award a zero-progress winner');
assert.match(karnevalsdrukMigrationSql, /on conflict \(challenge_id, user_id, award_slug\)/i, 'award insertion should be idempotent');
assert.match(karnevalsdrukMigrationSql, /on conflict \(challenge_id, kind\)/i, 'official post insertion should be idempotent');
assert.match(karnevalsdrukMigrationSql, /create or replace function public\.finalize_due_challenges/i, 'migration should expose finalization RPC');
assert.match(karnevalsdrukMigrationSql, /cron\.schedule/i, 'migration should schedule challenge finalization');

const finalizerSource = read(challengeFinalizerPath);
assert.match(finalizerSource, /finalize_due_challenges/, 'scheduled function should call finalization RPC');
assert.match(finalizerSource, /CHALLENGE_FINALIZER_CRON_SECRET/, 'scheduled function should require a challenge cron secret');
assert.match(finalizerSource, /x-beerva-cron-secret/i, 'scheduled function should validate the cron secret header');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:challenges
```

Expected: FAIL because the KarnevalsDruk migration and finalizer function do not exist.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/challenges.test.js
git commit -m "test: guard KarnevalsDruk finalization"
```

---

### Task 4: Database Migration And Scheduled Finalizer

**Files:**
- Create: `supabase/migrations/20260520120000_add_karnevalsdruk_challenge.sql`
- Create: `supabase/functions/finalize-challenges/index.ts`
- Test command: `npm run test:challenges`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260520120000_add_karnevalsdruk_challenge.sql` with these sections in this order.

Schema and seed:

```sql
create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

alter table public.challenges
  add column if not exists challenge_type text not null default 'target',
  add column if not exists finalized_at timestamp with time zone,
  add column if not exists winner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists winner_progress_value double precision;

alter table public.challenges
  alter column target_value drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_type_check'
      and conrelid = 'public.challenges'::regclass
  ) then
    alter table public.challenges
      add constraint challenges_type_check
      check (challenge_type in ('target', 'leaderboard'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'challenges_target_by_type_check'
      and conrelid = 'public.challenges'::regclass
  ) then
    alter table public.challenges
      add constraint challenges_target_by_type_check
      check (
        (challenge_type = 'target' and target_value > 0)
        or (challenge_type = 'leaderboard' and target_value is null)
      );
  end if;
end;
$$;

update public.challenges
set challenge_type = 'target'
where challenge_type is null;

insert into public.challenges (
  slug,
  title,
  description,
  metric_type,
  challenge_type,
  target_value,
  starts_at,
  ends_at,
  join_closes_at
) values (
  'karnevalsdruk-2026',
  'KarnevalsDruk',
  'Log drinks from 06:00 May 23 to 06:00 May 24. Highest true-pint total wins among joined drinkers.',
  'true_pints',
  'leaderboard',
  null,
  timestamp with time zone '2026-05-23 04:00:00+00',
  timestamp with time zone '2026-05-24 04:00:00+00',
  timestamp with time zone '2026-05-24 04:00:00+00'
) on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_type = excluded.metric_type,
  challenge_type = excluded.challenge_type,
  target_value = excluded.target_value,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  join_closes_at = excluded.join_closes_at;
```

Awards and official posts:

```sql
create table if not exists public.challenge_awards (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  award_slug text not null,
  title text not null,
  description text not null,
  rank integer not null,
  progress_value double precision not null,
  metadata jsonb not null default '{}'::jsonb,
  awarded_at timestamp with time zone not null default now(),
  unique (challenge_id, user_id, award_slug)
);

create index if not exists challenge_awards_user_awarded_at_idx
  on public.challenge_awards(user_id, awarded_at desc);

alter table public.challenge_awards enable row level security;

drop policy if exists "Signed-in users can view challenge awards" on public.challenge_awards;
create policy "Signed-in users can view challenge awards"
  on public.challenge_awards
  for select
  to authenticated
  using (true);

create table if not exists public.official_feed_posts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references public.challenges(id) on delete set null,
  kind text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  unique (challenge_id, kind)
);

create index if not exists official_feed_posts_published_at_idx
  on public.official_feed_posts(published_at desc);

alter table public.official_feed_posts enable row level security;

drop policy if exists "Signed-in users can view official feed posts" on public.official_feed_posts;
create policy "Signed-in users can view official feed posts"
  on public.official_feed_posts
  for select
  to authenticated
  using (true);
```

Drop and recreate changed-return RPCs:

```sql
drop function if exists public.get_official_challenges();
drop function if exists public.get_challenge_detail(text);

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
  with challenge_rollups as (
    select
      challenges.id,
      count(challenge_entries.user_id)::integer as entrants_count
    from public.challenges
    left join public.challenge_entries on challenge_entries.challenge_id = challenges.id
    group by challenges.id
  ),
  current_user_entries as (
    select challenge_entries.challenge_id, challenge_entries.joined_at
    from public.challenge_entries
    where challenge_entries.user_id = auth.uid()
  ),
  all_current_user_ranks as (
    select
      challenges.id as challenge_id,
      leaderboard.rank,
      leaderboard.progress_value
    from public.challenges
    cross join lateral public.get_challenge_leaderboard(challenges.id) leaderboard
    where leaderboard.user_id = auth.uid()
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
    coalesce(challenge_rollups.entrants_count, 0) as entrants_count,
    all_current_user_ranks.rank as current_user_rank,
    all_current_user_ranks.progress_value as current_user_progress
  from public.challenges
  left join challenge_rollups on challenge_rollups.id = challenges.id
  left join current_user_entries on current_user_entries.challenge_id = challenges.id
  left join all_current_user_ranks on all_current_user_ranks.challenge_id = challenges.id
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
  challenge_entry_counts as (
    select count(challenge_entries.user_id)::integer as entrants_count
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
  ),
  current_user_entry as (
    select challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
    where challenge_entries.user_id = auth.uid()
  ),
  leaderboard as (
    select *
    from target_challenge
    cross join lateral public.get_challenge_leaderboard(target_challenge.id)
  ),
  current_user_rank as (
    select leaderboard.rank, leaderboard.progress_value
    from leaderboard
    where leaderboard.user_id = auth.uid()
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
    'entrants_count', coalesce((select entrants_count from challenge_entry_counts), 0),
    'current_user_rank', (select rank from current_user_rank),
    'current_user_progress', (select progress_value from current_user_rank),
    'leaderboard', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'rank', leaderboard.rank,
            'user_id', leaderboard.user_id,
            'username', leaderboard.username,
            'avatar_url', leaderboard.avatar_url,
            'progress_value', leaderboard.progress_value,
            'completed', leaderboard.completed
          )
          order by leaderboard.rank asc
        )
        from leaderboard
      ),
      '[]'::jsonb
    )
  )
  from target_challenge;
$$;
```

Create award fetch RPC:

```sql
create or replace function public.get_challenge_awards(target_user_id uuid default null)
returns table (
  id uuid,
  challenge_id uuid,
  user_id uuid,
  award_slug text,
  title text,
  description text,
  rank integer,
  progress_value double precision,
  metadata jsonb,
  awarded_at timestamp with time zone
)
language sql
stable
set search_path = public
as $$
  select
    challenge_awards.id,
    challenge_awards.challenge_id,
    challenge_awards.user_id,
    challenge_awards.award_slug,
    challenge_awards.title,
    challenge_awards.description,
    challenge_awards.rank,
    challenge_awards.progress_value,
    challenge_awards.metadata,
    challenge_awards.awarded_at
  from public.challenge_awards
  where challenge_awards.user_id = coalesce(target_user_id, auth.uid())
  order by challenge_awards.awarded_at desc, challenge_awards.title asc;
$$;
```

Create the finalization RPC:

```sql
create or replace function public.finalize_due_challenges(batch_size integer default 10)
returns table (
  challenge_id uuid,
  challenge_slug text,
  winner_user_id uuid,
  winner_progress_value double precision,
  award_id uuid,
  official_post_id uuid,
  finalized_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
  leader_row record;
  stats_row record;
  profile_row record;
  award_row_id uuid;
  post_row_id uuid;
  final_time timestamp with time zone;
begin
  for challenge_row in
    select *
    from public.challenges
    where challenge_type = 'leaderboard'
      and ends_at <= now()
      and finalized_at is null
    order by ends_at asc
    limit least(greatest(coalesce(batch_size, 10), 1), 50)
  loop
    final_time := now();
    award_row_id := null;
    post_row_id := null;

    select *
    into leader_row
    from public.get_challenge_leaderboard(challenge_row.id)
    order by rank asc
    limit 1;

    if leader_row.user_id is null or coalesce(leader_row.progress_value, 0) <= 0 then
      update public.challenges
      set finalized_at = final_time,
          winner_user_id = null,
          winner_progress_value = null
      where id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := null;
      winner_progress_value := null;
      award_id := null;
      official_post_id := null;
      finalized_at := final_time;
      return next;
    else
      select profiles.username, profiles.avatar_url
      into profile_row
      from public.profiles
      where profiles.id = leader_row.user_id;

      with filtered_beers as (
        select
          sessions.id as session_id,
          session_beers.volume,
          greatest(coalesce(session_beers.quantity, 1), 0) as quantity,
          session_beers.abv
        from public.sessions
        join public.session_beers on session_beers.session_id = sessions.id
        where sessions.user_id = leader_row.user_id
          and sessions.status = 'published'
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= challenge_row.starts_at
          and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < challenge_row.ends_at
      )
      select
        coalesce(sum(public.beerva_serving_volume_ml(filtered_beers.volume) * filtered_beers.quantity / 568.0), 0)::double precision as true_pints,
        coalesce(sum(filtered_beers.quantity), 0)::integer as drink_count,
        round((
          sum(filtered_beers.abv * filtered_beers.quantity) filter (where filtered_beers.abv is not null)
          / nullif(sum(filtered_beers.quantity) filter (where filtered_beers.abv is not null), 0)
        )::numeric, 1)::double precision as average_abv,
        count(distinct filtered_beers.session_id)::integer as session_count
      into stats_row
      from filtered_beers;

      insert into public.challenge_awards (
        challenge_id,
        user_id,
        award_slug,
        title,
        description,
        rank,
        progress_value,
        metadata,
        awarded_at
      ) values (
        challenge_row.id,
        leader_row.user_id,
        'winner-of-karneval-2026',
        'Winner of Karneval 2026',
        'Won KarnevalsDruk 2026 by drinking the most true pints.',
        1,
        leader_row.progress_value,
        jsonb_build_object(
          'challenge_slug', challenge_row.slug,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0)
        ),
        final_time
      )
      on conflict (challenge_id, user_id, award_slug) do update set
        progress_value = excluded.progress_value,
        metadata = excluded.metadata
      returning id into award_row_id;

      insert into public.official_feed_posts (
        challenge_id,
        kind,
        title,
        body,
        metadata,
        published_at
      ) values (
        challenge_row.id,
        'challenge_winner',
        'Winner of Karneval 2026',
        coalesce(profile_row.username, 'Beer Lover') || ' won KarnevalsDruk with ' || round(leader_row.progress_value::numeric, 1)::text || ' true pints.',
        jsonb_build_object(
          'winner_user_id', leader_row.user_id,
          'winner_username', profile_row.username,
          'winner_avatar_url', profile_row.avatar_url,
          'true_pints', round(leader_row.progress_value::numeric, 1),
          'drink_count', coalesce(stats_row.drink_count, 0),
          'average_abv', coalesce(stats_row.average_abv, 0),
          'session_count', coalesce(stats_row.session_count, 0),
          'challenge_slug', challenge_row.slug
        ),
        final_time
      )
      on conflict (challenge_id, kind) do update set
        title = excluded.title,
        body = excluded.body,
        metadata = excluded.metadata
      returning id into post_row_id;

      update public.challenges
      set finalized_at = final_time,
          winner_user_id = leader_row.user_id,
          winner_progress_value = leader_row.progress_value
      where id = challenge_row.id;

      challenge_id := challenge_row.id;
      challenge_slug := challenge_row.slug;
      winner_user_id := leader_row.user_id;
      winner_progress_value := leader_row.progress_value;
      award_id := award_row_id;
      official_post_id := post_row_id;
      finalized_at := final_time;
      return next;
    end if;
  end loop;
end;
$$;
```

Add scheduling and grants:

```sql
create or replace function public.invoke_challenge_finalizer()
returns void
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  cron_secret text;
  edge_function_jwt text;
  request_headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
begin
  begin
    select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
    where name = 'beerva_challenge_finalizer_cron_secret'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      cron_secret := null;
  end;

  begin
    select decrypted_secret
    into edge_function_jwt
    from vault.decrypted_secrets
    where name = 'beerva_edge_function_jwt'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      edge_function_jwt := null;
  end;

  if nullif(btrim(coalesce(edge_function_jwt, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object('Authorization', 'Bearer ' || edge_function_jwt);
  end if;

  if nullif(btrim(coalesce(cron_secret, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object('x-beerva-cron-secret', cron_secret);
  end if;

  perform net.http_post(
    url := 'https://yzrfihijpusvjypypnip.supabase.co/functions/v1/finalize-challenges',
    body := '{}'::jsonb,
    headers := request_headers,
    timeout_milliseconds := 10000
  );
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

revoke execute on function public.finalize_due_challenges(integer) from public, anon, authenticated;
grant execute on function public.finalize_due_challenges(integer) to service_role;
grant execute on function public.get_challenge_awards(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;
grant execute on function public.get_challenge_detail(text) to authenticated;

comment on function public.finalize_due_challenges(integer) is 'Finalizes ended leaderboard challenges, awarding winners and posting official Beerva announcements idempotently.';
comment on table public.challenge_awards is 'Persistent official challenge trophies awarded by trusted finalization jobs.';
comment on table public.official_feed_posts is 'Beerva-authored feed announcements such as official challenge winners.';
```

- [ ] **Step 2: Create the scheduled Edge Function**

Create `supabase/functions/finalize-challenges/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CHALLENGE_FINALIZER_CRON_SECRET') || '';

Deno.serve(async (req) => {
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'CHALLENGE_FINALIZER_CRON_SECRET is not configured' }), { status: 500 });
  }

  const customSecret = req.headers.get('x-beerva-cron-secret') || '';
  const legacyAuth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const legacyBearerSecret = legacyAuth.startsWith('Bearer ') ? legacyAuth.slice('Bearer '.length) : '';

  if (customSecret !== cronSecret && legacyBearerSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.rpc('finalize_due_challenges', {
    batch_size: 10,
  });

  if (error) {
    console.error('Challenge finalization error', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    finalized: Array.isArray(data) ? data.length : 0,
    results: data || [],
  }), { status: 200 });
});
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm run test:challenges
```

Expected: PASS with `official challenge checks passed`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520120000_add_karnevalsdruk_challenge.sql supabase/functions/finalize-challenges/index.ts
git commit -m "feat: add KarnevalsDruk finalization"
```

---

### Task 5: Official Feed Post Tests

**Files:**
- Modify: `scripts/challenges.test.js`
- Test command: `npm run test:challenges`

- [ ] **Step 1: Write failing official feed post guards**

Add paths near the top:

```js
const officialFeedPostsPath = 'src/lib/officialFeedPosts.ts';
const officialFeedPostsApiPath = 'src/lib/officialFeedPostsApi.ts';
const officialFeedPostCardPath = 'src/components/OfficialFeedPostCard.tsx';
```

Add existence checks:

```js
assert.ok(exists(officialFeedPostsPath), 'official feed post mapper should exist');
assert.ok(exists(officialFeedPostsApiPath), 'official feed post API should exist');
assert.ok(exists(officialFeedPostCardPath), 'official feed post card should exist');
```

Load and test the mapper after challenge helper tests:

```js
const { mapOfficialFeedPostRow, formatOfficialWinnerStat } = loadTypeScriptModule(officialFeedPostsPath);

const officialPost = mapOfficialFeedPostRow({
  id: 'official-1',
  challenge_id: 'challenge-1',
  kind: 'challenge_winner',
  title: 'Winner of Karneval 2026',
  body: 'Mads won KarnevalsDruk with 8.4 true pints.',
  metadata: {
    winner_user_id: 'user-1',
    winner_username: 'Mads',
    winner_avatar_url: 'https://example.com/avatar.png',
    true_pints: 8.44,
    drink_count: 11,
    average_abv: 5.2,
    session_count: 3,
    challenge_slug: 'karnevalsdruk-2026',
  },
  published_at: '2026-05-24T04:05:00Z',
  created_at: '2026-05-24T04:05:00Z',
});

assert.equal(officialPost.title, 'Winner of Karneval 2026');
assert.equal(officialPost.winnerUsername, 'Mads');
assert.equal(officialPost.truePints, 8.44);
assert.equal(officialPost.drinkCount, 11);
assert.equal(officialPost.averageAbv, 5.2);
assert.equal(officialPost.sessionCount, 3);
assert.equal(formatOfficialWinnerStat('Average ABV', 5.2, '%'), 'Average ABV 5.2%');
```

Add source assertions after the feed source block:

```js
const officialFeedApiSource = read(officialFeedPostsApiPath);
assert.match(officialFeedApiSource, /from\('official_feed_posts'\)/, 'official feed post API should read official_feed_posts');
assert.match(officialFeedApiSource, /mapOfficialFeedPostRow/, 'official feed post API should map rows');

const officialFeedCardSource = read(officialFeedPostCardPath);
assert.match(officialFeedCardSource, /Official Beerva/, 'official feed card should mark the post as official');
assert.match(officialFeedCardSource, /Average ABV/, 'official feed card should show average ABV');
assert.doesNotMatch(officialFeedCardSource, /onDelete|onToggleCheers|onOpenComments/, 'official feed card should not expose user post controls');

assert.match(feedScreenSource, /fetchOfficialFeedPostsForFeedPage/, 'Feed should fetch official feed posts');
assert.match(feedScreenSource, /type: 'official_post'/, 'Feed should merge official post items');
assert.match(feedScreenSource, /OfficialFeedPostCard/, 'Feed should render official feed post cards');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:challenges
```

Expected: FAIL because official feed post files and Feed integration do not exist.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/challenges.test.js
git commit -m "test: guard official challenge winner feed posts"
```

---

### Task 6: Official Feed Post Implementation

**Files:**
- Create: `src/lib/officialFeedPosts.ts`
- Create: `src/lib/officialFeedPostsApi.ts`
- Create: `src/components/OfficialFeedPostCard.tsx`
- Modify: `src/screens/FeedScreen.tsx`
- Test command: `npm run test:challenges`

- [ ] **Step 1: Create official feed post mapper**

Create `src/lib/officialFeedPosts.ts`:

```ts
export type OfficialFeedPostRow = {
  id?: string | null;
  challenge_id?: string | null;
  kind?: string | null;
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  published_at?: string | null;
  created_at?: string | null;
};

export type OfficialFeedPost = {
  id: string;
  challengeId: string | null;
  kind: string;
  title: string;
  body: string;
  winnerUserId: string | null;
  winnerUsername: string | null;
  winnerAvatarUrl: string | null;
  truePints: number;
  drinkCount: number;
  averageAbv: number;
  sessionCount: number;
  challengeSlug: string | null;
  publishedAt: string;
  createdAt: string;
  raw: OfficialFeedPostRow;
};

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toStringOrNull = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const formatOfficialWinnerStat = (label: string, value: number | string | null | undefined, suffix = '') => {
  const parsed = toNumber(value);
  const formatted = Number.isInteger(parsed) ? `${parsed}` : parsed.toFixed(1);
  return `${label} ${formatted}${suffix}`;
};

export const mapOfficialFeedPostRow = (row: OfficialFeedPostRow): OfficialFeedPost => {
  const metadata = row.metadata || {};

  return {
    id: toStringOrNull(row.id) || 'unknown',
    challengeId: toStringOrNull(row.challenge_id),
    kind: toStringOrNull(row.kind) || 'official',
    title: toStringOrNull(row.title) || 'Official Beerva',
    body: toStringOrNull(row.body) || '',
    winnerUserId: toStringOrNull(metadata.winner_user_id),
    winnerUsername: toStringOrNull(metadata.winner_username),
    winnerAvatarUrl: toStringOrNull(metadata.winner_avatar_url),
    truePints: toNumber(metadata.true_pints),
    drinkCount: Math.round(toNumber(metadata.drink_count)),
    averageAbv: toNumber(metadata.average_abv),
    sessionCount: Math.round(toNumber(metadata.session_count)),
    challengeSlug: toStringOrNull(metadata.challenge_slug),
    publishedAt: toStringOrNull(row.published_at) || '',
    createdAt: toStringOrNull(row.created_at) || '',
    raw: row,
  };
};
```

- [ ] **Step 2: Create official feed post API**

Create `src/lib/officialFeedPostsApi.ts`:

```ts
import { mapOfficialFeedPostRow, OfficialFeedPost, OfficialFeedPostRow } from './officialFeedPosts';
import { supabase } from './supabase';
import { getErrorMessage, withTimeout } from './timeouts';

const OFFICIAL_FEED_TIMEOUT_MS = 15000;

export const fetchOfficialFeedPostsForFeedPage = async (
  limit: number,
  offset: number
): Promise<OfficialFeedPost[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('official_feed_posts')
        .select('id, challenge_id, kind, title, body, metadata, published_at, created_at')
        .order('published_at', { ascending: false })
        .range(offset, offset + limit),
      OFFICIAL_FEED_TIMEOUT_MS,
      'Official Beerva posts are taking too long.'
    );

    if (error) throw error;
    return ((data || []) as OfficialFeedPostRow[]).map(mapOfficialFeedPostRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load official Beerva posts.'));
  }
};
```

- [ ] **Step 3: Create official feed card**

Create `src/components/OfficialFeedPostCard.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Trophy } from 'lucide-react-native';

import { CachedImage } from './CachedImage';
import { formatOfficialWinnerStat, OfficialFeedPost } from '../lib/officialFeedPosts';
import { colors } from '../theme/colors';
import { feedCardColors } from '../theme/feedCard';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type OfficialFeedPostCardProps = {
  post: OfficialFeedPost;
  onOpenProfile: (userId: string) => void;
};

export const OfficialFeedPostCard = ({ post, onOpenProfile }: OfficialFeedPostCardProps) => (
  <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.officialBadge}>
        <CheckCircle2 color={colors.primary} size={15} />
        <Text style={styles.officialText}>Official Beerva</Text>
      </View>
      <Trophy color={colors.primary} size={20} />
    </View>

    <Text style={styles.title}>{post.title}</Text>
    <Text style={styles.body}>{post.body}</Text>

    {post.winnerUserId ? (
      <Pressable
        style={styles.winnerRow}
        onPress={() => post.winnerUserId && onOpenProfile(post.winnerUserId)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${post.winnerUsername || 'winner'} profile`}
      >
        <CachedImage
          uri={post.winnerAvatarUrl}
          fallbackUri={`https://i.pravatar.cc/150?u=${post.winnerUserId}`}
          style={styles.avatar}
          recyclingKey={`official-winner-${post.id}-${post.winnerAvatarUrl || 'fallback'}`}
        />
        <View style={styles.winnerCopy}>
          <Text style={styles.winnerLabel}>Winner</Text>
          <Text style={styles.winnerName} numberOfLines={1}>{post.winnerUsername || 'Beer Lover'}</Text>
        </View>
      </Pressable>
    ) : null}

    <View style={styles.statGrid}>
      <Text style={styles.statText}>{formatOfficialWinnerStat('True pints', post.truePints)}</Text>
      <Text style={styles.statText}>{formatOfficialWinnerStat('Average ABV', post.averageAbv, '%')}</Text>
      <Text style={styles.statText}>{formatOfficialWinnerStat('Drinks', post.drinkCount)}</Text>
      <Text style={styles.statText}>{formatOfficialWinnerStat('Sessions', post.sessionCount)}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: feedCardColors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 14,
    gap: spacing.sm,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  officialBadge: {
    minHeight: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  officialText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '900',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.text,
  },
  winnerRow: {
    minHeight: 54,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardMuted,
  },
  winnerCopy: {
    flex: 1,
    minWidth: 0,
  },
  winnerLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  winnerName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '900',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statText: {
    ...typography.caption,
    color: colors.text,
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
});
```

- [ ] **Step 4: Merge official posts into FeedScreen**

In `src/screens/FeedScreen.tsx`, add imports:

```ts
import { OfficialFeedPost } from '../lib/officialFeedPosts';
import { fetchOfficialFeedPostsForFeedPage } from '../lib/officialFeedPostsApi';
import { OfficialFeedPostCard } from '../components/OfficialFeedPostCard';
```

Update `FeedItem`:

```ts
export type FeedItem =
  | { type: 'session'; id: string; publishedAt: string; session: FeedSession }
  | { type: 'pub_crawl'; id: string; publishedAt: string; crawl: PubCrawl }
  | { type: 'official_post'; id: string; publishedAt: string; post: OfficialFeedPost };
```

Inside `fetchSessions`, add an official offset next to the existing offsets:

```ts
const officialOffset = reset ? 0 : sessionsRef.current.filter((item) => item.type === 'official_post').length;
```

Change the `Promise.all` to include official posts:

```ts
const [sessionsResult, crawlsResult, officialPostsResult] = await withTimeout(
  Promise.all([
    supabase
      .from('sessions')
      .select(`
        id,
        user_id,
        pub_id,
        pub_name,
        beer_name,
        volume,
        quantity,
        abv,
        comment,
        image_url,
        status,
        started_at,
        ended_at,
        published_at,
        edited_at,
        hangover_score,
        created_at,
        hide_from_feed
      `)
      .in('user_id', feedUserIds)
      .eq('status', 'published')
      .eq('hide_from_feed', false)
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(sessionOffset, sessionOffset + FEED_PAGE_SIZE),
    fetchPublishedPubCrawlsForFeedPage(feedUserIds, FEED_PAGE_SIZE, crawlOffset),
    fetchOfficialFeedPostsForFeedPage(FEED_PAGE_SIZE, officialOffset)
  ]),
  FEED_REQUEST_TIMEOUT_MS,
  'Feed items are taking too long.'
);
```

After `pageCrawls`, add:

```ts
const pageOfficialPosts = officialPostsResult.map((post): FeedItem => ({
  type: 'official_post',
  id: post.id,
  publishedAt: post.publishedAt || post.createdAt || '',
  post,
}));
```

Replace the merge line with:

```ts
const merged = sortFeedItemsByPublishedAt([...pageSessions, ...pageCrawls, ...pageOfficialPosts]);
```

In `renderSession`, add the official post branch before the session branch:

```tsx
if (item.type === 'official_post') {
  return (
    <OfficialFeedPostCard
      post={item.post}
      onOpenProfile={openProfile}
    />
  );
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:challenges
```

Expected: PASS with `official challenge checks passed`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/officialFeedPosts.ts src/lib/officialFeedPostsApi.ts src/components/OfficialFeedPostCard.tsx src/screens/FeedScreen.tsx
git commit -m "feat: show official winner feed posts"
```

---

### Task 7: Challenge Award Trophy Tests

**Files:**
- Modify: `scripts/profileStats.test.js`
- Test command: `npm run test:stats`

- [ ] **Step 1: Write failing award trophy guards**

Add these paths near the top of `scripts/profileStats.test.js`:

```js
const challengeAwardsPath = 'src/lib/challengeAwards.ts';
const challengeAwardsApiPath = 'src/lib/challengeAwardsApi.ts';
const profileStatsPanelPath = 'src/components/ProfileStatsPanel.tsx';
const profileScreenPath = 'src/screens/ProfileScreen.tsx';
const userProfileScreenPath = 'src/screens/UserProfileScreen.tsx';
```

Add these helpers if the file does not already have them:

```js
const exists = (relativePath) => fs.existsSync(path.resolve(__dirname, '..', relativePath));
const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
```

Add assertions near the other trophy assertions:

```js
assert.ok(exists(challengeAwardsPath), 'challenge award mapper should exist');
assert.ok(exists(challengeAwardsApiPath), 'challenge award API should exist');

const { mapChallengeAwardRow } = loadTypeScriptModule(challengeAwardsPath);
const awardTrophy = mapChallengeAwardRow({
  id: 'award-1',
  challenge_id: 'challenge-1',
  user_id: 'user-1',
  award_slug: 'winner-of-karneval-2026',
  title: 'Winner of Karneval 2026',
  description: 'Won KarnevalsDruk 2026 by drinking the most true pints.',
  rank: 1,
  progress_value: 8.44,
  metadata: { true_pints: 8.4 },
  awarded_at: '2026-05-24T04:05:00Z',
});

assert.equal(awardTrophy.id, 'challenge-award-winner-of-karneval-2026');
assert.equal(awardTrophy.title, 'Winner of Karneval 2026');
assert.equal(awardTrophy.kind, 'challenge');
assert.equal(awardTrophy.earned, true);

const profileStatsSource = readSource('src/lib/profileStats.ts');
assert.match(profileStatsSource, /\\| 'challenge'/, 'TrophyKind should include challenge awards');

const challengeAwardsApiSource = readSource(challengeAwardsApiPath);
assert.match(challengeAwardsApiSource, /get_challenge_awards/, 'challenge award API should call award RPC');
assert.match(challengeAwardsApiSource, /mapChallengeAwardRow/, 'challenge award API should map award rows');

const profileStatsPanelSource = readSource(profileStatsPanelPath);
assert.match(profileStatsPanelSource, /challengeAwards/, 'ProfileStatsPanel should accept challenge awards');
assert.match(profileStatsPanelSource, /\\.\\.\\.challengeAwards/, 'ProfileStatsPanel should merge challenge awards into trophies');

const profileScreenSource = readSource(profileScreenPath);
assert.match(profileScreenSource, /fetchChallengeAwards/, 'ProfileScreen should fetch current user challenge awards');
assert.match(profileScreenSource, /challengeAwards=\\{challengeAwards\\}/, 'ProfileScreen should pass challenge awards to stats panel');

const userProfileScreenSource = readSource(userProfileScreenPath);
assert.match(userProfileScreenSource, /fetchChallengeAwards/, 'UserProfileScreen should fetch viewed user challenge awards');
assert.match(userProfileScreenSource, /challengeAwards=\\{challengeAwards\\}/, 'UserProfileScreen should pass challenge awards to stats panel');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:stats
```

Expected: FAIL because challenge awards are not mapped, fetched, or passed into the profile trophy cabinet.

- [ ] **Step 3: Commit the failing test**

```bash
git add scripts/profileStats.test.js
git commit -m "test: guard challenge award trophies"
```

---

### Task 8: Challenge Award Trophy Implementation

**Files:**
- Modify: `src/lib/profileStats.ts`
- Modify: `src/components/ProfileStatsPanel.tsx`
- Create: `src/lib/challengeAwards.ts`
- Create: `src/lib/challengeAwardsApi.ts`
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/screens/UserProfileScreen.tsx`
- Test command: `npm run test:stats`

- [ ] **Step 1: Add challenge trophy kind**

In `src/lib/profileStats.ts`, add `challenge` to `TrophyKind`:

```ts
export type TrophyKind =
  | 'pints'
  | 'pubs'
  | 'session'
  | 'abv'
  | 'late'
  | 'spree'
  | 'streak'
  | 'variety'
  | 'morning'
  | 'calendar'
  | 'rtd'
  | 'jager'
  | 'sambuca'
  | 'challenge';
```

- [ ] **Step 2: Create award mapper**

Create `src/lib/challengeAwards.ts`:

```ts
import { TrophyDefinition } from './profileStats';

export type ChallengeAwardRow = {
  id?: string | null;
  challenge_id?: string | null;
  user_id?: string | null;
  award_slug?: string | null;
  title?: string | null;
  description?: string | null;
  rank?: number | string | null;
  progress_value?: number | string | null;
  metadata?: Record<string, unknown> | null;
  awarded_at?: string | null;
};

const toStringOrNull = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const mapChallengeAwardRow = (row: ChallengeAwardRow): TrophyDefinition => {
  const awardSlug = toStringOrNull(row.award_slug) || toStringOrNull(row.id) || 'challenge-award';

  return {
    id: `challenge-award-${awardSlug}`,
    title: toStringOrNull(row.title) || 'Challenge Award',
    description: toStringOrNull(row.description) || 'Won an official Beerva challenge.',
    kind: 'challenge',
    earned: true,
  };
};
```

- [ ] **Step 3: Create award API**

Create `src/lib/challengeAwardsApi.ts`:

```ts
import { ChallengeAwardRow, mapChallengeAwardRow } from './challengeAwards';
import { TrophyDefinition } from './profileStats';
import { supabase } from './supabase';
import { getErrorMessage, withTimeout } from './timeouts';

const CHALLENGE_AWARDS_TIMEOUT_MS = 15000;

export const fetchChallengeAwards = async (userId: string): Promise<TrophyDefinition[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_challenge_awards', { target_user_id: userId }),
      CHALLENGE_AWARDS_TIMEOUT_MS,
      'Challenge awards are taking too long.'
    );

    if (error) throw error;
    return ((data || []) as ChallengeAwardRow[]).map(mapChallengeAwardRow);
  } catch (error) {
    console.warn('Challenge awards unavailable:', getErrorMessage(error, 'Could not load challenge awards.'));
    return [];
  }
};
```

- [ ] **Step 4: Render challenge award icons**

In `src/components/ProfileStatsPanel.tsx`, update the type import:

```ts
import { getTrophies, Stats, TrophyDefinition, TrophyKind } from '../lib/profileStats';
```

Add a `challenge` case to `renderTrophyIcon`:

```tsx
case 'challenge':
  return <Trophy color={iconColor} size={iconSize} />;
```

Update props:

```ts
type ProfileStatsPanelProps = {
  stats: Stats;
  pintTimeline?: PintTimelinePoint[];
  challengeAwards?: TrophyDefinition[];
};
```

Update the component signature and trophy calculation:

```ts
export const ProfileStatsPanel = ({ stats, pintTimeline = [], challengeAwards = [] }: ProfileStatsPanelProps) => {
  const trophies = useMemo(() => [...getTrophies(stats), ...challengeAwards], [stats, challengeAwards]);
```

- [ ] **Step 5: Fetch awards in ProfileScreen**

In `src/screens/ProfileScreen.tsx`, update imports:

```ts
import { emptyStats, getVolumeMl, ProfileSessionStatsRow, Stats, TrophyDefinition } from '../lib/profileStats';
import { fetchChallengeAwards } from '../lib/challengeAwardsApi';
```

Add state:

```ts
const [challengeAwards, setChallengeAwards] = useState<TrophyDefinition[]>([]);
```

In the `Promise.all`, add `fetchChallengeAwards(user.id)` after `fetchPintTimeline(user.id)` and destructure it as `awards`:

```ts
const [
  profileResult,
  profileStats,
  timeline,
  awards,
  sessionsResult,
  followersResult,
  followingResult,
] = await Promise.all([
  supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle(),
  fetchProfileStats(user.id),
  fetchPintTimeline(user.id),
  fetchChallengeAwards(user.id),
  supabase
    .from('sessions')
    .select('id, pub_id, pub_name, beer_name, volume, quantity, abv, comment, image_url, status, published_at, created_at', { count: 'exact' })
    .eq('user_id', user.id)
    .eq('status', 'published')
    .eq('hide_from_feed', false)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(5),
  supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', user.id),
  supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', user.id),
]);
```

After `setPintTimeline(timeline);`, add:

```ts
setChallengeAwards(awards);
```

Update the stats panel:

```tsx
<ProfileStatsPanel stats={stats} pintTimeline={pintTimeline} challengeAwards={challengeAwards} />
```

- [ ] **Step 6: Fetch awards in UserProfileScreen**

In `src/screens/UserProfileScreen.tsx`, add imports:

```ts
import { emptyStats, getVolumeMl, ProfileSessionStatsRow, Stats, TrophyDefinition } from '../lib/profileStats';
import { fetchChallengeAwards } from '../lib/challengeAwardsApi';
```

Add state:

```ts
const [challengeAwards, setChallengeAwards] = useState<TrophyDefinition[]>([]);
```

Replace the profile `Promise.all` destructuring and call list with this shape:

```ts
const [
  profileResult,
  sessionsResult,
  profileStats,
  timeline,
  awards,
  followersResult,
  followingResult,
] = await Promise.all([
  supabase
    .from('profiles')
    .select('id, username, avatar_url, updated_at')
    .eq('id', profileId)
    .maybeSingle(),
  supabase
    .from('sessions')
    .select('id, pub_id, pub_name, beer_name, volume, quantity, abv, comment, image_url, status, published_at, created_at', { count: 'exact' })
    .eq('user_id', profileId)
    .eq('status', 'published')
    .eq('hide_from_feed', false)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(5),
  fetchProfileStats(profileId),
  fetchPintTimeline(profileId),
  fetchChallengeAwards(profileId),
  supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', profileId),
  supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', profileId),
]);
```

After `setPintTimeline(timeline);`, add:

```ts
setChallengeAwards(awards);
```

Update the stats panel:

```tsx
<ProfileStatsPanel stats={stats} pintTimeline={pintTimeline} challengeAwards={challengeAwards} />
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test:stats
```

Expected: PASS with `profileStats trophy tests passed`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/profileStats.ts src/components/ProfileStatsPanel.tsx src/lib/challengeAwards.ts src/lib/challengeAwardsApi.ts src/screens/ProfileScreen.tsx src/screens/UserProfileScreen.tsx
git commit -m "feat: show challenge award trophies"
```

---

### Task 9: Full Verification

**Files:**
- No code edits unless verification exposes a failure.
- Commands:
  - `npm run test:challenges`
  - `npm run test:stats`
  - `npm run build:web`

- [ ] **Step 1: Run challenge tests**

Run:

```bash
npm run test:challenges
```

Expected: PASS with `official challenge checks passed`.

- [ ] **Step 2: Run profile stats tests**

Run:

```bash
npm run test:stats
```

Expected: PASS with `profileStats trophy tests passed`.

- [ ] **Step 3: Run web build**

Run:

```bash
npm run build:web
```

Expected: PASS and Expo export completes without TypeScript or bundling errors.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional committed work is clean. Pre-existing unrelated edits in `public/sw.js` and `scripts/pwaStartup.test.js` may still appear if they were present before execution; do not revert them.

- [ ] **Step 5: Confirm no verification fixes remain unstaged**

Run:

```bash
git diff --name-only
```

Expected: no output. If this prints files, return to the task that owns those files, complete that task's test/fix/commit cycle, and then rerun Task 9.

---

## Self-Review Notes

- Spec coverage:
  - Leaderboard challenge type: Tasks 1-2 and 4.
  - KarnevalsDruk seed and exact 06:00 Copenhagen UTC window: Tasks 3-4.
  - Winner trophy: Tasks 3-4 and 7-8.
  - Official Beerva post with true pints, drinks, average ABV, sessions, and winner profile: Tasks 3-6.
  - Idempotent finalization: Tasks 3-4.
  - Feed merge and profile trophy display: Tasks 5-8.
  - Verification: Task 9.
- Type consistency:
  - Database `challenge_type` maps to TypeScript `challengeType`.
  - Database `official_feed_posts.metadata.average_abv` maps to `OfficialFeedPost.averageAbv`.
  - Challenge award trophies use `TrophyKind` value `challenge`.
- Scope:
  - This plan keeps all work inside the existing official challenges, feed, and profile trophy systems. It does not add user-created challenges, comments on official posts, or push notifications for winner announcements.
