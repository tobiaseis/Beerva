# Official Challenges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add official Beerva challenges with the first public opt-in challenge, "Drink 15 beers in May", ranked by retroactive true-pint progress.

**Architecture:** Store official challenges and challenge entries in Supabase, with an RPC responsible for leaderboard/progress calculation so ranking is consistent and not duplicated in React Native screens. Keep UI entry inside the existing Pub Legends tab with a `Pub Legends | Challenges` segmented view, add a stack detail screen, and show only a tiny joined-active challenge strip in the feed.

**Tech Stack:** Expo React Native, React Navigation, Supabase SQL/RPC, Node source-level tests, existing Beerva theme tokens.

---

## File Structure

- Create `supabase/migrations/20260514170000_add_official_challenges.sql`
  - Owns `challenges`, `challenge_entries`, seed data for the May challenge, RLS policies, `join_challenge`, `get_official_challenges`, and `get_challenge_detail`.
- Create `src/lib/challenges.ts`
  - Pure row types, app types, date/status helpers, formatters, and mappers.
- Create `src/lib/challengesApi.ts`
  - Supabase API wrapper for challenge list, detail, joining, and joined active feed summary.
- Create `src/screens/ChallengeDetailScreen.tsx`
  - Stack screen for challenge details and leaderboard.
- Modify `src/screens/PubLegendsScreen.tsx`
  - Add compact segmented control and render official challenges as the second segment.
- Modify `src/screens/FeedScreen.tsx`
  - Fetch joined active challenge summary and render a tiny top-of-feed strip.
- Modify `src/navigation/RootNavigator.tsx`
  - Register `ChallengeDetail`.
- Modify `package.json`
  - Add `test:challenges`.
- Create `scripts/challenges.test.js`
  - Source and pure-helper contract tests for data, migration, API, navigation, Pub Legends placement, Feed strip compactness, and styling constraints.

## Task 1: Add The Failing Challenge Contract Test

**Files:**
- Create: `scripts/challenges.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add test script to `package.json`**

Add this line in the `scripts` object near the other feature tests:

```json
"test:challenges": "node scripts/challenges.test.js",
```

- [ ] **Step 2: Create `scripts/challenges.test.js`**

Create the file with this content:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const loadTypeScriptModule = (relativePath) => {
  const filename = path.join(root, relativePath);
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

const challengesHelperPath = 'src/lib/challenges.ts';
const challengesApiPath = 'src/lib/challengesApi.ts';
const detailScreenPath = 'src/screens/ChallengeDetailScreen.tsx';
const pubLegendsScreenPath = 'src/screens/PubLegendsScreen.tsx';
const feedScreenPath = 'src/screens/FeedScreen.tsx';
const navigatorPath = 'src/navigation/RootNavigator.tsx';
const migrationPath = 'supabase/migrations/20260514170000_add_official_challenges.sql';

assert.ok(exists(challengesHelperPath), 'challenge helper module should exist');
assert.ok(exists(challengesApiPath), 'challenge API module should exist');
assert.ok(exists(detailScreenPath), 'challenge detail screen should exist');
assert.ok(exists(migrationPath), 'official challenge migration should exist');

const {
  CHALLENGE_STATUS,
  formatChallengeProgress,
  getChallengeStatus,
  mapChallengeDetailRow,
  mapChallengeSummaryRow,
} = loadTypeScriptModule(challengesHelperPath);

assert.equal(CHALLENGE_STATUS.ACTIVE, 'active');
assert.equal(formatChallengeProgress(6.234, 15), '6.2/15');
assert.equal(formatChallengeProgress(null, 15), '0.0/15');

assert.equal(
  getChallengeStatus({
    startsAt: '2026-04-30T22:00:00Z',
    endsAt: '2026-05-31T22:00:00Z',
  }, new Date('2026-05-14T12:00:00Z')),
  'active',
  'May challenge should be active during May'
);
assert.equal(
  getChallengeStatus({
    startsAt: '2026-04-30T22:00:00Z',
    endsAt: '2026-05-31T22:00:00Z',
  }, new Date('2026-06-01T00:00:00Z')),
  'ended',
  'May challenge should be ended after the exclusive end'
);

const summary = mapChallengeSummaryRow({
  id: 'challenge-1',
  slug: 'may-2026-15-true-pints',
  title: 'Drink 15 beers in May',
  description: 'Reach 15 true pints between May 1 and May 31. All logged beverages count toward your total, normalized by serving size.',
  metric_type: 'true_pints',
  target_value: '15',
  starts_at: '2026-04-30T22:00:00Z',
  ends_at: '2026-05-31T22:00:00Z',
  join_closes_at: '2026-05-31T22:00:00Z',
  joined_at: '2026-05-14T12:00:00Z',
  entrants_count: '4',
  current_user_rank: '3',
  current_user_progress: '6.234',
});

assert.equal(summary.title, 'Drink 15 beers in May');
assert.equal(summary.metricType, 'true_pints');
assert.equal(summary.targetValue, 15);
assert.equal(summary.joined, true);
assert.equal(summary.entrantsCount, 4);
assert.equal(summary.currentUserRank, 3);
assert.equal(summary.currentUserProgress, 6.234);

const detail = mapChallengeDetailRow({
  ...summary.raw,
  leaderboard: [
    {
      rank: '1',
      user_id: 'user-1',
      username: 'Mads',
      avatar_url: null,
      progress_value: '15.4',
      completed: true,
    },
    {
      rank: '2',
      user_id: 'user-2',
      username: null,
      avatar_url: 'https://example.com/avatar.png',
      progress_value: '8',
      completed: false,
    },
  ],
});

assert.equal(detail.leaderboard.length, 2);
assert.equal(detail.leaderboard[0].rank, 1);
assert.equal(detail.leaderboard[0].completed, true);
assert.equal(detail.leaderboard[1].username, null);

const migrationSql = read(migrationPath);
assert.match(migrationSql, /create table if not exists public\.challenges/i, 'migration should create challenges table');
assert.match(migrationSql, /create table if not exists public\.challenge_entries/i, 'migration should create challenge entries table');
assert.match(migrationSql, /may-2026-15-true-pints/, 'migration should seed the May challenge slug');
assert.match(migrationSql, /Drink 15 beers in May/, 'migration should seed the public headline');
assert.match(migrationSql, /true_pints/, 'migration should seed the true-pints metric');
assert.match(migrationSql, /2026-04-30 22:00:00\+00/, 'migration should store May 1 Copenhagen start in UTC');
assert.match(migrationSql, /2026-05-31 22:00:00\+00/, 'migration should store exclusive June 1 Copenhagen end in UTC');
assert.match(migrationSql, /now\(\) < challenges\.join_closes_at/, 'joining should close at join_closes_at');
assert.match(migrationSql, /public\.beerva_serving_volume_ml\(session_beers\.volume\)/, 'progress should use shared serving volume normalization');
assert.match(migrationSql, /coalesce\(session_beers\.consumed_at,\s*sessions\.started_at,\s*sessions\.created_at\)/, 'progress should use beer consumed timestamp fallback');
assert.match(migrationSql, /sessions\.hide_from_feed is true|coalesce\(sessions\.hide_from_feed,\s*false\)/, 'hidden pub crawl child sessions should not be excluded from challenge progress');
assert.match(migrationSql, /join public\.challenge_entries/, 'leaderboard should only include joined users');
assert.match(migrationSql, /order by progress_value desc/i, 'leaderboard should rank highest progress first');

const apiSource = read(challengesApiPath);
assert.match(apiSource, /fetchOfficialChallenges/, 'challenge API should fetch official challenges');
assert.match(apiSource, /fetchChallengeDetail/, 'challenge API should fetch challenge detail');
assert.match(apiSource, /joinChallenge/, 'challenge API should expose joining');
assert.match(apiSource, /fetchJoinedActiveChallengeSummary/, 'challenge API should expose joined active feed summary');
assert.match(apiSource, /supabase\.rpc\('join_challenge'/, 'joining should go through join RPC');
assert.match(apiSource, /supabase\.rpc\('get_official_challenges'/, 'list should go through official challenges RPC');
assert.match(apiSource, /supabase\.rpc\('get_challenge_detail'/, 'detail should go through challenge detail RPC');

const pubLegendsSource = read(pubLegendsScreenPath);
assert.match(pubLegendsSource, /activeSegment/, 'Pub Legends should track active segment');
assert.match(pubLegendsSource, /Pub Legends[\s\S]*Challenges/, 'Pub Legends should render a Pub Legends | Challenges segment');
assert.match(pubLegendsSource, /fetchOfficialChallenges/, 'Pub Legends should load official challenges');
assert.match(pubLegendsSource, /Join/, 'Challenges list should expose compact Join control');
assert.doesNotMatch(pubLegendsSource, /label="Join Challenge"/, 'Challenges should not use a chunky full-width Join Challenge AppButton');

const detailScreenSource = read(detailScreenPath);
assert.match(detailScreenSource, /fetchChallengeDetail/, 'detail screen should load challenge detail');
assert.match(detailScreenSource, /joinChallenge/, 'detail screen should support joining');
assert.match(detailScreenSource, /FlatList/, 'detail screen should render leaderboard as a list');
assert.match(detailScreenSource, /styles\.joinButtonCompact/, 'detail screen should use compact join button styling');

const feedScreenSource = read(feedScreenPath);
assert.match(feedScreenSource, /fetchJoinedActiveChallengeSummary/, 'Feed should load joined active challenge summary');
assert.match(feedScreenSource, /challengePreviewStrip/, 'Feed should render a compact challenge strip');
assert.doesNotMatch(feedScreenSource, /challengePreviewCard/, 'Feed should not render a large challenge card');
assert.match(feedScreenSource, /navigation\.navigate\('ChallengeDetail'/, 'Feed strip should open challenge detail');

const navigatorSource = read(navigatorPath);
assert.match(navigatorSource, /ChallengeDetailScreen/, 'navigator should import challenge detail screen');
assert.match(navigatorSource, /<Stack\.Screen name="ChallengeDetail"/, 'navigator should register ChallengeDetail stack route');
assert.doesNotMatch(navigatorSource, /<Tab\.Screen[\s\S]*name="Challenges"/, 'Challenges should not be a bottom tab');

console.log('official challenge checks passed');
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
npm run test:challenges
```

Expected: FAIL with `challenge helper module should exist`.

- [ ] **Step 4: Commit the failing test**

```bash
git add package.json scripts/challenges.test.js
git commit -m "test: guard official challenges"
```

## Task 2: Add Challenge Data Model, Seed, And RPCs

**Files:**
- Create: `supabase/migrations/20260514170000_add_official_challenges.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260514170000_add_official_challenges.sql` with this content:

```sql
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null,
  metric_type text not null,
  target_value numeric not null,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  join_closes_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  constraint challenges_metric_type_check check (metric_type in ('true_pints')),
  constraint challenges_target_positive_check check (target_value > 0),
  constraint challenges_window_check check (starts_at < ends_at),
  constraint challenges_join_window_check check (starts_at <= join_closes_at and join_closes_at <= ends_at)
);

create table if not exists public.challenge_entries (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamp with time zone not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists challenges_active_window_idx
  on public.challenges(starts_at, ends_at, join_closes_at);

create index if not exists challenge_entries_user_id_idx
  on public.challenge_entries(user_id, joined_at desc);

alter table public.challenges enable row level security;
alter table public.challenge_entries enable row level security;

drop policy if exists "Signed-in users can view official challenges" on public.challenges;
create policy "Signed-in users can view official challenges"
  on public.challenges
  for select
  to authenticated
  using (true);

drop policy if exists "Signed-in users can view challenge entries" on public.challenge_entries;
create policy "Signed-in users can view challenge entries"
  on public.challenge_entries
  for select
  to authenticated
  using (true);

drop policy if exists "Users can join challenges for themselves" on public.challenge_entries;
create policy "Users can join challenges for themselves"
  on public.challenge_entries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

insert into public.challenges (
  slug,
  title,
  description,
  metric_type,
  target_value,
  starts_at,
  ends_at,
  join_closes_at
) values (
  'may-2026-15-true-pints',
  'Drink 15 beers in May',
  'Reach 15 true pints between May 1 and May 31. All logged beverages count toward your total, normalized by serving size.',
  'true_pints',
  15,
  timestamp with time zone '2026-04-30 22:00:00+00',
  timestamp with time zone '2026-05-31 22:00:00+00',
  timestamp with time zone '2026-05-31 22:00:00+00'
) on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  metric_type = excluded.metric_type,
  target_value = excluded.target_value,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  join_closes_at = excluded.join_closes_at;

create or replace function public.join_challenge(target_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a challenge.';
  end if;

  if not exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and now() < challenges.join_closes_at
  ) then
    raise exception 'This challenge is closed for joining.';
  end if;

  insert into public.challenge_entries(challenge_id, user_id)
  values (target_challenge_id, auth.uid())
  on conflict (challenge_id, user_id) do nothing;
end;
$$;

create or replace function public.get_challenge_leaderboard(target_challenge_id uuid)
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
  with target_challenge as (
    select *
    from public.challenges
    where challenges.id = target_challenge_id
  ),
  joined_users as (
    select
      challenge_entries.user_id,
      challenge_entries.joined_at
    from public.challenge_entries
    join target_challenge on target_challenge.id = challenge_entries.challenge_id
  ),
  beverage_progress as (
    select
      joined_users.user_id,
      sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 0)
        / 568.0
      ) as progress_value
    from joined_users
    join target_challenge on true
    left join public.sessions on sessions.user_id = joined_users.user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) in (false, true)
    left join public.session_beers on session_beers.session_id = sessions.id
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) < target_challenge.ends_at
    group by joined_users.user_id
  ),
  ranked as (
    select
      row_number() over (
        order by coalesce(beverage_progress.progress_value, 0) desc, joined_users.joined_at asc, joined_users.user_id asc
      )::integer as rank,
      joined_users.user_id,
      profiles.username,
      profiles.avatar_url,
      coalesce(beverage_progress.progress_value, 0)::double precision as progress_value,
      coalesce(beverage_progress.progress_value, 0) >= target_challenge.target_value as completed
    from joined_users
    join target_challenge on true
    left join beverage_progress on beverage_progress.user_id = joined_users.user_id
    left join public.profiles on profiles.id = joined_users.user_id
  )
  select
    ranked.rank,
    ranked.user_id,
    ranked.username,
    ranked.avatar_url,
    ranked.progress_value,
    ranked.completed
  from ranked
  order by progress_value desc, rank asc;
$$;

create or replace function public.get_official_challenges()
returns table (
  id uuid,
  slug text,
  title text,
  description text,
  metric_type text,
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

- [ ] **Step 2: Run the test to confirm the migration clears its source assertions but helpers are still missing**

Run:

```bash
npm run test:challenges
```

Expected: FAIL with `challenge helper module should exist`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260514170000_add_official_challenges.sql
git commit -m "feat: add official challenge data model"
```

## Task 3: Add Pure Challenge Helpers

**Files:**
- Create: `src/lib/challenges.ts`

- [ ] **Step 1: Create `src/lib/challenges.ts`**

Create the file with this content:

```ts
export const CHALLENGE_STATUS = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;

export type ChallengeStatus = typeof CHALLENGE_STATUS[keyof typeof CHALLENGE_STATUS];
export type ChallengeMetricType = 'true_pints';

export type ChallengeSummaryRow = {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  metric_type?: ChallengeMetricType | string | null;
  target_value?: number | string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  join_closes_at?: string | null;
  joined_at?: string | null;
  entrants_count?: number | string | null;
  current_user_rank?: number | string | null;
  current_user_progress?: number | string | null;
};

export type ChallengeLeaderboardRow = {
  rank?: number | string | null;
  user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  progress_value?: number | string | null;
  completed?: boolean | null;
};

export type ChallengeDetailRow = ChallengeSummaryRow & {
  leaderboard?: ChallengeLeaderboardRow[] | null;
};

export type ChallengeSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  metricType: ChallengeMetricType;
  targetValue: number;
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

export type ChallengeLeaderboardEntry = {
  rank: number;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  progressValue: number;
  completed: boolean;
};

export type ChallengeDetail = ChallengeSummary & {
  leaderboard: ChallengeLeaderboardEntry[];
};

const toNumber = (value: number | string | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIntegerOrNull = (value: number | string | null | undefined) => {
  const parsed = toNumber(value);
  return parsed > 0 ? Math.round(parsed) : null;
};

const toInteger = (value: number | string | null | undefined) => Math.round(toNumber(value));

const toStringOrNull = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toMetricType = (value: string | null | undefined): ChallengeMetricType => (
  value === 'true_pints' ? value : 'true_pints'
);

export const getChallengeStatus = (
  challenge: Pick<ChallengeSummary, 'startsAt' | 'endsAt'> | { startsAt?: string | null; endsAt?: string | null },
  now = new Date()
): ChallengeStatus => {
  const startsAt = new Date(challenge.startsAt || '');
  const endsAt = new Date(challenge.endsAt || '');

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return CHALLENGE_STATUS.ENDED;
  }

  if (now.getTime() < startsAt.getTime()) return CHALLENGE_STATUS.UPCOMING;
  if (now.getTime() >= endsAt.getTime()) return CHALLENGE_STATUS.ENDED;
  return CHALLENGE_STATUS.ACTIVE;
};

export const isChallengeJoinOpen = (
  challenge: { joinClosesAt?: string | null },
  now = new Date()
) => {
  const joinClosesAt = new Date(challenge.joinClosesAt || '');
  return !Number.isNaN(joinClosesAt.getTime()) && now.getTime() < joinClosesAt.getTime();
};

export const formatChallengeProgress = (progress: number | string | null | undefined, target: number | string | null | undefined) => {
  const progressValue = toNumber(progress).toFixed(1);
  const targetValue = toNumber(target).toFixed(0);
  return `${progressValue}/${targetValue}`;
};

export const formatChallengeRank = (rank: number | null | undefined) => (
  rank ? `#${rank}` : '-'
);

export const mapChallengeSummaryRow = (row: ChallengeSummaryRow): ChallengeSummary => {
  const mapped = {
    id: toStringOrNull(row.id) || 'unknown',
    slug: toStringOrNull(row.slug) || 'unknown',
    title: toStringOrNull(row.title) || 'Challenge',
    description: toStringOrNull(row.description) || '',
    metricType: toMetricType(row.metric_type),
    targetValue: toNumber(row.target_value),
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

export const mapChallengeLeaderboardRow = (row: ChallengeLeaderboardRow): ChallengeLeaderboardEntry => ({
  rank: toInteger(row.rank),
  userId: toStringOrNull(row.user_id) || 'unknown',
  username: toStringOrNull(row.username),
  avatarUrl: toStringOrNull(row.avatar_url),
  progressValue: toNumber(row.progress_value),
  completed: row.completed === true,
});

export const mapChallengeDetailRow = (row: ChallengeDetailRow): ChallengeDetail => ({
  ...mapChallengeSummaryRow(row),
  leaderboard: (row.leaderboard || []).map(mapChallengeLeaderboardRow),
});
```

- [ ] **Step 2: Run the test to verify helper assertions pass and API is still missing**

Run:

```bash
npm run test:challenges
```

Expected: FAIL with `challenge API module should exist`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/challenges.ts
git commit -m "feat: add challenge mapping helpers"
```

## Task 4: Add Challenge API Wrapper

**Files:**
- Create: `src/lib/challengesApi.ts`

- [ ] **Step 1: Create `src/lib/challengesApi.ts`**

Create the file with this content:

```ts
import { supabase } from './supabase';
import {
  ChallengeDetail,
  ChallengeDetailRow,
  ChallengeSummary,
  ChallengeSummaryRow,
  mapChallengeDetailRow,
  mapChallengeSummaryRow,
} from './challenges';
import { getErrorMessage, withTimeout } from './timeouts';

const CHALLENGE_TIMEOUT_MS = 15000;

export const fetchOfficialChallenges = async (): Promise<ChallengeSummary[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_official_challenges'),
      CHALLENGE_TIMEOUT_MS,
      'Challenges are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as ChallengeSummaryRow[]).map(mapChallengeSummaryRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load challenges.'));
  }
};

export const fetchChallengeDetail = async (challengeIdOrSlug: string): Promise<ChallengeDetail> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_challenge_detail', { target_challenge_slug: challengeIdOrSlug }),
      CHALLENGE_TIMEOUT_MS,
      'Challenge leaderboard is taking too long to load.'
    );

    if (error) throw error;
    if (!data) throw new Error('Challenge not found.');

    return mapChallengeDetailRow(data as ChallengeDetailRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load challenge.'));
  }
};

export const joinChallenge = async (challengeId: string) => {
  try {
    const { error } = await withTimeout(
      supabase.rpc('join_challenge', { target_challenge_id: challengeId }),
      CHALLENGE_TIMEOUT_MS,
      'Joining the challenge is taking too long.'
    );

    if (error) throw error;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not join challenge.'));
  }
};

export const fetchJoinedActiveChallengeSummary = async (): Promise<ChallengeSummary | null> => {
  const challenges = await fetchOfficialChallenges();
  return challenges.find((challenge) => challenge.joined && challenge.status === 'active') || null;
};
```

- [ ] **Step 2: Run challenge tests**

Run:

```bash
npm run test:challenges
```

Expected: FAIL with `challenge detail screen should exist`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/challengesApi.ts
git commit -m "feat: add challenge API wrapper"
```

## Task 5: Add Challenge Detail Screen And Navigation

**Files:**
- Create: `src/screens/ChallengeDetailScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Create `src/screens/ChallengeDetailScreen.tsx`**

Create the screen with this structure:

```tsx
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Check, Trophy, Users, X } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

import { CachedImage } from '../components/CachedImage';
import { ChallengeDetail, ChallengeLeaderboardEntry, formatChallengeProgress, formatChallengeRank } from '../lib/challenges';
import { fetchChallengeDetail, joinChallenge } from '../lib/challengesApi';
import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

export const ChallengeDetailScreen = ({ navigation, route }: any) => {
  const challengeSlug = route?.params?.challengeSlug || route?.params?.challengeId || 'may-2026-15-true-pints';
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadChallenge = useCallback(async () => {
    try {
      setErrorMessage(null);
      const detail = await fetchChallengeDetail(challengeSlug);
      setChallenge(detail);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not load challenge.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [challengeSlug]);

  useFocusEffect(
    useCallback(() => {
      loadChallenge();
    }, [loadChallenge])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadChallenge();
  }, [loadChallenge]);

  const handleJoin = useCallback(async () => {
    if (!challenge || joining || challenge.joined || !challenge.joinOpen) return;

    try {
      setJoining(true);
      await joinChallenge(challenge.id);
      await loadChallenge();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not join challenge.');
    } finally {
      setJoining(false);
    }
  }, [challenge, joining, loadChallenge]);

  const renderLeader = useCallback(({ item }: { item: ChallengeLeaderboardEntry }) => (
    <View style={styles.leaderRow}>
      <Text style={styles.rankText}>{formatChallengeRank(item.rank)}</Text>
      <CachedImage
        uri={item.avatarUrl}
        fallbackUri={`https://i.pravatar.cc/150?u=${item.userId}`}
        style={styles.avatar}
        recyclingKey={`challenge-${item.userId}-${item.avatarUrl || 'fallback'}`}
        accessibilityLabel={`${item.username || 'Beer Lover'} avatar`}
      />
      <View style={styles.leaderCopy}>
        <Text style={styles.leaderName} numberOfLines={1}>{item.username || 'Beer Lover'}</Text>
        <Text style={styles.leaderMeta}>{item.completed ? 'Completed' : 'In progress'}</Text>
      </View>
      <Text style={styles.progressText}>{formatChallengeProgress(item.progressValue, challenge?.targetValue || 15)}</Text>
    </View>
  ), [challenge?.targetValue]);

  const renderHeader = useCallback(() => {
    if (!challenge) return null;

    return (
      <View style={styles.headerBlock}>
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back">
            <ArrowLeft color={colors.text} size={21} />
          </Pressable>
          <Text style={styles.screenTitle}>Challenges</Text>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Trophy color={colors.background} size={22} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>{challenge.title}</Text>
            <Text style={styles.description}>{challenge.description}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Your progress</Text>
            <Text style={styles.summaryValue}>{formatChallengeProgress(challenge.currentUserProgress, challenge.targetValue)}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Rank</Text>
            <Text style={styles.summaryValue}>{formatChallengeRank(challenge.currentUserRank)}</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryLabel}>Entered</Text>
            <Text style={styles.summaryValue}>{challenge.entrantsCount}</Text>
          </View>
        </View>

        {challenge.joined ? (
          <View style={styles.joinedBadge}>
            <Check color={colors.primary} size={15} />
            <Text style={styles.joinedText}>Joined</Text>
          </View>
        ) : challenge.joinOpen ? (
          <Pressable style={styles.joinButtonCompact} onPress={handleJoin} disabled={joining} accessibilityRole="button" accessibilityLabel="Join challenge">
            <Text style={styles.joinButtonText}>{joining ? 'Joining...' : 'Join'}</Text>
          </Pressable>
        ) : (
          <View style={styles.closedBadge}>
            <X color={colors.textMuted} size={15} />
            <Text style={styles.closedText}>Closed</Text>
          </View>
        )}

        <View style={styles.leaderboardHeading}>
          <Users color={colors.primary} size={18} />
          <Text style={styles.leaderboardTitle}>Leaderboard</Text>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    );
  }, [challenge, errorMessage, handleJoin, joining, navigation]);

  if (loading && !refreshing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={challenge?.leaderboard || []}
      keyExtractor={(item) => item.userId}
      renderItem={renderLeader}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No entrants yet</Text>
          <Text style={styles.emptyText}>Joined users will appear here.</Text>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: Platform.OS === 'web' ? 18 : 58,
    paddingHorizontal: 16,
    paddingBottom: 110,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: 4,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  screenTitle: {
    ...typography.h3,
    color: colors.text,
  },
  hero: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    padding: 14,
    ...shadows.card,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  description: {
    ...typography.bodyMuted,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryPill: {
    flex: 1,
    minHeight: 58,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 10,
  },
  summaryLabel: {
    ...typography.tiny,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  summaryValue: {
    ...typography.h3,
    color: colors.primary,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  joinButtonCompact: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    ...typography.caption,
    color: colors.background,
    fontWeight: '800',
  },
  joinedBadge: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  joinedText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '800',
  },
  closedBadge: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  closedText: {
    ...typography.tiny,
    color: colors.textMuted,
    fontWeight: '800',
  },
  leaderboardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  leaderboardTitle: {
    ...typography.h3,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  leaderRow: {
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankText: {
    width: 34,
    ...typography.h3,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
  },
  leaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  leaderName: {
    ...typography.body,
    fontWeight: '800',
  },
  leaderMeta: {
    ...typography.tiny,
    color: colors.textMuted,
  },
  progressText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyTitle: {
    ...typography.h3,
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Register the screen in `src/navigation/RootNavigator.tsx`**

Add the import:

```ts
import { ChallengeDetailScreen } from '../screens/ChallengeDetailScreen';
```

Add the stack screen after `PubLegendDetail`:

```tsx
<Stack.Screen name="ChallengeDetail" component={ChallengeDetailScreen} />
```

- [ ] **Step 3: Run challenge test**

Run:

```bash
npm run test:challenges
```

Expected: FAIL with `Pub Legends should track active segment`.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ChallengeDetailScreen.tsx src/navigation/RootNavigator.tsx
git commit -m "feat: add challenge detail screen"
```

## Task 6: Add Challenges Segment To Pub Legends

**Files:**
- Modify: `src/screens/PubLegendsScreen.tsx`

- [ ] **Step 1: Add imports**

Update imports in `src/screens/PubLegendsScreen.tsx`:

```ts
import { ChallengeSummary, formatChallengeProgress, formatChallengeRank } from '../lib/challenges';
import { fetchOfficialChallenges, joinChallenge } from '../lib/challengesApi';
```

- [ ] **Step 2: Add state near existing legends state**

```ts
const [activeSegment, setActiveSegment] = useState<'pub-legends' | 'challenges'>('pub-legends');
const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
const [challengesLoading, setChallengesLoading] = useState(false);
const [joiningChallengeIds, setJoiningChallengeIds] = useState<Set<string>>(() => new Set());
```

- [ ] **Step 3: Add challenge loading and join handlers**

Insert below `loadLegends`:

```ts
const loadChallenges = useCallback(async () => {
  try {
    setChallengesLoading(true);
    setErrorMessage(null);
    const rows = await fetchOfficialChallenges();
    setChallenges(rows);
  } catch (error) {
    console.error('Challenges fetch error:', error);
    setErrorMessage(error instanceof Error ? error.message : 'Could not load challenges.');
  } finally {
    setChallengesLoading(false);
  }
}, []);

const handleJoinChallenge = useCallback(async (challenge: ChallengeSummary) => {
  if (challenge.joined || !challenge.joinOpen || joiningChallengeIds.has(challenge.id)) return;

  setJoiningChallengeIds((previous) => new Set(previous).add(challenge.id));
  try {
    await joinChallenge(challenge.id);
    await loadChallenges();
  } catch (error) {
    console.error('Join challenge error:', error);
    setErrorMessage(error instanceof Error ? error.message : 'Could not join challenge.');
  } finally {
    setJoiningChallengeIds((previous) => {
      const next = new Set(previous);
      next.delete(challenge.id);
      return next;
    });
  }
}, [joiningChallengeIds, loadChallenges]);

const openChallenge = useCallback((challenge: ChallengeSummary) => {
  hapticLight();
  navigation.getParent()?.navigate('ChallengeDetail', { challengeSlug: challenge.slug });
}, [navigation]);
```

- [ ] **Step 4: Update focus loading**

Replace the current `useFocusEffect` callback with:

```ts
useFocusEffect(
  useCallback(() => {
    loadLegends();
    loadChallenges();
  }, [loadChallenges, loadLegends])
);
```

- [ ] **Step 5: Add segmented control to `renderHeader`**

Inside `renderHeader`, after the subtitle and before `heroStrip`, add:

```tsx
<View style={styles.segmentedControl}>
  <Pressable
    style={[styles.segmentButton, activeSegment === 'pub-legends' ? styles.segmentButtonActive : null]}
    onPress={() => setActiveSegment('pub-legends')}
    accessibilityRole="button"
    accessibilityState={{ selected: activeSegment === 'pub-legends' }}
  >
    <Text style={[styles.segmentText, activeSegment === 'pub-legends' ? styles.segmentTextActive : null]}>Pub Legends</Text>
  </Pressable>
  <Pressable
    style={[styles.segmentButton, activeSegment === 'challenges' ? styles.segmentButtonActive : null]}
    onPress={() => setActiveSegment('challenges')}
    accessibilityRole="button"
    accessibilityState={{ selected: activeSegment === 'challenges' }}
  >
    <Text style={[styles.segmentText, activeSegment === 'challenges' ? styles.segmentTextActive : null]}>Challenges</Text>
  </Pressable>
</View>
```

Add `activeSegment` to the `renderHeader` dependency array.

- [ ] **Step 6: Add challenge row renderer**

Add this renderer near `renderLegend`:

```tsx
const renderChallenge = useCallback(({ item }: { item: ChallengeSummary }) => {
  const isJoining = joiningChallengeIds.has(item.id);
  const actionLabel = item.joined ? 'Joined' : item.joinOpen ? 'Join' : 'View';

  return (
    <Pressable
      onPress={() => openChallenge(item)}
      style={({ pressed }) => [styles.challengeRow, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.entrantsCount} entrants`}
    >
      <View style={styles.challengeIcon}>
        <Trophy color={colors.primary} size={18} />
      </View>
      <View style={styles.challengeBody}>
        <Text style={styles.challengeTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.challengeMeta} numberOfLines={1}>
          {item.joined
            ? `${formatChallengeRank(item.currentUserRank)} - ${formatChallengeProgress(item.currentUserProgress, item.targetValue)}`
            : `${item.entrantsCount} entered`}
        </Text>
      </View>
      <Pressable
        style={[styles.challengeAction, item.joined ? styles.challengeActionJoined : null]}
        onPress={(event) => {
          event.stopPropagation();
          if (item.joined || !item.joinOpen) {
            openChallenge(item);
            return;
          }
          handleJoinChallenge(item);
        }}
        disabled={isJoining}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} ${item.title}`}
      >
        <Text style={[styles.challengeActionText, item.joined ? styles.challengeActionTextJoined : null]}>
          {isJoining ? '...' : actionLabel}
        </Text>
      </Pressable>
    </Pressable>
  );
}, [handleJoinChallenge, joiningChallengeIds, openChallenge]);
```

- [ ] **Step 7: Branch the list rendering**

In the return block, render one `FlatList` for legends and one for challenges:

```tsx
{activeSegment === 'pub-legends' ? (
  <FlatList
    data={legends}
    keyExtractor={(item) => item.pubKey}
    renderItem={renderLegend}
    initialNumToRender={10}
    maxToRenderPerBatch={10}
    windowSize={5}
    removeClippedSubviews={Platform.OS !== 'web'}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={[styles.listContent, legends.length === 0 ? styles.emptyContent : null]}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    ListHeaderComponent={renderHeader}
    ListEmptyComponent={
      <View style={styles.emptyState}>
        <EmptyIllustration kind="trophy" size={170} />
        <Text style={styles.emptyTitle}>{errorMessage ? 'Could not load Pub Legends' : 'No pub legends yet'}</Text>
        <Text style={styles.emptyText}>{errorMessage || 'Published sessions with pubs will appear here.'}</Text>
      </View>
    }
  />
) : (
  <FlatList
    data={challenges}
    keyExtractor={(item) => item.id}
    renderItem={renderChallenge}
    initialNumToRender={8}
    maxToRenderPerBatch={8}
    windowSize={5}
    removeClippedSubviews={Platform.OS !== 'web'}
    contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={[styles.listContent, challenges.length === 0 ? styles.emptyContent : null]}
    refreshControl={<RefreshControl refreshing={challengesLoading} onRefresh={loadChallenges} tintColor={colors.primary} />}
    ListHeaderComponent={renderHeader}
    ListEmptyComponent={
      <View style={styles.emptyState}>
        <EmptyIllustration kind="trophy" size={170} />
        <Text style={styles.emptyTitle}>{errorMessage ? 'Could not load Challenges' : 'No challenges yet'}</Text>
        <Text style={styles.emptyText}>{errorMessage || 'Official Beerva challenges will appear here.'}</Text>
      </View>
    }
  />
)}
```

- [ ] **Step 8: Add compact styles**

Add these styles:

```ts
segmentedControl: {
  minHeight: 36,
  borderRadius: radius.pill,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  padding: 3,
  flexDirection: 'row',
},
segmentButton: {
  flex: 1,
  minHeight: 28,
  borderRadius: radius.pill,
  alignItems: 'center',
  justifyContent: 'center',
},
segmentButtonActive: {
  backgroundColor: colors.primarySoft,
},
segmentText: {
  ...typography.caption,
  color: colors.textMuted,
  fontWeight: '800',
},
segmentTextActive: {
  color: colors.primary,
},
challengeRow: {
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
challengeIcon: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  alignItems: 'center',
  justifyContent: 'center',
},
challengeBody: {
  flex: 1,
  minWidth: 0,
},
challengeTitle: {
  ...typography.h3,
  color: colors.text,
},
challengeMeta: {
  ...typography.caption,
  color: colors.textMuted,
  marginTop: 2,
},
challengeAction: {
  minHeight: 30,
  borderRadius: radius.pill,
  backgroundColor: colors.primary,
  paddingHorizontal: 12,
  alignItems: 'center',
  justifyContent: 'center',
},
challengeActionJoined: {
  backgroundColor: colors.primarySoft,
  borderWidth: 1,
  borderColor: colors.primaryBorder,
},
challengeActionText: {
  ...typography.tiny,
  color: colors.background,
  fontWeight: '900',
},
challengeActionTextJoined: {
  color: colors.primary,
},
```

- [ ] **Step 9: Run challenge and Pub Legends tests**

Run:

```bash
npm run test:challenges
npm run test:pub-legends
```

Expected after this task: `test:challenges` fails with `Feed should load joined active challenge summary`; `test:pub-legends` passes.

- [ ] **Step 10: Commit**

```bash
git add src/screens/PubLegendsScreen.tsx
git commit -m "feat: add challenges to pub legends"
```

## Task 7: Add Tiny Feed Challenge Preview

**Files:**
- Modify: `src/screens/FeedScreen.tsx`

- [ ] **Step 1: Add imports**

Add:

```ts
import { ChallengeSummary, formatChallengeProgress, formatChallengeRank } from '../lib/challenges';
import { fetchJoinedActiveChallengeSummary } from '../lib/challengesApi';
```

- [ ] **Step 2: Add state**

Add near other state:

```ts
const [activeChallengeSummary, setActiveChallengeSummary] = useState<ChallengeSummary | null>(null);
```

- [ ] **Step 3: Add loader**

Add this callback:

```ts
const fetchActiveChallengeSummary = useCallback(async () => {
  try {
    const summary = await fetchJoinedActiveChallengeSummary();
    setActiveChallengeSummary(summary);
  } catch (error) {
    console.error('Active challenge summary fetch error:', error);
    setActiveChallengeSummary(null);
  }
}, []);
```

Update the existing `useFocusEffect`:

```ts
useFocusEffect(
  useCallback(() => {
    fetchSessions({ reset: true });
    fetchActiveChallengeSummary();
  }, [fetchActiveChallengeSummary, fetchSessions])
);
```

- [ ] **Step 4: Add strip renderer**

Add near `renderFeedHeader`:

```tsx
const renderChallengePreviewStrip = useCallback(() => {
  if (!activeChallengeSummary) return null;

  return (
    <TouchableOpacity
      style={styles.challengePreviewStrip}
      onPress={() => navigation.navigate('ChallengeDetail', { challengeSlug: activeChallengeSummary.slug })}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${activeChallengeSummary.title} challenge progress`}
    >
      <Trophy color={colors.primary} size={15} />
      <Text style={styles.challengePreviewText} numberOfLines={1}>
        {activeChallengeSummary.title} - {formatChallengeRank(activeChallengeSummary.currentUserRank)} - {formatChallengeProgress(activeChallengeSummary.currentUserProgress, activeChallengeSummary.targetValue)}
      </Text>
    </TouchableOpacity>
  );
}, [activeChallengeSummary, navigation]);
```

- [ ] **Step 5: Include the strip in `renderFeedHeader`**

Replace `renderFeedHeader` with:

```tsx
const renderFeedHeader = useCallback(() => {
  const pullIndicator = Platform.OS === 'web' || pullDistance || refreshing
    ? <PullIndicator pullDistance={pullDistance} refreshing={refreshing} />
    : null;
  const challengePreview = renderChallengePreviewStrip();

  if (!pullIndicator && !challengePreview) return null;

  return (
    <View style={styles.feedHeaderExtras}>
      {pullIndicator}
      {challengePreview}
    </View>
  );
}, [pullDistance, refreshing, renderChallengePreviewStrip]);
```

- [ ] **Step 6: Add compact strip styles**

Add:

```ts
feedHeaderExtras: {
  gap: 6,
  marginBottom: 6,
},
challengePreviewStrip: {
  minHeight: 34,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.surface,
  paddingHorizontal: 11,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
},
challengePreviewText: {
  ...typography.caption,
  color: colors.text,
  flex: 1,
  minWidth: 0,
  fontWeight: '800',
},
```

- [ ] **Step 7: Run challenge and feed tests**

Run:

```bash
npm run test:challenges
npm run test:feed-redesign
```

Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/screens/FeedScreen.tsx
git commit -m "feat: add compact challenge feed preview"
```

## Task 8: Full Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run challenge-specific checks**

Run:

```bash
npm run test:challenges
```

Expected:

```text
official challenge checks passed
```

- [ ] **Step 2: Run related feature guards**

Run:

```bash
npm run test:stats
npm run test:pub-crawl
npm run test:pub-legends
npm run test:feed-redesign
npm run test:app-theme-screens
npm run test:floating-nav
```

Expected:

```text
profileStats trophy tests passed
pub crawl tests passed
Pub Legends tests passed
feed card redesign checks passed
app theme screen checks passed
floating bottom nav checks passed
```

- [ ] **Step 3: Run web build**

Run:

```bash
npm run build:web
```

Expected: Expo export succeeds and writes `dist`.

- [ ] **Step 4: Commit any verification-only test adjustments**

If implementation required small source-test corrections, commit them:

```bash
git add scripts/challenges.test.js package.json
git commit -m "test: finalize official challenge guards"
```

If there are no changes, skip this commit.

## Self-Review

- Spec coverage:
  - Official-only challenge data and May seed: Task 2.
  - Retroactive true-pint scoring and all beverages: Task 2 RPC and Task 3 helper guard.
  - Everyone who enters appears on leaderboard: Task 2 leaderboard and Task 5 detail.
  - Pub Legends placement: Task 6.
  - Tiny feed preview: Task 7.
  - No bottom nav tab: Task 5 navigation guard.
  - Professional compact visual style: Task 5, Task 6, Task 7 styles and source guard.
- Completion scan:
  - No unresolved markers.
  - Optional future enhancements are not implementation steps.
- Type consistency:
  - `ChallengeSummaryRow`, `ChallengeSummary`, `ChallengeDetailRow`, and `ChallengeDetail` flow from `src/lib/challenges.ts` into API, Pub Legends, Detail, and Feed.
  - Route param is consistently `challengeSlug`.
