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
  MAX_SESSION_PHOTOS,
  TEMP_SESSION_PHOTO_LIFETIME_MS,
  buildSessionPhotoRecords,
  getAllSessionPhotoUrls,
  getVisibleSessionPhotoUrls,
} = loadTypeScriptModule('src/lib/sessionPhotos.ts');
const recordScreenSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'),
  'utf8'
);
const feedScreenSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/FeedScreen.tsx'),
  'utf8'
);
const pubCrawlCarouselSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/components/PubCrawlMediaCarousel.tsx'),
  'utf8'
);
const cleanupFunctionSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase/functions/cleanup-temporary-photos/index.ts'),
  'utf8'
);

assert.equal(MAX_SESSION_PHOTOS, 5, 'sessions should allow one keeper plus four temporary photos');
assert.equal(TEMP_SESSION_PHOTO_LIFETIME_MS, 24 * 60 * 60 * 1000, 'temporary session photos should expire after 24 hours');

const now = Date.parse('2026-06-02T12:00:00.000Z');
const records = buildSessionPhotoRecords(
  'session-1',
  ['https://example.com/one.jpg', 'https://example.com/two.jpg', 'https://example.com/three.jpg'],
  1,
  now
);

assert.deepEqual(
  records.map((record) => ({ url: record.image_url, keeper: record.is_keeper })),
  [
    { url: 'https://example.com/one.jpg', keeper: false },
    { url: 'https://example.com/two.jpg', keeper: true },
    { url: 'https://example.com/three.jpg', keeper: false },
  ],
  'photo records should preserve picked order and mark exactly the selected keeper'
);
assert.equal(records[1].expires_at, null, 'keeper photo should not expire');
assert.equal(
  records[0].expires_at,
  '2026-06-03T12:00:00.000Z',
  'temporary photos should expire 24 hours after publishing'
);

const photos = [
  {
    id: 'temp-live',
    image_url: 'https://example.com/temp-live.jpg',
    is_keeper: false,
    expires_at: '2026-06-02T13:00:00.000Z',
    created_at: '2026-06-02T12:02:00.000Z',
  },
  {
    id: 'keeper',
    image_url: 'https://example.com/keeper.jpg',
    is_keeper: true,
    expires_at: null,
    created_at: '2026-06-02T12:01:00.000Z',
  },
  {
    id: 'temp-expired',
    image_url: 'https://example.com/temp-expired.jpg',
    is_keeper: false,
    expires_at: '2026-06-02T11:59:00.000Z',
    created_at: '2026-06-02T12:00:00.000Z',
  },
];

assert.deepEqual(
  getVisibleSessionPhotoUrls(photos, 'https://example.com/fallback.jpg', now),
  ['https://example.com/keeper.jpg', 'https://example.com/temp-live.jpg'],
  'feed carousel should show keeper first and hide expired temporary photos'
);

assert.deepEqual(
  getAllSessionPhotoUrls(photos, 'https://example.com/fallback.jpg'),
  [
    'https://example.com/keeper.jpg',
    'https://example.com/temp-expired.jpg',
    'https://example.com/temp-live.jpg',
    'https://example.com/fallback.jpg',
  ],
  'delete flows should include every stored photo URL plus the legacy fallback URL'
);

assert.match(
  recordScreenSource,
  /allowsMultipleSelection:\s*availableSlots > 1/,
  'library picker should enable multi-select when more than one session photo slot is open'
);
assert.match(
  recordScreenSource,
  /selectionLimit:\s*availableSlots/,
  'library picker should cap selected photos to the remaining session slots'
);
assert.match(
  recordScreenSource,
  /handleImageAssets\(result\.assets\)/,
  'library picker should process every returned asset instead of only result.assets[0]'
);
assert.match(
  recordScreenSource,
  /styles\.photoStripBlock/,
  'record screen should expose selected photo thumbnails for keeper changes and removal'
);
assert.match(
  feedScreenSource,
  /fetchSessionFeedDetails/,
  'feed should fetch session photos through the consolidated feed details RPC'
);
assert.match(
  feedScreenSource,
  /getVisibleSessionPhotoUrls\(item\.session_photos,\s*item\.image_url\)/,
  'feed card should render the keeper-first visible photo list'
);
assert.match(
  feedScreenSource,
  /onScroll=\{handlePhotoScroll\}/,
  'session carousel should update its active dot while scrolling'
);
assert.match(
  feedScreenSource,
  /<View pointerEvents="none" style=\{styles\.photoIndicatorContainer\}>/,
  'session carousel dots should not intercept swipe gestures'
);
assert.match(
  pubCrawlCarouselSource,
  /onScroll=\{handleScroll\}/,
  'pub crawl carousel should update its active dot while scrolling'
);
assert.match(
  pubCrawlCarouselSource,
  /<View pointerEvents="none" style=\{styles\.indicatorContainer\}>/,
  'pub crawl carousel dots should not intercept swipe gestures'
);
assert.match(
  cleanupFunctionSource,
  /SESSION_PHOTO_BUCKET = 'session_images'/,
  'temporary photo cleanup should remove objects from the session_images bucket'
);

console.log('session photo helpers tests passed');
