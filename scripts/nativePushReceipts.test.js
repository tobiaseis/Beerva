const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const migrationPath = 'supabase/migrations/20260711120000_add_native_push_receipts.sql';
const functionPath = 'supabase/functions/check-native-push-receipts/index.ts';

assert.equal(packageJson.scripts['test:native-push-receipts'], 'node scripts/nativePushReceipts.test.js');
assert.ok(fs.existsSync(path.join(root, migrationPath)), 'native receipt migration should exist');
assert.ok(fs.existsSync(path.join(root, functionPath)), 'native receipt Edge Function should exist');

const migration = read(migrationPath);
const config = read('supabase/config.toml');
const fn = read(functionPath);

for (const column of ['receipt_status', 'receipt_checked_at', 'receipt_error_code', 'receipt_error_message']) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`, 'i'));
}
assert.match(migration, /receipt_status_check[\s\S]*pending[\s\S]*ok[\s\S]*error[\s\S]*missing/i);
assert.match(migration, /create or replace function public\.invoke_native_push_receipt_checker/i);
assert.match(migration, /beerva_push_webhook_secret/i);
assert.match(migration, /cron\.schedule\([\s\S]*beerva-check-native-push-receipts[\s\S]*\*\/15/i);
assert.match(config, /\[functions\.check-native-push-receipts\][\s\S]*verify_jwt\s*=\s*false/);
assert.match(fn, /api\/v2\/push\/getReceipts/);
assert.match(fn, /receipt_status[\s\S]*pending/);
assert.match(fn, /DeviceNotRegistered/);
assert.match(fn, /from\('native_push_tokens'\)[\s\S]*delete\(\)/);
assert.doesNotMatch(fn, /expo_push_token\s*:/, 'receipt diagnostics must not persist raw tokens');

console.log('native push receipt checks passed');
