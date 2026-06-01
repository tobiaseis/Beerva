const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/lib/chugMediaPipe.ts'), 'utf8');

assert.doesNotMatch(
  source,
  /import\(['"]@mediapipe\/tasks-vision['"]\)/,
  'MediaPipe loading should not expose a package import to Metro web bundling'
);
assert.match(source, /MEDIAPIPE_MODULE_URL/, 'MediaPipe runtime loader should pin the CDN module URL');
assert.match(source, /new Function\(/, 'MediaPipe runtime loader should use a browser-only dynamic import wrapper');

console.log('chug MediaPipe bundle guard passed');
