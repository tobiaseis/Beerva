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
const karnevalTestMigrationPath = 'supabase/migrations/20260521110000_add_karneval_test_challenge.sql';
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
assert.ok(exists(karnevalTestMigrationPath), 'Karneval test challenge migration should exist');
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
  getChallengePreJoinCopy({ challengeType: 'leaderboard', slug: 'karnevalsdruk-2026' }),
  'Join to count your Karneval drinks from the full 06:00 to 06:00 window.'
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
assert.equal(summary.joinOpen, true);
assert.equal(summary.entrantsCount, 4);
assert.equal(summary.currentUserRank, 3);
assert.equal(summary.currentUserProgress, 6.234);
assert.deepEqual(summary.raw, summaryRow);

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
  leaderboard: [
    {
      rank: '1',
      user_id: 'user-1',
      username: 'Mads',
      avatar_url: null,
      progress_value: '15.4',
      completed: true,
    },
    {
      rank: '2',
      user_id: 'user-2',
      username: null,
      avatar_url: 'https://example.com/avatar.png',
      progress_value: '8',
      completed: false,
    },
  ],
});

assert.equal(detail.leaderboard.length, 2);
assert.equal(detail.leaderboard[0].rank, 1);
assert.equal(detail.leaderboard[0].completed, true);
assert.equal(detail.leaderboard[1].username, null);

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

const finalizerSource = read(challengeFinalizerPath);
assert.match(finalizerSource, /finalize_due_challenges/, 'scheduled function should call finalization RPC');
assert.match(finalizerSource, /CHALLENGE_FINALIZER_CRON_SECRET/, 'scheduled function should require a challenge cron secret');
assert.match(finalizerSource, /x-beerva-cron-secret/i, 'scheduled function should validate the cron secret header');

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

const detailScreenSource = read(detailScreenPath);
assert.match(detailScreenSource, /fetchChallengeDetail/, 'detail screen should load challenge detail');
assert.match(detailScreenSource, /joinChallenge/, 'detail screen should support joining');
assert.match(detailScreenSource, /FlatList/, 'detail screen should render leaderboard as a list');
assert.match(detailScreenSource, /styles\.joinButtonCompact/, 'detail screen should use compact join button styling');
assert.match(detailScreenSource, /challenge\.joined\s*\?\s*\(/, 'detail screen should gate progress and rank behind joined state');
assert.match(detailScreenSource, /Join to see your retroactive progress/, 'detail screen should explain retroactive progress before joining');
assert.match(detailScreenSource, /CHALLENGE_AUTO_REFRESH_INTERVAL_MS\s*=\s*20000/, 'active challenge detail should poll every 20 seconds');
assert.match(detailScreenSource, /setInterval/, 'active challenge detail should auto-refresh while focused');
assert.match(detailScreenSource, /clearInterval/, 'active challenge detail should clear its auto-refresh timer on blur');
assert.match(detailScreenSource, /challengeType\s*===\s*CHALLENGE_TYPE\.LEADERBOARD/, 'auto-refresh should be scoped to leaderboard challenges');
assert.match(detailScreenSource, /status\s*===\s*CHALLENGE_STATUS\.ACTIVE/, 'auto-refresh should only poll while the challenge is active');
assert.match(detailScreenSource, /silent:\s*true/, 'auto-refresh should avoid showing manual refresh errors');
assert.match(detailScreenSource, /skipIfInFlight:\s*true/, 'auto-refresh should not overlap challenge detail requests');

const feedScreenSource = read(feedScreenPath);
assert.match(feedScreenSource, /fetchJoinedActiveChallengeSummary/, 'Feed should load joined active challenge summary');
assert.match(feedScreenSource, /challengePreviewStrip/, 'Feed should render a compact challenge strip');
assert.doesNotMatch(feedScreenSource, /challengePreviewCard/, 'Feed should not render a large challenge card');
assert.match(feedScreenSource, /navigation\.navigate\('ChallengeDetail'/, 'Feed strip should open challenge detail');

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
