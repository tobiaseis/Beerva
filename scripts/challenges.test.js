const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const loadTypeScriptModule = (relativePath) => {
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
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const challengesHelperPath = 'src/lib/challenges.ts';
const challengesApiPath = 'src/lib/challengesApi.ts';
const detailScreenPath = 'src/screens/ChallengeDetailScreen.tsx';
const pubLegendsScreenPath = 'src/screens/PubLegendsScreen.tsx';
const feedScreenPath = 'src/screens/FeedScreen.tsx';
const navigatorPath = 'src/navigation/RootNavigator.tsx';
const migrationPath = 'supabase/migrations/20260514170000_add_official_challenges.sql';
const karnevalsdrukMigrationPath = 'supabase/migrations/20260520120000_add_karnevalsdruk_challenge.sql';
const challengeLeaderboardWindowFixPath = 'supabase/migrations/20260521100000_fix_challenge_leaderboard_window.sql';
const localChallengeLeaderboardsMigrationPath = 'supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql';
const adminChallengesMigrationPath = 'supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql';
const archiveMigrationPath = 'supabase/migrations/20260603120000_add_admin_challenge_archive.sql';
const targetChallengeUnitsMigrationPath = 'supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql';
const boozeInJuneUnitsFixMigrationPath = 'supabase/migrations/20260618130000_fix_booze_in_june_units.sql';
const forceTargetUnitsMigrationPath = 'supabase/migrations/20260618140000_force_target_challenges_to_units.sql';
const karnevalTestMigrationPath = 'supabase/migrations/20260521110000_add_karneval_test_challenge.sql';
const removeKarnevalTestMigrationPath = 'supabase/migrations/20260521120000_remove_karneval_test_challenge.sql';
const karnevalsdrukDualAwardsMigrationPath = 'supabase/migrations/20260522110000_add_karnevalsdruk_dual_awards.sql';
const karnevalsdrukFinalizationRecoveryPath = 'supabase/migrations/20260525100000_recover_karnevalsdruk_finalization.sql';
const challengeFinalizerPath = 'supabase/functions/finalize-challenges/index.ts';
const officialFeedPostsPath = 'src/lib/officialFeedPosts.ts';
const officialFeedPostsApiPath = 'src/lib/officialFeedPostsApi.ts';
const officialFeedPostCardPath = 'src/components/OfficialFeedPostCard.tsx';

assert.ok(exists(challengesHelperPath), 'challenge helper module should exist');
assert.ok(exists(challengesApiPath), 'challenge API module should exist');
assert.ok(exists(detailScreenPath), 'challenge detail screen should exist');
assert.ok(exists(migrationPath), 'official challenge migration should exist');
assert.ok(exists(karnevalsdrukMigrationPath), 'KarnevalsDruk migration should exist');
assert.ok(exists(challengeLeaderboardWindowFixPath), 'challenge leaderboard window fix migration should exist');
assert.ok(exists(localChallengeLeaderboardsMigrationPath), 'local challenge leaderboards migration should exist');
assert.ok(exists(archiveMigrationPath), 'admin challenge archive migration should exist');
assert.ok(exists(targetChallengeUnitsMigrationPath), 'target challenge units migration should exist');
assert.ok(exists(boozeInJuneUnitsFixMigrationPath), 'Booze-in-June units fix migration should exist');
assert.ok(exists(forceTargetUnitsMigrationPath), 'target challenge force-units migration should exist');
assert.ok(exists(karnevalTestMigrationPath), 'Karneval test challenge migration should exist');
assert.ok(exists(removeKarnevalTestMigrationPath), 'Karneval test cleanup migration should exist');
assert.ok(exists(karnevalsdrukDualAwardsMigrationPath), 'KarnevalsDruk dual awards migration should exist');
assert.ok(exists(karnevalsdrukFinalizationRecoveryPath), 'KarnevalsDruk finalization recovery migration should exist');
assert.ok(exists(challengeFinalizerPath), 'challenge finalizer Edge Function should exist');
assert.ok(exists(officialFeedPostsPath), 'official feed post mapper should exist');
assert.ok(exists(officialFeedPostsApiPath), 'official feed post API should exist');
assert.ok(exists(officialFeedPostCardPath), 'official feed post card should exist');

const {
  CHALLENGE_STATUS,
  CHALLENGE_TYPE,
  formatChallengeProgress,
  formatChallengeRank,
  formatChallengeStatusLabel,
  getChallengePreJoinCopy,
  getChallengeStatus,
  getLeaderboardEntryMeta,
  isLeaderboardChallenge,
  mapChallengeDetailRow,
  mapChallengeSummaryRow,
} = loadTypeScriptModule(challengesHelperPath);

assert.equal(CHALLENGE_STATUS.ACTIVE, 'active');
assert.equal(formatChallengeProgress(6.234, 15), '6.2/15');
assert.equal(formatChallengeProgress(null, 15), '0.0/15');
assert.equal(formatChallengeRank(3), '#3');
assert.equal(formatChallengeRank(null), 'Unranked');
assert.equal(formatChallengeStatusLabel('active'), 'Active');
assert.equal(formatChallengeStatusLabel('upcoming'), 'Upcoming');
assert.equal(formatChallengeStatusLabel('ended'), 'Closed');
assert.equal(CHALLENGE_TYPE.TARGET, 'target');
assert.equal(CHALLENGE_TYPE.LEADERBOARD, 'leaderboard');
assert.equal(formatChallengeProgress(8.44, null, 'leaderboard'), '8.4 true pints');
assert.equal(
  formatChallengeProgress(6.234, 30, 'target', 'alcohol_units'),
  '6.2/30 units',
  'unit target challenges should show units in progress copy'
);
assert.equal(
  formatChallengeProgress(6.234, 15, 'target', 'true_pints'),
  '6.2/15',
  'legacy true-pint target challenges should keep compact fraction formatting'
);
assert.equal(
  formatChallengeProgress(8.44, null, 'leaderboard', 'alcohol_units'),
  '8.4 true pints',
  'leaderboard challenges should keep true-pint copy even if a bad metric arrives'
);
assert.equal(
  getChallengePreJoinCopy({ challengeType: 'leaderboard', slug: 'karnevalsdruk-2026' }),
  'Join to count your Karneval drinks from the full 06:00 to 06:00 window.'
);
assert.equal(
  getChallengePreJoinCopy({ challengeType: 'target', slug: 'may-2026-15-true-pints' }),
  'Join this challenge to track your progress.'
);
assert.equal(
  getLeaderboardEntryMeta({ completed: true, progressValue: 8.44 }, { challengeType: 'leaderboard' }),
  '8.4 true pints'
);
assert.equal(
  getLeaderboardEntryMeta({ completed: true, progressValue: 15.1 }, { challengeType: 'target' }),
  'Completed'
);
assert.equal(isLeaderboardChallenge({ challengeType: 'leaderboard' }), true);
assert.equal(isLeaderboardChallenge({ challengeType: 'target' }), false);

assert.equal(
  getChallengeStatus(
    {
      startsAt: '2026-04-30T22:00:00Z',
      endsAt: '2026-05-31T22:00:00Z',
      joinClosesAt: '2026-05-31T22:00:00Z',
    },
    new Date('2026-05-14T12:00:00Z')
  ),
  'active',
  'May challenge should be active during May'
);
assert.equal(
  getChallengeStatus(
    {
      startsAt: '2026-04-30T22:00:00Z',
      endsAt: '2026-05-31T22:00:00Z',
      joinClosesAt: '2026-05-31T22:00:00Z',
    },
    new Date('2026-06-01T00:00:00Z')
  ),
  'ended',
  'May challenge should be ended after the exclusive end'
);

const summaryRow = {
  id: 'challenge-1',
  slug: 'may-2026-15-true-pints',
  title: 'Drink 15 beers in May',
  description: 'Reach 15 true pints between May 1 and May 31. All logged beverages count toward your total, normalized by serving size.',
  metric_type: 'true_pints',
  challenge_type: 'target',
  target_value: '15',
  starts_at: '2026-04-30T22:00:00Z',
  ends_at: '2026-05-31T22:00:00Z',
  join_closes_at: '2026-05-31T22:00:00Z',
  joined_at: '2026-05-14T12:00:00Z',
  entrants_count: '4',
  current_user_rank: '3',
  current_user_progress: '6.234',
};

const summary = mapChallengeSummaryRow(summaryRow);

assert.equal(summary.title, 'Drink 15 beers in May');
assert.equal(summary.metricType, 'true_pints');
assert.equal(summary.targetValue, 15);
assert.equal(summary.joined, true);
assert.equal(summary.joinOpen, false);
assert.equal(summary.entrantsCount, 4);
assert.equal(summary.currentUserRank, 3);
assert.equal(summary.currentUserProgress, 6.234);
assert.deepEqual(summary.raw, summaryRow);

const unitSummary = mapChallengeSummaryRow({
  ...summaryRow,
  slug: 'booze-in-june',
  title: 'Booze-in-June',
  description: 'Reach 30 units in June.',
  metric_type: 'alcohol_units',
  target_value: '30',
  current_user_progress: '6.234',
});

assert.equal(unitSummary.metricType, 'alcohol_units');
assert.equal(unitSummary.targetValue, 30);
assert.equal(
  formatChallengeProgress(unitSummary.currentUserProgress, unitSummary.targetValue, unitSummary.challengeType, unitSummary.metricType),
  '6.2/30 units'
);

const leaderboardSummary = mapChallengeSummaryRow({
  ...summaryRow,
  slug: 'karnevalsdruk-2026',
  title: 'KarnevalsDruk',
  description: 'Log drinks from 06:00 May 23 to 06:00 May 24. Highest true-pint total wins among joined drinkers.',
  challenge_type: 'leaderboard',
  target_value: null,
  starts_at: '2026-05-23T04:00:00Z',
  ends_at: '2026-05-24T04:00:00Z',
  join_closes_at: '2026-05-24T04:00:00Z',
  current_user_progress: '8.44',
});

assert.equal(leaderboardSummary.challengeType, 'leaderboard');
assert.equal(leaderboardSummary.targetValue, null);
assert.equal(formatChallengeProgress(leaderboardSummary.currentUserProgress, leaderboardSummary.targetValue, leaderboardSummary.challengeType), '8.4 true pints');

const { mapOfficialFeedPostRow, formatOfficialWinnerStat } = loadTypeScriptModule(officialFeedPostsPath);

const officialPost = mapOfficialFeedPostRow({
  id: 'official-1',
  challenge_id: 'challenge-1',
  kind: 'challenge_winner',
  title: 'Winner of Karneval 2026',
  body: 'Mads won KarnevalsDruk with 8.4 true pints.',
  metadata: {
    winner_user_id: 'user-1',
    winner_username: 'Mads',
    winner_avatar_url: 'https://example.com/avatar.png',
    true_pints: 8.44,
    drink_count: 11,
    average_abv: 5.2,
    session_count: 3,
    challenge_slug: 'karnevalsdruk-2026',
  },
  published_at: '2026-05-24T04:05:00Z',
  created_at: '2026-05-24T04:05:00Z',
});

assert.equal(officialPost.title, 'Winner of Karneval 2026');
assert.equal(officialPost.winnerUsername, 'Mads');
assert.equal(officialPost.truePints, 8.44);
assert.equal(officialPost.drinkCount, 11);
assert.equal(officialPost.averageAbv, 5.2);
assert.equal(officialPost.sessionCount, 3);
assert.equal(formatOfficialWinnerStat('Average ABV', 5.2, '%'), 'Average ABV 5.2%');

const detail = mapChallengeDetailRow({
  ...summaryRow,
  entrants_count: '2',
  current_user_rank: '2',
  leaderboards: {
    local: {
      entrants_count: '2',
      current_user_rank: '2',
      leaderboard: [
        {
          rank: '1',
          user_id: 'user-2',
          username: 'Mads',
          avatar_url: null,
          progress_value: '15.4',
          completed: true,
        },
        {
          rank: '2',
          user_id: 'user-1',
          username: null,
          avatar_url: 'https://example.com/avatar.png',
          progress_value: '8',
          completed: false,
        },
      ],
    },
    global: {
      entrants_count: '4',
      current_user_rank: '3',
      leaderboard: [
        {
          rank: '1',
          user_id: 'user-3',
          username: 'Line',
          avatar_url: null,
          progress_value: '18',
          completed: true,
        },
        {
          rank: '2',
          user_id: 'user-2',
          username: 'Mads',
          avatar_url: null,
          progress_value: '15.4',
          completed: true,
        },
        {
          rank: '3',
          user_id: 'user-1',
          username: null,
          avatar_url: 'https://example.com/avatar.png',
          progress_value: '8',
          completed: false,
        },
        {
          rank: '4',
          user_id: 'user-4',
          username: 'Sofie',
          avatar_url: null,
          progress_value: '4',
          completed: false,
        },
      ],
    },
  },
});

assert.equal(detail.entrantsCount, 2);
assert.equal(detail.currentUserRank, 2);
assert.equal(detail.leaderboards.local.entrantsCount, 2);
assert.equal(detail.leaderboards.local.currentUserRank, 2);
assert.equal(detail.leaderboards.local.entries.length, 2);
assert.equal(detail.leaderboards.local.entries[0].rank, 1);
assert.equal(detail.leaderboards.local.entries[1].username, null);
assert.equal(detail.leaderboards.global.entrantsCount, 4);
assert.equal(detail.leaderboards.global.currentUserRank, 3);
assert.equal(detail.leaderboards.global.entries.length, 4);
assert.equal(detail.leaderboards.global.entries[2].userId, 'user-1');

const emptyScopedDetail = mapChallengeDetailRow({
  ...summaryRow,
  leaderboards: {
    local: null,
  },
});
assert.equal(emptyScopedDetail.leaderboards.local.entrantsCount, 0);
assert.equal(emptyScopedDetail.leaderboards.local.currentUserRank, null);
assert.deepEqual(emptyScopedDetail.leaderboards.local.entries, []);
assert.equal(emptyScopedDetail.leaderboards.global.entrantsCount, 0);
assert.equal(emptyScopedDetail.leaderboards.global.currentUserRank, null);
assert.deepEqual(emptyScopedDetail.leaderboards.global.entries, []);

const migrationSql = read(migrationPath);
assert.match(migrationSql, /create table if not exists public\.challenges/i, 'migration should create challenges table');
assert.match(migrationSql, /create table if not exists public\.challenge_entries/i, 'migration should create challenge entries table');
assert.match(migrationSql, /may-2026-15-true-pints/, 'migration should seed the May challenge slug');
assert.match(migrationSql, /Drink 15 beers in May/, 'migration should seed the public headline');
assert.match(
  migrationSql,
  /Reach 15 true pints between May 1 and May 31\. All logged beverages count toward your total, normalized by serving size\./,
  'migration should seed the full true-pints detail copy'
);
assert.match(migrationSql, /true_pints/, 'migration should seed the true-pints metric');
assert.match(migrationSql, /2026-04-30 22:00:00\+00/, 'migration should store May 1 Copenhagen start in UTC');
assert.match(migrationSql, /2026-05-31 22:00:00\+00/, 'migration should store exclusive June 1 Copenhagen end in UTC');
assert.match(migrationSql, /now\(\) < challenges\.join_closes_at/, 'joining should close at join_closes_at');
assert.match(migrationSql, /public\.beerva_serving_volume_ml\(session_beers\.volume\)/, 'progress should use shared serving volume normalization');
assert.match(migrationSql, /coalesce\(session_beers\.consumed_at,\s*sessions\.started_at,\s*sessions\.created_at\)/, 'progress should use beer consumed timestamp fallback');
assert.doesNotMatch(migrationSql, /sessions\.hide_from_feed\s*=\s*false/, 'hidden pub crawl child sessions should still count toward challenge progress');
assert.match(migrationSql, /join public\.challenge_entries/, 'leaderboard should only include joined users');
assert.match(migrationSql, /order by progress_value desc/i, 'leaderboard should rank highest progress first');

const karnevalsdrukMigrationSql = read(karnevalsdrukMigrationPath);
assert.match(karnevalsdrukMigrationSql, /add column if not exists challenge_type text not null default 'target'/i, 'challenges should support challenge_type');
assert.match(karnevalsdrukMigrationSql, /alter column target_value drop not null/i, 'leaderboard challenges should allow null target values');
assert.match(karnevalsdrukMigrationSql, /challenge_type in \('target', 'leaderboard'\)/i, 'challenge_type should be constrained');
assert.match(karnevalsdrukMigrationSql, /karnevalsdruk-2026/, 'migration should seed KarnevalsDruk slug');
assert.match(karnevalsdrukMigrationSql, /KarnevalsDruk/, 'migration should seed KarnevalsDruk title');
assert.match(karnevalsdrukMigrationSql, /2026-05-23 04:00:00\+00/, 'migration should store May 23 06:00 Copenhagen start in UTC');
assert.match(karnevalsdrukMigrationSql, /2026-05-24 04:00:00\+00/, 'migration should store May 24 06:00 Copenhagen end in UTC');
assert.match(karnevalsdrukMigrationSql, /create table if not exists public\.challenge_awards/i, 'migration should create challenge awards table');
assert.match(karnevalsdrukMigrationSql, /Winner of Karneval 2026/, 'migration should award the requested trophy title');
assert.match(karnevalsdrukMigrationSql, /create table if not exists public\.official_feed_posts/i, 'migration should create official feed posts table');
assert.match(karnevalsdrukMigrationSql, /average_abv/, 'winner announcement metadata should include average ABV');
assert.match(karnevalsdrukMigrationSql, /drink_count/, 'winner announcement metadata should include drink count');
assert.match(karnevalsdrukMigrationSql, /session_count/, 'winner announcement metadata should include session count');
assert.match(karnevalsdrukMigrationSql, /progress_value <= 0/i, 'finalizer should not award a zero-progress winner');
assert.match(karnevalsdrukMigrationSql, /on conflict \(challenge_id, user_id, award_slug\)/i, 'award insertion should be idempotent');
assert.match(karnevalsdrukMigrationSql, /on conflict \(challenge_id, kind\)/i, 'official post insertion should be idempotent');
assert.match(karnevalsdrukMigrationSql, /create or replace function public\.finalize_due_challenges/i, 'migration should expose finalization RPC');
assert.match(karnevalsdrukMigrationSql, /cron\.schedule/i, 'migration should schedule challenge finalization');

const challengeLeaderboardWindowFixSql = read(challengeLeaderboardWindowFixPath);
assert.match(
  challengeLeaderboardWindowFixSql,
  /create or replace function public\.get_challenge_leaderboard/i,
  'window fix should replace the challenge leaderboard RPC'
);
assert.match(
  challengeLeaderboardWindowFixSql,
  /join public\.session_beers/i,
  'beer-row progress should only sum actual session_beers rows'
);
assert.doesNotMatch(
  challengeLeaderboardWindowFixSql,
  /left join public\.session_beers[\s\S]*greatest\(coalesce\(session_beers\.quantity,\s*1\),\s*0\)/i,
  'missing out-of-window beer rows must not be counted as one default pint'
);
assert.match(
  challengeLeaderboardWindowFixSql,
  /not exists\s*\([\s\S]*from public\.session_beers/i,
  'legacy session fallback should only apply when a session has no session_beers rows'
);
assert.match(
  challengeLeaderboardWindowFixSql,
  /coalesce\(sessions\.started_at,\s*sessions\.created_at\)\s*>=\s*target_challenge\.starts_at/i,
  'legacy session fallback should be gated by the challenge start time'
);
assert.match(
  challengeLeaderboardWindowFixSql,
  /coalesce\(sessions\.started_at,\s*sessions\.created_at\)\s*<\s*target_challenge\.ends_at/i,
  'legacy session fallback should be gated by the challenge end time'
);
assert.match(
  challengeLeaderboardWindowFixSql,
  /notify pgrst,\s*'reload schema'/i,
  'schema cache should be reloaded after challenge RPC changes'
);

const localChallengeLeaderboardsMigrationSql = read(localChallengeLeaderboardsMigrationPath);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /create or replace function public\.get_local_challenge_leaderboard\(target_challenge_id uuid\)/i,
  'local leaderboard migration should expose a viewer-aware local RPC'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /from public\.get_challenge_leaderboard\(target_challenge_id\) as global_leaderboard/i,
  'local leaderboard should derive progress and order from the canonical global RPC'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /global_leaderboard\.user_id\s*=\s*\(select auth\.uid\(\)\)[\s\S]*public\.is_mutual_follower\(\(select auth\.uid\(\)\), global_leaderboard\.user_id\)/i,
  'local leaderboard should include the signed-in joined user and joined mutual followers'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /row_number\(\) over \(\s*order by local_entries\.rank asc\s*\)::integer as rank/i,
  'local leaderboard should recalculate rank inside the filtered comparison group'
);

const officialChallengesSql = localChallengeLeaderboardsMigrationSql.match(
  /create or replace function public\.get_official_challenges\(\)[\s\S]*?(?=\ncreate or replace function public\.get_challenge_detail\(target_challenge_slug text\))/i
);
assert.ok(officialChallengesSql, 'local leaderboard migration should replace the official challenge summary RPC');
assert.match(
  officialChallengesSql[0],
  /local_users as \([\s\S]*from viewer[\s\S]*join public\.follows as outgoing_follow[\s\S]*join public\.follows as incoming_follow/i,
  'compact challenge summaries should calculate viewer-local users once with set-wise follow joins'
);
assert.match(
  officialChallengesSql[0],
  /row_number\(\) over \(\s*partition by local_entries\.challenge_id\s*order by coalesce\(beverage_progress\.progress_value,\s*0\) desc,\s*local_entries\.joined_at asc,\s*local_entries\.user_id asc\s*\)::integer as rank/i,
  'compact challenge summaries should rerank local entries independently inside each challenge'
);
assert.doesNotMatch(
  officialChallengesSql[0],
  /public\.get_local_challenge_leaderboard\(challenges\.id\)/i,
  'compact challenge summaries should avoid invoking the local leaderboard RPC per challenge'
);
assert.doesNotMatch(
  officialChallengesSql[0],
  /public\.get_challenge_leaderboard\(challenges\.id\)/i,
  'compact challenge summaries should avoid ranking every global entrant per challenge'
);

const challengeDetailSql = localChallengeLeaderboardsMigrationSql.match(
  /create or replace function public\.get_challenge_detail\(target_challenge_slug text\)[\s\S]*?(?=\nrevoke execute on function public\.get_local_challenge_leaderboard\(uuid\))/i
);
assert.ok(challengeDetailSql, 'local leaderboard migration should replace the challenge detail RPC');
assert.match(
  challengeDetailSql[0],
  /'leaderboards'[\s\S]*'local'[\s\S]*'global'/i,
  'detail RPC should return both leaderboard scopes in one response'
);
assert.match(
  challengeDetailSql[0],
  /local_leaderboard as \(\s*select\s+row_number\(\) over \(\s*order by global_leaderboard\.rank asc\s*\)::integer as rank,[\s\S]*from global_leaderboard\s+where global_leaderboard\.user_id\s*=\s*\(select auth\.uid\(\)\)[\s\S]*or public\.is_mutual_follower\(\(select auth\.uid\(\)\), global_leaderboard\.user_id\)/i,
  'detail local leaderboard should reuse canonical rows, filter viewer-local users, and rerank the subset'
);
assert.doesNotMatch(
  challengeDetailSql[0],
  /cross join lateral public\.get_local_challenge_leaderboard\(target_challenge\.id\)/i,
  'detail RPC should not aggregate canonical global progress twice'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /'current_user_progress', global_scope\.current_user_progress/i,
  'shared detail progress should remain independent of the selected local or global scope'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /'leaderboard', local_scope\.leaderboard/i,
  'detail RPC should keep a top-level local leaderboard alias for cached older clients'
);
assert.doesNotMatch(
  localChallengeLeaderboardsMigrationSql,
  /create or replace function public\.get_challenge_leaderboard\(/i,
  'local scopes must not replace the canonical global leaderboard RPC'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /notify pgrst,\s*'reload schema'/i,
  'local leaderboard migration should reload the PostgREST schema cache'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /revoke execute on function public\.get_official_challenges\(\) from public,\s*anon;/i,
  'official challenge summaries should explicitly revoke public and anon execution'
);
assert.match(
  localChallengeLeaderboardsMigrationSql,
  /revoke execute on function public\.get_challenge_detail\(text\) from public,\s*anon;/i,
  'challenge detail should explicitly revoke public and anon execution'
);

const adminChallengesMigrationSql = read(adminChallengesMigrationPath);
assert.match(
  adminChallengesMigrationSql,
  /create or replace function public\.finalize_generic_due_challenges[\s\S]*from public\.get_challenge_leaderboard\(challenge_row\.id\) as leaderboard/i,
  'generic finalization should continue using the canonical global leaderboard'
);
assert.doesNotMatch(
  adminChallengesMigrationSql,
  /get_local_challenge_leaderboard/i,
  'generic finalization must not use viewer-specific local ranks'
);

const archiveMigrationSql = read(archiveMigrationPath);
const targetChallengeUnitsMigrationSql = read(targetChallengeUnitsMigrationPath);
const boozeInJuneUnitsFixMigrationSql = read(boozeInJuneUnitsFixMigrationPath);
const forceTargetUnitsMigrationSql = read(forceTargetUnitsMigrationPath);
assert.match(
  archiveMigrationSql,
  /create or replace function public\.get_official_challenges\(\)[\s\S]*where challenges\.archived_at is null/i,
  'official challenge summaries should exclude archived challenges'
);
assert.match(
  archiveMigrationSql,
  /create or replace function public\.get_challenge_detail\(target_challenge_slug text\)[\s\S]*and challenges\.archived_at is null/i,
  'challenge detail should not resolve archived challenges'
);
assert.match(
  archiveMigrationSql,
  /create or replace function public\.join_challenge\(target_challenge_id uuid\)[\s\S]*and challenges\.archived_at is null/i,
  'joining should reject archived challenges'
);
assert.match(
  archiveMigrationSql,
  /create or replace function public\.get_challenge_leaderboard\(target_challenge_id uuid\)[\s\S]*where challenges\.id = target_challenge_id[\s\S]*and challenges\.archived_at is null/i,
  'direct leaderboard calls should not expose archived challenge rows'
);
assert.match(
  archiveMigrationSql,
  /finalize_generic_due_challenges[\s\S]*and challenges\.archived_at is null/i,
  'generic finalization should skip archived challenges'
);
assert.match(
  archiveMigrationSql,
  /finalize_due_challenges[\s\S]*and challenges\.archived_at is null/i,
  'KarnevalsDruk finalization should skip archived challenges'
);
assert.match(
  archiveMigrationSql,
  /create policy "Signed-in users can view official challenges"[\s\S]*using \(archived_at is null\)/i,
  'regular challenge selects should be limited to unarchived rows'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /drop constraint if exists challenges_metric_type_check/i,
  'unit migration should replace the old metric_type constraint'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /metric_type in \('true_pints', 'alcohol_units'\)/i,
  'metric_type constraint should allow alcohol_units'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /create or replace function public\.beerva_challenge_progress_value/i,
  'unit migration should add a shared challenge progress helper'
);
assert.equal(
  (targetChallengeUnitsMigrationSql.match(/session_beers\.quantity::numeric,\s*session_beers\.abv::numeric/g) ?? []).length,
  2,
  'session_beers progress helper calls should cast quantity and ABV to match the helper signature'
);
assert.equal(
  (targetChallengeUnitsMigrationSql.match(/sessions\.quantity::numeric,\s*sessions\.abv::numeric/g) ?? []).length,
  2,
  'legacy session progress helper calls should cast quantity and ABV to match the helper signature'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /0\.789[\s\S]*12\.0/i,
  'unit progress should use Danish alcohol unit conversion constants'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /\/ 568\.0/i,
  'true-pint progress should remain available'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /set metric_type = 'alcohol_units'[\s\S]*challenge_type = 'target'[\s\S]*ends_at > now\(\)/i,
  'active and upcoming target challenges should move to alcohol units'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /finalized_at is null/i,
  'metric migration should not rewrite finalized historical challenges'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /target_challenge_type = 'target'[\s\S]*'alcohol_units'[\s\S]*'true_pints'/i,
  'admin target challenges should save as alcohol_units while leaderboard challenges stay true_pints'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /create or replace function public\.get_challenge_leaderboard/i,
  'unit migration should replace canonical global challenge leaderboard'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /create or replace function public\.get_official_challenges/i,
  'unit migration should replace compact official challenge summaries'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /notify pgrst,\s*'reload schema'/i,
  'unit migration should reload PostgREST schema cache'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /where challenges\.challenge_type = 'leaderboard'[\s\S]*and challenges\.slug = 'karnevalsdruk-2026'/i,
  'KarnevalsDruk finalizer should remain leaderboard scoped'
);
assert.match(
  boozeInJuneUnitsFixMigrationSql,
  /update public\.challenges[\s\S]*set metric_type = 'alcohol_units'[\s\S]*challenge_type = 'target'[\s\S]*finalized_at is null/i,
  'Booze-in-June fix should convert the existing unfinished target challenge to units'
);
assert.match(
  boozeInJuneUnitsFixMigrationSql,
  /booze-in-june/i,
  'Booze-in-June fix should target the June challenge by stable slug/title'
);
assert.match(
  boozeInJuneUnitsFixMigrationSql,
  /slug\) like 'booze-in-june-%'/i,
  'Booze-in-June fix should handle admin-generated slug suffixes'
);
assert.doesNotMatch(
  boozeInJuneUnitsFixMigrationSql,
  /ends_at\s*>\s*now\(\)/i,
  'Booze-in-June fix should not depend on the current date window'
);
assert.match(
  boozeInJuneUnitsFixMigrationSql,
  /notify pgrst,\s*'reload schema'/i,
  'Booze-in-June fix should reload PostgREST schema cache'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /create or replace function public\.beerva_effective_challenge_metric_type/i,
  'force-units migration should define an effective metric helper'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /when challenge_type_value = 'target' then 'alcohol_units'/i,
  'target challenges should resolve to alcohol_units regardless of stale stored metric_type'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /update public\.challenges[\s\S]*set metric_type = 'alcohol_units'[\s\S]*where challenge_type = 'target'/i,
  'force-units migration should update every stored target challenge metric'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /beerva_challenge_progress_value\(\s*public\.beerva_effective_challenge_metric_type\(\s*target_challenge\.challenge_type,\s*target_challenge\.metric_type\s*\)/i,
  'global leaderboard should calculate progress from the effective metric'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /beerva_challenge_progress_value\(\s*public\.beerva_effective_challenge_metric_type\(\s*challenges\.challenge_type,\s*challenges\.metric_type\s*\)/i,
  'official challenge summaries should calculate progress from the effective metric'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /public\.beerva_effective_challenge_metric_type\(\s*challenges\.challenge_type,\s*challenges\.metric_type\s*\) as metric_type/i,
  'official challenge summaries should expose the effective metric'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /'metric_type',\s*public\.beerva_effective_challenge_metric_type\(\s*target_challenge\.challenge_type,\s*target_challenge\.metric_type\s*\)/i,
  'challenge detail should expose the effective metric'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /create or replace function public\.get_challenge_detail\(target_challenge_slug text\)/i,
  'force-units migration should replace challenge detail so the UI receives alcohol_units'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /revoke execute on function public\.get_challenge_detail\(text\) from public, anon;/i,
  'force-units migration should keep challenge detail execute grants explicit'
);
assert.match(
  forceTargetUnitsMigrationSql,
  /notify pgrst,\s*'reload schema'/i,
  'force-units migration should reload PostgREST schema cache'
);

const karnevalTestMigrationSql = read(karnevalTestMigrationPath);
assert.match(karnevalTestMigrationSql, /karneval-test/, 'test challenge should use a stable slug');
assert.match(karnevalTestMigrationSql, /karneval test/, 'test challenge should use the requested title');
assert.match(karnevalTestMigrationSql, /'leaderboard'/, 'test challenge should be a leaderboard challenge');
assert.match(karnevalTestMigrationSql, /'true_pints'/, 'test challenge should use true-pint progress');
assert.match(karnevalTestMigrationSql, /2026-05-21 04:00:00\+00/, 'test challenge should start today at 06:00 Copenhagen time');
assert.match(karnevalTestMigrationSql, /2026-05-22 04:00:00\+00/, 'test challenge should end tomorrow at 06:00 Copenhagen time');
assert.match(karnevalTestMigrationSql, /slug = 'karnevalsdruk-2026'/, 'official finalizer should remain scoped to the real Karneval challenge');
assert.doesNotMatch(karnevalTestMigrationSql, /winner-of-karneval-2026[\s\S]*karneval-test/i, 'test challenge should not receive the official Karneval trophy');
assert.match(karnevalTestMigrationSql, /notify pgrst,\s*'reload schema'/i, 'test challenge migration should reload PostgREST schema cache');

const removeKarnevalTestMigrationSql = read(removeKarnevalTestMigrationPath);
assert.match(removeKarnevalTestMigrationSql, /delete from public\.challenges/i, 'cleanup should delete the test challenge row');
assert.match(removeKarnevalTestMigrationSql, /slug = 'karneval-test'/, 'cleanup should target only the test challenge slug');
assert.doesNotMatch(removeKarnevalTestMigrationSql, /karnevalsdruk-2026/, 'cleanup should not touch the real KarnevalsDruk challenge');
assert.match(removeKarnevalTestMigrationSql, /notify pgrst,\s*'reload schema'/i, 'cleanup should reload PostgREST schema cache');

const karnevalsdrukDualAwardsMigrationSql = read(karnevalsdrukDualAwardsMigrationPath);
assert.match(karnevalsdrukDualAwardsMigrationSql, /create or replace function public\.finalize_due_challenges/i, 'dual awards migration should replace finalization RPC');
assert.match(karnevalsdrukDualAwardsMigrationSql, /king-of-karneval-pints/, 'pint winner should receive a distinct award slug');
assert.match(karnevalsdrukDualAwardsMigrationSql, /king-of-karneval-abv/, 'ABV winner should receive a distinct award slug');
assert.match(karnevalsdrukDualAwardsMigrationSql, /King of Karneval/g, 'both trophies should use the requested title');
assert.match(
  karnevalsdrukDualAwardsMigrationSql,
  /Congrats, you outperformed everyone else by being an absolute legend\./,
  'pint trophy should use the requested subtitle'
);
assert.match(
  karnevalsdrukDualAwardsMigrationSql,
  /Are you ok\? You had the highest ABV-average/,
  'ABV trophy should use the requested subtitle'
);
assert.match(karnevalsdrukDualAwardsMigrationSql, /average_abv\s+desc/i, 'ABV winner should be ranked by highest average ABV');
assert.match(karnevalsdrukDualAwardsMigrationSql, /pint_user_id/, 'finalizer should track the pint winner separately');
assert.match(karnevalsdrukDualAwardsMigrationSql, /abv_user_id/, 'finalizer should track the ABV winner separately');
assert.match(
  karnevalsdrukDualAwardsMigrationSql,
  /on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key/i,
  'both challenge awards should remain idempotent without ambiguous conflict columns'
);
assert.match(
  karnevalsdrukDualAwardsMigrationSql,
  /on conflict on constraint official_feed_posts_challenge_id_kind_key/i,
  'official winner posts should remain idempotent without ambiguous conflict columns'
);
assert.doesNotMatch(
  karnevalsdrukDualAwardsMigrationSql,
  /on conflict \(challenge_id/i,
  'dual awards finalizer must not use bare challenge_id conflict targets'
);
assert.match(
  karnevalsdrukDualAwardsMigrationSql,
  /where challenges\.challenge_type = 'leaderboard'[\s\S]*and challenges\.finalized_at is null/i,
  'dual awards finalizer should qualify challenge columns to avoid PL/pgSQL output-variable ambiguity'
);
assert.doesNotMatch(
  karnevalsdrukDualAwardsMigrationSql,
  /\sand finalized_at is null/i,
  'dual awards finalizer must not use an unqualified finalized_at predicate'
);

const karnevalsdrukFinalizationRecoverySql = read(karnevalsdrukFinalizationRecoveryPath);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /create or replace function public\.finalize_due_challenges\(batch_size integer default 10\)/i,
  'recovery should replace the broken finalization RPC before invoking it'
);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /where challenges\.challenge_type = 'leaderboard'[\s\S]*and challenges\.finalized_at is null/i,
  'recovery finalizer should qualify challenge columns so finalized_at is not ambiguous with output variables'
);
assert.doesNotMatch(
  karnevalsdrukFinalizationRecoverySql,
  /\sand finalized_at is null/i,
  'recovery finalizer must not use an unqualified finalized_at predicate'
);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /on conflict on constraint challenge_awards_challenge_id_user_id_award_slug_key/i,
  'recovery awards should remain idempotent without ambiguous conflict columns'
);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /on conflict on constraint official_feed_posts_challenge_id_kind_key/i,
  'recovery official post should remain idempotent without ambiguous conflict columns'
);
assert.doesNotMatch(
  karnevalsdrukFinalizationRecoverySql,
  /on conflict \(challenge_id/i,
  'recovery finalizer must not use bare challenge_id conflict targets'
);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /create or replace function public\.invoke_challenge_finalizer\(\)[\s\S]*from public\.finalize_due_challenges\(10\)/i,
  'challenge cron should finalize directly in the database instead of depending on an Edge gateway call'
);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /king-of-karneval-pints[\s\S]*official_feed_posts[\s\S]*finalized_at\s*=\s*null/i,
  'recovery should reopen an ended KarnevalsDruk row when finalization side effects are missing'
);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /king-of-karneval-abv[\s\S]*finalized_at\s*=\s*null/i,
  'recovery should also reopen KarnevalsDruk when the ABV winner trophy is missing'
);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /from public\.finalize_due_challenges\(10\)/i,
  'recovery should run the finalizer after repairing the finalization state'
);
assert.match(
  karnevalsdrukFinalizationRecoverySql,
  /drop trigger if exists challenges_create_karnevalsdruk_hangover_prompts_after_finalize/i,
  'recovery should disable late KarnevalsDruk hangover prompt creation before rerunning finalization'
);
assert.doesNotMatch(
  karnevalsdrukFinalizationRecoverySql,
  /perform public\.create_karnevalsdruk_hangover_prompts|create trigger challenges_create_karnevalsdruk_hangover_prompts_after_finalize/i,
  'recovery should not queue late KarnevalsDruk hangover prompts'
);

const finalizerSource = read(challengeFinalizerPath);
assert.match(finalizerSource, /finalize_due_challenges/, 'scheduled function should call finalization RPC');
assert.match(finalizerSource, /CHALLENGE_FINALIZER_CRON_SECRET/, 'scheduled function should require a challenge cron secret');
assert.match(finalizerSource, /x-beerva-cron-secret/i, 'scheduled function should validate the cron secret header');

const supabaseConfig = read('supabase/config.toml');
assert.match(
  supabaseConfig,
  /\[functions\.finalize-challenges\][\s\S]*?verify_jwt\s*=\s*false/,
  'finalize-challenges should disable gateway JWT verification and rely on its cron secret'
);

const apiSource = read(challengesApiPath);
assert.match(apiSource, /fetchOfficialChallenges/, 'challenge API should fetch official challenges');
assert.match(apiSource, /fetchChallengeDetail/, 'challenge API should fetch challenge detail');
assert.match(apiSource, /joinChallenge/, 'challenge API should expose joining');
assert.match(apiSource, /fetchJoinedActiveChallengeSummary/, 'challenge API should expose joined active feed summary');
assert.match(apiSource, /supabase\.rpc\('join_challenge'/, 'joining should go through join RPC');
assert.match(apiSource, /supabase\.rpc\('get_official_challenges'/, 'list should go through official challenges RPC');
assert.match(apiSource, /supabase\.rpc\('get_challenge_detail'/, 'detail should go through challenge detail RPC');

const pubLegendsSource = read(pubLegendsScreenPath);
assert.match(pubLegendsSource, /activeSegment/, 'Pub Legends should track active segment');
assert.match(pubLegendsSource, /legendsErrorMessage/, 'Pub Legends should keep legend errors separate');
assert.match(pubLegendsSource, /challengesErrorMessage/, 'Pub Legends should keep challenge errors separate');
assert.match(pubLegendsSource, /Pub Legends[\s\S]*Challenges/, 'Pub Legends should render a Pub Legends | Challenges segment');
assert.match(pubLegendsSource, /fetchOfficialChallenges/, 'Pub Legends should load official challenges');
assert.match(pubLegendsSource, /Join/, 'Challenges list should expose compact Join control');
assert.match(pubLegendsSource, /formatChallengeStatusLabel/, 'Challenge rows should include compact status metadata');
assert.match(pubLegendsSource, /entered/, 'Challenge rows should include entrants count');
assert.doesNotMatch(pubLegendsSource, /label="Join Challenge"/, 'Challenges should not use a chunky full-width Join Challenge AppButton');
assert.match(
  pubLegendsSource,
  /formatChallengeProgress\(item\.currentUserProgress,\s*item\.targetValue,\s*item\.challengeType,\s*item\.metricType\)/,
  'Pub Legends challenge rows should pass metric type into progress formatting'
);

const detailScreenSource = read(detailScreenPath);
assert.match(detailScreenSource, /fetchChallengeDetail/, 'detail screen should load challenge detail');
assert.match(detailScreenSource, /joinChallenge/, 'detail screen should support joining');
assert.match(detailScreenSource, /FlatList/, 'detail screen should render leaderboard as a list');
assert.match(detailScreenSource, /styles\.joinButtonCompact/, 'detail screen should use compact join button styling');
assert.match(detailScreenSource, /challenge\.joined\s*\?\s*\(/, 'detail screen should gate progress and rank behind joined state');
assert.match(detailScreenSource, /getChallengePreJoinCopy\(challenge\)/, 'detail screen should render shared pre-join challenge copy');
assert.match(detailScreenSource, /CHALLENGE_AUTO_REFRESH_INTERVAL_MS\s*=\s*20000/, 'active challenge detail should poll every 20 seconds');
assert.match(detailScreenSource, /setInterval/, 'active challenge detail should auto-refresh while focused');
assert.match(detailScreenSource, /clearInterval/, 'active challenge detail should clear its auto-refresh timer on blur');
assert.match(detailScreenSource, /challengeType\s*===\s*CHALLENGE_TYPE\.LEADERBOARD/, 'auto-refresh should be scoped to leaderboard challenges');
assert.match(detailScreenSource, /status\s*===\s*CHALLENGE_STATUS\.ACTIVE/, 'auto-refresh should only poll while the challenge is active');
assert.match(detailScreenSource, /silent:\s*true/, 'auto-refresh should avoid showing manual refresh errors');
assert.match(detailScreenSource, /skipIfInFlight:\s*true/, 'auto-refresh should not overlap challenge detail requests');
assert.match(
  detailScreenSource,
  /useState<ChallengeLeaderboardScope>\(CHALLENGE_LEADERBOARD_SCOPE\.LOCAL\)/,
  'detail leaderboard scope should default to local'
);
assert.match(
  detailScreenSource,
  /challenge\?\.leaderboards\[leaderboardScope\]/,
  'detail screen should render the selected scoped leaderboard'
);
assert.match(
  detailScreenSource,
  /Local[\s\S]*Global/,
  'detail screen should expose Local and Global leaderboard controls'
);
assert.match(
  detailScreenSource,
  /setLeaderboardScope\(scope\.key\)/,
  'detail scope controls should switch the selected leaderboard'
);
assert.match(
  detailScreenSource,
  /formatChallengeRank\(activeLeaderboard\?\.currentUserRank\)/,
  'detail rank summary should follow the selected leaderboard'
);
assert.match(
  detailScreenSource,
  /\{activeLeaderboard\?\.entrantsCount \?\? 0\}/,
  'detail entrant summary should follow the selected leaderboard'
);
assert.match(
  detailScreenSource,
  /No local entrants yet[\s\S]*Mutual followers who join this challenge will appear here\./,
  'detail local scope should explain an empty mutual-follower leaderboard'
);
assert.match(
  detailScreenSource,
  /useEffect\(\(\) => \{\s*setLeaderboardScope\(CHALLENGE_LEADERBOARD_SCOPE\.LOCAL\);\s*\}, \[challengeSlug\]\);/,
  'detail leaderboard scope should reset only when the challenge route changes'
);
assert.equal(
  (detailScreenSource.match(/\bfetchChallengeDetail\(/g) || []).length,
  1,
  'detail polling should continue through the single existing challenge detail request'
);
assert.match(
  detailScreenSource,
  /const renderLeader = useCallback\([\s\S]*?\), \[challenge\]\);/,
  'detail leaderboard row renderer should remain independent of selected scope'
);
assert.match(
  detailScreenSource,
  /formatChallengeProgress\(item\.progressValue,\s*challenge\?\.targetValue,\s*challenge\?\.challengeType,\s*challenge\?\.metricType\)/,
  'detail leaderboard rows should pass challenge metric into progress formatting'
);
assert.match(
  detailScreenSource,
  /formatChallengeProgress\(challenge\.currentUserProgress,\s*challenge\.targetValue,\s*challenge\.challengeType,\s*challenge\.metricType\)/,
  'detail progress summary should pass challenge metric into progress formatting'
);

const feedScreenSource = read(feedScreenPath);
assert.match(feedScreenSource, /fetchJoinedActiveChallengeSummary/, 'Feed should load joined active challenge summary');
assert.match(feedScreenSource, /challengePreviewStrip/, 'Feed should render a compact challenge strip');
assert.doesNotMatch(feedScreenSource, /challengePreviewCard/, 'Feed should not render a large challenge card');
assert.match(feedScreenSource, /navigation\.navigate\('ChallengeDetail'/, 'Feed strip should open challenge detail');
assert.match(
  feedScreenSource,
  /formatChallengeProgress\(activeChallengeSummary\.currentUserProgress,\s*activeChallengeSummary\.targetValue,\s*activeChallengeSummary\.challengeType,\s*activeChallengeSummary\.metricType\)/,
  'feed challenge strip should pass metric type into progress formatting'
);

const officialFeedApiSource = read(officialFeedPostsApiPath);
assert.match(officialFeedApiSource, /from\('official_feed_posts'\)/, 'official feed post API should read official_feed_posts');
assert.match(officialFeedApiSource, /mapOfficialFeedPostRow/, 'official feed post API should map rows');

const officialFeedCardSource = read(officialFeedPostCardPath);
assert.match(officialFeedCardSource, /Official Beerva/, 'official feed card should mark the post as official');
assert.match(officialFeedCardSource, /Average ABV/, 'official feed card should show average ABV');
assert.doesNotMatch(officialFeedCardSource, /onDelete|onToggleCheers|onOpenComments/, 'official feed card should not expose user post controls');

assert.match(feedScreenSource, /fetchOfficialFeedPostsForFeedPage/, 'Feed should fetch official feed posts');
assert.match(feedScreenSource, /type: 'official_post'/, 'Feed should merge official post items');
assert.match(feedScreenSource, /OfficialFeedPostCard/, 'Feed should render official feed post cards');

const navigatorSource = read(navigatorPath);
assert.match(navigatorSource, /ChallengeDetailScreen/, 'navigator should import challenge detail screen');
assert.match(navigatorSource, /<Stack\.Screen name="ChallengeDetail"/, 'navigator should register ChallengeDetail stack route');
assert.doesNotMatch(navigatorSource, /<Tab\.Screen[\s\S]*name="Challenges"/, 'Challenges should not be a bottom tab');

console.log('official challenge checks passed');
