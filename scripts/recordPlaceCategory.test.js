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

console.log('record place category checks passed');
