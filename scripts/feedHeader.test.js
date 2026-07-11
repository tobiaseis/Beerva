const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const feedScreenSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/FeedScreen.tsx'),
  'utf8'
);

assert.match(
  feedScreenSource,
  /const \{ feedHeaderPaddingTop, tabContentPaddingBottom \} = usePwaParityInsets\(\)/,
  'feed header should use the shared safe-area-aware parity padding'
);

assert.match(
  feedScreenSource,
  /paddingBottom:\s*10/,
  'feed header should preserve the PWA bottom padding around the Beerva logo'
);

assert.match(
  feedScreenSource,
  /<View style=\{styles\.logoContainer\}>[\s\S]*<View style=\{styles\.headerActions\}>[\s\S]*<LiveMateButton[\s\S]*<TouchableOpacity\s+style=\{styles\.bellButton\}/,
  'feed header should place the live button between the Beerva logo area and notification bell'
);

console.log('feed header spacing checks passed');
