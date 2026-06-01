const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recordSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'), 'utf8');
const modalSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/ChugAttemptModal.tsx'), 'utf8');

assert.match(recordSource, /ChugAttemptModal/, 'record screen should render the chug modal');
assert.match(recordSource, /How fast can you chug\?/, 'record screen should expose the chug entry point');
assert.match(recordSource, /chugBottleButton/, 'record screen should render the chug entry point as a bottle button');
assert.match(recordSource, /chugBottleBody/, 'chug button should include a beer bottle body');
assert.match(recordSource, /chugBottleNeck/, 'chug button should include a beer bottle neck');
assert.match(recordSource, /chugBottleCap/, 'chug button should include a beer bottle cap');
assert.match(recordSource, /chugBottleLabel/, 'chug button should include a label area for the text');
assert.match(recordSource, /ImagePicker\.launchCameraAsync\(\{[\s\S]*mediaTypes:\s*\['videos'\]/, 'record flow should launch camera in video mode');
assert.match(recordSource, /videoMaxDuration:\s*CHUG_VIDEO_MAX_SECONDS/, 'record flow should cap chug video length');
assert.match(recordSource, /analyzeChugVideo/, 'record flow should analyze chug video locally');
assert.match(recordSource, /uploadChugProofVideo/, 'record flow should upload accepted proof video');
assert.match(recordSource, /\.from\('session_chug_attempts'\)\s*[\s\S]*?\.insert/, 'record flow should insert a chug attempt');
assert.match(recordSource, /ai_duration_ms:\s*durationMs/, 'record flow should preserve the original AI timing');
assert.match(recordSource, /type:\s*'chug_verification'/, 'record flow should notify chosen verifier');
assert.match(modalSource, /mutualFollowers/, 'chug modal should receive mutual followers');
assert.match(modalSource, /Chugs are 33cl bottled beers only for now\./, 'modal should explain 33cl-only rule');
assert.match(modalSource, /person_drinking\.png/, 'modal should render the supplied recording-angle illustration');
assert.match(modalSource, /Best recording angle/, 'modal should label the recording-angle guidance');
assert.match(
  modalSource,
  /Choose the 33cl bottled beer you want to chug\./,
  'modal should explain the first chug setup step'
);
assert.match(
  modalSource,
  /Find a mate to verify and record from the angle shown\./,
  'modal should explain who records the chug'
);
assert.match(
  modalSource,
  /Keep your face and bottle visible, then chug once the camera is rolling\./,
  'modal should explain how to frame and start the chug video'
);
assert.doesNotMatch(modalSource, /BeerDraftForm/, 'chug modal should not reuse the generic drink form');
assert.doesNotMatch(modalSource, /eligibleBeers/, 'chug modal should not offer existing session beers');
assert.match(modalSource, /AutocompleteInput/, 'chug modal should use catalog-only beer search');
assert.match(modalSource, /getChugBeerOptions/, 'chug modal should filter search options to beer catalog items');
assert.match(modalSource, /verifierSearch/, 'chug modal should locally filter mutual followers');
assert.match(modalSource, /height:\s*220/, 'recording angle illustration should be taller');
assert.match(modalSource, /Your chug is being analyzed\. Be patient\.\.\./, 'analysis should cover the modal with progress feedback');
assert.match(modalSource, /Send for manual timing/, 'failed detection should allow verifier timing');
assert.match(recordSource, /const \[chugAnalyzing, setChugAnalyzing\]/, 'record flow should separate analysis progress from general busy state');
assert.match(recordSource, /timingSource: 'ai' \| 'pending_manual'/, 'record flow should save timed and pending-manual attempts');
assert.match(recordSource, /timing_source:\s*timingSource/, 'record insert should persist timing source');
assert.match(recordSource, /duration_ms:\s*durationMs/, 'record insert should allow missing pending-manual duration');
assert.match(recordSource, /onSubmitManualTiming=\{sendChugForManualTiming\}/, 'modal should submit preserved failed-analysis proof');

const addBoozeIndex = recordSource.indexOf('submitLabel="Add Booze"');
const chugPanelIndex = recordSource.indexOf('styles.chugBottleButton');
const postDetailsIndex = recordSource.indexOf('<Text style={styles.sectionTitle}>Post Details</Text>');
assert.ok(
  addBoozeIndex !== -1 && chugPanelIndex > addBoozeIndex && postDetailsIndex > chugPanelIndex,
  'chug panel should sit between Add Booze and Post Details'
);

console.log('chug record screen checks passed');
