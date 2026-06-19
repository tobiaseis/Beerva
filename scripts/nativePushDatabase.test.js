const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260619120000_add_native_push_tokens.sql');
assert.ok(fs.existsSync(migrationPath), 'native push token migration should exist');

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:native-push-db'],
  'node scripts/nativePushDatabase.test.js',
  'package script should run native push database checks'
);

assert.match(
  migrationSql,
  /create table if not exists public\.native_push_tokens/i,
  'migration should create native_push_tokens'
);

for (const column of [
  'user_id uuid not null references auth.users\\(id\\) on delete cascade',
  'expo_push_token text not null',
  "platform text not null default 'android'",
  'device_name text null',
  'app_version text null',
  'last_seen_at timestamp with time zone not null default now\\(\\)',
]) {
  assert.match(migrationSql, new RegExp(column, 'i'), `native_push_tokens should include ${column}`);
}

assert.match(
  migrationSql,
  /unique \(user_id, expo_push_token\)/i,
  'native tokens should be unique per user and token'
);

assert.match(
  migrationSql,
  /native_push_tokens_platform_check[\s\S]*platform in \('android'\)/i,
  'native token platform should be constrained to android for v1'
);

assert.match(
  migrationSql,
  /alter table public\.native_push_tokens enable row level security/i,
  'native token table should enable RLS'
);

for (const policyName of [
  'Users can view their own native push tokens',
  'Users can insert their own native push tokens',
  'Users can update their own native push tokens',
  'Users can delete their own native push tokens',
]) {
  assert.match(
    migrationSql,
    new RegExp(policyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    `${policyName} policy should exist`
  );
}

assert.match(
  migrationSql,
  /create table if not exists public\.native_push_delivery_attempts/i,
  'migration should create native push diagnostics'
);

assert.match(
  migrationSql,
  /native_push_delivery_attempts_status_check[\s\S]*ticket_accepted[\s\S]*stale_token[\s\S]*failed/i,
  'native diagnostics should constrain statuses'
);

assert.match(
  migrationSql,
  /token_hash text not null/i,
  'native diagnostics should store token hashes instead of raw tokens'
);

assert.match(
  migrationSql,
  /alter table public\.native_push_delivery_attempts enable row level security/i,
  'native diagnostics should enable RLS'
);

const diagnosticsBlock = migrationSql.slice(
  migrationSql.search(/create table if not exists public\.native_push_delivery_attempts/i)
);
assert.doesNotMatch(
  diagnosticsBlock,
  /create policy/i,
  'native diagnostics should not expose normal user policies'
);

console.log('native push database checks passed');
