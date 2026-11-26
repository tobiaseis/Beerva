const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const { loadTypeScriptModule } = require('./loadTypeScriptModule');

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
  const sql = read('supabase/migrations/20261127140000_add_weekly_recap.sql');
  assert.ok(sql, 'weekly recap migration should exist');
  assert.match(sql, /create or replace function public\.get_weekly_recap\(target_week_start date default null\)/i);
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /viewer uuid := \(select auth\.uid\(\)\);/i, 'the recap is always the caller\'s own');
  assert.match(sql, /from public\.session_views/i, 'seen-by uses session views');
  assert.match(sql, /from public\.pub_crawl_views/i, 'seen-by uses pub crawl views');
  assert.match(sql, /public\.get_challenge_leaderboard\(mc\.id\)/i, 'challenge ranks come from the real leaderboard');
  assert.match(sql, /public\.get_weekly_streaks\(array\[viewer\]\)/i);
  assert.match(sql, /coalesce\(sb\.excluded_from_stats, false\) = false/i, 'invalidated drinks do not count');
  assert.match(sql, /'is_current_week', recap_week = public\.beerva_drinking_week\(now\(\)\)/i);
  assert.match(sql, /create or replace function public\.queue_weekly_recaps\(\s*force boolean default false,\s*only_user_id uuid default null\s*\)/i);
  assert.match(sql, /extract\(isodow from local_now\) <> 7/i, 'only on Sundays');
  assert.match(sql, /local_now::time < time '18:00'/i);
  assert.match(sql, /local_now::time >= time '19:30'/i);
  assert.match(sql, /if candidate\.nights_out = 0 and candidate\.mates_out = 0 then\s+continue;/i, 'quiet weeks get no push');
  assert.match(sql, /'weekly_recap',\s*null,/i);
  assert.match(sql, /revoke execute on function public\.queue_weekly_recaps\(boolean, uuid\) from public, anon, authenticated/i);
  assert.match(sql, /revoke execute on function public\.get_weekly_recap\(date\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_weekly_recap\(date\) to authenticated/i);
  assert.match(sql, /cron\.schedule\(\s*'beerva-weekly-recap',\s*'\*\/15 16-18 \* \* 0'/i, 'Sunday evenings in UTC cover both CET and CEST');

  // Shared copy.
  const copy = loadTypeScriptModule('supabase/functions/_shared/engagementCopy.ts');
  const title = 'Your week on Beerva 🍻';
  assert.deepEqual(copy.buildWeeklyRecapCopy({ nights_out: 3, seen_by: 12 }), { title, body: '3 nights out, seen by 12 mates. Tap for your recap.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy({ nights_out: 1, seen_by: 1 }), { title, body: '1 night out, seen by 1 mate. Tap for your recap.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy({ nights_out: 2, seen_by: 0 }), { title, body: '2 nights out this week. Tap for your recap.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy({ nights_out: 0, mates_out: 4 }), { title, body: '4 mates were out this week. See what you missed.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy({ mates_out: '1' }), { title, body: '1 mate was out this week. See what you missed.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy(null), { title, body: 'Your weekly recap is ready.' });

  // Launch params (pure, shared by web and Android routing).
  const { getRecapLaunchParamsFromSearch } = loadTypeScriptModule('src/lib/recapLaunchParams.ts');
  assert.deepEqual(getRecapLaunchParamsFromSearch('?recap=2026-11-23&notificationId=n1'), { weekStart: '2026-11-23', notificationId: 'n1' });
  assert.deepEqual(getRecapLaunchParamsFromSearch('?recap=2026-11-23'), { weekStart: '2026-11-23', notificationId: null });
  assert.equal(getRecapLaunchParamsFromSearch('?recap=next-week'), null, 'only ISO dates are accepted');
  assert.equal(getRecapLaunchParamsFromSearch('?post=abc'), null);

  // Client module.
  const rpcCalls = [];
  let rpcResponse = { data: null, error: null };
  const recapModule = loadWithMocks('src/lib/weeklyRecap.ts', {
    './supabase': { supabase: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpcResponse; } } },
    './timeouts': { withTimeout: (operation) => operation },
  });

  assert.equal(recapModule.formatWeekRange('2026-11-23', '2026-11-29'), '23–29 Nov');
  assert.equal(recapModule.formatWeekRange('2026-11-30', '2026-12-06'), '30 Nov – 6 Dec');
  assert.equal(recapModule.formatWeekRange('2026-12-28', '2027-01-03'), '28 Dec – 3 Jan');
  assert.equal(recapModule.shiftWeek('2026-11-23', -1), '2026-11-16');
  assert.equal(recapModule.shiftWeek('2026-12-28', 1), '2027-01-04');

  const row = {
    week_start: '2026-11-23', week_end: '2026-11-29', is_current_week: true,
    nights_out: 3, units: '18.4', drinks: 9, posts: 2, pubs: 3, top_pub: 'Kroen', seen_by: 12,
    cheers: 7, comments: 2, best_run: 2, weekly_streak: 5, mates_out: 4,
    challenges: [{ slug: 'julefrokost', title: 'Julefrokost Season', metric_type: 'alcohol_units', challenge_type: 'leaderboard', rank: 2, progress_value: '33.8', entrants: 14 }],
    mates: [{ user_id: 'u2', username: 'mads', avatar_url: null, nights_out: 3 }, { user_id: null, username: 'ghost', nights_out: 1 }],
  };
  const recap = recapModule.mapWeeklyRecap(row);
  assert.equal(recap.weekStart, '2026-11-23');
  assert.equal(recap.isCurrentWeek, true);
  assert.equal(recap.units, 18.4);
  assert.equal(recap.topPub, 'Kroen');
  assert.deepEqual(recap.challenges[0], { slug: 'julefrokost', title: 'Julefrokost Season', metricType: 'alcohol_units', challengeType: 'leaderboard', rank: 2, progressValue: 33.8, entrants: 14 });
  assert.equal(recap.mates.length, 1, 'mates without ids are dropped');
  assert.equal(recapModule.isRecapEmpty(recap), false);
  assert.equal(recapModule.isRecapEmpty(recapModule.mapWeeklyRecap({ week_start: '2026-11-23', week_end: '2026-11-29' })), true);

  rpcResponse = { data: row, error: null };
  await recapModule.fetchWeeklyRecap(null);
  assert.deepEqual(rpcCalls.pop(), { name: 'get_weekly_recap', args: { target_week_start: null } }, 'no week means the current week');
  await recapModule.fetchWeeklyRecap('2026-11-16');
  assert.deepEqual(rpcCalls.pop(), { name: 'get_weekly_recap', args: { target_week_start: '2026-11-16' } });
  rpcResponse = { data: null, error: new Error('boom') };
  await assert.rejects(() => recapModule.fetchWeeklyRecap(null), /boom/);

  // Edge function.
  const sendPush = read('supabase/functions/send-push/index.ts');
  assert.match(sendPush, /buildWeeklyRecapCopy/);
  assert.match(sendPush, /\| 'weekly_recap'/);
  assert.match(sendPush, /url = `\/\?recap=\$\{encodeURIComponent\(record\.metadata\.week_start\)\}&notificationId=\$\{encodeURIComponent\(record\.id\)\}`/);

  // Navigation and entry points.
  const navigator = read('src/navigation/RootNavigator.tsx');
  assert.match(navigator, /WeeklyRecap: \{ weekStart\?: string; notificationId\?: string \| null \} \| undefined;/);
  assert.match(navigator, /WeeklyRecap: 'recap\/:weekStart\?',/);
  assert.match(navigator, /<Stack\.Screen name="WeeklyRecap" component=\{WeeklyRecapScreen\} \/>/);
  assert.match(navigator, /getRecapLaunchParamsFromSearch\(window\.location\.search\)/, 'web push links open the recap');
  assert.match(navigator, /target\.kind === 'recap'/, 'android push links open the recap');

  const nativeRouting = read('src/lib/nativeNotificationRouting.ts');
  assert.match(nativeRouting, /\{ kind: 'recap'; weekStart: string; notificationId\?: string \| null \}/);
  assert.match(nativeRouting, /getRecapLaunchParamsFromSearch\(search\)/);

  const screen = read('src/screens/WeeklyRecapScreen.tsx');
  assert.match(screen, /export const WeeklyRecapScreen/);
  assert.match(screen, /fetchWeeklyRecap\(selectedWeek\)/);
  assert.match(screen, /disabled=\{!recap \|\| recap\.isCurrentWeek\}/, 'cannot page into the future');
  assert.match(screen, /Seen by/);
  assert.match(screen, /Who was out/);

  const notificationsScreen = read('src/screens/NotificationsScreen.tsx');
  assert.match(notificationsScreen, /\| 'weekly_recap'/);
  assert.match(notificationsScreen, /buildWeeklyRecapCopy\(item\.metadata\)/);
  assert.match(notificationsScreen, /See your week/);

  const profileScreen = read('src/screens/ProfileScreen.tsx');
  assert.match(profileScreen, /navigation\.navigate\('WeeklyRecap'\)/);
};

main()
  .then(() => console.log('weekly recap checks passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
