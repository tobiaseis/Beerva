# Post "Seen By" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the author of a session post or pub crawl post see who has seen it ("Seen by 12 people" → tap → list of mates with "Seen 2h ago").

**Architecture:** The feed list reports which cards are on screen via the built-in `onViewableItemsChanged` / `viewabilityConfig` support in both `FlatList` (PWA, react-native-web 0.21) and `FlashList` v2 (native). A small client recorder dedupes and batches seen post ids and flushes them every few seconds (and on blur/background) to a `record_post_views` RPC. Two new tables (`session_views`, `pub_crawl_views`) store one row per viewer per post. Read access goes through two author-only RPCs: a count RPC hydrated into the feed page, and a viewer list RPC that a new "Seen by" modal calls on demand.

**Tech Stack:** Expo React Native + react-native-web PWA, TypeScript, Supabase Postgres (tables, RLS, `security definer` RPCs), existing Node assertion test scripts in `scripts/`.

---

## Product Decisions Baked Into This Plan

Change these before executing if you disagree. Each one is isolated to the task named.

| Decision | Default in this plan | Where to change |
| --- | --- | --- |
| What counts as "seen" | At least 50% of the card on screen for at least 1 second, while the Feed tab is focused and the app is in the foreground. Opening the post page (for example from a notification) also counts. | `POST_VIEWABILITY_CONFIG` in Task 3 |
| Who can see viewers | **Only the post author.** Other users never see counts or lists. The modal says "Only you can see who viewed your post." | RPCs in Task 2 |
| Self views | Authors never show up in their own viewer list. | `record_post_views` in Task 2 |
| Which posts | Session posts and pub crawl posts. Official Beerva posts are excluded. | Task 2 and `getFeedItemViewTarget` in Task 3 |
| Repeat views | One row per viewer per post. `first_seen_at` is kept and `last_seen_at` is bumped. The list is sorted by most recent view. | Task 2 |
| Where the count shows | On your own post cards, in the engagement panel under the cheers row, only once at least 1 person has seen it. | Task 7 |
| Notifications | None. Seen-by is passive and does not push. | n/a |
| History | Counting starts when the migration ships. Older posts begin at 0. | n/a |

**Privacy note:** this changes what your friends can expect. Scrolling past a post now leaves a trace that the author can see. Consider announcing it in an official Beerva post when it ships. A per-user "hide my views" toggle is listed under Out Of Scope.

---

## File Structure

- Create `supabase/migrations/20261125120000_add_post_views.sql`
  - Tables `public.session_views` and `public.pub_crawl_views` with RLS that lets only the author read them, and no client write policies.
  - RPCs `record_post_views(uuid[], uuid[])`, `get_my_post_view_counts(uuid[], uuid[])` and `get_post_viewers(text, uuid)`.
- Create `src/lib/postViews.ts`
  - Types, pure helpers (keys, labels, "seen ago" formatting, target selection), RPC wrappers, and `createPostViewRecorder` with the app-wide `postViewRecorder` singleton.
- Create `src/lib/usePostViewTracking.ts`
  - React hook that returns a stable `viewabilityConfig` and `onViewableItemsChanged` for the feed list and flushes on blur, background and unmount.
- Create `src/components/PostViewsSummary.tsx`
  - The "Seen by N people" row with an eye icon.
- Create `src/components/PostViewersModal.tsx`
  - Bottom-sheet modal that loads and lists viewers, with loading, error with retry, and empty states.
- Modify `src/lib/feedTypes.ts`: add `views_count` to `FeedSession`.
- Modify `src/lib/pubCrawls.ts`: add `viewsCount` to `PubCrawl`.
- Modify `src/lib/feedApi.ts`: hydrate view counts for the viewer's own posts on each page.
- Modify `src/screens/FeedScreen.tsx`: wire viewability tracking into `FeedList`, render `PostViewsSummary` in `FeedSessionCard`, and own the viewers modal.
- Modify `src/components/PubCrawlFeedCard.tsx`: render `PostViewsSummary` for own crawls.
- Modify `src/screens/PostDetailScreen.tsx`: record a view when someone else's post is opened, and show the count and modal on your own post.
- Create `scripts/postViews.test.js` and modify `package.json` (`test:post-views`).

---

### Task 1: Add The Failing Post Views Test

**Files:**
- Create: `scripts/postViews.test.js`
- Modify: `package.json`

- [ ] **Step 1: Install dependencies and record the type-check baseline**

The test harness transpiles TypeScript with the `typescript` package, so `node_modules` must exist.

Run: `npm install`
Expected: installs without errors.

Run: `npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: note the output. Later tasks must not add new errors on top of this baseline.

- [ ] **Step 2: Add the npm script**

In `package.json`, add this entry inside `"scripts"` directly after `"test:feed-list": "node scripts/feedList.test.js"` (add a comma after that existing line):

```json
"test:post-views": "node scripts/postViews.test.js"
```

- [ ] **Step 3: Write the failing test script**

Create `scripts/postViews.test.js` with this complete content. The sections run in task order, so each later task moves the first failure further down the file.

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

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const loadTypeScriptModule = (relativePath, mocks = {}) => {
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
  compiledModule.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return Module.prototype.require.call(compiledModule, request);
  };
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const countMatches = (source, pattern) => (source.match(pattern) || []).length;

const checkMigration = () => {
  const sql = read('supabase/migrations/20261125120000_add_post_views.sql');
  assert.ok(sql, 'post views migration should exist');

  assert.match(sql, /create table if not exists public\.session_views/i, 'migration should create session_views');
  assert.match(sql, /create table if not exists public\.pub_crawl_views/i, 'migration should create pub_crawl_views');
  assert.match(sql, /session_id uuid not null references public\.sessions\(id\) on delete cascade/i, 'session views should cascade with the session');
  assert.match(sql, /pub_crawl_id uuid not null references public\.pub_crawls\(id\) on delete cascade/i, 'crawl views should cascade with the crawl');
  assert.equal(countMatches(sql, /viewer_id uuid not null references auth\.users\(id\) on delete cascade/gi), 2, 'views should cascade with the viewer account');
  assert.match(sql, /primary key \(session_id, viewer_id\)/i, 'one session view row per viewer');
  assert.match(sql, /primary key \(pub_crawl_id, viewer_id\)/i, 'one crawl view row per viewer');
  assert.match(sql, /alter table public\.session_views enable row level security/i, 'session_views should use RLS');
  assert.match(sql, /alter table public\.pub_crawl_views enable row level security/i, 'pub_crawl_views should use RLS');
  assert.doesNotMatch(sql, /for (insert|update|delete)/i, 'clients should only write views through the RPC');

  assert.match(sql, /create or replace function public\.record_post_views/i, 'migration should create record_post_views');
  assert.match(sql, /s\.status = 'published'/i, 'only published sessions can be viewed');
  assert.match(sql, /c\.status = 'published'/i, 'only published crawls can be viewed');
  assert.match(sql, /s\.user_id <> viewer/i, 'authors should not record views on their own sessions');
  assert.match(sql, /c\.user_id <> viewer/i, 'authors should not record views on their own crawls');
  assert.match(sql, /on conflict \(session_id, viewer_id\)\s*do update set last_seen_at = now\(\)/i, 'repeat session views should bump last_seen_at');
  assert.match(sql, /on conflict \(pub_crawl_id, viewer_id\)\s*do update set last_seen_at = now\(\)/i, 'repeat crawl views should bump last_seen_at');
  assert.match(sql, /> 100 then/i, 'record_post_views should cap the batch size');

  assert.match(sql, /create or replace function public\.get_my_post_view_counts/i, 'migration should create get_my_post_view_counts');
  assert.match(sql, /create or replace function public\.get_post_viewers/i, 'migration should create get_post_viewers');
  assert.ok(countMatches(sql, /s\.user_id = \(select auth\.uid\(\)\)/gi) >= 3, 'session view reads should be author-only');
  assert.ok(countMatches(sql, /c\.user_id = \(select auth\.uid\(\)\)/gi) >= 3, 'crawl view reads should be author-only');
  assert.match(sql, /order by last_seen_at desc/i, 'viewers should be listed most recent first');
  assert.equal(countMatches(sql, /security definer\s+set search_path = public/gi), 3, 'all three RPCs should be security definer with a pinned search path');

  [
    'record_post_views(uuid[], uuid[])',
    'get_my_post_view_counts(uuid[], uuid[])',
    'get_post_viewers(text, uuid)',
  ].forEach((signature) => {
    const escaped = escapeRegExp(signature);
    assert.match(sql, new RegExp(`revoke execute on function public\\.${escaped} from public, anon`, 'i'), `${signature} should not be callable by anon`);
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped} to authenticated`, 'i'), `${signature} should be callable by signed-in users`);
  });

  assert.match(sql, /notify pgrst, 'reload schema'/i, 'migration should reload the PostgREST schema cache');
};

const checkClientLibrary = async () => {
  assert.ok(read('src/lib/postViews.ts'), 'postViews client module should exist');

  const rpcCalls = [];
  let rpcResponse = { data: null, error: null };
  const postViews = loadTypeScriptModule('src/lib/postViews.ts', {
    './supabase': {
      supabase: {
        rpc: async (name, args) => {
          rpcCalls.push({ name, args });
          return rpcResponse;
        },
      },
    },
    './timeouts': { withTimeout: (operation) => operation },
  });

  const s1 = { targetType: 'session', targetId: 's1' };
  const s2 = { targetType: 'session', targetId: 's2' };
  const c1 = { targetType: 'pub_crawl', targetId: 'c1' };

  assert.deepEqual(postViews.POST_VIEWABILITY_CONFIG, { itemVisiblePercentThreshold: 50, minimumViewTime: 1000 }, 'seen means half the card for one second');
  assert.equal(postViews.getPostViewKey(s1), 'session:s1');
  assert.equal(postViews.getPostViewKey(c1), 'pub_crawl:c1');

  assert.equal(postViews.formatSeenByLabel(1), 'Seen by 1 person');
  assert.equal(postViews.formatSeenByLabel(12), 'Seen by 12 people');

  const now = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(postViews.formatSeenAgo('2026-11-25T11:59:50Z', now), 'Seen just now');
  assert.equal(postViews.formatSeenAgo('2026-11-25T11:30:00Z', now), 'Seen 30 min ago');
  assert.equal(postViews.formatSeenAgo('2026-11-25T09:00:00Z', now), 'Seen 3h ago');
  assert.equal(postViews.formatSeenAgo('2026-11-23T12:00:00Z', now), 'Seen 2d ago');
  assert.equal(postViews.formatSeenAgo(null, now), 'Seen');
  assert.equal(postViews.formatSeenAgo('not a date', now), 'Seen');

  assert.deepEqual(postViews.getPostViewTargetForAuthor(s1, 'author', 'viewer'), s1, 'other people\'s posts are recorded');
  assert.equal(postViews.getPostViewTargetForAuthor(s1, 'me', 'me'), null, 'own posts are never recorded');
  assert.equal(postViews.getPostViewTargetForAuthor(s1, 'author', null), null, 'signed-out viewers are never recorded');
  assert.equal(postViews.getPostViewTargetForAuthor({ targetType: 'session', targetId: '  ' }, 'author', 'viewer'), null, 'blank ids are ignored');

  assert.deepEqual(
    postViews.getFeedItemViewTarget({ type: 'session', id: 's1', publishedAt: '', session: { id: 's1', user_id: 'author' } }, 'viewer'),
    s1,
    'session feed items map to session targets'
  );
  assert.deepEqual(
    postViews.getFeedItemViewTarget({ type: 'pub_crawl', id: 'c1', publishedAt: '', crawl: { id: 'c1', userId: 'author' } }, 'viewer'),
    c1,
    'pub crawl feed items map to pub crawl targets'
  );
  assert.equal(
    postViews.getFeedItemViewTarget({ type: 'official_post', id: 'o1', publishedAt: '', post: { id: 'o1' } }, 'viewer'),
    null,
    'official Beerva posts are not tracked'
  );
  assert.equal(postViews.getFeedItemViewTarget(null, 'viewer'), null);

  assert.deepEqual(
    postViews.mapPostViewerRow({
      viewer_id: 'u1',
      username: 'mads',
      avatar_url: 'https://example.com/a.jpg',
      first_seen_at: '2026-11-25T10:00:00Z',
      last_seen_at: '2026-11-25T11:00:00Z',
    }),
    {
      userId: 'u1',
      username: 'mads',
      avatarUrl: 'https://example.com/a.jpg',
      firstSeenAt: '2026-11-25T10:00:00Z',
      lastSeenAt: '2026-11-25T11:00:00Z',
    }
  );
  assert.deepEqual(
    postViews.mapPostViewerRow({ viewer_id: ' ', username: '', avatar_url: null }),
    { userId: '', username: null, avatarUrl: null, firstSeenAt: null, lastSeenAt: null },
    'mapper tolerates blank and missing values'
  );

  // Recorder: dedupes, batches, and re-queues after a failed send.
  const sent = [];
  const scheduled = [];
  const recorder = postViews.createPostViewRecorder({
    send: async (targets) => {
      sent.push(targets);
    },
    schedule: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
    cancel: () => {},
  });
  recorder.markSeen(s1);
  recorder.markSeen(s1);
  recorder.markSeen(c1);
  assert.equal(scheduled.length, 1, 'one flush timer per pending batch');
  await recorder.flush();
  assert.deepEqual(sent, [[s1, c1]], 'flush sends each pending target once');
  recorder.markSeen(s1);
  await recorder.flush();
  assert.equal(sent.length, 1, 'already recorded posts are not sent again in the same app run');
  await recorder.flush();
  assert.equal(sent.length, 1, 'flushing with nothing pending is a no-op');

  const retried = [];
  let failNextSend = true;
  const originalConsoleError = console.error;
  console.error = () => {};
  const flakyRecorder = postViews.createPostViewRecorder({
    send: async (targets) => {
      if (failNextSend) {
        failNextSend = false;
        throw new Error('offline');
      }
      retried.push(targets);
    },
    schedule: () => 0,
    cancel: () => {},
  });
  flakyRecorder.markSeen(s2);
  await flakyRecorder.flush();
  flakyRecorder.markSeen(s2);
  await flakyRecorder.flush();
  console.error = originalConsoleError;
  assert.deepEqual(retried, [[s2]], 'a failed batch can be recorded again on the next sighting');

  const batchSent = [];
  const batchRecorder = postViews.createPostViewRecorder({
    send: async (targets) => {
      batchSent.push(targets);
    },
    schedule: () => 0,
    cancel: () => {},
  });
  for (let index = 0; index < postViews.POST_VIEW_MAX_BATCH; index += 1) {
    batchRecorder.markSeen({ targetType: 'session', targetId: `bulk-${index}` });
  }
  await Promise.resolve();
  assert.equal(batchSent.length, 1, 'a full batch flushes immediately');
  assert.equal(batchSent[0].length, postViews.POST_VIEW_MAX_BATCH);

  // RPC wrappers.
  rpcCalls.length = 0;
  await postViews.recordPostViews([]);
  assert.equal(rpcCalls.length, 0, 'empty batches skip the network');

  rpcResponse = { data: null, error: null };
  await postViews.recordPostViews([s1, c1, s2]);
  assert.deepEqual(rpcCalls, [{
    name: 'record_post_views',
    args: { session_ids: ['s1', 's2'], pub_crawl_ids: ['c1'] },
  }], 'record helper splits targets by type');

  rpcResponse = { data: null, error: new Error('boom') };
  await assert.rejects(() => postViews.recordPostViews([s1]), /boom/, 'record helper surfaces RPC errors so the recorder can retry');

  rpcCalls.length = 0;
  rpcResponse = {
    data: [
      { target_type: 'session', target_id: 's1', views_count: 4 },
      { target_type: 'pub_crawl', target_id: 'c1', views_count: 0 },
      { target_type: 'session', target_id: null, views_count: 9 },
    ],
    error: null,
  };
  const counts = await postViews.fetchMyPostViewCounts([s1, c1]);
  assert.deepEqual(rpcCalls, [{
    name: 'get_my_post_view_counts',
    args: { session_ids: ['s1'], pub_crawl_ids: ['c1'] },
  }]);
  assert.equal(counts.get('session:s1'), 4);
  assert.equal(counts.get('pub_crawl:c1'), 0);
  assert.equal(counts.size, 2, 'rows without ids are dropped');

  rpcCalls.length = 0;
  const noCounts = await postViews.fetchMyPostViewCounts([]);
  assert.equal(noCounts.size, 0);
  assert.equal(rpcCalls.length, 0, 'no own posts means no count request');

  rpcCalls.length = 0;
  rpcResponse = {
    data: [
      { viewer_id: 'u2', username: 'sofie', avatar_url: null, first_seen_at: '2026-11-25T10:00:00Z', last_seen_at: '2026-11-25T11:00:00Z' },
      { viewer_id: null, username: 'ghost' },
    ],
    error: null,
  };
  const viewers = await postViews.fetchPostViewers(c1);
  assert.deepEqual(rpcCalls, [{ name: 'get_post_viewers', args: { post_type: 'pub_crawl', post_id: 'c1' } }]);
  assert.equal(viewers.length, 1, 'viewer rows without ids are dropped');
  assert.equal(viewers[0].username, 'sofie');

  const postViewsSource = read('src/lib/postViews.ts');
  assert.match(postViewsSource, /export const postViewRecorder = createPostViewRecorder\(\{ send: recordPostViews \}\)/, 'app uses one shared recorder');
  assert.doesNotMatch(postViewsSource, /\.from\('(session_views|pub_crawl_views)'\)/, 'client never touches the view tables directly');
};

const checkFeedHydration = () => {
  assert.match(read('src/lib/feedTypes.ts'), /views_count\?: number \| null;/, 'FeedSession should carry an optional views_count');
  assert.match(read('src/lib/pubCrawls.ts'), /viewsCount\?: number \| null;/, 'PubCrawl should carry an optional viewsCount');

  const feedApi = read('src/lib/feedApi.ts');
  assert.match(feedApi, /from '\.\/postViews'/, 'feedApi imports the post views helpers');
  assert.match(feedApi, /ownPostViewTargets/, 'feedApi only asks for counts on the viewer\'s own posts');
  assert.match(feedApi, /fetchMyPostViewCounts\(ownPostViewTargets\)\.catch\(/, 'view count failures must not break the feed');
  assert.match(feedApi, /views_count: viewCountsByPost\.get\(/, 'session posts get their view count');
  assert.match(feedApi, /viewsCount: viewCountsByPost\.get\(/, 'pub crawl posts get their view count');
};

const checkTrackingHook = () => {
  const hook = read('src/lib/usePostViewTracking.ts');
  assert.ok(hook, 'usePostViewTracking hook should exist');
  assert.match(hook, /export const usePostViewTracking/, 'hook should be exported');
  assert.match(hook, /const onViewableItemsChanged = useRef\(/, 'callback identity must be stable for FlatList and FlashList');
  assert.match(hook, /getFeedItemViewTarget\(token\.item as FeedItem, currentUserIdRef\.current\)/, 'hook maps visible rows to targets');
  assert.match(hook, /if \(!token\.isViewable\) return;/, 'only newly visible rows are recorded');
  assert.match(hook, /if \(!isActiveRef\.current \|\| !appActiveRef\.current\) return;/, 'no recording while the feed is blurred or the app is backgrounded');
  assert.match(hook, /AppState\.addEventListener\('change'/, 'hook flushes when the app leaves the foreground');
  assert.match(hook, /postViewRecorder\.flush\(\)/, 'hook flushes pending views');
  assert.match(hook, /viewabilityConfig: POST_VIEWABILITY_CONFIG/, 'hook exposes the shared viewability config');

  const feedScreen = read('src/screens/FeedScreen.tsx');
  assert.match(feedScreen, /useIsFocused/, 'FeedScreen uses navigation focus to gate tracking');
  assert.match(feedScreen, /usePostViewTracking\(\{ currentUserId, isActive: isFeedFocused \}\)/, 'FeedScreen enables tracking only while focused');
  assert.match(feedScreen, /viewabilityConfig=\{viewabilityConfig\}/, 'FeedList receives the viewability config');
  assert.match(feedScreen, /onViewableItemsChanged=\{onViewableItemsChanged\}/, 'FeedList reports visible rows');
};

const checkComponents = () => {
  const summary = read('src/components/PostViewsSummary.tsx');
  assert.ok(summary, 'PostViewsSummary component should exist');
  assert.match(summary, /export const PostViewsSummary/, 'summary should be exported');
  assert.match(summary, /formatSeenByLabel\(count\)/, 'summary uses the shared label');
  assert.match(summary, /<Eye /, 'summary shows an eye icon');
  assert.match(summary, /accessibilityRole="button"/, 'summary is an accessible button');

  const modal = read('src/components/PostViewersModal.tsx');
  assert.ok(modal, 'PostViewersModal component should exist');
  assert.match(modal, /export const PostViewersModal/, 'modal should be exported');
  assert.match(modal, /fetchPostViewers\(target\)/, 'modal loads viewers for the selected post');
  assert.match(modal, /if \(!cancelled\)/, 'modal ignores stale responses');
  assert.match(modal, />Seen by</, 'modal is titled Seen by');
  assert.match(modal, /No views yet\./, 'modal has an empty state');
  assert.match(modal, /Retry/, 'modal can retry after an error');
  assert.match(modal, /formatSeenAgo\(item\.lastSeenAt\)/, 'rows show when the post was last seen');
  assert.match(modal, /Only you can see who viewed your post\./, 'modal tells the author the list is private');
};

const checkCardsAndFeedScreen = () => {
  const feedScreen = read('src/screens/FeedScreen.tsx');
  assert.match(feedScreen, /onOpenViewers\?: \(target: PostViewTarget\) => void;/, 'session card accepts an optional viewers handler');
  assert.match(feedScreen, /isOwnPost && viewsCount > 0/, 'session card shows views only to the author');
  assert.match(feedScreen, /<PostViewsSummary/, 'session card renders the views row');
  assert.match(feedScreen, /item\.cheers_count > 0 \|\| item\.comments_count > 0 \|\| showViews \?/, 'engagement panel opens for views alone');
  assert.match(feedScreen, /targetType: 'session', targetId: item\.id/, 'session card opens viewers for the session');
  assert.ok(countMatches(feedScreen, /onOpenViewers=\{openViewers\}/g) >= 2, 'FeedScreen passes the viewers handler to session and crawl cards');
  assert.match(feedScreen, /<PostViewersModal/, 'FeedScreen mounts the viewers modal');

  const crawlCard = read('src/components/PubCrawlFeedCard.tsx');
  assert.match(crawlCard, /onOpenViewers\?: \(target: PostViewTarget\) => void;/, 'crawl card accepts an optional viewers handler');
  assert.match(crawlCard, /isOwnPost && viewsCount > 0/, 'crawl card shows views only to the author');
  assert.match(crawlCard, /<PostViewsSummary/, 'crawl card renders the views row');
  assert.match(crawlCard, /crawl\.cheersCount > 0 \|\| crawl\.commentsCount > 0 \|\| showViews \?/, 'crawl engagement panel opens for views alone');
  assert.match(crawlCard, /targetType: 'pub_crawl', targetId: crawl\.id/, 'crawl card opens viewers for the crawl');
};

const checkPostDetail = () => {
  const postDetail = read('src/screens/PostDetailScreen.tsx');
  assert.match(postDetail, /getPostViewTargetForAuthor\(viewTarget, loadedAuthorId, currentUserId\)/, 'detail screen only records other people\'s posts');
  assert.match(postDetail, /postViewRecorder\.markSeen\(viewerTarget\)/, 'opening someone else\'s post records a view');
  assert.match(postDetail, /fetchMyPostViewCounts\(\[viewTarget\]\)/, 'detail screen loads the count for the author');
  assert.ok(countMatches(postDetail, /onOpenViewers=\{setViewersTarget\}/g) >= 2, 'detail screen wires viewers for sessions and crawls');
  assert.match(postDetail, /<PostViewersModal/, 'detail screen mounts the viewers modal');
};

const main = async () => {
  checkMigration();
  await checkClientLibrary();
  checkFeedHydration();
  checkTrackingHook();
  checkComponents();
  checkCardsAndFeedScreen();
  checkPostDetail();
};

main()
  .then(() => {
    console.log('post views checks passed');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:post-views`
Expected: FAIL with `AssertionError ... post views migration should exist`.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/postViews.test.js
git commit -m "test: add failing post views checks"
```

---

### Task 2: Add The Post Views Migration

**Files:**
- Create: `supabase/migrations/20261125120000_add_post_views.sql`
- Test: `scripts/postViews.test.js`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261125120000_add_post_views.sql` with this complete content:

```sql
-- Records which signed-in users have seen a published session or pub crawl
-- post, so the author (and only the author) can see who has seen it.
-- Writes only go through public.record_post_views; reads only go through the
-- author-only RPCs below.

create table if not exists public.session_views (
  session_id uuid not null references public.sessions(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  primary key (session_id, viewer_id)
);

create table if not exists public.pub_crawl_views (
  pub_crawl_id uuid not null references public.pub_crawls(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  primary key (pub_crawl_id, viewer_id)
);

-- The primary keys cover lookups by post. These cover cascade deletes when a
-- viewer account is removed.
create index if not exists session_views_viewer_id_idx
  on public.session_views(viewer_id);

create index if not exists pub_crawl_views_viewer_id_idx
  on public.pub_crawl_views(viewer_id);

alter table public.session_views enable row level security;
alter table public.pub_crawl_views enable row level security;

drop policy if exists "Authors can see who viewed their sessions" on public.session_views;
create policy "Authors can see who viewed their sessions"
  on public.session_views
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions s
      where s.id = session_views.session_id
        and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "Authors can see who viewed their pub crawls" on public.pub_crawl_views;
create policy "Authors can see who viewed their pub crawls"
  on public.pub_crawl_views
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.pub_crawls c
      where c.id = pub_crawl_views.pub_crawl_id
        and c.user_id = (select auth.uid())
    )
  );

create or replace function public.record_post_views(
  session_ids uuid[] default array[]::uuid[],
  pub_crawl_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := (select auth.uid());
begin
  if viewer is null then
    return;
  end if;

  if coalesce(cardinality(session_ids), 0) + coalesce(cardinality(pub_crawl_ids), 0) > 100 then
    raise exception 'Too many post views in one batch';
  end if;

  insert into public.session_views (session_id, viewer_id)
  select s.id, viewer
  from public.sessions s
  where s.id = any(coalesce(session_ids, array[]::uuid[]))
    and s.status = 'published'
    and s.user_id <> viewer
  on conflict (session_id, viewer_id)
  do update set last_seen_at = now();

  insert into public.pub_crawl_views (pub_crawl_id, viewer_id)
  select c.id, viewer
  from public.pub_crawls c
  where c.id = any(coalesce(pub_crawl_ids, array[]::uuid[]))
    and c.status = 'published'
    and c.user_id <> viewer
  on conflict (pub_crawl_id, viewer_id)
  do update set last_seen_at = now();
end;
$$;

create or replace function public.get_my_post_view_counts(
  session_ids uuid[] default array[]::uuid[],
  pub_crawl_ids uuid[] default array[]::uuid[]
)
returns table (
  target_type text,
  target_id uuid,
  views_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select 'session'::text, s.id, count(v.viewer_id)::int
  from public.sessions s
  left join public.session_views v
    on v.session_id = s.id
  where s.id = any(coalesce(session_ids, array[]::uuid[]))
    and s.user_id = (select auth.uid())
  group by s.id
  union all
  select 'pub_crawl'::text, c.id, count(v.viewer_id)::int
  from public.pub_crawls c
  left join public.pub_crawl_views v
    on v.pub_crawl_id = c.id
  where c.id = any(coalesce(pub_crawl_ids, array[]::uuid[]))
    and c.user_id = (select auth.uid())
  group by c.id;
$$;

create or replace function public.get_post_viewers(
  post_type text,
  post_id uuid
)
returns table (
  viewer_id uuid,
  username text,
  avatar_url text,
  first_seen_at timestamp with time zone,
  last_seen_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from (
    select v.viewer_id, pr.username, pr.avatar_url, v.first_seen_at, v.last_seen_at
    from public.session_views v
    join public.sessions s
      on s.id = v.session_id
    left join public.profiles pr
      on pr.id = v.viewer_id
    where post_type = 'session'
      and v.session_id = post_id
      and s.user_id = (select auth.uid())
    union all
    select v.viewer_id, pr.username, pr.avatar_url, v.first_seen_at, v.last_seen_at
    from public.pub_crawl_views v
    join public.pub_crawls c
      on c.id = v.pub_crawl_id
    left join public.profiles pr
      on pr.id = v.viewer_id
    where post_type = 'pub_crawl'
      and v.pub_crawl_id = post_id
      and c.user_id = (select auth.uid())
  ) viewers
  order by last_seen_at desc nulls last;
$$;

revoke execute on function public.record_post_views(uuid[], uuid[]) from public, anon;
grant execute on function public.record_post_views(uuid[], uuid[]) to authenticated;

revoke execute on function public.get_my_post_view_counts(uuid[], uuid[]) from public, anon;
grant execute on function public.get_my_post_view_counts(uuid[], uuid[]) to authenticated;

revoke execute on function public.get_post_viewers(text, uuid) from public, anon;
grant execute on function public.get_post_viewers(text, uuid) to authenticated;

comment on table public.session_views is 'One row per viewer per published session post. Readable only by the post author.';
comment on table public.pub_crawl_views is 'One row per viewer per published pub crawl post. Readable only by the post author.';
comment on function public.record_post_views(uuid[], uuid[]) is 'Records that the caller has seen these published posts. Ignores the caller''s own posts.';
comment on function public.get_my_post_view_counts(uuid[], uuid[]) is 'Returns view counts for the given posts that the caller authored.';
comment on function public.get_post_viewers(text, uuid) is 'Returns who has seen a post, newest first. Empty unless the caller is the author.';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Run the test to verify the migration section passes**

Run: `npm run test:post-views`
Expected: FAIL with `AssertionError ... postViews client module should exist` (the migration checks now pass).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261125120000_add_post_views.sql
git commit -m "feat: add post views tables and author-only RPCs"
```

---

### Task 3: Add The Post Views Client Library

**Files:**
- Create: `src/lib/postViews.ts`
- Test: `scripts/postViews.test.js`

- [ ] **Step 1: Write the module**

Create `src/lib/postViews.ts` with this complete content:

```typescript
import type { FeedItem } from './feedTypes';
import type { PostTargetType } from './postTargets';
import { supabase } from './supabase';
import { withTimeout } from './timeouts';

export const POST_VIEW_FLUSH_DELAY_MS = 4000;
export const POST_VIEW_MAX_BATCH = 50;
const POST_VIEWS_TIMEOUT_MS = 12000;

// A post counts as "seen" once at least half of its card has been on screen
// for one second. Used by both FlatList (PWA) and FlashList (native).
export const POST_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 1000,
};

export type PostViewTarget = {
  targetType: PostTargetType;
  targetId: string;
};

export type PostViewer = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

type PostViewerRow = {
  viewer_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
};

type PostViewCountRow = {
  target_type?: string | null;
  target_id?: string | null;
  views_count?: number | null;
};

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getPostViewKey = (target: PostViewTarget) => `${target.targetType}:${target.targetId}`;

export const getPostViewTargetForAuthor = (
  target: PostViewTarget,
  authorId: string | null | undefined,
  currentUserId: string | null | undefined
): PostViewTarget | null => {
  if (!currentUserId || !authorId || !toCleanString(target.targetId)) return null;
  if (authorId === currentUserId) return null;
  return target;
};

export const getFeedItemViewTarget = (
  item: FeedItem | null | undefined,
  currentUserId: string | null
): PostViewTarget | null => {
  if (!item) return null;
  if (item.type === 'session') {
    return getPostViewTargetForAuthor(
      { targetType: 'session', targetId: item.session.id },
      item.session.user_id,
      currentUserId
    );
  }
  if (item.type === 'pub_crawl') {
    return getPostViewTargetForAuthor(
      { targetType: 'pub_crawl', targetId: item.crawl.id },
      item.crawl.userId,
      currentUserId
    );
  }
  return null;
};

export const formatSeenByLabel = (count: number) => (
  `Seen by ${count} ${count === 1 ? 'person' : 'people'}`
);

export const formatSeenAgo = (isoDate: string | null, now = Date.now()) => {
  if (!isoDate) return 'Seen';
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) return 'Seen';
  const diffMins = Math.max(0, Math.round((now - timestamp) / 60000));
  if (diffMins < 1) return 'Seen just now';
  if (diffMins < 60) return `Seen ${diffMins} min ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `Seen ${diffHours}h ago`;
  return `Seen ${Math.round(diffHours / 24)}d ago`;
};

export const mapPostViewerRow = (row: PostViewerRow): PostViewer => ({
  userId: toCleanString(row.viewer_id) || '',
  username: toCleanString(row.username),
  avatarUrl: toCleanString(row.avatar_url),
  firstSeenAt: toCleanString(row.first_seen_at),
  lastSeenAt: toCleanString(row.last_seen_at),
});

const splitTargetsByType = (targets: PostViewTarget[]) => ({
  session_ids: targets.filter((target) => target.targetType === 'session').map((target) => target.targetId),
  pub_crawl_ids: targets.filter((target) => target.targetType === 'pub_crawl').map((target) => target.targetId),
});

export const recordPostViews = async (targets: PostViewTarget[]) => {
  if (targets.length === 0) return;
  const { error } = await supabase.rpc('record_post_views', splitTargetsByType(targets));
  if (error) throw error;
};

export const fetchMyPostViewCounts = async (targets: PostViewTarget[]) => {
  const counts = new Map<string, number>();
  if (targets.length === 0) return counts;

  const { data, error } = await withTimeout(
    supabase.rpc('get_my_post_view_counts', splitTargetsByType(targets)),
    POST_VIEWS_TIMEOUT_MS,
    'Post view counts are taking too long.'
  );
  if (error) throw error;

  ((data || []) as PostViewCountRow[]).forEach((row) => {
    const targetId = toCleanString(row.target_id);
    if (!targetId) return;
    const targetType: PostTargetType = row.target_type === 'pub_crawl' ? 'pub_crawl' : 'session';
    counts.set(getPostViewKey({ targetType, targetId }), Math.max(0, Number(row.views_count) || 0));
  });
  return counts;
};

export const fetchPostViewers = async (target: PostViewTarget): Promise<PostViewer[]> => {
  const { data, error } = await withTimeout(
    supabase.rpc('get_post_viewers', { post_type: target.targetType, post_id: target.targetId }),
    POST_VIEWS_TIMEOUT_MS,
    'Viewers are taking too long to load.'
  );
  if (error) throw error;
  return ((data || []) as PostViewerRow[])
    .map(mapPostViewerRow)
    .filter((viewer) => viewer.userId.length > 0);
};

export type PostViewRecorder = {
  markSeen: (target: PostViewTarget) => void;
  flush: () => Promise<void>;
};

type PostViewRecorderOptions = {
  send: (targets: PostViewTarget[]) => Promise<void>;
  flushDelayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
};

// Dedupes sightings for the lifetime of the app run, batches them, and sends
// them every few seconds. A failed batch is forgotten so the next sighting of
// the same post can try again.
export const createPostViewRecorder = ({
  send,
  flushDelayMs = POST_VIEW_FLUSH_DELAY_MS,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: PostViewRecorderOptions): PostViewRecorder => {
  const recordedKeys = new Set<string>();
  let pending = new Map<string, PostViewTarget>();
  let timer: unknown = null;

  const flush = async () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    if (pending.size === 0) return;

    const batch = Array.from(pending.values());
    pending = new Map();
    try {
      await send(batch);
    } catch (error) {
      console.error('Post views flush error:', error);
      batch.forEach((target) => recordedKeys.delete(getPostViewKey(target)));
    }
  };

  const markSeen = (target: PostViewTarget) => {
    const key = getPostViewKey(target);
    if (recordedKeys.has(key)) return;
    recordedKeys.add(key);
    pending.set(key, target);

    if (pending.size >= POST_VIEW_MAX_BATCH) {
      void flush();
      return;
    }
    if (timer === null) {
      timer = schedule(() => {
        timer = null;
        void flush();
      }, flushDelayMs);
    }
  };

  return { markSeen, flush };
};

export const postViewRecorder = createPostViewRecorder({ send: recordPostViews });
```

- [ ] **Step 2: Run the test to verify the client section passes**

Run: `npm run test:post-views`
Expected: FAIL with `AssertionError ... FeedSession should carry an optional views_count`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: same output as the Task 1 baseline (no new errors in `src/lib/postViews.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/postViews.ts
git commit -m "feat: add post views client recorder and RPC helpers"
```

---

### Task 4: Hydrate View Counts Into The Feed

**Files:**
- Modify: `src/lib/feedTypes.ts` (the `FeedSession` type)
- Modify: `src/lib/pubCrawls.ts` (the `PubCrawl` type, around line 87)
- Modify: `src/lib/feedApi.ts` (mention hydration block, around lines 244-300)
- Test: `scripts/postViews.test.js`

- [ ] **Step 1: Add `views_count` to `FeedSession`**

In `src/lib/feedTypes.ts`, replace:

```typescript
  cheers_count: number;
  has_cheered: boolean;
};
```

with:

```typescript
  cheers_count: number;
  has_cheered: boolean;
  views_count?: number | null;
};
```

- [ ] **Step 2: Add `viewsCount` to `PubCrawl`**

In `src/lib/pubCrawls.ts`, inside `export type PubCrawl = {`, replace:

```typescript
  cheerProfiles: PubCrawlProfile[];
  comments: PubCrawlComment[];
  stops: PubCrawlStop[];
};
```

with:

```typescript
  cheerProfiles: PubCrawlProfile[];
  comments: PubCrawlComment[];
  stops: PubCrawlStop[];
  viewsCount?: number | null;
};
```

If that exact block appears more than once in the file, apply the change only to the `PubCrawl` type.

- [ ] **Step 3: Import the helpers in `feedApi.ts`**

In `src/lib/feedApi.ts`, after the line `import { ChallengeSummary } from './challenges';` add:

```typescript
import { fetchMyPostViewCounts, getPostViewKey, PostViewTarget } from './postViews';
```

- [ ] **Step 4: Fetch counts alongside mentions**

In `src/lib/feedApi.ts`, replace:

```typescript
  const [commentMentionsBySource, postMentionsBySource] = await withTimeout(
    Promise.all([
      fetchContentMentionsForSources(supabase, 'comment', commentSourceIds),
      fetchContentMentionsForSources(supabase, 'post', postSourceIds),
    ]),
    timeoutMs,
    'Feed mentions are taking too long.'
  );
```

with:

```typescript
  const ownPostViewTargets: PostViewTarget[] = [
    ...sessionRows
      .filter((session) => session.user_id === user.id)
      .map((session): PostViewTarget => ({ targetType: 'session', targetId: session.id })),
    ...crawls
      .filter((crawl) => crawl.userId === user.id)
      .map((crawl): PostViewTarget => ({ targetType: 'pub_crawl', targetId: crawl.id })),
  ];

  const [commentMentionsBySource, postMentionsBySource, viewCountsByPost] = await withTimeout(
    Promise.all([
      fetchContentMentionsForSources(supabase, 'comment', commentSourceIds),
      fetchContentMentionsForSources(supabase, 'post', postSourceIds),
      fetchMyPostViewCounts(ownPostViewTargets).catch((error) => {
        console.error('Post view counts fetch error:', error);
        return new Map<string, number>();
      }),
    ]),
    timeoutMs,
    'Feed mentions are taking too long.'
  );
```

- [ ] **Step 5: Attach counts to sessions**

In the `hydratedPageSessions` mapper in `src/lib/feedApi.ts`, replace:

```typescript
      session: {
        ...feedItem.session,
        mentions: postMentionsBySource.get(feedItem.session.id) || [],
```

with:

```typescript
      session: {
        ...feedItem.session,
        views_count: viewCountsByPost.get(getPostViewKey({ targetType: 'session', targetId: feedItem.session.id })) ?? null,
        mentions: postMentionsBySource.get(feedItem.session.id) || [],
```

- [ ] **Step 6: Attach counts to pub crawls**

In the `hydratedPageCrawls` mapper in `src/lib/feedApi.ts`, replace:

```typescript
      crawl: {
        ...feedItem.crawl,
        comments: feedItem.crawl.comments.map((comment) => ({
```

with:

```typescript
      crawl: {
        ...feedItem.crawl,
        viewsCount: viewCountsByPost.get(getPostViewKey({ targetType: 'pub_crawl', targetId: feedItem.crawl.id })) ?? null,
        comments: feedItem.crawl.comments.map((comment) => ({
```

- [ ] **Step 7: Run the tests**

Run: `npm run test:post-views`
Expected: FAIL with `AssertionError ... usePostViewTracking hook should exist`.

Run: `npm run test:feed-api && npm run test:pub-crawl`
Expected: both PASS (existing feed contracts unchanged).

Run: `npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: same as baseline.

- [ ] **Step 8: Commit**

```bash
git add src/lib/feedTypes.ts src/lib/pubCrawls.ts src/lib/feedApi.ts
git commit -m "feat: hydrate own-post view counts into the feed"
```

---

### Task 5: Track Visible Posts In The Feed

**Files:**
- Create: `src/lib/usePostViewTracking.ts`
- Modify: `src/screens/FeedScreen.tsx` (imports, around line 788, and the `<FeedList` props around line 1764)
- Test: `scripts/postViews.test.js`

- [ ] **Step 1: Write the hook**

Create `src/lib/usePostViewTracking.ts` with this complete content:

```typescript
import { useEffect, useRef } from 'react';
import { AppState, ViewToken } from 'react-native';
import type { FeedItem } from './feedTypes';
import { getFeedItemViewTarget, POST_VIEWABILITY_CONFIG, postViewRecorder } from './postViews';

type ViewableItemsChangedInfo = {
  viewableItems: ViewToken[];
  changed: ViewToken[];
};

type UsePostViewTrackingArgs = {
  currentUserId: string | null;
  isActive: boolean;
};

export const usePostViewTracking = ({ currentUserId, isActive }: UsePostViewTrackingArgs) => {
  const currentUserIdRef = useRef(currentUserId);
  const isActiveRef = useRef(isActive);
  const appActiveRef = useRef(true);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    isActiveRef.current = isActive;
    if (!isActive) void postViewRecorder.flush();
  }, [isActive]);

  useEffect(() => {
    // react-native-web maps document visibility onto AppState, so this also
    // covers the PWA being hidden or closed.
    const subscription = AppState.addEventListener('change', (nextState) => {
      appActiveRef.current = nextState === 'active';
      if (!appActiveRef.current) void postViewRecorder.flush();
    });
    return () => {
      subscription.remove();
      void postViewRecorder.flush();
    };
  }, []);

  // FlatList and FlashList throw if this callback's identity changes after
  // mount, so it is created once and reads the latest state through refs.
  const onViewableItemsChanged = useRef(({ changed }: ViewableItemsChangedInfo) => {
    if (!isActiveRef.current || !appActiveRef.current) return;
    changed.forEach((token) => {
      if (!token.isViewable) return;
      const target = getFeedItemViewTarget(token.item as FeedItem, currentUserIdRef.current);
      if (target) postViewRecorder.markSeen(target);
    });
  }).current;

  return { viewabilityConfig: POST_VIEWABILITY_CONFIG, onViewableItemsChanged };
};
```

- [ ] **Step 2: Import the hook and focus helper in `FeedScreen.tsx`**

In `src/screens/FeedScreen.tsx`, replace:

```typescript
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
```

with:

```typescript
import { useFocusEffect, useIsFocused, useNavigation, useScrollToTop } from '@react-navigation/native';
```

Then after the line `import { FeedList } from '../components/FeedList';` add:

```typescript
import { usePostViewTracking } from '../lib/usePostViewTracking';
```

- [ ] **Step 3: Call the hook**

In `FeedScreen`, replace:

```typescript
  const flatListRef = useRef<FlatList>(null);
```

with:

```typescript
  const flatListRef = useRef<FlatList>(null);
  const isFeedFocused = useIsFocused();
  const { viewabilityConfig, onViewableItemsChanged } = usePostViewTracking({ currentUserId, isActive: isFeedFocused });
```

- [ ] **Step 4: Pass the props to `FeedList`**

In the `<FeedList` element, replace:

```tsx
          onScroll={handleScroll}
          scrollEventThrottle={16}
```

with:

```tsx
          onScroll={handleScroll}
          scrollEventThrottle={16}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
```

`FeedList.web.tsx` and `FeedList.tsx` forward these to `FlatList`, and `FeedList.native.tsx` forwards them to `FlashList`. No changes are needed in those files.

- [ ] **Step 5: Run the tests**

Run: `npm run test:post-views`
Expected: FAIL with `AssertionError ... PostViewsSummary component should exist`.

Run: `npm run test:feed-list && npm run test:feed-api && npm run test:native-pwa-parity`
Expected: all PASS.

Run: `npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: same as baseline.

- [ ] **Step 6: Commit**

```bash
git add src/lib/usePostViewTracking.ts src/screens/FeedScreen.tsx
git commit -m "feat: record feed posts as seen when they stay on screen"
```

---

### Task 6: Add The Seen-By Row And Viewers Modal

**Files:**
- Create: `src/components/PostViewsSummary.tsx`
- Create: `src/components/PostViewersModal.tsx`
- Test: `scripts/postViews.test.js`

- [ ] **Step 1: Write `PostViewsSummary`**

Create `src/components/PostViewsSummary.tsx` with this complete content. The sizing matches the existing `cheerSummaryRow` so the two rows line up.

```tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Eye } from 'lucide-react-native';
import { formatSeenByLabel } from '../lib/postViews';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type Props = {
  count: number;
  onPress: () => void;
};

export const PostViewsSummary = React.memo(({ count, onPress }: Props) => (
  <TouchableOpacity
    style={styles.row}
    onPress={onPress}
    activeOpacity={0.72}
    accessibilityRole="button"
    accessibilityLabel={`See who viewed your post. ${formatSeenByLabel(count)}`}
  >
    <View style={styles.iconSlot}>
      <Eye color={colors.textMuted} size={16} />
    </View>
    <Text style={styles.text} numberOfLines={1}>
      {formatSeenByLabel(count)}
    </Text>
  </TouchableOpacity>
));

PostViewsSummary.displayName = 'PostViewsSummary';

const styles = StyleSheet.create({
  row: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconSlot: {
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    fontWeight: '700',
  },
});
```

- [ ] **Step 2: Write `PostViewersModal`**

Create `src/components/PostViewersModal.tsx` with this complete content. The styles copy the existing cheers sheet in `FeedScreen.tsx` so the two modals look the same.

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, RefreshCw, X } from 'lucide-react-native';
import { CachedImage } from './CachedImage';
import { fetchPostViewers, formatSeenAgo, PostViewer, PostViewTarget } from '../lib/postViews';
import { colors } from '../theme/colors';
import { radius, shadows } from '../theme/layout';
import { typography } from '../theme/typography';

type Props = {
  target: PostViewTarget | null;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
};

export const PostViewersModal = ({ target, onClose, onOpenProfile }: Props) => {
  const [viewers, setViewers] = useState<PostViewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!target) {
      setViewers([]);
      setErrorMessage(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetchPostViewers(target)
      .then((rows) => {
        if (!cancelled) setViewers(rows);
      })
      .catch((error) => {
        console.error('Post viewers fetch error:', error);
        if (!cancelled) setErrorMessage('Couldn’t load viewers.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target, reloadToken]);

  const retry = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  return (
    <Modal
      visible={Boolean(target)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Seen by</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close viewers"
            >
              <X color={colors.text} size={21} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : errorMessage ? (
            <View style={styles.centerState}>
              <Text style={styles.emptyText}>{errorMessage}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={retry} activeOpacity={0.75}>
                <RefreshCw color={colors.background} size={14} />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={viewers}
              keyExtractor={(viewer) => viewer.userId}
              style={styles.list}
              contentContainerStyle={[
                styles.listContent,
                viewers.length === 0 ? styles.emptyContent : null,
              ]}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.personRow}
                  onPress={() => onOpenProfile(item.userId)}
                  activeOpacity={0.75}
                >
                  <CachedImage
                    uri={item.avatarUrl}
                    fallbackUri={`https://i.pravatar.cc/150?u=${item.userId}`}
                    style={styles.personAvatar}
                    recyclingKey={`viewer-${item.userId}-${item.avatarUrl || 'fallback'}`}
                    accessibilityLabel={`${item.username || 'Someone'}'s avatar`}
                  />
                  <View style={styles.personText}>
                    <Text style={styles.personName} numberOfLines={1}>{item.username || 'Someone'}</Text>
                    <Text style={styles.personMeta}>{formatSeenAgo(item.lastSeenAt)}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Eye color={colors.textMuted} size={28} />
                  <Text style={styles.emptyText}>No views yet.</Text>
                </View>
              }
            />
          )}

          <Text style={styles.privacyNote}>Only you can see who viewed your post.</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxHeight: '82%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    ...shadows.raised,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.h3,
    fontSize: 18,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  centerState: {
    minHeight: 170,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyContent: {
    minHeight: 170,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 13,
  },
  personRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  personText: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  personMeta: {
    ...typography.caption,
    marginTop: 2,
  },
  privacyNote: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
});
```

- [ ] **Step 3: Run the tests**

Run: `npm run test:post-views`
Expected: FAIL with `AssertionError ... session card accepts an optional viewers handler`.

Run: `npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: same as baseline.

- [ ] **Step 4: Commit**

```bash
git add src/components/PostViewsSummary.tsx src/components/PostViewersModal.tsx
git commit -m "feat: add seen-by summary row and viewers modal"
```

---

### Task 7: Show Seen-By On Own Feed Cards

**Files:**
- Modify: `src/screens/FeedScreen.tsx` (`FeedSessionCard` around lines 250-720, state around line 757, callbacks around line 1100, `renderSession` around line 1619, modals around line 1800)
- Modify: `src/components/PubCrawlFeedCard.tsx` (props around line 21, body around line 84, engagement panel around line 296)
- Test: `scripts/postViews.test.js`

- [ ] **Step 1: Import the new pieces in `FeedScreen.tsx`**

After the line `import { usePostViewTracking } from '../lib/usePostViewTracking';` (added in Task 5) add:

```typescript
import { PostViewsSummary } from '../components/PostViewsSummary';
import { PostViewersModal } from '../components/PostViewersModal';
import type { PostViewTarget } from '../lib/postViews';
```

- [ ] **Step 2: Add the prop to `FeedSessionCardProps`**

Replace:

```typescript
  onOpenCheers: (session: FeedSession) => void;
  onOpenComments: (session: FeedSession) => void;
```

with:

```typescript
  onOpenCheers: (session: FeedSession) => void;
  onOpenViewers?: (target: PostViewTarget) => void;
  onOpenComments: (session: FeedSession) => void;
```

- [ ] **Step 3: Destructure it and compute visibility**

Replace:

```typescript
  onOpenCheers,
  onOpenComments,
  onOpenProfile,
  onImagePress,
  onToggleCheers,
}: FeedSessionCardProps) => {
  const isOwnPost = item.user_id === currentUserId;
```

with:

```typescript
  onOpenCheers,
  onOpenViewers,
  onOpenComments,
  onOpenProfile,
  onImagePress,
  onToggleCheers,
}: FeedSessionCardProps) => {
  const isOwnPost = item.user_id === currentUserId;
  const viewsCount = item.views_count ?? 0;
  const showViews = isOwnPost && viewsCount > 0 && Boolean(onOpenViewers);
```

- [ ] **Step 4: Open the engagement panel for views alone**

Replace:

```tsx
      {item.cheers_count > 0 || item.comments_count > 0 ? (
```

with:

```tsx
      {item.cheers_count > 0 || item.comments_count > 0 || showViews ? (
```

- [ ] **Step 5: Render the row under the cheers row**

In `FeedSessionCard`, replace:

```tsx
          ) : null}

          {latestComments.length > 0 ? (
```

with:

```tsx
          ) : null}

          {showViews ? (
            <PostViewsSummary
              count={viewsCount}
              onPress={() => onOpenViewers?.({ targetType: 'session', targetId: item.id })}
            />
          ) : null}

          {latestComments.length > 0 ? (
```

- [ ] **Step 6: Add viewers state and callbacks to `FeedScreen`**

Replace:

```typescript
  const [cheersSession, setCheersSession] = useState<FeedSession | PubCrawl | null>(null);
```

with:

```typescript
  const [cheersSession, setCheersSession] = useState<FeedSession | PubCrawl | null>(null);
  const [viewersTarget, setViewersTarget] = useState<PostViewTarget | null>(null);
```

Then replace:

```typescript
  const closeCheers = useCallback(() => {
    setCheersSession(null);
  }, []);
```

with:

```typescript
  const closeCheers = useCallback(() => {
    setCheersSession(null);
  }, []);

  const openViewers = useCallback((target: PostViewTarget) => {
    setViewersTarget(target);
  }, []);

  const closeViewers = useCallback(() => {
    setViewersTarget(null);
  }, []);

  const openViewerProfile = useCallback((userId: string) => {
    setViewersTarget(null);
    openProfile(userId);
  }, [openProfile]);
```

- [ ] **Step 7: Pass the handler to both cards in `renderSession`**

Replace:

```tsx
          onOpenCheers={openCheers}
          onOpenProfile={openProfile}
          onImagePress={setViewingImageUrl}
        />
      );
    }
```

with:

```tsx
          onOpenCheers={openCheers}
          onOpenViewers={openViewers}
          onOpenProfile={openProfile}
          onImagePress={setViewingImageUrl}
        />
      );
    }
```

Then replace:

```tsx
        onOpenCheers={openCheers}
        onOpenComments={openComments as any}
```

with:

```tsx
        onOpenCheers={openCheers}
        onOpenViewers={openViewers}
        onOpenComments={openComments as any}
```

Then in the `renderSession` dependency array replace:

```typescript
    openCheers,
    openComments,
    openProfile,
```

with:

```typescript
    openCheers,
    openComments,
    openProfile,
    openViewers,
```

- [ ] **Step 8: Mount the modal**

In `FeedScreen`'s returned JSX, replace:

```tsx
      <ImageViewerModal
        visible={Boolean(viewingImageUrl)}
        imageUrl={viewingImageUrl}
        onClose={() => setViewingImageUrl(null)}
      />
```

with:

```tsx
      <ImageViewerModal
        visible={Boolean(viewingImageUrl)}
        imageUrl={viewingImageUrl}
        onClose={() => setViewingImageUrl(null)}
      />

      <PostViewersModal
        target={viewersTarget}
        onClose={closeViewers}
        onOpenProfile={openViewerProfile}
      />
```

- [ ] **Step 9: Update `PubCrawlFeedCard`**

In `src/components/PubCrawlFeedCard.tsx`, after the line `import { StreakAvatar } from './StreakAvatar';` add:

```typescript
import { PostViewsSummary } from './PostViewsSummary';
import type { PostViewTarget } from '../lib/postViews';
```

Replace:

```typescript
  onOpenCheers: (crawl: PubCrawl) => void;
```

with:

```typescript
  onOpenCheers: (crawl: PubCrawl) => void;
  onOpenViewers?: (target: PostViewTarget) => void;
```

Replace:

```typescript
  onOpenCheers,
  onOpenProfile,
  onImagePress,
}: Props) => {
```

with:

```typescript
  onOpenCheers,
  onOpenViewers,
  onOpenProfile,
  onImagePress,
}: Props) => {
```

Replace:

```typescript
  const isOwnPost = crawl.userId === currentUserId;
```

with:

```typescript
  const isOwnPost = crawl.userId === currentUserId;
  const viewsCount = crawl.viewsCount ?? 0;
  const showViews = isOwnPost && viewsCount > 0 && Boolean(onOpenViewers);
```

Replace:

```tsx
      {crawl.cheersCount > 0 || crawl.commentsCount > 0 ? (
```

with:

```tsx
      {crawl.cheersCount > 0 || crawl.commentsCount > 0 || showViews ? (
```

Replace:

```tsx
          ) : null}

          {latestComments.length > 0 ? (
```

with:

```tsx
          ) : null}

          {showViews ? (
            <PostViewsSummary
              count={viewsCount}
              onPress={() => onOpenViewers?.({ targetType: 'pub_crawl', targetId: crawl.id })}
            />
          ) : null}

          {latestComments.length > 0 ? (
```

- [ ] **Step 10: Run the tests**

Run: `npm run test:post-views`
Expected: FAIL with `AssertionError ... detail screen only records other people's posts`.

Run: `npm run test:feed-redesign && npm run test:pub-crawl && npm run test:feed-header && npm run test:native-pwa-parity`
Expected: all PASS. `feedCardRedesign.test.js` looks for `<View style={styles.engagementPanel}>`, which is unchanged.

Run: `npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: same as baseline.

- [ ] **Step 11: Commit**

```bash
git add src/screens/FeedScreen.tsx src/components/PubCrawlFeedCard.tsx
git commit -m "feat: show seen-by count and viewers on own feed posts"
```

---

### Task 8: Record And Show Views On The Post Detail Screen

Opening a post from a notification or a mention never passes through the feed list, so the detail screen records the view itself. For the author, it loads the count and offers the same modal.

**Files:**
- Modify: `src/screens/PostDetailScreen.tsx` (imports at line 1, state around line 108, effects after the `useFocusEffect` around line 353, `renderHeader` around line 663, modals around line 791)
- Test: `scripts/postViews.test.js`

- [ ] **Step 1: Update imports**

Replace:

```typescript
import React, { useCallback, useRef, useState } from 'react';
```

with:

```typescript
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

After the line `import { PubCrawlFeedCard } from '../components/PubCrawlFeedCard';` add:

```typescript
import { PostViewersModal } from '../components/PostViewersModal';
import {
  fetchMyPostViewCounts,
  getPostViewKey,
  getPostViewTargetForAuthor,
  postViewRecorder,
  PostViewTarget,
} from '../lib/postViews';
```

- [ ] **Step 2: Add state**

Replace:

```typescript
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const composerRef = useRef<TextInput>(null);
```

with:

```typescript
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [ownViewsCount, setOwnViewsCount] = useState<number | null>(null);
  const [viewersTarget, setViewersTarget] = useState<PostViewTarget | null>(null);
  const composerRef = useRef<TextInput>(null);
```

- [ ] **Step 3: Record or load views once the post is loaded**

Replace:

```typescript
  useFocusEffect(
    useCallback(() => {
      fetchPost();
    }, [fetchPost])
  );
```

with:

```typescript
  useFocusEffect(
    useCallback(() => {
      fetchPost();
    }, [fetchPost])
  );

  const loadedTargetId = targetType === 'pub_crawl' ? crawl?.id ?? null : session?.id ?? null;
  const loadedAuthorId = targetType === 'pub_crawl' ? crawl?.userId ?? null : session?.user_id ?? null;
  const viewTarget = useMemo<PostViewTarget | null>(
    () => (loadedTargetId ? { targetType, targetId: loadedTargetId } : null),
    [loadedTargetId, targetType]
  );

  useEffect(() => {
    setOwnViewsCount(null);
    if (!viewTarget || !currentUserId || !loadedAuthorId) return undefined;

    const viewerTarget = getPostViewTargetForAuthor(viewTarget, loadedAuthorId, currentUserId);
    if (viewerTarget) {
      postViewRecorder.markSeen(viewerTarget);
      void postViewRecorder.flush();
      return undefined;
    }

    let cancelled = false;
    fetchMyPostViewCounts([viewTarget])
      .then((counts) => {
        if (!cancelled) setOwnViewsCount(counts.get(getPostViewKey(viewTarget)) ?? 0);
      })
      .catch((error) => {
        console.error('Post view count fetch error:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, loadedAuthorId, viewTarget]);
```

- [ ] **Step 4: Pass the count and handler to the cards**

In `renderHeader`, replace:

```tsx
          <PubCrawlFeedCard
            crawl={crawl}
            currentUserId={currentUserId}
            isCheering={cheering}
            onToggleCheer={toggleCrawlCheers}
            onOpenCheers={() => {}}
```

with:

```tsx
          <PubCrawlFeedCard
            crawl={ownViewsCount === null ? crawl : { ...crawl, viewsCount: ownViewsCount }}
            currentUserId={currentUserId}
            isCheering={cheering}
            onToggleCheer={toggleCrawlCheers}
            onOpenCheers={() => {}}
            onOpenViewers={setViewersTarget}
```

Replace:

```tsx
        <FeedSessionCard
          item={session}
          currentUserId={currentUserId}
          isCheering={cheering}
          onDeleteSession={deleteSession}
          onEditSession={editSession}
          onOpenCheers={() => {}}
```

with:

```tsx
        <FeedSessionCard
          item={ownViewsCount === null ? session : { ...session, views_count: ownViewsCount }}
          currentUserId={currentUserId}
          isCheering={cheering}
          onDeleteSession={deleteSession}
          onEditSession={editSession}
          onOpenCheers={() => {}}
          onOpenViewers={setViewersTarget}
```

Then replace the `renderHeader` dependency array:

```typescript
  }, [cheering, crawl, currentUserId, deleteSession, editSession, openComments, openProfile, session, toggleCheers, toggleCrawlCheers]);
```

with:

```typescript
  }, [cheering, crawl, currentUserId, deleteSession, editSession, openComments, openProfile, ownViewsCount, session, toggleCheers, toggleCrawlCheers]);
```

- [ ] **Step 5: Mount the modal**

Replace:

```tsx
      <ImageViewerModal
        visible={Boolean(viewingImageUrl)}
        imageUrl={viewingImageUrl}
        onClose={() => setViewingImageUrl(null)}
      />
    </View>
  );
};
```

with:

```tsx
      <ImageViewerModal
        visible={Boolean(viewingImageUrl)}
        imageUrl={viewingImageUrl}
        onClose={() => setViewingImageUrl(null)}
      />

      <PostViewersModal
        target={viewersTarget}
        onClose={() => setViewersTarget(null)}
        onOpenProfile={(userId) => {
          setViewersTarget(null);
          openProfile(userId);
        }}
      />
    </View>
  );
};
```

- [ ] **Step 6: Run the tests**

Run: `npm run test:post-views`
Expected: PASS with `post views checks passed`.

Run: `npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: same as baseline.

- [ ] **Step 7: Commit**

```bash
git add src/screens/PostDetailScreen.tsx
git commit -m "feat: record and show post views on the post detail screen"
```

---

### Task 9: Apply The Migration And Verify End To End

**Files:** none (verification only)

- [ ] **Step 1: Run the related automated checks**

Run:

```bash
npm run test:post-views && npm run test:feed-api && npm run test:feed-list && npm run test:feed-redesign && npm run test:pub-crawl && npm run test:feed-header && npm run test:native-pwa-parity && npm run test:session-feed-details && npm run test:feed-pagination
```

Expected: every script prints its "passed" line and the chain exits 0.

- [ ] **Step 2: Apply the migration to the linked Supabase project**

Run: `npx supabase db push`
Expected: `20261125120000_add_post_views.sql` is applied with no errors.

- [ ] **Step 3: Check privacy rules in the Supabase SQL editor**

Do not commit real user ids. With two test accounts, A (author) and B (follows A):

1. As B, call `select public.record_post_views(array['<A session id>']::uuid[], array[]::uuid[]);`. Then as A, `select * from public.get_post_viewers('session', '<A session id>');` returns one row for B.
2. As B, `select * from public.get_post_viewers('session', '<A session id>');` returns **zero rows**.
3. As A, `select public.record_post_views(array['<A session id>']::uuid[], array[]::uuid[]);` adds **no** row for A.
4. As B, `select * from public.session_views;` returns **zero rows** (RLS).

- [ ] **Step 4: Manual QA on the PWA**

Run: `npm run build:web && npm run preview:web`

1. Signed in as B, scroll the feed so that A's post is mostly on screen for more than 1 second, then switch to another tab.
2. Flick quickly past a different post by A (under 1 second on screen). Expected: no view recorded for that post.
3. Signed in as A, pull to refresh. Expected: "Seen by 1 person" with an eye icon under the cheers row of the first post only.
4. Tap it. Expected: the "Seen by" sheet lists B with "Seen just now" and the footer "Only you can see who viewed your post." Tapping B opens B's profile.
5. As B, open A's pub crawl from a notification. As A, refresh. Expected: the crawl shows "Seen by 1 person".
6. As B, confirm no "Seen by" row appears on any of A's posts.
7. Turn off the network as A and open the sheet. Expected: "Couldn’t load viewers." with a working Retry.

- [ ] **Step 5: Manual QA on Android (native build)**

Repeat steps 1, 3 and 4 in the Android build (`npm run android`) to confirm `FlashList` reports viewability the same way.

---

## Known Limitations

- **Very tall cards:** with `itemVisiblePercentThreshold: 50`, a card taller than twice the screen height can never be 50% visible. Feed cards are well under that today. If expanded pub crawls ever get that tall, switch to tracking with `viewAreaCoveragePercentThreshold`.
- **Closing the app mid-batch:** views are sent within about 4 seconds, and on blur or background. If the browser tab is killed before the request completes, up to 4 seconds of views can be lost. That post will be recorded the next time it is seen.
- **Navigating away within 1 second** of a card appearing skips that card until it scrolls into view again.

## Out Of Scope (Possible Follow-Ups)

- A per-user "hide my views" privacy setting. This needs a `profiles.hide_post_views` column checked inside `record_post_views`.
- Showing who cheered or commented with a badge inside the "Seen by" list.
- Live-updating counts through Supabase Realtime. Counts refresh on pull-to-refresh and on refocus today.
- Retention cleanup, for example deleting view rows older than 90 days from a scheduled function.
- Views for official Beerva posts, which would give admin-only reach analytics.
