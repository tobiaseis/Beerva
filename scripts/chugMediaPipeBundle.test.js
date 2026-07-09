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
assert.match(source, /'cup'/, 'MediaPipe detector should accept cup as a bottle-like fallback label');
assert.match(source, /'wine glass'/, 'MediaPipe detector should accept wine glass as a bottle-like fallback label');
assert.match(source, /getFaceBoxFromLandmarks/, 'MediaPipe analyzer should derive full-face geometry for occlusion scoring');
assert.match(source, /getLowerFaceBoxFromFaceBox/, 'MediaPipe analyzer should send lower-face geometry to the detector');
assert.match(source, /getFaceAnchorFromLandmarks/, 'MediaPipe analyzer should send a stable face anchor to the detector');
assert.match(source, /getAverageLandmarkVisibility/, 'MediaPipe analyzer should send mouth landmark visibility to the detector');
assert.match(source, /bottleScore/, 'MediaPipe analyzer should send object detector confidence to the detector');
assert.match(source, /CHUG_VIDEO_SEEK_TIMEOUT_MS/, 'MediaPipe analyzer should bound video seek waits');
assert.match(source, /CHUG_ANALYSIS_TIMEOUT_MS/, 'MediaPipe analyzer should bound total analysis time');
assert.match(source, /seekVideoTo/, 'MediaPipe analyzer should use a guarded seek helper');
assert.match(source, /waitForVideoEvent/, 'MediaPipe analyzer should time out video loading events');
assert.match(
  source,
  /Automatic chug timing took too long/,
  'MediaPipe analyzer should explain timeout fallback to manual timing'
);

console.log('chug MediaPipe bundle guard passed');
