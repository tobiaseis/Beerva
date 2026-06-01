const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260601150000_add_session_buddies.sql');
const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

assert.match(migrationSql, /create table if not exists public\.session_buddies/, 'migration should create session_buddies');
assert.match(migrationSql, /status in \('active', 'removed', 'declined'\)/, 'session buddies should constrain status values');
assert.match(migrationSql, /unique\s*\(session_id,\s*buddy_user_id\)/i, 'one buddy row should exist per user per session');
assert.match(migrationSql, /buddy_user_id <> added_by_user_id/, 'session owners should not tag themselves');
assert.match(migrationSql, /session_buddies_session_status_idx/, 'migration should index session/status lookups');
assert.match(migrationSql, /session_buddies_buddy_status_created_at_idx/, 'migration should index buddy notification lookups');
assert.match(migrationSql, /session_buddies_added_by_created_at_idx/, 'migration should index owner edit lookups');
assert.match(migrationSql, /alter table public\.session_buddies enable row level security/, 'session buddies should enable RLS');
assert.match(migrationSql, /create or replace function public\.set_session_buddies/, 'owner reconciliation RPC should exist');
assert.match(migrationSql, /create or replace function public\.decline_session_buddy/, 'buddy decline RPC should exist');
assert.match(migrationSql, /create or replace function public\.get_session_buddy_summaries/, 'feed summary RPC should exist');
assert.match(migrationSql, /public\.is_mutual_follower\(requesting_user_id,\s*requested_buddy_id\)/, 'adding buddies should require mutual mates');
assert.match(migrationSql, /status = 'declined'[\s\S]*cannot be re-added/i, 'declined buddies should not be reactivated');
assert.match(migrationSql, /'drinking_buddy_added'/, 'notification type should include drinking_buddy_added');
assert.match(migrationSql, /jsonb_build_object\([\s\S]*'target_type', 'session'[\s\S]*'session_id'/, 'buddy notifications should snapshot session metadata');
assert.match(migrationSql, /grant execute on function public\.set_session_buddies\(uuid, uuid\[\]\) to authenticated/, 'authenticated users should execute set_session_buddies');
assert.match(migrationSql, /grant execute on function public\.decline_session_buddy\(uuid\) to authenticated/, 'authenticated users should execute decline_session_buddy');
assert.match(migrationSql, /grant execute on function public\.get_session_buddy_summaries\(uuid\[\]\) to authenticated/, 'authenticated users should execute get_session_buddy_summaries');

console.log('drinking buddies checks passed');
