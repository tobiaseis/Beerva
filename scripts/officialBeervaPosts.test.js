const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = 'supabase/migrations/20260601160000_add_official_beerva_posts.sql';
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const migrationSql = exists(migrationPath) ? read(migrationPath) : '';

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

assert.ok(exists(migrationPath), 'official posts migration should exist');
assert.match(migrationSql, /add column if not exists admin_request_key uuid/i, 'official posts should store retry keys');
assert.match(migrationSql, /add column if not exists linked_challenge_id uuid/i, 'official posts should store optional linked challenges');
assert.match(migrationSql, /add column if not exists image_url text/i, 'official posts should store one optional image');
assert.match(migrationSql, /official_feed_posts_admin_request_key_idx/i, 'official posts should index retry keys uniquely');
assert.match(migrationSql, /official_post_images/i, 'migration should create official post image storage');
assert.match(migrationSql, /Admins can upload their own official post images/i, 'official image uploads should require an admin folder policy');
assert.match(migrationSql, /alter column actor_id drop not null/i, 'official notifications should allow a null personal actor');
assert.match(migrationSql, /'official_post'/i, 'notifications should support official posts');
assert.match(migrationSql, /create or replace function public\.admin_get_official_posts\(\)/i, 'admins should list official posts');
assert.match(migrationSql, /create or replace function public\.admin_publish_official_post/i, 'admins should publish official posts');
assert.match(migrationSql, /if not public\.is_current_user_admin\(\)/i, 'publication should require an admin');
assert.match(migrationSql, /push notifications require in-app notifications/i, 'push should require in-app delivery');
assert.match(migrationSql, /where official_feed_posts\.admin_request_key = post_request_key/i, 'publication should reuse retry keys');
assert.match(migrationSql, /on conflict \(admin_request_key\)[\s\S]*do nothing/i, 'overlapping publication retries should converge on one post');
assert.match(migrationSql, /insert into public\.notifications/i, 'publication should fan out in-app notifications');
assert.match(migrationSql, /select profiles\.id/i, 'fan-out should create one row per profile');
assert.match(migrationSql, /'push_enabled'/i, 'fan-out should snapshot the push toggle');
assert.match(migrationSql, /notify pgrst,\s*'reload schema'/i, 'migration should refresh PostgREST schema');

const officialFeedPosts = loadTypeScriptModule('src/lib/officialFeedPosts.ts');
const adminTools = loadTypeScriptModule('src/lib/adminTools.ts');

const announcement = officialFeedPosts.mapOfficialFeedPostRow({
  id: 'post-1',
  kind: 'announcement',
  title: 'Booze-in-June has begun',
  body: 'June is here.',
  image_url: 'https://example.com/june.jpg',
  linked_challenge_id: 'challenge-1',
  metadata: { challenge_slug: 'booze-in-june' },
  published_at: '2026-06-01T18:00:00Z',
  created_at: '2026-06-01T18:00:00Z',
});

assert.equal(announcement.imageUrl, 'https://example.com/june.jpg');
assert.equal(announcement.linkedChallengeId, 'challenge-1');
assert.equal(announcement.challengeSlug, 'booze-in-june');
assert.equal(officialFeedPosts.isOfficialWinnerPost(announcement), false);
assert.equal(
  officialFeedPosts.isOfficialWinnerPost(
    officialFeedPosts.mapOfficialFeedPostRow({ kind: 'challenge_winner' })
  ),
  true
);

const emptyOfficialDraft = adminTools.createEmptyOfficialPostDraft();
assert.equal(emptyOfficialDraft.sendInAppNotification, false);
assert.equal(emptyOfficialDraft.sendPushNotification, false);

const juneDraft = adminTools.applyOfficialPostChallengePrefill(
  emptyOfficialDraft,
  { id: 'challenge-1', slug: 'booze-in-june', title: 'Booze-in-June' }
);
assert.equal(juneDraft.title, 'Booze-in-June has begun');
assert.match(juneDraft.body, /liver has been assigned a side quest/);
assert.equal(juneDraft.pushTitle, 'New June challenge');
assert.match(juneDraft.pushBody, /first beer starts counting itself lonely/);
assert.equal(juneDraft.notificationBody, juneDraft.pushBody);

assert.equal(
  adminTools.validateOfficialPostDraft({
    ...juneDraft,
    sendInAppNotification: false,
    sendPushNotification: true,
  }),
  'Enable in-app notifications before sending a push.'
);

assert.equal(
  adminTools.validateOfficialPostDraft({
    ...juneDraft,
    sendInAppNotification: true,
    notificationBody: '',
  }),
  'Notification body is required.'
);

const officialApiSource = read('src/lib/officialFeedPostsApi.ts');
const adminApiSource = read('src/lib/adminApi.ts');
const imageUploadSource = read('src/lib/imageUpload.ts');
assert.match(officialApiSource, /linked_challenge_id/, 'feed API should fetch linked challenge ids');
assert.match(officialApiSource, /image_url/, 'feed API should fetch official post image URLs');
assert.match(adminApiSource, /fetchAdminOfficialPosts/, 'admin API should list official posts');
assert.match(adminApiSource, /publishAdminOfficialPost/, 'admin API should publish official posts');
assert.match(adminApiSource, /post_request_key:\s*input\.requestKey/, 'admin API should send the composer retry key');
assert.match(adminApiSource, /AdminOfficialPostPublishError/, 'admin API should classify uncertain publication failures');
assert.match(adminApiSource, /failed to fetch\|network request failed\|abort/i, 'network failures should remain uncertain after publication');
assert.match(imageUploadSource, /check that the \$\{bucket\} bucket is available/, 'image upload errors should name the requested bucket');

const adminScreenSource = read('src/screens/AdminToolsScreen.tsx');
assert.match(adminScreenSource, /type AdminSegment = 'challenges' \| 'beers' \| 'official-posts'/, 'admin tools should add official posts segment');
assert.match(adminScreenSource, /fetchAdminOfficialPosts/, 'admin tools should load official posts');
assert.match(adminScreenSource, /publishAdminOfficialPost/, 'admin tools should publish official posts');
assert.match(adminScreenSource, /prepareWebImageFromPickerAsset/, 'web official photos should use shared compression');
assert.match(adminScreenSource, /UPLOAD_IMAGE_MAX_WIDTH/, 'native official photos should reuse the session image width');
assert.match(adminScreenSource, /official_post_images/, 'official photos should use the dedicated bucket');
assert.match(adminScreenSource, /admins\/\$\{user\.id\}\/posts/, 'official photos should upload into the current admin folder');
assert.match(adminScreenSource, /Send in-app notification/, 'composer should expose the in-app toggle');
assert.match(adminScreenSource, /Send push notification/, 'composer should expose the push toggle');
assert.match(adminScreenSource, /Select a challenge/, 'composer should expose optional challenge linking');
assert.match(adminScreenSource, /deletePublicImageUrl/, 'definitive publication failures should clean uploaded photos');
assert.match(adminScreenSource, /officialPostRequestKey/, 'manual publication retries should reuse the composer request key');
assert.match(adminScreenSource, /pendingOfficialPostImageUrl/, 'manual retries should reuse a photo uploaded before an uncertain timeout');
assert.match(
  adminScreenSource,
  /Resolve the uncertain publish before closing this post/,
  'admin composer should not discard retry state after an uncertain official-post publish'
);
assert.match(
  adminScreenSource,
  /setOfficialPostPublishUncertain\(true\)/,
  'admin composer should remember when a publish attempt may have succeeded'
);

const officialCardSource = read('src/components/OfficialFeedPostCard.tsx');
const feedScreenSource = read('src/screens/FeedScreen.tsx');
const winnerCardSection = officialCardSource.slice(
  officialCardSource.indexOf('const WinnerOfficialFeedPostCard'),
  officialCardSource.indexOf('const AnnouncementOfficialFeedPostCard')
);
const announcementCardSection = officialCardSource.slice(
  officialCardSource.indexOf('const AnnouncementOfficialFeedPostCard'),
  officialCardSource.indexOf('export const OfficialFeedPostCard')
);
assert.match(officialCardSource, /isOfficialWinnerPost/, 'official card should preserve a winner branch');
assert.match(winnerCardSection, /statGrid/, 'winner announcements should keep official winner stats');
assert.match(
  winnerCardSection,
  /formatOfficialWinnerStat\('True pints'/,
  'winner announcements should render official winner stat values'
);
assert.doesNotMatch(
  announcementCardSection,
  /statGrid|formatOfficialWinnerStat|True pints|Average ABV|Sessions/,
  'promotional announcements should not render winner stats'
);
assert.match(officialCardSource, /Join challenge/, 'announcement card should expose immediate challenge joining');
assert.match(officialCardSource, /View challenge/, 'announcement card should preserve detail navigation');
assert.match(officialCardSource, /post\.imageUrl/, 'announcement card should render optional photos');
assert.match(officialCardSource, /onImagePress/, 'announcement photos should open the shared image viewer');
assert.match(feedScreenSource, /fetchOfficialPostLinkedChallengeSummaries/, 'feed should hydrate linked challenge summaries once per page');
assert.match(feedScreenSource, /handleJoinOfficialPostChallenge/, 'feed should join challenges from announcements');
assert.match(feedScreenSource, /onImagePress=\{setViewingImageUrl\}/, 'feed should route official photos to the existing viewer');
assert.match(
  feedScreenSource,
  /Official challenge actions fetch error/,
  'feed should treat official challenge CTA hydration as best-effort so announcement posts still render'
);

const challengeLaunchParams = loadTypeScriptModule('src/lib/challengeLaunchParams.ts');
assert.deepEqual(
  challengeLaunchParams.getChallengeLaunchParamsFromSearch('?challenge=booze-in-june&notificationId=notif-1'),
  { challengeSlug: 'booze-in-june', notificationId: 'notif-1' }
);
assert.equal(
  challengeLaunchParams.getChallengeLaunchParamsFromSearch('?notifications=1'),
  null
);

const notificationsScreenSource = read('src/screens/NotificationsScreen.tsx');
const navigatorSource = read('src/navigation/RootNavigator.tsx');
assert.match(notificationsScreenSource, /official_post/, 'notifications screen should render official notifications');
assert.match(notificationsScreenSource, /Official Beerva/, 'official notifications should show Beerva identity');
assert.match(notificationsScreenSource, /View challenge/, 'official notifications should open linked challenges');
assert.match(navigatorSource, /getChallengeLaunchParamsFromSearch/, 'navigator should parse challenge push links');
assert.match(navigatorSource, /navigationRef\.navigate\('ChallengeDetail'/, 'navigator should open challenge detail');
assert.match(navigatorSource, /\.from\('notifications'\)[\s\S]*\.update\(\{ read: true \}\)/, 'navigator should mark push-opened challenge notifications read');

console.log('official Beerva post checks passed');
