const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

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

const {
  getOfficialNotificationBody,
  getOfficialNotificationTitle,
  getNotificationMessage,
  getNotificationPubName,
} = loadTypeScriptModule('src/lib/notificationMessages.ts');
const {
  getNotificationPostTarget,
  getPostLaunchParamsFromSearch,
  normalizePostTargetType,
} = loadTypeScriptModule('src/lib/postTargets.ts');

assert.equal(
  normalizePostTargetType('pub_crawl'),
  'pub_crawl',
  'post target normalization should preserve pub crawl targets'
);

assert.equal(
  normalizePostTargetType('anything-else'),
  'session',
  'post target normalization should default older notifications to session targets'
);

assert.deepEqual(
  getPostLaunchParamsFromSearch('?post=crawl-1&post_type=pub_crawl&notificationId=notif-1'),
  { targetType: 'pub_crawl', targetId: 'crawl-1', notificationId: 'notif-1' },
  'post launch params should parse pub crawl deep links'
);

assert.deepEqual(
  getPostLaunchParamsFromSearch('?post=session-1'),
  { targetType: 'session', targetId: 'session-1', notificationId: null },
  'post launch params should keep old session-only deep links working'
);

assert.equal(
  getPostLaunchParamsFromSearch('?notifications=1'),
  null,
  'post launch params should ignore non-post URLs'
);

assert.deepEqual(
  getNotificationPostTarget({
    reference_id: 'crawl-1',
    metadata: { target_type: 'pub_crawl' },
  }),
  { targetType: 'pub_crawl', targetId: 'crawl-1' },
  'notification rows should expose typed pub crawl post targets'
);

assert.deepEqual(
  getNotificationPostTarget({
    reference_id: 'session-1',
    metadata: null,
  }),
  { targetType: 'session', targetId: 'session-1' },
  'older notification rows without metadata should open session posts'
);

assert.deepEqual(
  getNotificationPostTarget({
    reference_id: 'session-buddy-row-1',
    metadata: { target_type: 'session', session_id: 'session-1' },
  }),
  { targetType: 'session', targetId: 'session-1' },
  'drinking buddy notifications should open the session from metadata instead of the buddy row'
);

assert.equal(
  getNotificationPubName({
    metadata: { pub_name: '  John Bull Pub  ' },
    session: null,
  }),
  'John Bull Pub',
  'notification metadata should be the first source for pub names'
);

assert.equal(
  getNotificationPubName({
    metadata: {},
    session: { pub_name: 'The Wharf' },
  }),
  'The Wharf',
  'session preview should remain a fallback for older notifications'
);

assert.equal(
  getNotificationMessage({
    type: 'session_started',
    metadata: { pub_name: 'John Bull Pub' },
    session: null,
  }),
  ' started a drinking session at John Bull Pub.'
);

assert.equal(
  getNotificationMessage({
    type: 'pub_crawl_started',
    metadata: { pub_name: 'John Bull Pub' },
    session: null,
  }),
  ' started a pub crawl at John Bull Pub.'
);

assert.equal(
  getNotificationMessage({
    type: 'drinking_buddy_added',
    metadata: { session_id: 'session-1', target_type: 'session' },
    session: null,
  }),
  ' added you as a drinking buddy.'
);

assert.equal(
  getNotificationMessage({ type: 'beverage_submission', metadata: { beverage_name: 'Missing Pub Ale' } }),
  ' submitted Missing Pub Ale for Beerva approval.'
);

assert.equal(
  getOfficialNotificationTitle({ type: 'official_post', metadata: { official_title: 'Booze-in-June has begun' } }),
  'Booze-in-June has begun'
);
assert.equal(
  getOfficialNotificationBody({ type: 'official_post', metadata: { notification_body: 'Tap to join.' } }),
  'Tap to join.'
);

const recordScreenSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'), 'utf8');
assert.match(
  recordScreenSource,
  /metadata:\s*\{\s*pub_name:/,
  'session/pub crawl start notifications should include pub_name metadata at insert time'
);

const notificationsScreenSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/NotificationsScreen.tsx'), 'utf8');
assert.match(
  notificationsScreenSource,
  /\.select\('id, actor_id, type, reference_id, metadata, read, created_at'\)/,
  'notifications screen should fetch metadata with each notification'
);
assert.match(
  notificationsScreenSource,
  /getNotificationMessage/,
  'notifications screen should render messages through the shared metadata-aware helper'
);
assert.match(
  notificationsScreenSource,
  /getNotificationPostTarget/,
  'notifications screen should derive typed post navigation targets through the shared helper'
);
assert.match(
  notificationsScreenSource,
  /drinking_buddy_added/,
  'notifications screen should know drinking buddy notifications'
);
assert.match(
  notificationsScreenSource,
  /declineSessionBuddy/,
  'notifications screen should decline drinking buddy tags through shared API'
);
assert.match(
  notificationsScreenSource,
  /Not with me/,
  'drinking buddy notifications should expose the opt-out copy'
);
assert.match(
  notificationsScreenSource,
  /Removed from this session/,
  'declined buddy notifications should show removal status'
);
assert.match(
  notificationsScreenSource,
  /item\.session\?\.status === 'published'/,
  'drinking buddy notifications should only open posts after the session is published'
);
assert.match(notificationsScreenSource, /\| 'beverage_submission'/, 'notifications screen should include beverage submission type');
assert.match(notificationsScreenSource, /item\.type === 'beverage_submission'/, 'notifications screen should route beverage submission rows');
assert.match(notificationsScreenSource, /initialSegment: 'submissions'/, 'beverage submission notifications should open admin submissions');

const rootNavigatorSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/navigation/RootNavigator.tsx'), 'utf8');
assert.match(
  rootNavigatorSource,
  /getPostLaunchParamsFromSearch/,
  'root navigator should parse typed post deep links through the shared helper'
);
assert.match(
  rootNavigatorSource,
  /targetType:\s*pendingPostOpen\.targetType/,
  'root navigator should pass the parsed post target type to PostDetail'
);

const postDetailSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/PostDetailScreen.tsx'), 'utf8');
assert.match(
  postDetailSource,
  /targetType/,
  'post detail screen should accept typed post targets'
);
assert.match(
  postDetailSource,
  /fetchPublishedPubCrawlById/,
  'post detail screen should be able to load pub crawl posts by id'
);

const pubCrawlsApiSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/pubCrawlsApi.ts'), 'utf8');
assert.match(
  pubCrawlsApiSource,
  /fetchPublishedPubCrawlById/,
  'pub crawl API should expose a detail fetch helper for notification deep links'
);

const feedScreenSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/FeedScreen.tsx'), 'utf8');
assert.match(
  feedScreenSource,
  /target_type:\s*'session'/,
  'session cheer/comment notifications should snapshot a session target type'
);
assert.match(
  feedScreenSource,
  /target_type:\s*'pub_crawl'/,
  'pub crawl cheer/comment notifications should snapshot a pub crawl target type'
);

const sendPushSource = fs.readFileSync(path.resolve(__dirname, '..', 'supabase/functions/send-push/index.ts'), 'utf8');
assert.match(sendPushSource, /pub_crawl_started/, 'push delivery should support pub crawl start notifications');
assert.match(sendPushSource, /record\.metadata\?\.pub_name/, 'push delivery should prefer notification metadata pub names');
assert.match(sendPushSource, /started a pub crawl at/, 'pub crawl push text should include the pub name when available');
assert.match(sendPushSource, /post_type/, 'cheer/comment push URLs should include the post target type');
assert.match(sendPushSource, /beverage_submission/, 'push delivery should support beverage submission notifications');

const migrationSql = fs
  .readdirSync(path.resolve(__dirname, '..', 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => fs.readFileSync(path.resolve(__dirname, '..', 'supabase/migrations', file), 'utf8'))
  .join('\n');
const beverageSubmissionsMigrationSql = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase/migrations/20260708170000_add_user_beverage_submissions.sql'),
  'utf8'
);
assert.match(migrationSql, /add column if not exists metadata jsonb/, 'notifications should have metadata jsonb storage');
assert.match(migrationSql, /set_notification_metadata/, 'database should backfill notification metadata on insert');
assert.match(migrationSql, /update public\.notifications/, 'migration should backfill pub_name metadata for existing start notifications');
assert.match(
  migrationSql,
  /notifications\.type in \('cheer', 'comment'\)[\s\S]*jsonb_build_object\('target_type', 'pub_crawl'\)/,
  'notification metadata should include typed pub crawl post targets for cheer/comment links'
);
assert.match(
  migrationSql,
  /type = 'cheer'[\s\S]*pub_crawl_cheers[\s\S]*pub_crawl_cheers\.pub_crawl_id = notifications\.reference_id/,
  'notification insert policy should allow pub crawl cheer notifications'
);
assert.match(
  beverageSubmissionsMigrationSql,
  /notifications_type_check[\s\S]*'beverage_submission'/i,
  'notifications should support beverage submission rows'
);

console.log('notification tests passed');
