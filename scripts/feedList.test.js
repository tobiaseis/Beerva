const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

assert.ok(exists('src/components/FeedList.tsx'), 'FeedList TypeScript fallback should exist');
assert.ok(exists('src/components/FeedList.native.tsx'), 'native FeedList should exist');
assert.ok(exists('src/components/FeedList.web.tsx'), 'web FeedList should exist');

const feedList = read('src/components/FeedList.tsx');
const nativeFeedList = read('src/components/FeedList.native.tsx');
const webFeedList = read('src/components/FeedList.web.tsx');
const feedScreen = read('src/screens/FeedScreen.tsx');
const packageJson = JSON.parse(read('package.json'));

assert.ok(packageJson.dependencies['@shopify/flash-list'], 'FlashList dependency is installed');
assert.doesNotMatch(feedList, /@shopify\/flash-list/, 'shared FeedList fallback should not import FlashList');
assert.match(nativeFeedList, /import \{ FlashList/, 'native FeedList imports FlashList');
assert.match(nativeFeedList, /@shopify\/flash-list/, 'native FeedList owns the FlashList dependency');
assert.match(nativeFeedList, /getItemType/, 'native FeedList exposes item type recycling support');
assert.doesNotMatch(webFeedList, /@shopify\/flash-list/, 'web FeedList should not import FlashList');
assert.match(webFeedList, /FlatList/, 'web FeedList keeps FlatList fallback');
assert.match(feedList, /FlatList/, 'shared FeedList fallback keeps TypeScript on FlatList');
assert.match(feedScreen, /import \{ FeedList \} from '\.\.\/components\/FeedList'/, 'FeedScreen imports FeedList');
assert.match(feedScreen, /<FeedList/, 'FeedScreen renders the main feed through FeedList');
assert.match(feedScreen, /getItemType=\{\(item\) => item\.type\}/, 'FeedScreen gives FlashList stable item types');
assert.equal((feedScreen.match(/\n\s*<FlatList/g) || []).length, 2, 'FeedScreen modal lists stay on FlatList in this phase');
