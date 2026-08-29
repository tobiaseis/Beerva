const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'),
  'utf8'
);

assert.match(
  source,
  /PlaceCategory/,
  'Record screen should use the shared place category type'
);

assert.match(
  source,
  /pubCategoryChoiceVisible/,
  'Record screen should track whether the category choice sheet is visible'
);

assert.match(
  source,
  /setPubCategoryChoiceVisible\(true\)/,
  'pressing the add-new-place footer should open the category sheet'
);

assert.match(
  source,
  /addTypedPub\('pub'\)/,
  'category sheet should create real pubs with the pub category'
);

assert.match(
  source,
  /addTypedPub\('other'\)/,
  'category sheet should create non-pub places with the other category'
);

assert.match(
  source,
  />\s*Choose place type\s*<\/Text>/,
  'category sheet should clearly ask for the place type'
);

assert.match(
  source,
  />\s*Counts toward Pub Legends\s*<\/Text>/,
  'pub option should explain that it counts toward Pub Legends'
);

assert.match(
  source,
  />\s*Excluded from Pub Legends\s*<\/Text>/,
  'other option should explain that it is excluded from Pub Legends'
);

assert.match(
  source,
  /openPubCategoryChoice = \(target: PubDraftTarget/,
  'the category sheet should know which pub field asked for the new place'
);

assert.match(
  source,
  /openPubCategoryChoice\('crawl'\)|renderAddPlaceFooter\(cleanCrawlPubDraft, 'crawl'\)/,
  'the pub crawl next-stop field should offer the same add-new-place footer'
);

assert.match(
  source,
  /footer=\{addCrawlPubFooter\}/,
  'crawl pub inputs should render the add-new-place footer'
);

assert.match(
  source,
  /const resolveCrawlPubRecord = async/,
  'crawl stops should resolve a real pub record for typed names'
);

assert.match(
  source,
  /return await createUserPub\(cleanDraft, await resolveNewPlaceLocation\(\)\)/,
  'a typed crawl stop that matches no known pub should be created in the pub directory with a location'
);

assert.match(
  source,
  /const pubRecord = await resolveCrawlPubRecord\(cleanDraft\);[\s\S]*finishCrawlStopAndStartNext/,
  'moving to the next bar should persist the typed place before starting the next stop'
);

console.log('record place category checks passed');
