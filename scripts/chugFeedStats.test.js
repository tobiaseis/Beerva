const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const feedSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/FeedScreen.tsx'), 'utf8');
const postDetailSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/PostDetailScreen.tsx'), 'utf8');

assert.match(feedSource, /session_chug_attempts/, 'feed screen should know chug attempt summaries');
assert.match(feedSource, /get_session_chug_attempt_summaries/, 'feed should fetch public chug attempt summaries through RPC');
assert.match(feedSource, /getFastestVisibleChugAttempt/, 'feed card should compute fastest visible chug');
assert.match(feedSource, /Fastest chug/, 'feed card should render fastest chug label');
assert.match(feedSource, /formatChugDuration/, 'feed card should render formatted chug duration');
assert.match(feedSource, /getChugStatSubtitle/, 'feed card should render volume and verification status');
assert.match(postDetailSource, /get_session_chug_attempt_summaries/, 'post detail should hydrate chug summaries');

console.log('chug feed stat checks passed');
