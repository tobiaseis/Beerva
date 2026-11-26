const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadTypeScriptModule } = require('./loadTypeScriptModule');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};
const countMatches = (source, pattern) => (source.match(pattern) || []).length;

// Migration: a separate nights-out RPC, merged into the challenge detail JSON.
const sql = read('supabase/migrations/20261126120000_add_challenge_nights_out.sql');
assert.ok(sql, 'nights-out migration should exist');
assert.match(sql, /create or replace function public\.get_challenge_nights_out\(target_challenge_id uuid\)/i, 'migration should add get_challenge_nights_out');
assert.match(sql, /returns table \(\s*user_id uuid,\s*nights_out integer\s*\)/i, 'nights-out RPC should return user_id and nights_out');
assert.match(sql, /timezone\('Europe\/Copenhagen', drink_events\.drank_at\) - interval '6 hours'/i, 'a night is the 06:00-06:00 Copenhagen drinking day');
assert.match(sql, /count\(distinct/i, 'nights are distinct drinking days');
assert.match(sql, /coalesce\(session_beers\.excluded_from_stats, false\) = false/i, 'invalidated drinks do not create a night out');
assert.match(sql, /sessions\.status = 'published'/i, 'only published sessions count');
assert.match(sql, /drank_at >= target_challenge\.starts_at/i, 'nights respect the challenge start');
assert.match(sql, /drank_at < target_challenge\.ends_at/i, 'nights respect the challenge end');
assert.match(sql, /challenges\.archived_at is null/i, 'archived challenges return nothing');
assert.doesNotMatch(sql, /drop function[^;]*get_challenge_leaderboard/i, 'the ranking RPC keeps its signature so older callers keep working');
assert.match(sql, /create or replace function public\.get_challenge_detail\(target_challenge_slug text\)/i, 'challenge detail is re-created');
assert.equal(countMatches(sql, /'nights_out', [a-z_]+\.nights_out/gi), 2, 'both local and global leaderboard rows carry nights_out');
assert.match(sql, /order by coalesce\(beverage_progress|get_challenge_leaderboard\(target_challenge\.id\)/i, 'ranking still comes from the units leaderboard');
assert.match(sql, /revoke execute on function public\.get_challenge_nights_out\(uuid\) from public, anon/i, 'anon cannot call the nights-out RPC');
assert.match(sql, /grant execute on function public\.get_challenge_nights_out\(uuid\) to authenticated/i, 'signed-in users can call the nights-out RPC');
assert.match(sql, /notify pgrst, 'reload schema'/i, 'migration reloads the PostgREST schema cache');

// Client mapping and copy.
const {
  formatNightsOut,
  getLeaderboardEntryMeta,
  mapChallengeDetailRow,
  mapChallengeLeaderboardRow,
} = loadTypeScriptModule('src/lib/challenges.ts');

assert.equal(typeof formatNightsOut, 'function', 'formatNightsOut should be exported');
assert.equal(formatNightsOut(0), '0 nights out');
assert.equal(formatNightsOut(1), '1 night out');
assert.equal(formatNightsOut(4), '4 nights out');

assert.equal(mapChallengeLeaderboardRow({ rank: 1, user_id: 'u1', progress_value: '12.5', nights_out: '3' }).nightsOut, 3, 'nights_out maps to nightsOut');
assert.equal(mapChallengeLeaderboardRow({ rank: 1, user_id: 'u1', progress_value: 0, nights_out: 0 }).nightsOut, 0, 'zero nights stays zero');
assert.equal(mapChallengeLeaderboardRow({ rank: 1, user_id: 'u1', progress_value: '12.5' }).nightsOut, null, 'missing nights_out (older backend) maps to null');
assert.equal(mapChallengeLeaderboardRow({ rank: 1, user_id: 'u1', nights_out: 'abc' }).nightsOut, null, 'garbage maps to null');

const unitsBoard = { challengeType: 'leaderboard', metricType: 'alcohol_units' };
assert.equal(getLeaderboardEntryMeta({ completed: false, progressValue: 34.2, nightsOut: 4 }, unitsBoard), '4 nights out', 'leaderboard rows say how many nights out');
assert.equal(getLeaderboardEntryMeta({ completed: false, progressValue: 3, nightsOut: 1 }, unitsBoard), '1 night out');
assert.equal(getLeaderboardEntryMeta({ completed: false, progressValue: 34.2, nightsOut: null }, unitsBoard), '34.2 units', 'older backend falls back to the previous copy');
assert.equal(getLeaderboardEntryMeta({ completed: true, progressValue: 15.1, nightsOut: 5 }, { challengeType: 'target' }), 'Completed', 'target challenges keep their status copy');

const detail = mapChallengeDetailRow({
  id: 'c1',
  slug: 'julefrokost-season-2026',
  title: 'Julefrokost Season',
  description: 'x',
  metric_type: 'alcohol_units',
  challenge_type: 'leaderboard',
  starts_at: '2026-11-27T05:00:00Z',
  ends_at: '2027-01-01T05:00:00Z',
  join_closes_at: '2027-01-01T05:00:00Z',
  leaderboards: {
    local: { entrants_count: 1, leaderboard: [{ rank: 1, user_id: 'u1', progress_value: 20, nights_out: 2 }] },
    global: { entrants_count: 1, leaderboard: [{ rank: 1, user_id: 'u1', progress_value: 20, nights_out: 2 }] },
  },
});
assert.equal(detail.leaderboards.local.entries[0].nightsOut, 2, 'local leaderboard entries carry nights out');
assert.equal(detail.leaderboards.global.entries[0].nightsOut, 2, 'global leaderboard entries carry nights out');

// The detail screen keeps ranking by units on the right and shows nights under the name.
const screen = read('src/screens/ChallengeDetailScreen.tsx');
assert.match(screen, /getLeaderboardEntryMeta\(item, challenge/, 'row subtitle uses the shared meta copy');
assert.match(screen, /formatChallengeProgress\(item\.progressValue/, 'row value stays the units total');

console.log('challenge nights-out checks passed');
