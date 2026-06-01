const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recordSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'), 'utf8');
const modalSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/ChugAttemptModal.tsx'), 'utf8');

assert.match(recordSource, /ChugAttemptModal/, 'record screen should render the chug modal');
assert.match(recordSource, /How fast can you chug\?/, 'record screen should expose the chug entry point');
assert.match(recordSource, /ImagePicker\.launchCameraAsync\(\{[\s\S]*mediaTypes:\s*\['videos'\]/, 'record flow should launch camera in video mode');
assert.match(recordSource, /videoMaxDuration:\s*CHUG_VIDEO_MAX_SECONDS/, 'record flow should cap chug video length');
assert.match(recordSource, /analyzeChugVideo/, 'record flow should analyze chug video locally');
assert.match(recordSource, /uploadChugProofVideo/, 'record flow should upload accepted proof video');
assert.match(recordSource, /\.from\('session_chug_attempts'\)\s*[\s\S]*?\.insert/, 'record flow should insert a chug attempt');
assert.match(recordSource, /ai_duration_ms:\s*chugAnalysisPreview\.durationMs/, 'record flow should preserve the original AI timing');
assert.match(recordSource, /type:\s*'chug_verification'/, 'record flow should notify chosen verifier');
assert.match(recordSource, /isBottleChugEligibleBeer/, 'record flow should filter 33cl bottled beers');
assert.match(modalSource, /mutualFollowers/, 'chug modal should receive mutual followers');
assert.match(modalSource, /eligibleBeers/, 'chug modal should receive eligible beers');
assert.match(modalSource, /Chugs are 33cl bottled beers only for now\./, 'modal should explain 33cl-only rule');
assert.match(modalSource, /person_drinking_beer\.png/, 'modal should render the supplied recording-angle illustration');
assert.match(modalSource, /Best recording angle/, 'modal should label the recording-angle guidance');
assert.match(
  modalSource,
  /Keep the face and bottle visible\. Film from a slight side angle in good lighting\./,
  'modal should explain how to frame the chug video'
);

console.log('chug record screen checks passed');
