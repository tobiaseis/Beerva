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

const helpersPath = 'src/lib/pubLegends.ts';
const apiPath = 'src/lib/pubLegendsApi.ts';
const legendsScreenPath = 'src/screens/PubLegendsScreen.tsx';
const legendDetailScreenPath = 'src/screens/PubLegendDetailScreen.tsx';
const migrationPath = 'supabase/migrations/20260510133000_add_pub_legends_leaderboards.sql';
const friendLeaderboardsMigrationPath = 'supabase/migrations/20260604160000_add_pub_legends_friend_leaderboards.sql';
const zeroStreakFilterMigrationPath = 'supabase/migrations/20260605120000_filter_zero_friend_streaks.sql';
const placeCategoryMigrationPath = 'supabase/migrations/20260513120000_add_pub_place_category.sql';
const placeCategoryRepairMigrationPath = 'supabase/migrations/20260518113000_add_pub_place_category_repair_rpc.sql';
const legacySessionRepairMigrationPath = 'supabase/migrations/20260518114500_link_legacy_sessions_on_place_exclusion.sql';
const liveCountRepairMigrationPath = 'supabase/migrations/20260619170000_repair_pub_legends_counts.sql';

assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', helpersPath)),
  'Pub Legends should define shared row mapping helpers'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', migrationPath)),
  'Pub Legends should add Supabase leaderboard RPCs'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', friendLeaderboardsMigrationPath)),
  'Pub Legends should add viewer-plus-followed friend leaderboard RPCs'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', zeroStreakFilterMigrationPath)),
  'Pub Legends should add a follow-up migration for deployed zero-streak filtering'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', placeCategoryMigrationPath)),
  'Place category migration should update pub schema and leaderboard filtering'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', placeCategoryRepairMigrationPath)),
  'Place category repair migration should let users reclassify their own manually added places'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', legacySessionRepairMigrationPath)),
  'A follow-up migration should update already-applied place repair RPCs for legacy name-only sessions'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', liveCountRepairMigrationPath)),
  'A follow-up migration should repair deployed Pub Legends live counts'
);

const {
  formatHoursSinceLastDrink,
  formatTruePints,
  mapFriendPubWatchRow,
  mapFriendPubWatchRows,
  mapPubKingSessionRow,
  mapPubLegendRow,
} = loadTypeScriptModule(helpersPath);

assert.deepEqual(
  mapPubLegendRow({
    pub_key: 'pub-1',
    pub_id: 'pub-1',
    pub_name: 'Basement Bar',
    city: 'Aalborg',
    address: null,
    session_count: '12',
    unique_drinker_count: '5',
    top_true_pints: '8.25',
    champion_user_id: 'user-1',
    champion_username: 'Mads',
    champion_avatar_url: null,
    champion_session_id: 'session-1',
    champion_at: '2026-05-10T19:00:00.000Z',
  }),
  {
    pubKey: 'pub-1',
    pubId: 'pub-1',
    pubName: 'Basement Bar',
    city: 'Aalborg',
    address: null,
    sessionCount: 12,
    uniqueDrinkerCount: 5,
    topTruePints: 8.25,
    championUserId: 'user-1',
    championUsername: 'Mads',
    championAvatarUrl: null,
    championSessionId: 'session-1',
    championAt: '2026-05-10T19:00:00.000Z',
  },
  'legend rows should map snake_case Supabase results to app-friendly data'
);

assert.deepEqual(
  mapPubKingSessionRow({
    rank: '1',
    user_id: 'user-2',
    username: null,
    avatar_url: 'https://example.com/avatar.png',
    session_id: 'session-2',
    true_pints: '6.75',
    drink_count: '9',
    session_started_at: '2026-05-09T18:00:00.000Z',
    published_at: '2026-05-09T23:00:00.000Z',
  }),
  {
    rank: 1,
    userId: 'user-2',
    username: null,
    avatarUrl: 'https://example.com/avatar.png',
    sessionId: 'session-2',
    truePints: 6.75,
    drinkCount: 9,
    sessionStartedAt: '2026-05-09T18:00:00.000Z',
    publishedAt: '2026-05-09T23:00:00.000Z',
  },
  'King of the Pub rows should preserve the winning session metadata'
);

assert.deepEqual(
  mapFriendPubWatchRow({
    leaderboard_type: 'active_streak',
    rank: '1',
    user_id: 'user-3',
    username: 'Sofie',
    avatar_url: 'https://example.com/sofie.png',
    current_streak: '8',
    latest_drink_at: '2026-06-04T18:00:00.000Z',
    hours_since_last_drink: null,
  }),
  {
    leaderboardType: 'active_streak',
    rank: 1,
    userId: 'user-3',
    username: 'Sofie',
    avatarUrl: 'https://example.com/sofie.png',
    currentStreak: 8,
    latestDrinkAt: '2026-06-04T18:00:00.000Z',
    hoursSinceLastDrink: 0,
  },
  'friend active-streak rows should map snake_case Supabase results to app-friendly data'
);

assert.deepEqual(
  mapFriendPubWatchRows([
    {
      leaderboard_type: 'active_streak',
      rank: 1,
      user_id: 'user-1',
      username: 'Mads',
      avatar_url: null,
      current_streak: 4,
      latest_drink_at: '2026-06-04T19:00:00.000Z',
      hours_since_last_drink: null,
    },
    {
      leaderboard_type: 'most_overdue',
      rank: 1,
      user_id: 'user-2',
      username: 'Nora',
      avatar_url: null,
      current_streak: 0,
      latest_drink_at: '2026-05-30T19:00:00.000Z',
      hours_since_last_drink: '142',
    },
  ]),
  {
    activeStreaks: [
      {
        leaderboardType: 'active_streak',
        rank: 1,
        userId: 'user-1',
        username: 'Mads',
        avatarUrl: null,
        currentStreak: 4,
        latestDrinkAt: '2026-06-04T19:00:00.000Z',
        hoursSinceLastDrink: 0,
      },
    ],
    mostOverdue: [
      {
        leaderboardType: 'most_overdue',
        rank: 1,
        userId: 'user-2',
        username: 'Nora',
        avatarUrl: null,
        currentStreak: 0,
        latestDrinkAt: '2026-05-30T19:00:00.000Z',
        hoursSinceLastDrink: 142,
      },
    ],
  },
  'friend leaderboard rows should split into active streak and most overdue lists'
);

assert.equal(formatTruePints(8.25), '8.3 true pints');
assert.equal(formatTruePints(1), '1.0 true pint');
assert.equal(formatTruePints(Number.NaN), '0.0 true pints');
assert.equal(formatHoursSinceLastDrink(0), '0h');
assert.equal(formatHoursSinceLastDrink(1), '1h');
assert.equal(formatHoursSinceLastDrink(142), '142h');
assert.equal(formatHoursSinceLastDrink(Number.NaN), '0h');

const migrationSql = fs.readFileSync(path.resolve(__dirname, '..', migrationPath), 'utf8');
const friendLeaderboardsMigrationSql = fs.readFileSync(
  path.resolve(__dirname, '..', friendLeaderboardsMigrationPath),
  'utf8'
);
const zeroStreakFilterMigrationSql = fs.readFileSync(
  path.resolve(__dirname, '..', zeroStreakFilterMigrationPath),
  'utf8'
);
const placeCategoryMigrationSql = fs.readFileSync(path.resolve(__dirname, '..', placeCategoryMigrationPath), 'utf8');
const placeCategoryRepairMigrationSql = fs.readFileSync(path.resolve(__dirname, '..', placeCategoryRepairMigrationPath), 'utf8');
const legacySessionRepairMigrationSql = fs.readFileSync(path.resolve(__dirname, '..', legacySessionRepairMigrationPath), 'utf8');
const liveCountRepairMigrationSql = fs.readFileSync(path.resolve(__dirname, '..', liveCountRepairMigrationPath), 'utf8');
assert.match(
  placeCategoryMigrationSql,
  /add column if not exists place_category text not null default 'pub'/,
  'pubs should default existing and new rows to real pubs'
);
assert.match(
  placeCategoryMigrationSql,
  /pubs_place_category_check/,
  'pubs should constrain place_category to known values'
);
assert.match(
  placeCategoryMigrationSql,
  /drop function if exists public\.search_pubs\(text, double precision, double precision, integer\)/,
  'search_pubs should be recreated because the return table changes'
);
assert.match(
  placeCategoryMigrationSql,
  /place_category text/,
  'search_pubs should return place_category to the app'
);

const categoryFilters = placeCategoryMigrationSql.match(/coalesce\(pubs\.place_category,\s*'pub'\)\s*=\s*'pub'/g) || [];
assert.ok(
  categoryFilters.length >= 2,
  'Pub Legends list and King of the Pub should both exclude other places'
);
assert.match(migrationSql, /get_pub_legends/, 'migration should create get_pub_legends');
assert.match(migrationSql, /get_pub_king_of_the_pub/, 'migration should create get_pub_king_of_the_pub');
assert.match(migrationSql, /status\s*=\s*'published'/, 'leaderboards should only use published sessions');
assert.match(migrationSql, /beerva_serving_volume_ml/, 'leaderboards should calculate true pints from serving volume');
assert.match(
  liveCountRepairMigrationSql,
  /create or replace function public\.get_pub_legends\(limit_count integer default 10\)/i,
  'live-count repair migration should replace get_pub_legends in already-deployed databases'
);
assert.match(
  liveCountRepairMigrationSql,
  /count\(distinct session_totals\.session_id\)::integer as session_count/i,
  'Pub Legends should count published sessions live, not stale pub metadata'
);
assert.match(
  liveCountRepairMigrationSql,
  /from public\.sessions/i,
  'Pub Legends live counts should read the sessions table directly'
);
assert.match(
  liveCountRepairMigrationSql,
  /sessions\.status\s*=\s*'published'/i,
  'Pub Legends live counts should only include published sessions'
);
assert.match(
  liveCountRepairMigrationSql,
  /coalesce\(pubs\.place_category,\s*'pub'\)\s*=\s*'pub'/i,
  'Pub Legends live counts should keep excluding places marked as other'
);
assert.doesNotMatch(
  liveCountRepairMigrationSql,
  /hide_from_feed\s*=\s*false/i,
  'Pub Legends should still count hidden child pub-crawl stops'
);
assert.match(
  liveCountRepairMigrationSql,
  /coalesce\(session_beers\.excluded_from_stats,\s*false\)\s*=\s*false/i,
  'Pub Legends champion pints should ignore drinks excluded from stats'
);
assert.match(
  liveCountRepairMigrationSql,
  /update public\.pubs[\s\S]*use_count = pub_session_counts\.session_count/i,
  'repair migration should resync denormalized pub use counts for search and roulette'
);
assert.match(
  liveCountRepairMigrationSql,
  /grant execute on function public\.get_pub_legends\(integer\) to authenticated/i,
  'authenticated users should keep access to the Pub Legends RPC'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /create or replace function public\.get_friend_pub_watch_leaderboards\(result_limit integer default 25\)/i,
  'friend watch migration should create get_friend_pub_watch_leaderboards'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /follows\.follower_id\s*=\s*\(select auth\.uid\(\)\)/i,
  'friend watch leaderboard should scope rows to people the viewer follows'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /select\s+\(select auth\.uid\(\)\)\s+as user_id/i,
  'friend watch leaderboard should include the current viewer in the ranked pool'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /public\.get_current_streaks/i,
  'active streak leaderboard should reuse the canonical current streak function'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /from streak_rows\s+where streak_rows\.current_streak > 0/i,
  'active streak leaderboard should hide participants with zero current streak'
);
assert.match(
  zeroStreakFilterMigrationSql,
  /create or replace function public\.get_friend_pub_watch_leaderboards\(result_limit integer default 25\)/i,
  'zero-streak filter migration should replace the deployed friend leaderboard RPC'
);
assert.match(
  zeroStreakFilterMigrationSql,
  /from streak_rows\s+where streak_rows\.current_streak > 0/i,
  'zero-streak filter migration should hide participants with zero current streak'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /coalesce\(session_beers\.consumed_at,\s*sessions\.started_at,\s*sessions\.created_at\)/i,
  'most overdue leaderboard should prefer consumed_at with session timestamp fallbacks'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /round\(extract\(epoch from \(now\(\) - latest_drink_at\)\) \/ 3600\.0\)::integer/i,
  'most overdue leaderboard should round time since last drink to whole hours'
);
assert.match(
  friendLeaderboardsMigrationSql,
  /grant execute on function public\.get_friend_pub_watch_leaderboards\(integer\) to authenticated/i,
  'authenticated users should be able to call friend watch leaderboard RPC'
);

assert.match(
  placeCategoryRepairMigrationSql,
  /create or replace function public\.set_pub_place_category/i,
  'users should have an RPC for repairing places accidentally categorized as pubs'
);
assert.match(
  placeCategoryRepairMigrationSql,
  /source\s*=\s*'user'/i,
  'place repair RPC should only reclassify manually added places'
);
assert.match(
  placeCategoryRepairMigrationSql,
  /created_by\s*=\s*requesting_user_id/i,
  'place repair RPC should only reclassify places created by the current user'
);
assert.match(
  placeCategoryRepairMigrationSql,
  /clean_place_category not in \('pub', 'other'\)/i,
  'place repair RPC should only accept known categories'
);
assert.match(
  placeCategoryRepairMigrationSql,
  /grant execute on function public\.set_pub_place_category/i,
  'authenticated users should be able to call the place repair RPC'
);
assert.match(
  legacySessionRepairMigrationSql,
  /create or replace function public\.set_pub_place_category/i,
  'legacy session repair migration should replace the already-deployed place repair RPC'
);
assert.match(
  legacySessionRepairMigrationSql,
  /sessions\.pub_id is null/i,
  'place repair RPC should repair legacy name-only sessions so excluded places disappear from Pub Legends'
);
assert.match(
  legacySessionRepairMigrationSql,
  /lower\(btrim\(coalesce\(sessions\.pub_name,\s*''\)\)\)\s*=\s*lower\(btrim\(coalesce\(updated_pub\.name,\s*''\)\)\)/i,
  'place repair RPC should match legacy sessions by normalized pub name'
);
assert.match(
  legacySessionRepairMigrationSql,
  /sessions\.user_id\s*=\s*requesting_user_id/i,
  'place repair RPC should only link the current user session history when repairing legacy rows'
);
assert.match(
  legacySessionRepairMigrationSql,
  /update public\.sessions[\s\S]*from public\.pubs/i,
  'legacy session repair migration should backfill sessions for places already excluded with the old RPC'
);
assert.match(
  legacySessionRepairMigrationSql,
  /pubs\.place_category\s*=\s*'other'/i,
  'legacy session backfill should only attach sessions to places already marked other'
);
assert.match(
  legacySessionRepairMigrationSql,
  /sessions\.user_id\s*=\s*pubs\.created_by/i,
  'legacy session backfill should only repair the creator-owned session history'
);

const apiSource = fs.readFileSync(path.resolve(__dirname, '..', apiPath), 'utf8');
assert.match(apiSource, /setPubPlaceCategory/, 'Pub Legends API should expose a place reclassification helper');
assert.match(apiSource, /set_pub_place_category/, 'Pub Legends API helper should call the repair RPC');
assert.match(
  apiSource,
  /fetchFriendPubWatchLeaderboards/,
  'Pub Legends API should expose a friend watch leaderboard fetch helper'
);
assert.match(
  apiSource,
  /get_friend_pub_watch_leaderboards/,
  'Pub Legends API helper should call the friend watch RPC'
);

const legendsScreenSource = fs.readFileSync(path.resolve(__dirname, '..', legendsScreenPath), 'utf8');
assert.match(legendsScreenSource, /pubId: item\.pubId/, 'Pub Legends list should pass pubId into the detail screen');
assert.match(
  legendsScreenSource,
  /Friends on Watch/,
  'Pub Legends screen should label the compact friend watch strip'
);
assert.match(
  legendsScreenSource,
  /Hottest streak/,
  'Pub Legends screen should render the hottest streak spotlight tile'
);
assert.match(
  legendsScreenSource,
  /Most overdue/,
  'Pub Legends screen should render the most overdue spotlight tile'
);
assert.match(
  legendsScreenSource,
  /Back to pubs/,
  'friend leaderboard view should provide a same-screen return control'
);
assert.doesNotMatch(
  legendsScreenSource,
  /your rank|own rank|current user rank/i,
  'spotlight tiles should not render the viewer rank copy'
);
assert.match(
  legendsScreenSource,
  /colors\.dangerSoft/,
  'Most overdue tile should use the light red danger treatment'
);
assert.match(
  legendsScreenSource,
  /colors\.primarySoft/,
  'Hottest streak tile should use the light yellow primary treatment'
);
assert.match(
  legendsScreenSource,
  /getMsUntilNextHour/,
  'Pub Legends screen should calculate the next whole-hour refresh boundary'
);
assert.match(
  legendsScreenSource,
  /setInterval\(loadFriendLeaderboards,\s*60 \* 60 \* 1000\)/,
  'friend watch leaderboards should refresh hourly while the screen is focused'
);
assert.match(
  legendsScreenSource,
  /setInterval\(loadLegends,\s*60 \* 1000\)/,
  'Pub Legends counts should refresh while the screen remains focused'
);

const legendDetailSource = fs.readFileSync(path.resolve(__dirname, '..', legendDetailScreenPath), 'utf8');
assert.match(legendDetailSource, /Exclude from Pub Legends/, 'Pub Legend detail should expose a cleanup action for wrongly categorized private places');
assert.match(legendDetailSource, /setPubPlaceCategory\(pubId, 'other'\)/, 'cleanup action should mark the place as other');

console.log('Pub Legends tests passed');
