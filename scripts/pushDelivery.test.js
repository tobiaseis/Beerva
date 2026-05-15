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
  /functions\/v1\/send-push/i,
  'the notification trigger should call the send-push edge function'
);

assert.match(
  migrationSql,
  /Authorization/i,
  'the notification trigger should include an Authorization header for the push webhook secret'
);

assert.match(
  migrationSql,
  /vault\.decrypted_secrets/i,
  'the push trigger should read its webhook secret from Supabase Vault instead of committing it'
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

console.log('push delivery checks passed');
