const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

assert.ok(exists('src/lib/feedApi.ts'), 'feedApi module should exist');
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
