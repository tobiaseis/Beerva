const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'),
  'utf8'
);

assert.match(
  source,
  /getTotalBeerQuantity/,
  'active session drink count should count quantities, not just drink rows'
);

assert.match(
  source,
  /const incrementBeerInSession = async/,
  'record screen should expose a fast increment handler for existing drinks'
);

assert.match(
  source,
  /\.from\('session_beers'\)\s*[\s\S]*?\.update\(\{\s*quantity: nextQuantity\s*\}\)/,
  'incrementing an existing drink should update its session_beers quantity'
);

assert.match(
  source,
  /onPress=\{\(\) => incrementBeerInSession\(beer\)\}/,
  'each active-session drink row should wire the plus button to increment that drink'
);

assert.match(
  source,
  /<PlusCircle color=\{colors\.primary\} size=\{17\} \/>/,
  'the fast increment action should use the plus icon beside the delete action'
);

assert.match(
  source,
  /style=\{styles\.beerRowActions\}/,
  'drink row actions should group the plus and delete controls together'
);

console.log('record session drink checks passed');
