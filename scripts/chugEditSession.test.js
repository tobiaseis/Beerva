const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const editSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/EditSessionScreen.tsx'), 'utf8');

assert.match(editSource, /ChugAttemptModal/, 'edit screen should render the chug modal');
assert.match(editSource, /How fast can you chug\?/, 'edit screen should expose the chug entry point');
assert.match(editSource, /chugBottleButton/, 'edit screen should render the chug entry point as a bottle button');
assert.match(editSource, /chugBottleBody/, 'chug button should include a beer bottle body');
assert.match(editSource, /chugBottleNeck/, 'chug button should include a beer bottle neck');
assert.match(editSource, /chugBottleCap/, 'chug button should include a beer bottle cap');
assert.match(editSource, /chugBottleLabel/, 'chug button should include a label area for the text');
assert.match(editSource, /loadMutualFollowers/, 'edit chug flow should load mutual followers for verification');
assert.match(editSource, /ImagePicker\.launchCameraAsync\(\{[\s\S]*mediaTypes:\s*\['videos'\]/, 'edit chug flow should launch camera in video mode');
assert.match(editSource, /videoMaxDuration:\s*CHUG_VIDEO_MAX_SECONDS/, 'edit chug flow should cap chug video length');
assert.match(editSource, /analyzeChugVideo/, 'edit chug flow should analyze chug video locally');
assert.match(editSource, /uploadChugProofVideo/, 'edit chug flow should upload accepted proof video');
assert.match(editSource, /\.from\('session_beers'\)\s*[\s\S]*?\.insert\([\s\S]*?CHUG_REQUIRED_VOLUME[\s\S]*?\.select\('id, session_id, beer_name, volume, quantity, abv, note, consumed_at, created_at'\)/, 'edit chug flow should persist the chug beer before saving an attempt');
assert.match(editSource, /\.from\('session_chug_attempts'\)\s*[\s\S]*?\.insert/, 'edit chug flow should insert a chug attempt');
assert.match(editSource, /ai_duration_ms:\s*durationMs/, 'edit chug flow should preserve the original AI timing');
assert.match(editSource, /timingSource: 'ai' \| 'pending_manual'/, 'edit chug flow should save timed and pending-manual attempts');
assert.match(editSource, /timing_source:\s*timingSource/, 'edit chug insert should persist timing source');
assert.match(editSource, /duration_ms:\s*durationMs/, 'edit chug insert should allow missing pending-manual duration');
assert.match(editSource, /type:\s*'chug_verification'/, 'edit chug flow should notify chosen verifier');
assert.match(editSource, /onSubmitManualTiming=\{sendChugForManualTiming\}/, 'edit modal should submit preserved failed-analysis proof');

const addBoozeIndex = editSource.indexOf('submitLabel="Add Booze"');
const chugPanelIndex = editSource.indexOf('styles.chugBottleButton');
const detailsIndex = editSource.indexOf('<Text style={styles.sectionTitle}>Details</Text>');
assert.ok(
  addBoozeIndex !== -1 && chugPanelIndex > addBoozeIndex && detailsIndex > chugPanelIndex,
  'edit chug panel should sit between Add Booze and Details'
);

console.log('chug edit session checks passed');
