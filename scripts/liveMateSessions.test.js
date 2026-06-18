const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260604130000_add_live_mate_sessions.sql');
const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';
const drinkInvalidationMigrationPath = path.join(root, 'supabase/migrations/20260618160000_add_drink_invalidation.sql');
const drinkInvalidationSql = fs.existsSync(drinkInvalidationMigrationPath)
  ? fs.readFileSync(drinkInvalidationMigrationPath, 'utf8')
  : '';

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

assert.match(migrationSql, /create table if not exists public\.live_mate_sessions/, 'migration should create live_mate_sessions');
assert.match(migrationSql, /session_id uuid not null references public\.sessions\(id\) on delete cascade/, 'live rows should point at the active session or crawl stop');
assert.match(migrationSql, /pub_crawl_id uuid references public\.pub_crawls\(id\) on delete cascade/, 'live rows should optionally point at an active pub crawl');
assert.match(migrationSql, /true_pints double precision not null default 0/, 'live rows should cache true-pint progress');
assert.match(migrationSql, /constraint live_mate_sessions_user_unique unique \(user_id\)/, 'a user should have at most one live row');
assert.match(migrationSql, /constraint live_mate_sessions_session_unique unique \(session_id\)/, 'a session should have at most one live row');
assert.match(migrationSql, /live_mate_sessions_last_activity_idx/, 'live rows should be indexed by latest activity');
assert.match(migrationSql, /alter table public\.live_mate_sessions enable row level security/, 'live rows should enable RLS');
assert.match(migrationSql, /follows\.follower_id = \(select auth\.uid\(\)\)[\s\S]*follows\.following_id = live_mate_sessions\.user_id/, 'direct select policy should be follower-aware');
assert.match(migrationSql, /alter publication supabase_realtime add table public\.live_mate_sessions/, 'live rows should be added to the realtime publication');
assert.match(migrationSql, /create or replace function public\.get_live_session_true_pints/, 'migration should add normal-session true-pint helper');
assert.match(migrationSql, /public\.beerva_serving_volume_ml\(session_beers\.volume\)/, 'true-pint helper should use the shared serving volume parser');
assert.match(migrationSql, /\/ 568\.0/, 'true-pint helper should normalize to Beerva true pints');
assert.match(migrationSql, /round\([^;]+::numeric,\s*1\)::double precision/, 'true-pint helper should round to one decimal');
assert.match(migrationSql, /create or replace function public\.get_live_pub_crawl_true_pints/, 'migration should add crawl true-pint helper');
assert.match(migrationSql, /create or replace function public\.refresh_live_mate_session_for_session/, 'session refresh function should exist');
assert.match(migrationSql, /create or replace function public\.refresh_live_mate_session_for_pub_crawl/, 'pub crawl refresh function should exist');
assert.match(migrationSql, /create or replace function public\.repair_live_mate_sessions/, 'repair function should exist');
assert.match(migrationSql, /create or replace function public\.get_live_mate_sessions\(\)/, 'viewer RPC should exist');
assert.match(migrationSql, /security definer/g, 'live functions should use security definer where needed');
assert.match(migrationSql, /grant execute on function public\.get_live_mate_sessions\(\) to authenticated/, 'authenticated users should execute the viewer RPC');
assert.match(migrationSql, /revoke execute on function public\.repair_live_mate_sessions\(\) from public, anon, authenticated/, 'clients should not execute the repair function');
assert.match(migrationSql, /create trigger sessions_live_mate_refresh/, 'sessions trigger should maintain live rows');
assert.match(migrationSql, /create trigger session_beers_live_mate_refresh/, 'session_beers trigger should maintain true-pint totals');
assert.match(migrationSql, /create trigger pub_crawls_live_mate_refresh/, 'pub_crawls trigger should maintain crawl rows');
assert.match(migrationSql, /select public\.repair_live_mate_sessions\(\);/, 'migration should backfill current active live rows');
assert.ok(fs.existsSync(drinkInvalidationMigrationPath), 'admin drink invalidation migration should exist');
assert.match(
  drinkInvalidationSql,
  /create or replace function public\.get_live_session_true_pints/i,
  'drink invalidation migration should replace normal live true-pint helper'
);
assert.match(
  drinkInvalidationSql,
  /create or replace function public\.get_live_pub_crawl_true_pints/i,
  'drink invalidation migration should replace pub crawl live true-pint helper'
);
assert.match(
  drinkInvalidationSql,
  /coalesce\(session_beers\.excluded_from_stats,\s*false\)\s*=\s*false/i,
  'live mate totals should ignore admin-invalidated drinks'
);

assert.ok(fs.existsSync(path.join(root, 'src/lib/liveMateSessions.ts')), 'live mate client API should exist');

const liveMateSessions = loadTypeScriptModule('src/lib/liveMateSessions.ts', {
  './supabase': {
    supabase: {
      rpc: async () => ({ data: [], error: null }),
    },
  },
});

assert.deepEqual(
  liveMateSessions.mapLiveMateSessionRow({
    id: 'live-1',
    user_id: 'user-2',
    session_id: 'session-1',
    pub_crawl_id: null,
    username: 'Tubpac',
    avatar_url: 'avatar.png',
    current_pub_name: 'John Bull Pub',
    started_at: '2026-06-04T18:00:00Z',
    last_activity_at: '2026-06-04T19:00:00Z',
    true_pints: 2.44,
    is_pub_crawl: false,
  }),
  {
    id: 'live-1',
    userId: 'user-2',
    sessionId: 'session-1',
    pubCrawlId: null,
    username: 'Tubpac',
    avatarUrl: 'avatar.png',
    currentPubName: 'John Bull Pub',
    startedAt: '2026-06-04T18:00:00Z',
    lastActivityAt: '2026-06-04T19:00:00Z',
    truePints: 2.44,
    isPubCrawl: false,
  },
  'RPC rows should map to app shape'
);

assert.equal(
  liveMateSessions.mapLiveMateSessionRow({
    id: 'live-2',
    user_id: 'user-3',
    session_id: 'session-2',
    pub_crawl_id: 'crawl-1',
    username: '   ',
    avatar_url: '',
    current_pub_name: '  ',
    started_at: null,
    last_activity_at: null,
    true_pints: 'bad-number',
    is_pub_crawl: true,
  }).username,
  null,
  'blank profile names should map to null'
);

assert.equal(liveMateSessions.formatLiveMateCount(1), '1 drinking now', 'single count copy should be singular');
assert.equal(liveMateSessions.formatLiveMateCount(3), '3 drinking now', 'multi count copy should be plural-neutral');
assert.equal(liveMateSessions.formatLiveTruePints(0), '0.0 true pints', 'zero true-pint copy should include one decimal');
assert.equal(liveMateSessions.formatLiveTruePints(1), '1.0 true pint', 'one true pint should be singular');
assert.equal(liveMateSessions.formatLiveTruePints(2.44), '2.4 true pints', 'true pints should round to one decimal');
assert.equal(liveMateSessions.getLiveMateDisplayName({ username: null }), 'Someone', 'missing names should fall back');
assert.equal(liveMateSessions.getLiveMatePubName({ currentPubName: null }), 'Somewhere', 'missing pub names should fall back');
assert.equal(
  liveMateSessions.formatLiveStartedLabel('2026-06-04T17:30:00Z', new Date('2026-06-04T19:00:00Z')),
  '1h 30m',
  'elapsed labels should show hours and minutes'
);
assert.equal(
  liveMateSessions.formatLiveStartedLabel('2026-06-04T18:52:00Z', new Date('2026-06-04T19:00:00Z')),
  '8m',
  'elapsed labels should show minutes for short sessions'
);

const liveMateApiSource = fs.readFileSync(path.join(root, 'src/lib/liveMateSessions.ts'), 'utf8');
assert.match(liveMateApiSource, /rpc\('get_live_mate_sessions'\)/, 'client API should fetch live mates through RPC');

const liveMateHookPath = path.join(root, 'src/lib/useLiveMateSessions.ts');
assert.ok(fs.existsSync(liveMateHookPath), 'live mate hook should exist');
const liveMateHookSource = fs.readFileSync(liveMateHookPath, 'utf8');

assert.match(liveMateHookSource, /export const useLiveMateSessions = \(\)/, 'hook should export useLiveMateSessions');
assert.match(liveMateHookSource, /fetchLiveMateSessions\(\)/, 'hook should fetch live sessions through the shared client API');
assert.match(liveMateHookSource, /supabase\.auth\.getSession\(\)/, 'hook should avoid RPC calls when no user session exists');
assert.match(liveMateHookSource, /supabase\.auth\.onAuthStateChange/, 'hook should refresh on auth state changes');
assert.match(liveMateHookSource, /\.channel\(`live-mate-sessions-\$\{userId\}`\)/, 'hook should create a user-scoped realtime channel');
assert.match(liveMateHookSource, /table: 'live_mate_sessions'/, 'hook should subscribe to live_mate_sessions changes');
assert.match(liveMateHookSource, /supabase\.removeChannel\(channel\)/, 'hook should clean up realtime channels');
assert.match(liveMateHookSource, /setSessions\(\[\]\)/, 'hook should clear sessions when signed out or empty');

const liveButtonPath = path.join(root, 'src/components/LiveMateButton.tsx');
assert.ok(fs.existsSync(liveButtonPath), 'LiveMateButton component should exist');
const liveButtonSource = fs.readFileSync(liveButtonPath, 'utf8');

assert.match(liveButtonSource, /export const LiveMateButton = \(\{ count, onPress \}: LiveMateButtonProps\)/, 'live button should expose count and press props');
assert.match(liveButtonSource, /Animated\.loop/, 'live button should use looped animation');
assert.match(liveButtonSource, /Easing\.inOut\(Easing\.sin\)/, 'live button pulse should use smooth easing');
assert.match(liveButtonSource, /coreCircle/, 'live button should keep a stable core circle');
assert.match(liveButtonSource, /pulseRing/, 'live button should render pulse rings');
assert.match(liveButtonSource, /animationRef\.current\?\.stop\(\)/, 'live button should stop animation loops on cleanup');
assert.match(liveButtonSource, /AccessibilityInfo\.isReduceMotionEnabled/, 'live button should respect reduced motion on initial render');
assert.match(liveButtonSource, /accessibilityLabel=\{`Open live mates, \$\{count\} drinking now`\}/, 'live button should expose useful accessibility copy');

const liveSheetPath = path.join(root, 'src/components/LiveMateSessionsSheet.tsx');
assert.ok(fs.existsSync(liveSheetPath), 'LiveMateSessionsSheet component should exist');
const liveSheetSource = fs.readFileSync(liveSheetPath, 'utf8');

assert.match(liveSheetSource, /export const LiveMateSessionsSheet = \(\{ visible, sessions, onClose \}: LiveMateSessionsSheetProps\)/, 'live sheet should expose visibility, sessions, and close props');
assert.match(liveSheetSource, /animationType="none"/, 'live sheet should own its top-drop animation');
assert.match(liveSheetSource, /translateY/, 'live sheet should animate from the top');
assert.match(liveSheetSource, />Live mates</, 'live sheet should render the approved title');
assert.match(liveSheetSource, /formatLiveMateCount\(sessions\.length\)/, 'live sheet should render count copy');
assert.match(liveSheetSource, /formatLiveTruePints\(session\.truePints\)/, 'live sheet should render true-pint progress');
assert.match(liveSheetSource, /formatLiveStartedLabel\(session\.startedAt\)/, 'live sheet should render elapsed time');
assert.match(liveSheetSource, /Pub crawl/, 'live sheet should show a small pub crawl indicator');
assert.match(liveSheetSource, /CachedImage/, 'live sheet should render avatars through CachedImage');

const feedScreenSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');

assert.match(feedScreenSource, /import \{ LiveMateButton \} from '\.\.\/components\/LiveMateButton';/, 'Feed should import LiveMateButton');
assert.match(feedScreenSource, /import \{ LiveMateSessionsSheet \} from '\.\.\/components\/LiveMateSessionsSheet';/, 'Feed should import LiveMateSessionsSheet');
assert.match(feedScreenSource, /import \{ useLiveMateSessions \} from '\.\.\/lib\/useLiveMateSessions';/, 'Feed should import live mate hook');
assert.match(feedScreenSource, /const \{ sessions: liveMateSessions,[\s\S]*refresh: refreshLiveMateSessions \} = useLiveMateSessions\(\);/, 'Feed should read live mate hook state');
assert.match(feedScreenSource, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*refreshLiveMateSessions\(\);/, 'Feed should refresh live mates on focus');
assert.match(feedScreenSource, /liveMateSessions\.length === 0[\s\S]*setLiveMateSheetVisible\(false\)/, 'Feed should close the sheet when the live list empties');
assert.match(feedScreenSource, /<LiveMateButton\s+count=\{liveMateSessions\.length\}\s+onPress=\{\(\) => setLiveMateSheetVisible\(true\)\}/, 'Feed should render the button only when live mates exist');
assert.match(feedScreenSource, /<LiveMateSessionsSheet\s+visible=\{liveMateSheetVisible\}\s+sessions=\{liveMateSessions\}/, 'Feed should mount the top sheet');
assert.match(feedScreenSource, /styles\.headerActions/, 'Feed header should group live button and bell actions');

console.log('live mate feed wiring checks passed');
