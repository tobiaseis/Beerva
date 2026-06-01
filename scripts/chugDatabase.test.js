const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(__dirname, '..', 'supabase/migrations/20260601120000_add_session_chug_attempts.sql');
const source = fs.readFileSync(migrationPath, 'utf8');

assert.match(source, /create table if not exists public\.session_chug_attempts/, 'migration should create session_chug_attempts');
assert.match(source, /status in \('unverified', 'verified', 'rejected'\)/, 'migration should constrain chug status');
assert.match(source, /required_volume = '33cl'/, 'migration should constrain required volume');
assert.match(source, /container_type = 'bottle'/, 'migration should constrain bottle container');
assert.match(source, /insert into storage\.buckets/, 'migration should create chug_videos storage bucket');
assert.match(source, /create or replace function public\.is_mutual_follower/, 'migration should expose mutual follower helper');
assert.match(source, /create or replace function public\.get_session_chug_attempt_summaries/, 'migration should expose feed summary RPC');
assert.match(source, /create or replace function public\.review_chug_attempt/, 'migration should expose verifier review RPC');
assert.match(source, /delete from storage\.objects/, 'review RPC should delete temporary proof objects');
assert.match(source, /'chug_verification'/, 'notification type should include chug_verification');
assert.match(source, /Users can create chug verification notifications/, 'notification policy should allow attempt owner to notify chosen verifier');

console.log('chug database migration checks passed');
