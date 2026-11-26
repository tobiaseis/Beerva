const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

const loadWithMocks = (relativePath, mocks) => {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = (request) => (
    Object.prototype.hasOwnProperty.call(mocks, request) ? mocks[request] : Module.prototype.require.call(compiled, request)
  );
  compiled._compile(outputText, filename);
  return compiled.exports;
};

const main = async () => {
  // Migration.
  const sql = read('supabase/migrations/20261127120000_add_weekly_streaks.sql');
  assert.ok(sql, 'weekly streak migration should exist');
  assert.match(sql, /create or replace function public\.beerva_drinking_day\(event_at timestamp with time zone\)/i);
  assert.match(sql, /timezone\('Europe\/Copenhagen', event_at\) - interval '6 hours'/i, 'drinking day is 06:00-06:00 Copenhagen');
  assert.match(sql, /create or replace function public\.beerva_drinking_week\(event_at timestamp with time zone\)/i);
  assert.match(sql, /date_trunc\('week', public\.beerva_drinking_day\(event_at\)::timestamp\)::date/i, 'weeks start on Monday');
  assert.match(sql, /create or replace function public\.get_weekly_streaks\(user_ids uuid\[\]\)/i);
  assert.match(sql, /returns table \(\s*user_id uuid,\s*weekly_streak integer,\s*active_this_week boolean,\s*nights_this_week integer\s*\)/i);
  assert.match(sql, /latest_run\.run_end >= current_week\.week_start - 7/i, 'a streak survives until the current week ends');
  assert.match(sql, /create or replace function public\.get_session_night_runs\(session_ids uuid\[\]\)/i);
  assert.match(sql, /returns table \(\s*session_id uuid,\s*nights_in_a_row integer\s*\)/i);
  assert.match(sql, /requested\.drinking_day - island_starts\.island_start \+ 1/i, 'nights in a row counts up to the post\'s own night');
  assert.doesNotMatch(sql, /drop function[^;]*get_current_streaks/i, 'the daily streak RPC stays as it is');
  ['get_weekly_streaks(uuid[])', 'get_session_night_runs(uuid[])'].forEach((signature) => {
    const escaped = signature.replace(/[()[\]]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke execute on function public\\.${escaped} from public, anon`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped} to authenticated`, 'i'));
  });
  assert.match(sql, /notify pgrst, 'reload schema'/i);

  // Client module.
  const rpcCalls = [];
  let rpcResponse = { data: [], error: null };
  const streaks = loadWithMocks('src/lib/weeklyStreaks.ts', {
    './supabase': { supabase: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpcResponse; } } },
  });

  assert.equal(streaks.formatWeeklyStreak(1), '1-week streak');
  assert.equal(streaks.formatWeeklyStreak(6), '6-week streak');
  assert.equal(streaks.formatNightsInARow(3), '3 nights in a row');
  assert.equal(streaks.shouldShowNightsInARow(1), false);
  assert.equal(streaks.shouldShowNightsInARow(2), true);
  assert.equal(streaks.shouldShowNightsInARow(null), false);
  assert.equal(streaks.shouldShowNightsInARow(undefined), false);

  assert.deepEqual(streaks.mapWeeklyStreakRow({ weekly_streak: '4', active_this_week: true, nights_this_week: '2' }), { weeklyStreak: 4, activeThisWeek: true, nightsThisWeek: 2 });
  assert.deepEqual(streaks.mapWeeklyStreakRow({}), { weeklyStreak: 0, activeThisWeek: false, nightsThisWeek: 0 });

  assert.equal(streaks.getWeeklyStreakBadgeCopy(0, false, false), null, 'no badge on other profiles without a streak');
  assert.deepEqual(streaks.getWeeklyStreakBadgeCopy(0, false, true), { title: 'No weekly streak yet', hint: 'One night out this week starts one' });
  assert.deepEqual(streaks.getWeeklyStreakBadgeCopy(5, true, true), { title: '5-week streak', hint: null });
  assert.deepEqual(streaks.getWeeklyStreakBadgeCopy(5, false, true), { title: '5-week streak', hint: 'Log a night out this week to keep it' });
  assert.deepEqual(streaks.getWeeklyStreakBadgeCopy(5, false, false), { title: '5-week streak', hint: null }, 'no nagging on other people\'s profiles');

  rpcResponse = { data: [{ user_id: 'u1', weekly_streak: 3, active_this_week: false, nights_this_week: 0 }], error: null };
  const weekly = await streaks.fetchWeeklyStreaks(['u1', 'u1', '']);
  assert.deepEqual(rpcCalls.pop(), { name: 'get_weekly_streaks', args: { user_ids: ['u1'] } }, 'ids are deduped and blanks dropped');
  assert.deepEqual(weekly.get('u1'), { weeklyStreak: 3, activeThisWeek: false, nightsThisWeek: 0 });

  assert.equal((await streaks.fetchWeeklyStreaks([])).size, 0);
  assert.equal(rpcCalls.length, 0, 'no ids means no request');

  const originalWarn = console.warn;
  console.warn = () => {};
  rpcResponse = { data: null, error: { message: 'function does not exist' } };
  assert.equal((await streaks.fetchWeeklyStreaks(['u1'])).size, 0, 'a missing RPC degrades to no streaks');
  console.warn = originalWarn;
  rpcCalls.length = 0;

  rpcResponse = { data: [{ session_id: 's1', nights_in_a_row: '3' }, { session_id: null, nights_in_a_row: 9 }], error: null };
  const runs = await streaks.fetchSessionNightRuns(['s1', 's2']);
  assert.deepEqual(rpcCalls.pop(), { name: 'get_session_night_runs', args: { session_ids: ['s1', 's2'] } });
  assert.equal(runs.get('s1'), 3);
  assert.equal(runs.size, 1);

  // Wiring.
  const hook = read('src/lib/useWeeklyStreak.ts');
  assert.match(hook, /useFocusEffect\(/, 'the profile streak refreshes on focus');
  assert.match(hook, /fetchWeeklyStreaks\(\[userId\]\)/);

  const badge = read('src/components/WeeklyStreakBadge.tsx');
  assert.match(badge, /getWeeklyStreakBadgeCopy\(weeks, activeThisWeek, isOwnProfile\)/);
  assert.match(badge, /if \(!copy\) return null;/);

  const profile = read('src/screens/ProfileScreen.tsx');
  assert.match(profile, /const weeklyStreak = useWeeklyStreak\(profile\?\.id \?\? null\);/);
  assert.match(profile, /<WeeklyStreakBadge[\s\S]*?isOwnProfile/);

  const userProfile = read('src/screens/UserProfileScreen.tsx');
  assert.match(userProfile, /const weeklyStreak = useWeeklyStreak\(profileId \?\? null\);/);
  assert.match(userProfile, /<WeeklyStreakBadge/);

  assert.match(read('src/lib/feedTypes.ts'), /nights_in_a_row\?: number \| null;/);
  const feedApi = read('src/lib/feedApi.ts');
  assert.match(feedApi, /fetchSessionNightRuns\(sessionIds\)/);
  assert.match(feedApi, /nights_in_a_row: nightRunsBySession\.get\(session\.id\) \?\? null,/);

  const feedScreen = read('src/screens/FeedScreen.tsx');
  assert.match(feedScreen, /shouldShowNightsInARow\(item\.nights_in_a_row\)/);
  assert.match(feedScreen, /formatNightsInARow\(item\.nights_in_a_row as number\)/);
  assert.match(feedScreen, /streak=\{item\.author_current_streak \|\| 0\}/, 'the daily avatar flame stays');

  const postDetail = read('src/screens/PostDetailScreen.tsx');
  assert.match(postDetail, /fetchSessionNightRuns\(\[sessionIdForRun\]\)/);
  assert.match(postDetail, /nights_in_a_row: nightsInARow \?\? session\.nights_in_a_row \?\? null/);
};

main()
  .then(() => console.log('weekly streak checks passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
