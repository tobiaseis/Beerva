const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const feedScreen = read('src/screens/FeedScreen.tsx');
const feedApi = read('src/lib/feedApi.ts');
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
  /appendFeedPage\(previous,\s*result\.items\)/,
  'FeedScreen keeps append-only pagination for infinite scroll'
);

assert.match(
  feedApi,
  /sortFeedItemsByPublishedAt/,
  'feedApi sorts each new page before FeedScreen appends it'
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
