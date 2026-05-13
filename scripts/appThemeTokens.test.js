const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(__dirname, '..', relativePath),
  'utf8'
);

const colorsSource = readSource('src/theme/colors.ts');
const feedCardSource = readSource('src/theme/feedCard.ts');
const surfaceSource = readSource('src/components/Surface.tsx');

assert.match(
  colorsSource,
  /card:\s*appThemeColors\.card/,
  'shared card color should point at the feed card surface'
);
assert.match(
  colorsSource,
  /surface:\s*appThemeColors\.inset/,
  'shared inset surface should point at the feed stat surface'
);
assert.match(
  colorsSource,
  /surfaceRaised:\s*appThemeColors\.floating/,
  'raised surfaces should use the floating feed/nav surface'
);
assert.match(
  colorsSource,
  /border:\s*appThemeColors\.border/,
  'strong borders should use the feed soft border'
);
assert.match(
  colorsSource,
  /borderSoft:\s*appThemeColors\.divider/,
  'soft borders should use the feed divider'
);
assert.match(
  colorsSource,
  /card:\s*'rgba\(15,\s*23,\s*42,\s*0\.82\)'/,
  'feed card surface value should be app-wide'
);
assert.match(
  colorsSource,
  /inset:\s*'rgba\(15,\s*23,\s*42,\s*0\.56\)'/,
  'feed stat inset value should be app-wide'
);
assert.match(
  colorsSource,
  /floating:\s*'#172238'/,
  'floating nav/feed raised color should be app-wide'
);
assert.match(
  colorsSource,
  /border:\s*'rgba\(148,\s*163,\s*184,\s*0\.12\)'/,
  'feed card border value should be app-wide'
);
assert.match(
  colorsSource,
  /divider:\s*'rgba\(148,\s*163,\s*184,\s*0\.10\)'/,
  'feed metadata divider value should be app-wide'
);

assert.match(
  feedCardSource,
  /import \{ colors \} from '\.\/colors';/,
  'feed card tokens should consume shared app theme colors'
);
assert.match(
  feedCardSource,
  /card:\s*colors\.card/,
  'feed cards should use the shared app card surface'
);
assert.match(
  feedCardSource,
  /statBackground:\s*colors\.cardMuted/,
  'feed stat surfaces should use the shared app inset surface'
);

assert.match(
  surfaceSource,
  /backgroundColor:\s*colors\.card/,
  'Surface default should use the shared feed card surface'
);
assert.match(
  surfaceSource,
  /backgroundColor:\s*colors\.surfaceRaised/,
  'Surface raised variant should use the shared floating surface'
);
assert.match(
  surfaceSource,
  /borderColor:\s*colors\.borderSoft/,
  'Surface should keep the shared feed divider border'
);

console.log('app theme token checks passed');
