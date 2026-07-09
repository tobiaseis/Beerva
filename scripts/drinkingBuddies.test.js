const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260601150000_add_session_buddies.sql');
const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

const loadTypeScriptModule = (relativePath, mocks = {}) => {
  const filename = path.join(root, relativePath);
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
  compiledModule.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return Module.prototype.require.call(compiledModule, request);
  };
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

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
assert.match(migrationSql, /and pub_crawl_id is null/, 'pub crawl stops should stay outside the first drinking buddies pass');
assert.match(migrationSql, /status = 'declined'[\s\S]*cannot be re-added/i, 'declined buddies should not be reactivated');
assert.match(migrationSql, /'drinking_buddy_added'/, 'notification type should include drinking_buddy_added');
assert.match(migrationSql, /jsonb_build_object\([\s\S]*'target_type', 'session'[\s\S]*'session_id'/, 'buddy notifications should snapshot session metadata');
assert.match(migrationSql, /grant execute on function public\.set_session_buddies\(uuid, uuid\[\]\) to authenticated/, 'authenticated users should execute set_session_buddies');
assert.match(migrationSql, /grant execute on function public\.decline_session_buddy\(uuid\) to authenticated/, 'authenticated users should execute decline_session_buddy');
assert.match(migrationSql, /grant execute on function public\.get_session_buddy_summaries\(uuid\[\]\) to authenticated/, 'authenticated users should execute get_session_buddy_summaries');

const buddyLibPath = path.join(root, 'src/lib/sessionBuddies.ts');
assert.equal(fs.existsSync(buddyLibPath), true, 'shared drinking buddies client API should exist');

const sessionBuddies = loadTypeScriptModule('src/lib/sessionBuddies.ts', {
  './supabase': { supabase: {} },
});

assert.equal(
  sessionBuddies.formatDrinkingBuddyNames([
    { username: 'Beist' },
    { username: 'Tubpac' },
  ]),
  'Beist and Tubpac',
  'two buddy names should use and'
);

assert.equal(
  sessionBuddies.formatDrinkingBuddyNames([
    { username: 'Beist' },
    { username: 'Tubpac' },
    { username: 'Someone Else' },
    { username: 'Fourth' },
  ]),
  'Beist, Tubpac +2',
  'long buddy lists should show two names and a remaining count'
);

assert.equal(
  sessionBuddies.formatDrinkingBuddyNames([]),
  null,
  'empty buddy lists should not render a stats line'
);

assert.deepEqual(
  sessionBuddies.mapSessionBuddyRow({
    id: 'buddy-row-1',
    session_id: 'session-1',
    buddy_user_id: 'user-2',
    username: 'Beist',
    avatar_url: 'avatar.png',
    created_at: '2026-06-01T12:00:00Z',
  }),
  {
    id: 'buddy-row-1',
    sessionId: 'session-1',
    buddyUserId: 'user-2',
    username: 'Beist',
    avatarUrl: 'avatar.png',
    createdAt: '2026-06-01T12:00:00Z',
  },
  'buddy RPC rows should map to app shape'
);

const buddyLibSource = fs.readFileSync(buddyLibPath, 'utf8');
assert.match(buddyLibSource, /rpc\('get_session_buddy_summaries'/, 'client API should fetch buddy summaries through RPC');
assert.match(buddyLibSource, /rpc\('set_session_buddies'/, 'client API should save buddy selections through RPC');
assert.match(buddyLibSource, /rpc\('decline_session_buddy'/, 'client API should decline buddy tags through RPC');
assert.match(buddyLibSource, /\.from\('follows'\)/, 'client API should load mutual mates from follows');

const pickerPath = path.join(root, 'src/components/DrinkingBuddiesPicker.tsx');
const pickerSource = fs.existsSync(pickerPath) ? fs.readFileSync(pickerPath, 'utf8') : '';
const recordScreenSource = fs.readFileSync(path.join(root, 'src/screens/RecordScreen.tsx'), 'utf8');
const editScreenSource = fs.readFileSync(path.join(root, 'src/screens/EditSessionScreen.tsx'), 'utf8');

assert.match(pickerSource, /export const DrinkingBuddiesPicker/, 'shared picker should export DrinkingBuddiesPicker');
assert.match(pickerSource, /Add your drinking buddies/, 'picker button should use the approved label');
assert.match(pickerSource, /variant\?: 'card' \| 'inline'/, 'picker should support an inline variant for integrated post details placement');
assert.match(pickerSource, /styles\.inlineContainer/, 'inline buddies picker should avoid rendering as a nested card');
assert.match(pickerSource, /fetchMutualMateOptions/, 'picker should load mutual mates');
assert.match(pickerSource, /setSessionBuddies/, 'picker should autosave selections through the RPC wrapper');
assert.match(pickerSource, /selectedBuddyIds/, 'picker should track selected buddy ids');
assert.match(recordScreenSource, /DrinkingBuddiesPicker/, 'record screen should render the shared drinking buddies picker');
assert.match(recordScreenSource, /sessionId=\{activeSession\.id\}/, 'record screen should pass active session id to the picker');
assert.match(recordScreenSource, /variant="inline"/, 'record screen should render buddies as an integrated post details action');
assert.match(recordScreenSource, /postDetailBuddies/, 'record screen should place the inline buddies action inside the post details surface');
assert.match(editScreenSource, /DrinkingBuddiesPicker/, 'edit screen should render the shared drinking buddies picker');
assert.match(editScreenSource, /sessionId=\{sessionId\}/, 'edit screen should pass edited session id to the picker');

const feedSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');
const feedApiSource = fs.readFileSync(path.join(root, 'src/lib/feedApi.ts'), 'utf8');
const feedTypesSource = fs.readFileSync(path.join(root, 'src/lib/feedTypes.ts'), 'utf8');
const postDetailSource = fs.readFileSync(path.join(root, 'src/screens/PostDetailScreen.tsx'), 'utf8');

assert.match(feedTypesSource, /drinking_buddies:\s*SessionBuddy\[\]/, 'FeedSession should include drinking buddies');
assert.match(feedApiSource, /fetchSessionBuddySummaries/, 'feed should fetch drinking buddy summaries');
assert.match(feedApiSource, /drinking_buddies:\s*buddiesBySession\.get\(session\.id\) \|\| \[\]/, 'feed API should hydrate sessions with buddy summaries');
assert.match(feedSource, /formatDrinkingBuddyNames/, 'feed should format drinking buddy names');
assert.match(feedSource, /Drinking buddies:/, 'feed More stats should render drinking buddies');
assert.match(postDetailSource, /fetchSessionBuddySummaries/, 'post detail should fetch drinking buddy summaries');
assert.match(postDetailSource, /drinking_buddies:/, 'post detail assembled sessions should include drinking buddies');

console.log('drinking buddies checks passed');
