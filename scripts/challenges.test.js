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

assert.ok(exists(challengesHelperPath), 'challenge helper module should exist');
assert.ok(exists(challengesApiPath), 'challenge API module should exist');
assert.ok(exists(detailScreenPath), 'challenge detail screen should exist');
assert.ok(exists(migrationPath), 'official challenge migration should exist');

const {
  CHALLENGE_STATUS,
  formatChallengeProgress,
  formatChallengeRank,
  formatChallengeStatusLabel,
  getChallengeStatus,
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

const feedScreenSource = read(feedScreenPath);
assert.match(feedScreenSource, /fetchJoinedActiveChallengeSummary/, 'Feed should load joined active challenge summary');
assert.match(feedScreenSource, /challengePreviewStrip/, 'Feed should render a compact challenge strip');
assert.doesNotMatch(feedScreenSource, /challengePreviewCard/, 'Feed should not render a large challenge card');
assert.match(feedScreenSource, /navigation\.navigate\('ChallengeDetail'/, 'Feed strip should open challenge detail');

const navigatorSource = read(navigatorPath);
assert.match(navigatorSource, /ChallengeDetailScreen/, 'navigator should import challenge detail screen');
assert.match(navigatorSource, /<Stack\.Screen name="ChallengeDetail"/, 'navigator should register ChallengeDetail stack route');
assert.doesNotMatch(navigatorSource, /<Tab\.Screen[\s\S]*name="Challenges"/, 'Challenges should not be a bottom tab');

console.log('official challenge checks passed');
