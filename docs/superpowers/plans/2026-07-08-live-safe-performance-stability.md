# Live-Safe Performance And Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Beerva feed speed, record-session responsiveness, database stability, and rollout safety without removing or changing existing user-facing features.

**Architecture:** Make small, reversible changes around the current behavior. First lock behavior with tests, then extract large screen logic behind identical interfaces, then add faster rendering/data paths with old paths kept as fallbacks until verified. Database changes are query-plan-driven and additive only.

**Tech Stack:** Expo React Native, React 19, Supabase Postgres/RPC, TypeScript, Node source-level regression scripts, optional `@shopify/flash-list` installed through Expo.

---

## Current Baseline

Graphify and source inspection identified these main pressure points:

- `src/screens/FeedScreen.tsx` is the largest feed hub and owns fetching, hydration, mentions, list rendering, comments, cheers, pub crawls, official posts, live mates, and modals.
- `src/screens/RecordScreen.tsx` is another large hub and still does some independent active-session work sequentially.
- `src/lib/pubCrawlsApi.ts` hydrates pub crawl feed posts through multiple batched queries. This is already safer than per-row loading, but it remains a good later RPC candidate.
- `src/lib/timeouts.ts` already provides timeout/retry helpers. New network code should use the same path instead of inventing local timeout behavior.
- `src/components/CachedImage.tsx` already uses `expo-image`; do not replace that system.
- The earlier `docs/superpowers/plans/2026-06-02-feed-performance.md` work already introduced cached auth/session feed-detail patterns and related scripts. This plan builds on that, not around it.

## Feature Preservation Rules

These are release blockers if violated:

- Feed pagination must keep the current append-only behavior: never re-sort already-shown items on infinite scroll.
- Pub crawl posts, ordinary sessions, chug attempts, official posts, comments, cheers, mentions, live mates, profile navigation, image viewer, edit/delete, notifications, and trophy modals must keep working.
- Suspicious or ignored drinks must remain visible in feed/profile/history breakdowns.
- `excluded_from_stats` must remain excluded from stats, leaderboards, challenges, and trophy calculations.
- `IgnoredDrinkBadge` behavior must stay centralized in `src/components/IgnoredDrinkBadge.tsx`.
- No destructive migrations. All Supabase changes must be additive and reversible.
- Every new faster path must keep the old path available until production-like smoke testing passes.

## External References

- Expo FlashList docs: `https://docs.expo.dev/versions/latest/sdk/flash-list/`
- Shopify FlashList docs: `https://shopify.github.io/flash-list/docs/`

Use `npx expo install @shopify/flash-list` when the FlashList phase begins. Expo currently lists FlashList as an Expo-compatible package and recommends installing it through Expo.

---

## File Structure

### Create

- `scripts/liveSafePerformance.test.js`
  - Source-level guardrail checks for the rollout plan: feature boundaries, feed append behavior, new extracted modules, FlashList fallback, and record-screen parallelism.
- `src/lib/feedTypes.ts`
  - Shared `FeedSession` and `FeedItem` types moved out of `FeedScreen`.
- `src/lib/feedApi.ts`
  - Extracted feed-page data loader. It returns the same feed item shape the screen already renders.
- `src/components/FeedList.tsx`
  - List wrapper that can use FlashList on native and FlatList as fallback.
- `scripts/feedApi.test.js`
  - Mapper and source-level tests for `feedApi`.
- `scripts/feedList.test.js`
  - Source-level tests for `FeedList` fallback behavior.
- `scripts/recordScreenPerformance.test.js`
  - Source-level tests for `RecordScreen` memoization and independent fetch parallelism.
- `supabase/migrations/20260708120000_add_feed_query_plan_helpers.sql`
  - Query-analysis helper comments or index additions only after EXPLAIN evidence is captured.

### Modify

- `package.json`
  - Add scripts for the new regression tests.
  - Add `@shopify/flash-list` only in the FlashList phase.
- `src/screens/FeedScreen.tsx`
  - Move feed types to `src/lib/feedTypes.ts`.
  - Move page fetch/hydration to `src/lib/feedApi.ts`.
  - Replace only the main feed `FlatList` with `FeedList`; keep modal `FlatList`s unchanged unless later testing proves they need migration.
- `src/screens/RecordScreen.tsx`
  - Memoize pub option labels.
  - Load active-session photos, beers, and active pub crawl state in parallel.
- `src/lib/pubCrawlsApi.ts`
  - Keep current behavior. Add RPC fallback only after query-plan evidence and API tests exist.
- `supabase/migrations/*`
  - Add only additive, query-plan-backed indexes or RPCs. Do not edit old migrations unless a test requires a source-level assertion update.

### Intentionally Unchanged

- `src/components/CachedImage.tsx`
  - Already uses `expo-image` and should remain the image abstraction.
- `src/components/IgnoredDrinkBadge.tsx`
  - No behavior change in this plan.
- `src/lib/feedPagination.ts`
  - Keep `appendFeedPage` as the authority for infinite-scroll append behavior.
- Existing stats/trophy logic
  - Do not move this server-side until the feed/record refactors are stable.

---

## Release Slices

Each task should be one PR or one clean checkpoint. Do not batch multiple release slices into one deployment.

### Task 1: Add Live-Safe Guardrail Tests

**Files:**
- Create: `scripts/liveSafePerformance.test.js`
- Modify: `package.json`
- Test: `scripts/liveSafePerformance.test.js`

- [ ] **Step 1: Create the guardrail test**

Create `scripts/liveSafePerformance.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const feedScreen = read('src/screens/FeedScreen.tsx');
const recordScreen = read('src/screens/RecordScreen.tsx');
const feedPagination = read('src/lib/feedPagination.ts');
const pubCrawls = read('src/lib/pubCrawls.ts');
const pubCrawlCard = read('src/components/PubCrawlFeedCard.tsx');
const profileStatsApi = read('src/lib/profileStatsApi.ts');

assert.match(
  feedPagination,
  /export const appendFeedPage/,
  'appendFeedPage remains the feed pagination authority'
);

assert.match(
  feedScreen,
  /appendFeedPage\(previous,\s*merged\)/,
  'FeedScreen keeps append-only pagination for infinite scroll'
);

assert.match(
  pubCrawls,
  /calculatePubCrawlSummary/,
  'pub crawl visible summaries remain centralized'
);

assert.match(
  pubCrawlCard,
  /getStopDrinkCount/,
  'pub crawl stop display counts remain explicit'
);

assert.match(
  pubCrawlCard,
  /IgnoredDrinkBadge/,
  'pub crawl feed cards keep showing ignored-drink badges'
);

assert.match(
  profileStatsApi,
  /filter\(\(beer\) => !beer\.excluded_from_stats\)/,
  'profile stats still exclude ignored drinks from stats paths'
);

assert.ok(
  exists('src/lib/feedTypes.ts'),
  'feed types should be moved into src/lib/feedTypes.ts before FeedScreen extraction is considered complete'
);

assert.ok(
  exists('src/lib/feedApi.ts'),
  'feed page loading should be extracted into src/lib/feedApi.ts'
);

assert.ok(
  exists('src/components/FeedList.tsx'),
  'main feed list should be wrapped in a fallback-capable FeedList component'
);

assert.match(
  feedScreen,
  /<FeedList/,
  'main feed rendering should go through FeedList after the list migration'
);

assert.match(
  recordScreen,
  /useMemo\(\(\) => pubOptions\.map\(formatPubLabel\), \[pubOptions\]\)/,
  'RecordScreen should memoize pub option labels'
);

assert.doesNotMatch(
  recordScreen,
  /data=\{pubOptions\.map\(formatPubLabel\)\}/,
  'RecordScreen should not remap pub option labels inside AutocompleteInput props'
);

assert.match(
  recordScreen,
  /Promise\.all\(\[[\s\S]*fetchActiveSessionPhotos\(session\)[\s\S]*fetchSessionBeers\(session\.id\)[\s\S]*fetchActivePubCrawl\(\)/,
  'RecordScreen should load independent active-session details in parallel'
);
```

- [ ] **Step 2: Add the script**

Add this entry to `package.json` under `scripts`:

```json
"test:live-safe-performance": "node scripts/liveSafePerformance.test.js"
```

- [ ] **Step 3: Run the new test and confirm it fails for planned work**

Run:

```powershell
npm run test:live-safe-performance
```

Expected:

```text
FAIL before implementation because src/lib/feedTypes.ts, src/lib/feedApi.ts, and src/components/FeedList.tsx do not exist yet.
```

- [ ] **Step 4: Commit**

```powershell
git add package.json scripts/liveSafePerformance.test.js
git commit -m "test: add live-safe performance guardrails"
```

---

### Task 2: Extract Feed Types Without Changing Behavior

**Files:**
- Create: `src/lib/feedTypes.ts`
- Modify: `src/screens/FeedScreen.tsx`
- Test: `scripts/liveSafePerformance.test.js`, `scripts/feedPagination.test.js`, `scripts/sessionFeedDetails.test.js`, `scripts/pubCrawl.test.js`

- [ ] **Step 1: Move feed item types**

Create `src/lib/feedTypes.ts` by moving the existing exported `FeedSession` and `FeedItem` type definitions out of `src/screens/FeedScreen.tsx`.

The file must import these existing types:

```ts
import { ContentMention } from './mentions';
import { OfficialFeedPost } from './officialFeedPosts';
import { PubCrawl } from './pubCrawls';
import { SessionBeer } from './sessionBeers';
import { SessionBuddy } from './sessionBuddies';
import { SessionChugAttempt } from './chugAttempts';
import { SessionPhoto } from './sessionPhotos';
```

The exported type names must remain and should be copied with this shape:

```ts
type ProfilePreview = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

export type FeedComment = {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  profiles?: ProfilePreview | null;
  mentions?: ContentMention[];
};

export type FeedSession = {
  id: string;
  user_id: string;
  pub_id?: string | null;
  pub_name: string;
  beer_name: string;
  volume: string | null;
  quantity: number | null;
  abv: number | null;
  comment: string | null;
  image_url: string | null;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  published_at?: string | null;
  edited_at?: string | null;
  hangover_score?: number | null;
  created_at: string;
  session_beers: SessionBeer[];
  session_photos: SessionPhoto[];
  session_chug_attempts: SessionChugAttempt[];
  drinking_buddies: SessionBuddy[];
  units?: number | null;
  profiles?: {
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  author_current_streak?: number | null;
  cheer_profiles: ProfilePreview[];
  comments: FeedComment[];
  mentions?: ContentMention[];
  comments_count: number;
  cheers_count: number;
  has_cheered: boolean;
};

export type FeedItem =
  | { type: 'session'; id: string; publishedAt: string; session: FeedSession }
  | { type: 'pub_crawl'; id: string; publishedAt: string; crawl: PubCrawl }
  | { type: 'official_post'; id: string; publishedAt: string; post: OfficialFeedPost };
```

- [ ] **Step 2: Import the moved types in FeedScreen**

In `src/screens/FeedScreen.tsx`, remove the local exported `FeedSession` and `FeedItem` type blocks and add:

```ts
import { FeedItem, FeedSession } from '../lib/feedTypes';
```

- [ ] **Step 3: Run type and behavior checks**

Run:

```powershell
npx tsc --noEmit
npm run test:feed-pagination
npm run test:session-feed-details
npm run test:pub-crawl
```

Expected:

```text
All commands pass. Feed behavior is unchanged because only type ownership moved.
```

- [ ] **Step 4: Commit**

```powershell
git add src/lib/feedTypes.ts src/screens/FeedScreen.tsx
git commit -m "refactor: move feed item types out of feed screen"
```

---

### Task 3: Extract Feed Page Loading Behind The Same Output Shape

**Files:**
- Create: `src/lib/feedApi.ts`
- Create: `scripts/feedApi.test.js`
- Modify: `src/screens/FeedScreen.tsx`
- Modify: `package.json`
- Test: `scripts/feedApi.test.js`, existing feed/session/pub-crawl scripts

- [ ] **Step 1: Add source-level feed API tests**

Create `scripts/feedApi.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const feedApi = read('src/lib/feedApi.ts');
const feedScreen = read('src/screens/FeedScreen.tsx');

assert.match(feedApi, /export type FetchFeedPageArgs/, 'feedApi exposes FetchFeedPageArgs');
assert.match(feedApi, /export type FetchFeedPageResult/, 'feedApi exposes FetchFeedPageResult');
assert.match(feedApi, /export const fetchFeedPage/, 'feedApi exposes fetchFeedPage');
assert.match(feedApi, /fetchSessionFeedDetails/, 'feedApi keeps optimized session detail hydration');
assert.match(feedApi, /fetchPublishedPubCrawlsForFeedPage/, 'feedApi keeps pub crawl feed posts');
assert.match(feedApi, /fetchOfficialFeedPostsForFeedPage/, 'feedApi keeps official feed posts');
assert.match(feedApi, /fetchContentMentionsForSources/, 'feedApi keeps mention hydration');
assert.match(feedApi, /withTimeout/, 'feedApi uses the shared timeout helper');
assert.match(feedApi, /sortFeedItemsByPublishedAt/, 'feedApi sorts each new page before screen append');
assert.match(feedScreen, /fetchFeedPage\(/, 'FeedScreen delegates page loading to feedApi');
assert.match(feedScreen, /appendFeedPage\(previous,\s*result\.items\)/, 'FeedScreen keeps append-only page merge');
```

Add this script to `package.json`:

```json
"test:feed-api": "node scripts/feedApi.test.js"
```

- [ ] **Step 2: Create the feed API contract**

Create `src/lib/feedApi.ts` with this public contract:

```ts
import { supabase } from './supabase';
import { getCurrentUser } from './authSession';
import { fetchSessionFeedDetails, SessionFeedDetail } from './sessionFeedDetails';
import { sortFeedItemsByPublishedAt } from './feedPagination';
import { getErrorMessage, withTimeout } from './timeouts';
import { fetchPublishedPubCrawlsForFeedPage } from './pubCrawlsApi';
import { fetchContentMentionsForSources } from './mentions';
import { fetchOfficialFeedPostsForFeedPage, fetchOfficialPostLinkedChallengeSummaries } from './officialFeedPostsApi';
import { fetchSessionBuddySummaries } from './sessionBuddies';
import { mapChugAttemptRow, SessionChugAttempt, SessionChugAttemptRow } from './chugAttempts';
import { FeedItem } from './feedTypes';
import { ChallengeSummary } from './challenges';

export type FetchFeedPageArgs = {
  sessionOffset: number;
  crawlOffset: number;
  officialOffset: number;
  pageSize: number;
  timeoutMs: number;
};

export type FetchFeedPageResult = {
  items: FeedItem[];
  currentUserId: string | null;
  followedUserCount: number;
  hasMore: boolean;
  loadedSessionCount: number;
  loadedCrawlCount: number;
  loadedOfficialPostCount: number;
  officialPostChallengesById: Map<string, ChallengeSummary>;
};

export const fetchFeedPage = async (args: FetchFeedPageArgs): Promise<FetchFeedPageResult> => (
  fetchFeedPageViaClientHydration(args)
);
```

Add `fetchFeedPageViaClientHydration` below the public function in the same file. It owns the current data-loading statements from `FeedScreen.fetchSessions` in this order:

- cached user lookup through `getCurrentUser()`;
- follows query and `feedUserIds` construction;
- parallel page fetch for sessions, pub crawls, and official posts;
- session detail, chug, buddy, and official challenge hydration;
- comment and post mention hydration;
- `sortFeedItemsByPublishedAt([...hydratedPageSessions, ...hydratedPageCrawls, ...pageOfficialPosts])`;
- return of `FetchFeedPageResult`.

`FeedScreen` keeps only request-id checks, loading state, ref counters, and `appendFeedPage`.

- [ ] **Step 3: Wire FeedScreen to the extracted function**

In `src/screens/FeedScreen.tsx`, `fetchSessions` should keep request-id, loading, refresh, and append state ownership, but delegate the network/hydration work:

```ts
const result = await fetchFeedPage({
  sessionOffset,
  crawlOffset,
  officialOffset,
  pageSize: FEED_PAGE_SIZE,
  timeoutMs: FEED_REQUEST_TIMEOUT_MS,
});

if (!isLatestRequest()) return;

setCurrentUserId(result.currentUserId);
setFollowedUserCount(result.followedUserCount);
loadedSessionCountRef.current = sessionOffset + result.loadedSessionCount;
loadedCrawlCountRef.current = crawlOffset + result.loadedCrawlCount;
loadedOfficialPostCountRef.current = officialOffset + result.loadedOfficialPostCount;
setHasMore(result.hasMore);
hasMoreRef.current = result.hasMore;
setOfficialPostChallengesById((previous) => {
  const next = reset ? new Map<string, ChallengeSummary>() : new Map(previous);
  result.officialPostChallengesById.forEach((challenge, id) => next.set(id, challenge));
  return next;
});

setSessions((previous) => {
  const nextSessions = reset ? result.items : appendFeedPage(previous, result.items);
  sessionsRef.current = nextSessions;
  return nextSessions;
});
```

- [ ] **Step 4: Run checks**

Run:

```powershell
npm run test:feed-api
npm run test:feed-pagination
npm run test:session-feed-details
npm run test:pub-crawl
npm run test:official-posts
npm run test:mentions
npx tsc --noEmit
```

Expected:

```text
All commands pass. Feed order, page append behavior, session details, pub crawls, official posts, and mentions remain covered.
```

- [ ] **Step 5: Manual smoke test**

Run:

```powershell
npm run web
```

Smoke:

- Load feed.
- Refresh feed.
- Scroll until another page loads.
- Open comments and cheers for a session.
- Open comments and cheers for a pub crawl.
- Open an official post challenge action.
- Open a profile from each feed item type.

- [ ] **Step 6: Commit**

```powershell
git add package.json scripts/feedApi.test.js src/lib/feedApi.ts src/screens/FeedScreen.tsx
git commit -m "refactor: extract feed page loading"
```

---

### Task 4: Make RecordScreen Faster Without Changing The Flow

**Files:**
- Create: `scripts/recordScreenPerformance.test.js`
- Modify: `package.json`
- Modify: `src/screens/RecordScreen.tsx`
- Test: `scripts/recordScreenPerformance.test.js`, record/session/pub-crawl scripts

- [ ] **Step 1: Add the test**

Create `scripts/recordScreenPerformance.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/screens/RecordScreen.tsx'), 'utf8');

assert.match(source, /useMemo/, 'RecordScreen imports and uses useMemo');
assert.match(
  source,
  /const pubOptionLabels = useMemo\(\(\) => pubOptions\.map\(formatPubLabel\), \[pubOptions\]\);/,
  'RecordScreen memoizes pub option labels'
);
assert.doesNotMatch(
  source,
  /data=\{pubOptions\.map\(formatPubLabel\)\}/,
  'AutocompleteInput props reuse memoized pub option labels'
);
assert.match(
  source,
  /const \[, , nextActiveCrawl\] = await Promise\.all\(\[[\s\S]*fetchActiveSessionPhotos\(session\),[\s\S]*fetchSessionBeers\(session\.id\),[\s\S]*session\.pub_crawl_id \? fetchActivePubCrawl\(\) : Promise\.resolve\(null\),[\s\S]*\]\);/,
  'active session photos, beers, and active crawl are loaded in parallel'
);
assert.match(
  source,
  /\}, \[fetchActivePubCrawl, fetchActiveSessionPhotos, fetchSessionBeers, resetActiveState\]\);/,
  'fetchActiveSession dependencies include fetchActivePubCrawl'
);
```

Add this script to `package.json`:

```json
"test:record-performance": "node scripts/recordScreenPerformance.test.js"
```

- [ ] **Step 2: Memoize pub option labels**

Change the React import in `src/screens/RecordScreen.tsx` to include `useMemo`:

```ts
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
```

Replace:

```ts
const pubOptionLabels = pubOptions.map(formatPubLabel);
```

with:

```ts
const pubOptionLabels = useMemo(() => pubOptions.map(formatPubLabel), [pubOptions]);
```

Replace every `data={pubOptions.map(formatPubLabel)}` in `AutocompleteInput` with:

```tsx
data={pubOptionLabels}
```

- [ ] **Step 3: Parallelize active-session detail loading**

In `fetchActiveSession`, replace:

```ts
await fetchActiveSessionPhotos(session);
await fetchSessionBeers(session.id);
if (session.pub_crawl_id) {
  setActiveCrawl(await fetchActivePubCrawl());
} else {
  setActiveCrawl(null);
}
```

with:

```ts
const [, , nextActiveCrawl] = await Promise.all([
  fetchActiveSessionPhotos(session),
  fetchSessionBeers(session.id),
  session.pub_crawl_id ? fetchActivePubCrawl() : Promise.resolve(null),
]);
setActiveCrawl(nextActiveCrawl);
```

Update the callback dependency list to:

```ts
}, [fetchActivePubCrawl, fetchActiveSessionPhotos, fetchSessionBeers, resetActiveState]);
```

- [ ] **Step 4: Run checks**

Run:

```powershell
npm run test:record-performance
npm run test:record-session-drinks
npm run test:session-photos
npm run test:pub-crawl
npm run test:chugs
npx tsc --noEmit
```

Expected:

```text
All commands pass. Starting, resuming, editing, publishing, and pub-crawl active-session loading keep the same behavior.
```

- [ ] **Step 5: Commit**

```powershell
git add package.json scripts/recordScreenPerformance.test.js src/screens/RecordScreen.tsx
git commit -m "perf: parallelize active session loading"
```

---

### Task 5: Add FeedList With FlatList Fallback

**Files:**
- Create: `src/components/FeedList.tsx`
- Create: `scripts/feedList.test.js`
- Modify: `package.json`
- Modify: `src/screens/FeedScreen.tsx`
- Test: `scripts/feedList.test.js`, feed scripts

- [ ] **Step 1: Install FlashList through Expo**

Run:

```powershell
npx expo install @shopify/flash-list
```

Expected:

```text
package.json and package-lock.json update with an Expo-compatible @shopify/flash-list version.
```

- [ ] **Step 2: Add the test**

Create `scripts/feedList.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const feedList = read('src/components/FeedList.tsx');
const feedScreen = read('src/screens/FeedScreen.tsx');
const packageJson = JSON.parse(read('package.json'));

assert.ok(packageJson.dependencies['@shopify/flash-list'], 'FlashList dependency is installed');
assert.match(feedList, /import \{ FlashList \} from '@shopify\/flash-list'/, 'FeedList imports FlashList');
assert.match(feedList, /FlatList/, 'FeedList keeps FlatList fallback');
assert.match(feedList, /Platform\.OS === 'web'/, 'FeedList keeps web on FlatList fallback');
assert.match(feedList, /getItemType/, 'FeedList exposes item type recycling support');
assert.match(feedScreen, /import \{ FeedList \} from '\.\.\/components\/FeedList'/, 'FeedScreen imports FeedList');
assert.match(feedScreen, /<FeedList/, 'FeedScreen renders the main feed through FeedList');
assert.match(feedScreen, /getItemType=\{\(item\) => item\.type\}/, 'FeedScreen gives FlashList stable item types');
assert.match(feedScreen, /<FlatList[\s\S]*commentsModal/, 'FeedScreen modal lists stay on FlatList in this phase');
```

Add this script to `package.json`:

```json
"test:feed-list": "node scripts/feedList.test.js"
```

- [ ] **Step 3: Create FeedList**

Create `src/components/FeedList.tsx`:

```tsx
import React from 'react';
import { FlatList, FlatListProps, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';

type FeedListProps<ItemT> = FlatListProps<ItemT> & {
  getItemType?: (item: ItemT, index: number) => string | number | undefined;
};

export const FeedList = React.forwardRef<FlatList<any>, FeedListProps<any>>(
  ({ getItemType, ...props }, ref) => {
    if (Platform.OS === 'web') {
      return <FlatList ref={ref} {...props} />;
    }

    return (
      <FlashList
        ref={ref as any}
        {...props}
        getItemType={getItemType as any}
      />
    );
  }
);

FeedList.displayName = 'FeedList';
```

- [ ] **Step 4: Use FeedList only for the main feed**

In `src/screens/FeedScreen.tsx`, keep `FlatList` imported because modal lists still use it. Add:

```ts
import { FeedList } from '../components/FeedList';
```

Replace only the main feed list:

```tsx
<FlatList
```

with:

```tsx
<FeedList
```

Add the item type prop:

```tsx
getItemType={(item) => item.type}
```

Do not migrate the comments modal or cheers modal lists in this task.

- [ ] **Step 5: Run checks**

Run:

```powershell
npm run test:feed-list
npm run test:feed-api
npm run test:feed-pagination
npm run test:session-feed-details
npm run test:pub-crawl
npm run test:official-posts
npx tsc --noEmit
npm run build:web
```

Expected:

```text
All commands pass. Web still uses FlatList. Native main feed uses FlashList.
```

- [ ] **Step 6: Manual native smoke test**

Run:

```powershell
npm run android
```

Smoke:

- Feed renders without blank rows.
- Refresh works.
- Infinite scroll loads more items.
- Feed does not jump when appending another page.
- Pub crawl cards expand and collapse.
- Comments and cheers modals still open.
- Pull-to-refresh custom gesture still works.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json scripts/feedList.test.js src/components/FeedList.tsx src/screens/FeedScreen.tsx
git commit -m "perf: render native feed through FlashList"
```

---

### Task 6: Standardize New Network Failure Behavior

**Files:**
- Modify: `src/lib/feedApi.ts`
- Modify: `src/lib/pubCrawlsApi.ts` only if new calls are added there
- Test: `scripts/timeouts.test.js`, feed/pub-crawl scripts

- [ ] **Step 1: Keep shared timeout helpers on all new calls**

Confirm new network calls added in this plan use:

```ts
withTimeout(operation, timeoutMs, 'Specific user-facing timeout message.')
```

or:

```ts
withRetryableTimeout(() => operation, timeoutMs, attempts, 'Specific user-facing timeout message.')
```

Do not add local `setTimeout`, `Promise.race`, or duplicate timeout classes.

- [ ] **Step 2: Run checks**

Run:

```powershell
npm run test:timeouts
npm run test:feed-api
npm run test:pub-crawl
npx tsc --noEmit
```

Expected:

```text
All commands pass. New network code uses the existing timeout primitives.
```

- [ ] **Step 3: Commit only if code changed**

```powershell
git add src/lib/feedApi.ts src/lib/pubCrawlsApi.ts
git commit -m "refactor: reuse shared timeout helpers in feed paths"
```

---

### Task 7: Add Query-Plan-Backed Database Improvements Only

**Files:**
- Create: `supabase/migrations/20260708120000_add_feed_query_plan_helpers.sql`
- Modify: relevant `scripts/*.test.js` only after concrete SQL is chosen
- Test: query-specific scripts and Supabase SQL review

- [ ] **Step 1: Capture query plans before writing indexes**

Run EXPLAIN in Supabase SQL editor or local linked database for these queries:

```sql
explain (analyze, buffers)
select id, user_id, pub_id, pub_name, status, published_at, created_at
from public.sessions
where user_id = any(array['00000000-0000-0000-0000-000000000000']::uuid[])
  and status = 'published'
  and hide_from_feed = false
order by published_at desc nulls last
limit 21;

explain (analyze, buffers)
select id, user_id, status, published_at, created_at
from public.pub_crawls
where user_id = any(array['00000000-0000-0000-0000-000000000000']::uuid[])
  and status = 'published'
order by published_at desc nulls last
limit 21;

explain (analyze, buffers)
select id, session_id, beer_name, excluded_from_stats, consumed_at
from public.session_beers
where session_id = any(array['00000000-0000-0000-0000-000000000000']::uuid[])
order by consumed_at asc;
```

Replace the zero UUID with real non-sensitive IDs in the SQL editor. Do not commit real user IDs.

- [ ] **Step 2: Decide based on evidence**

Only add an index when the plan shows sequential scans, excessive heap reads, or sort pressure on a hot path not covered by an existing index.

Acceptable migration pattern:

```sql
create index concurrently if not exists sessions_feed_user_published_idx
on public.sessions (user_id, published_at desc)
where status = 'published' and hide_from_feed = false;
```

If an equivalent index already exists, do not add another one.

- [ ] **Step 3: Test migration structure**

If a migration is added, update the closest existing script such as `scripts/sessionFeedDetails.test.js`, `scripts/pubCrawl.test.js`, or `scripts/profileStats.test.js` with exact source assertions for:

```js
assert.match(sql, /create index concurrently if not exists/i);
assert.match(sql, /where status = 'published'/i);
```

- [ ] **Step 4: Run checks**

Run:

```powershell
npm run test:session-feed-details
npm run test:pub-crawl
npm run test:stats
npx tsc --noEmit
```

Expected:

```text
All commands pass. Any new index is justified by a captured query plan and is additive.
```

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/20260708120000_add_feed_query_plan_helpers.sql scripts
git commit -m "perf: add query-plan-backed feed indexes"
```

---

### Task 8: Prepare Server-Side Feed Hydration As A Separate Dark-Launched Path

**Files:**
- Create only after Tasks 1-7 pass: a new plan or spec for a feed RPC
- Modify later: `src/lib/feedApi.ts`, `supabase/migrations/*`, scripts

- [ ] **Step 1: Do not start this until the client extraction has shipped**

Gate:

```powershell
npm run test:live-safe-performance
npm run test:feed-api
npm run test:feed-list
npm run test:record-performance
npm run test:session-feed-details
npm run test:pub-crawl
npm run test:official-posts
npm run test:mentions
npm run test:timeouts
npx tsc --noEmit
npm run build:web
```

Expected:

```text
All commands pass before server-side feed hydration work begins.
```

- [ ] **Step 2: Keep RPC behind fallback**

The later RPC path must have this shape in `src/lib/feedApi.ts`:

```ts
const USE_FEED_PAGE_RPC = false;

export const fetchFeedPage = async (args: FetchFeedPageArgs): Promise<FetchFeedPageResult> => {
  if (USE_FEED_PAGE_RPC) {
    try {
      return await fetchFeedPageViaRpc(args);
    } catch (error) {
      console.error('Feed page RPC failed, falling back to client hydration:', getErrorMessage(error));
    }
  }

  return fetchFeedPageViaClientHydration(args);
};
```

The default must remain `false` until RPC output has been compared against the client hydration output.

- [ ] **Step 3: Compare outputs before enabling**

Add a script that feeds representative session, pub crawl, official post, comment, cheer, mention, buddy, and chug rows through both mappers and asserts identical `FeedItem` output.

Minimum command set when that later work exists:

```powershell
npm run test:feed-api
npm run test:session-feed-details
npm run test:pub-crawl
npm run test:official-posts
npm run test:mentions
npm run test:chug-feed
npx tsc --noEmit
```

Expected:

```text
RPC and fallback output match before USE_FEED_PAGE_RPC can be switched on.
```

---

## Final Verification Before Any Production Release

Run:

```powershell
npm run test:live-safe-performance
npm run test:feed-api
npm run test:feed-list
npm run test:record-performance
npm run test:feed-pagination
npm run test:session-feed-details
npm run test:pub-crawl
npm run test:official-posts
npm run test:mentions
npm run test:timeouts
npm run test:record-session-drinks
npm run test:session-photos
npm run test:chugs
npm run test:chug-feed
npm run test:challenges
npm run test:stats
npx tsc --noEmit
npm run build:web
```

Manual smoke:

- Existing user signs in.
- Feed cold-loads.
- Pull-to-refresh works.
- Infinite scroll appends without jumping.
- Ordinary session card opens comments, cheers, image viewer, profile, edit, and delete.
- Pub crawl card opens comments, cheers, profile, image viewer, route/stops, and ignored-drink badges.
- Official post card still opens linked challenge actions.
- Record screen resumes an active ordinary session.
- Record screen resumes an active pub crawl stop.
- Session publish unlocks the same trophies as before.
- Pub crawl publish unlocks the same trophies as before.
- Profile stats still exclude ignored drinks.
- Feed/profile/history still show ignored drinks with the shared badge.
- Web build serves without blank feed rows.
- Android native feed scrolls smoothly and does not show blank recycled rows.

## Rollback Plan

- If Task 3 extraction breaks feed behavior, revert only the feed API PR. No schema change is involved.
- If Task 4 breaks record flow, revert only the RecordScreen performance PR.
- If Task 5 causes list rendering issues, change `FeedScreen` back to the main `FlatList` and keep `FeedList` unused until fixed.
- If Task 7 indexes hurt write performance, drop the new index in a follow-up migration. Never edit an already-applied production migration.
- If Task 8 RPC output differs from fallback output, keep `USE_FEED_PAGE_RPC = false` and ship no user-visible change.

## Completion Criteria

This rollout is complete when:

- All final verification commands pass.
- Manual smoke passes on web and Android.
- Feed and record-screen changes are deployed in separate reversible PRs.
- No existing feature listed in the Feature Preservation Rules regresses.
- Any database change has a captured before/after query plan and an additive rollback path.
