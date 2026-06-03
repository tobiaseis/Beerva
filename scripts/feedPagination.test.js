const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const { sortFeedItemsByPublishedAt, appendFeedPage } = loadTypeScriptModule('src/lib/feedPagination.ts');

// Page 1 (already displayed): two recent sessions plus an older, sparse crawl
// that page 1 over-fetched relative to the dense session window.
const previous = [
  { id: 'S1', publishedAt: '2026-06-02T12:00:00Z' },
  { id: 'S2', publishedAt: '2026-06-02T11:00:00Z' },
  { id: 'Cold', publishedAt: '2026-06-02T05:00:00Z' },
];

// Page 2: more sessions, newer than the old crawl but older than S2.
const page2 = [
  { id: 'S3', publishedAt: '2026-06-02T10:00:00Z' },
  { id: 'S4', publishedAt: '2026-06-02T09:00:00Z' },
];

// --- Documents the bug: a global re-sort relocates an already-shown item. ---
const naiveResort = sortFeedItemsByPublishedAt([...previous, ...page2]);
assert.equal(previous.findIndex((i) => i.id === 'Cold'), 2, 'Cold starts at index 2 while displayed');
assert.notEqual(
  naiveResort.findIndex((i) => i.id === 'Cold'),
  2,
  'global re-sort moves the already-shown Cold item below the new page (the scroll glitch)'
);

// --- The fix: appendFeedPage never moves already-shown items. ---
const appended = appendFeedPage(previous, page2);
assert.deepEqual(
  appended.slice(0, previous.length).map((i) => i.id),
  ['S1', 'S2', 'Cold'],
  'already-displayed items keep their exact order after appending a page'
);
assert.deepEqual(
  appended.slice(previous.length).map((i) => i.id),
  ['S3', 'S4'],
  'new page items are appended after, sorted among themselves'
);

// --- De-duplication: items already shown are not appended again. ---
const withDup = appendFeedPage(previous, [
  { id: 'S2', publishedAt: '2026-06-02T11:00:00Z' },
  { id: 'S5', publishedAt: '2026-06-02T08:00:00Z' },
]);
assert.deepEqual(
  withDup.map((i) => i.id),
  ['S1', 'S2', 'Cold', 'S5'],
  'duplicates are filtered, only genuinely new items are appended',
);

// --- sort helper: newest first ---
const sorted = sortFeedItemsByPublishedAt([
  { id: 'a', publishedAt: '2026-06-01T00:00:00Z' },
  { id: 'b', publishedAt: '2026-06-03T00:00:00Z' },
  { id: 'c', publishedAt: '2026-06-02T00:00:00Z' },
]);
assert.deepEqual(sorted.map((i) => i.id), ['b', 'c', 'a'], 'sortFeedItemsByPublishedAt orders newest first');

// --- Wiring: FeedScreen appends pages instead of globally re-sorting. ---
const feedSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');
assert.match(feedSource, /appendFeedPage\(previous, merged\)/, 'feed should append pages without re-sorting displayed items');
assert.doesNotMatch(feedSource, /sortFeedItemsByPublishedAt\(\[\.\.\.previous/, 'feed should not globally re-sort the accumulated list on append');

// --- Wiring: official posts fetch a look-ahead row so hasMore can advance. ---
const officialSource = fs.readFileSync(path.join(root, 'src/lib/officialFeedPostsApi.ts'), 'utf8');
assert.match(officialSource, /\.range\(offset, offset \+ limit\)/, 'official posts should fetch one look-ahead row for has-more detection');
assert.doesNotMatch(officialSource, /offset \+ limit - 1/, 'official posts should no longer fetch exactly limit rows');

console.log('feed pagination checks passed');
