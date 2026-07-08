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
