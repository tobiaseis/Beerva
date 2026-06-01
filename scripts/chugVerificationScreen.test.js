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

console.log('chug verification screen checks passed');
