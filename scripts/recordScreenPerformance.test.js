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
assert.match(
  source,
  /const \[pubRefreshingNearby, setPubRefreshingNearby\] = useState\(false\);/,
  'RecordScreen tracks nearby pub refresh separately from the blocking saved-pub search'
);
assert.match(
  source,
  /const results = await searchCachedPubs\([\s\S]*?setPubOptions\(results\);[\s\S]*?setPubSearching\(false\);[\s\S]*?getPreviouslyGrantedDeviceLocation/,
  'saved pub matches should render before optional location lookup starts'
);
assert.match(
  source,
  /setPubRefreshingNearby\(true\);[\s\S]*?fetchAndCacheNearbyPubs\(searchLocation, cleanPub\)/,
  'OpenStreetMap enrichment should run as a nearby refresh after cached results are shown'
);
assert.doesNotMatch(
  source,
  /getPreviouslyGrantedDeviceLocation\(\)\s*\|\|\s*await getCurrentDeviceLocation\(\)/,
  'typing in pub search should not prompt for fresh location; the Nearby button owns that'
);
assert.match(
  source,
  /pubRefreshingNearby \? \([\s\S]*?Checking nearby pubs/,
  'RecordScreen should show a non-blocking nearby refresh hint'
);
