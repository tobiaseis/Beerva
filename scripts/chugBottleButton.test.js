const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const assetPath = path.resolve(__dirname, '..', 'assets/chug-bottle-button.png');

assert.ok(fs.existsSync(assetPath), 'generated chug bottle asset should exist');

const png = PNG.sync.read(fs.readFileSync(assetPath));
assert.equal(png.width, 1600, 'generated chug bottle asset should use the stable wrapper width');
assert.equal(png.height, 360, 'generated chug bottle asset should use the stable wrapper height');

const alphaAt = (x, y) => png.data[((png.width * y) + x) * 4 + 3];
[
  [0, 0],
  [png.width - 1, 0],
  [0, png.height - 1],
  [png.width - 1, png.height - 1],
].forEach(([x, y]) => {
  assert.equal(alphaAt(x, y), 0, `asset corner ${x},${y} should be transparent`);
});

let visiblePixels = 0;
for (let offset = 3; offset < png.data.length; offset += 4) {
  if (png.data[offset] > 8) visiblePixels += 1;
}

const visibleRatio = visiblePixels / (png.width * png.height);
assert.ok(visibleRatio > 0.28, 'bottle should occupy enough of the canvas to read as a button');
assert.ok(visibleRatio < 0.88, 'bottle canvas should preserve transparent space around the cutout');
assert.ok(alphaAt(520, 180) > 80, 'wide bottle body should remain visible behind the label area');

const componentSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/components/ChugBottleButton.tsx'),
  'utf8'
);

assert.match(componentSource, /require\('\.\.\/\.\.\/assets\/chug-bottle-button\.png'\)/, 'component should use the generated bottle asset');
assert.match(componentSource, /Image as SvgImage/, 'component should render the bottle asset inside SVG');
assert.match(componentSource, /Text as SvgText/, 'component should render the editable label as SVG text');
assert.match(componentSource, /const renderedFontSize = clamp\(width \* 0\.044, 13, 18\)/, 'label size should adapt to phone width within readable bounds');
assert.match(componentSource, /const renderedLetterSpacing = clamp\(width \* 0\.004, 0\.6, 1\.5\)/, 'label spacing should tighten on narrow phones');
assert.match(componentSource, /textLength=\{TEXT_MAX_WIDTH\}/, 'label should be constrained to the text-safe bottle body width');
assert.match(componentSource, /const LABEL = 'HOW FAST CAN YOU CHUG\?';/, 'component should keep the editable chug action label without a trailing chevron');
assert.doesNotMatch(componentSource, /shadowColor|shadowOffset|shadowOpacity|shadowRadius|elevation/, 'component wrapper should not add an exterior glow box');
assert.doesNotMatch(componentSource, /SvgXml|BOTTLE_SVG|<path/, 'component should no longer draw the bottle with authored SVG paths');

console.log('responsive chug bottle asset checks passed');
