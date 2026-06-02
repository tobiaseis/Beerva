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

console.log('responsive chug bottle asset checks passed');
