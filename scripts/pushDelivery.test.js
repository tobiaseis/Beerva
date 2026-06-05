const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationSql = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'))
  .join('\n');

const sendPushSource = fs.readFileSync(path.join(root, 'supabase/functions/send-push/index.ts'), 'utf8');
const configPath = path.join(root, 'supabase/config.toml');
const supabaseConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';

assert.match(
  migrationSql,
  /create extension if not exists pg_net/i,
  'push delivery should enable pg_net for database-triggered HTTP delivery'
);

assert.match(
  migrationSql,
  /after insert\s+on public\.notifications/i,
  'notification inserts should trigger push delivery'
);

assert.match(
  migrationSql,
  /drop trigger if exists "send-push-on-notification" on public\.notifications/i,
  'legacy dashboard-created push triggers should be removed so notifications do not double-call send-push'
);

assert.match(
  migrationSql,
  /functions\/v1\/send-push/i,
  'the notification trigger should call the send-push edge function'
);

assert.match(
  migrationSql,
  /Authorization/i,
  'the notification trigger should be able to include an Authorization header for Supabase Edge gateway auth'
);

assert.match(
  migrationSql,
  /beerva_edge_function_jwt/i,
  'the notification trigger should read an optional Edge gateway JWT from Vault for projects where verify_jwt is still enabled'
);

assert.match(
  migrationSql,
  /x-beerva-webhook-secret/i,
  'the notification trigger should send the app webhook secret in a custom header, not overload Authorization'
);

assert.match(
  migrationSql,
  /vault\.decrypted_secrets/i,
  'the push trigger should read its webhook secret from Supabase Vault instead of committing it'
);

const pushDeliveryAttemptsMigrationPath = path.join(root, 'supabase/migrations/20260605120000_add_push_delivery_attempts.sql');
const pushDeliveryAttemptsMigrationSql = fs.existsSync(pushDeliveryAttemptsMigrationPath)
  ? fs.readFileSync(pushDeliveryAttemptsMigrationPath, 'utf8')
  : '';

assert.match(
  pushDeliveryAttemptsMigrationSql,
  /create table if not exists public\.push_delivery_attempts/i,
  'push delivery diagnostics should store one row per subscription delivery attempt'
);

assert.match(
  pushDeliveryAttemptsMigrationSql,
  /endpoint_hash text not null/i,
  'push delivery diagnostics should store an endpoint hash instead of raw endpoint text'
);

assert.match(
  pushDeliveryAttemptsMigrationSql,
  /push_delivery_attempts_status_check[\s\S]*accepted[\s\S]*expired_subscription[\s\S]*failed/i,
  'push delivery diagnostics should constrain delivery attempt statuses'
);

assert.match(
  pushDeliveryAttemptsMigrationSql,
  /alter table public\.push_delivery_attempts enable row level security/i,
  'push delivery diagnostics should have RLS enabled'
);

assert.doesNotMatch(
  pushDeliveryAttemptsMigrationSql,
  /create policy/i,
  'push delivery diagnostics should not expose normal user read policies'
);

assert.doesNotMatch(
  migrationSql,
  /undefined_schema/i,
  'PL/pgSQL does not support an undefined_schema exception condition; use invalid_schema_name'
);

assert.match(
  migrationSql,
  /invalid_schema_name/i,
  'the Vault lookup should handle a missing vault schema with the valid invalid_schema_name condition'
);

assert.match(
  supabaseConfig,
  /\[functions\.send-push\][\s\S]*?verify_jwt\s*=\s*false/,
  'send-push must disable gateway JWT verification so the database webhook can use its own secret'
);

assert.match(
  sendPushSource,
  /WEBHOOK_SECRET/,
  'send-push should keep validating the database webhook secret inside the function'
);

assert.match(
  sendPushSource,
  /x-beerva-webhook-secret/i,
  'send-push should validate webhook calls through the custom x-beerva-webhook-secret header'
);

assert.match(
  sendPushSource,
  /drinking_buddy_added/,
  'push delivery should support drinking buddy notifications'
);

assert.match(
  sendPushSource,
  /added you as a drinking buddy/,
  'drinking buddy push body should use the approved copy'
);

assert.match(
  sendPushSource,
  /session_status/,
  'drinking buddy push routing should inspect session status metadata'
);

assert.match(
  sendPushSource,
  /notifications=1/,
  'active-session buddy pushes should open notifications'
);

assert.match(sendPushSource, /official_post/, 'push delivery should support official posts');
assert.match(sendPushSource, /push_enabled\s*!==\s*true/, 'official pushes should stop when the admin toggle is off');
assert.match(sendPushSource, /push_title/, 'official pushes should use snapshotted titles');
assert.match(sendPushSource, /push_body/, 'official pushes should use snapshotted bodies');
assert.match(sendPushSource, /challenge=/, 'official challenge pushes should deep-link to challenge detail');
assert.match(sendPushSource, /record\.actor_id\s*\?/, 'system-authored notifications should skip actor profile lookup');

console.log('push delivery checks passed');
