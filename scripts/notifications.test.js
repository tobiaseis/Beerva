const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });

  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const {
  getNotificationMessage,
  getNotificationPubName,
} = loadTypeScriptModule('src/lib/notificationMessages.ts');

assert.equal(
  getNotificationPubName({
    metadata: { pub_name: '  John Bull Pub  ' },
    session: null,
  }),
  'John Bull Pub',
  'notification metadata should be the first source for pub names'
);

assert.equal(
  getNotificationPubName({
    metadata: {},
    session: { pub_name: 'The Wharf' },
  }),
  'The Wharf',
  'session preview should remain a fallback for older notifications'
);

assert.equal(
  getNotificationMessage({
    type: 'session_started',
    metadata: { pub_name: 'John Bull Pub' },
    session: null,
  }),
  ' started a drinking session at John Bull Pub.'
);

assert.equal(
  getNotificationMessage({
    type: 'pub_crawl_started',
    metadata: { pub_name: 'John Bull Pub' },
    session: null,
  }),
  ' started a pub crawl at John Bull Pub.'
);

const recordScreenSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'), 'utf8');
assert.match(
  recordScreenSource,
  /metadata:\s*\{\s*pub_name:/,
  'session/pub crawl start notifications should include pub_name metadata at insert time'
);

const notificationsScreenSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/NotificationsScreen.tsx'), 'utf8');
assert.match(
  notificationsScreenSource,
  /\.select\('id, actor_id, type, reference_id, metadata, read, created_at'\)/,
  'notifications screen should fetch metadata with each notification'
);
assert.match(
  notificationsScreenSource,
  /getNotificationMessage/,
  'notifications screen should render messages through the shared metadata-aware helper'
);

const sendPushSource = fs.readFileSync(path.resolve(__dirname, '..', 'supabase/functions/send-push/index.ts'), 'utf8');
assert.match(sendPushSource, /pub_crawl_started/, 'push delivery should support pub crawl start notifications');
assert.match(sendPushSource, /record\.metadata\?\.pub_name/, 'push delivery should prefer notification metadata pub names');
assert.match(sendPushSource, /started a pub crawl at/, 'pub crawl push text should include the pub name when available');

const migrationSql = fs
  .readdirSync(path.resolve(__dirname, '..', 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => fs.readFileSync(path.resolve(__dirname, '..', 'supabase/migrations', file), 'utf8'))
  .join('\n');
assert.match(migrationSql, /add column if not exists metadata jsonb/, 'notifications should have metadata jsonb storage');
assert.match(migrationSql, /set_notification_metadata/, 'database should backfill notification metadata on insert');
assert.match(migrationSql, /update public\.notifications/, 'migration should backfill pub_name metadata for existing start notifications');

console.log('notification tests passed');
