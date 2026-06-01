const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/ChugVerificationScreen.tsx'), 'utf8');

assert.match(source, /createChugProofSignedUrl/, 'review screen should create a signed proof video URL');
assert.match(source, /\.from\('session_chug_attempts'\)/, 'review screen should fetch the assigned chug attempt');
assert.match(source, /review_chug_attempt/, 'review screen should use the secure review RPC');
assert.match(source, /next_status:\s*nextStatus/, 'review screen should pass the chosen review status');
assert.match(source, /Verify/, 'review screen should render a verify action');
assert.match(source, /Reject/, 'review screen should render a reject action');
assert.match(source, /Proof video has already been cleared\./, 'review screen should handle cleared proof videos');
assert.match(source, /type ReviewMode = 'review' \| 'reject_options' \| 'manual_timing'/, 'review screen should use explicit inline modes');
assert.match(source, /Adjust time/, 'reject options should allow manual timing');
assert.match(source, /Reject chug completely/, 'reject options should expose final rejection');
assert.match(source, /CHUG_MANUAL_PLAYBACK_RATE/, 'manual timing should use the shared slow-motion rate');
assert.match(source, /getVideoPlaybackTimestampMs/, 'manual timing should read playback timestamps');
assert.match(source, /Start/, 'manual timing should render Start');
assert.match(source, /Stop/, 'manual timing should render Stop');
assert.match(source, /Approve time/, 'manual timing should render approval');
assert.match(source, /Re-do timing/, 'manual timing should support retry');
assert.match(source, /Proof video is unavailable\./, 'manual timing should report an unavailable proof video');
assert.match(source, /manual_start_ms:\s*manualTiming\?\.startMs \?\? null/, 'review RPC should receive manual start');
assert.match(source, /manual_end_ms:\s*manualTiming\?\.endMs \?\? null/, 'review RPC should receive manual end');
assert.match(source, /timing_source/, 'review screen should fetch the timing source');
assert.match(source, /expires_at/, 'review screen should fetch the expiry deadline');
assert.match(source, /row\.timing_source === 'pending_manual'/, 'pending-manual review should open directly in manual timing mode');
assert.match(source, /Chugging verification expired\./, 'expired review should show a clear disabled state');
assert.match(source, /setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\)/, 'open verifier screen should notice expiry without a reload');
assert.match(source, /!reviewExpired/, 'review actions should be disabled after the deadline');

console.log('chug verification screen checks passed');
