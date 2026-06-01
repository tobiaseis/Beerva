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

const retimingMigrationPath = path.resolve(__dirname, '..', 'supabase/migrations/20260601130000_add_chug_manual_retiming.sql');
const retimingSource = fs.readFileSync(retimingMigrationPath, 'utf8');

assert.match(retimingSource, /add column if not exists ai_duration_ms integer/, 'retiming migration should preserve AI duration');
assert.match(retimingSource, /add column if not exists manual_start_ms integer/, 'retiming migration should store manual start');
assert.match(retimingSource, /add column if not exists manual_end_ms integer/, 'retiming migration should store manual end');
assert.match(retimingSource, /add column if not exists manual_duration_ms integer/, 'retiming migration should store manual duration');
assert.match(retimingSource, /add column if not exists timing_source text not null default 'ai'/, 'retiming migration should track timing source');
assert.match(retimingSource, /update public\.session_chug_attempts[\s\S]*set ai_duration_ms = duration_ms/, 'retiming migration should backfill existing attempts');
assert.match(retimingSource, /drop function if exists public\.review_chug_attempt\(uuid, text, text\)/, 'retiming migration should remove the old RPC signature');
assert.match(retimingSource, /manual_start_ms integer default null/, 'review RPC should accept manual start');
assert.match(retimingSource, /manual_end_ms integer default null/, 'review RPC should accept manual end');
assert.match(retimingSource, /Manual timing requires both start and end timestamps\./, 'review RPC should reject partial timing');
assert.match(retimingSource, /Manual timing is only allowed when verifying a chug attempt\./, 'review RPC should reject timestamps on complete rejection');
assert.match(retimingSource, /Manual chug timing must be between 1 and 15000 milliseconds\./, 'review RPC should validate manual duration');
assert.match(retimingSource, /timing_source = case when has_manual_timing then 'manual' else 'ai' end/, 'review RPC should mark manually corrected attempts');
assert.match(retimingSource, /duration_ms = case when has_manual_timing then reviewed_manual_duration_ms else attempt\.ai_duration_ms end/, 'review RPC should expose the effective verified duration');

console.log('chug database migration checks passed');
