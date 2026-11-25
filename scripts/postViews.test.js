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
