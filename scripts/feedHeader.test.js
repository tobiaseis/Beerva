const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const feedScreenSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/FeedScreen.tsx'),
  'utf8'
);

assert.match(
  feedScreenSource,
  /paddingTop:\s*Platform\.OS === 'web' \? 12 : 52/,
  'feed header should use tighter top padding around the Beerva logo'
);

assert.match(
  feedScreenSource,
  /paddingBottom:\s*Platform\.OS === 'web' \? 10 : 14/,
  'feed header should use tighter bottom padding around the Beerva logo'
);

console.log('feed header spacing checks passed');
