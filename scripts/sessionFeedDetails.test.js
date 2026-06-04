const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260602130000_add_session_feed_details_rpc.sql');

assert.equal(fs.existsSync(migrationPath), true, 'session feed details migration should exist');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /create or replace function public\.get_session_feed_details\(session_ids uuid\[\]\)/i, 'feed details RPC should exist');
assert.match(sql, /security definer/i, 'RPC should run as definer to bypass per-table RLS');
assert.match(sql, /set search_path = public/i, 'RPC should pin search_path');
assert.match(sql, /\bstable\b/i, 'read-only RPC should be marked stable');
// Viewer-aware visibility, mirroring get_session_chug_attempt_summaries.
assert.match(sql, /sessions\.status = 'published'|s\.status = 'published'/i, 'RPC should only expose published sessions');
assert.match(sql, /follows\.follower_id = \(select auth\.uid\(\)\)/i, 'RPC should restrict to own and followed authors');
// One jsonb aggregate per relation.
assert.match(sql, /from public\.session_cheers/i, 'RPC should aggregate cheers');
assert.match(sql, /from public\.session_beers/i, 'RPC should aggregate beers');
assert.match(sql, /from public\.session_comments/i, 'RPC should aggregate comments');
assert.match(sql, /from public\.session_photos/i, 'RPC should aggregate photos');
assert.match(sql, /jsonb_agg/i, 'RPC should return jsonb arrays');
// Supporting index for the feed session list query.
assert.match(sql, /create index if not exists sessions_feed_published_idx/i, 'migration should add a partial feed index');
// Grants + schema reload, matching the buddy/chug migrations.
assert.match(sql, /grant execute on function public\.get_session_feed_details\(uuid\[\]\) to authenticated/i, 'authenticated users should execute the RPC');
assert.match(sql, /revoke execute on function public\.get_session_feed_details\(uuid\[\]\) from public, anon/i, 'anon should not execute the RPC');
assert.match(sql, /notify pgrst, 'reload schema'/i, 'migration should reload the PostgREST schema cache');

// ---- Client mapper unit tests ----
const Module = require('node:module');
const ts = require('typescript');

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

const feedDetails = loadTypeScriptModule('src/lib/sessionFeedDetails.ts', {
  './supabase': { supabase: {} },
  './timeouts': { withTimeout: async (op) => op },
});

const mapped = feedDetails.mapSessionFeedDetailRow({
  session_id: 'session-1',
  author_username: 'Beist',
  author_avatar_url: 'avatar.png',
  cheers_count: 2,
  cheers: [
    { user_id: 'u2', username: 'Tubpac', avatar_url: 'a2.png', created_at: '2026-06-02T10:00:00Z' },
  ],
  beers: [
    { id: 'b1', session_id: 'session-1', beer_name: 'Tuborg', volume: '50cl', quantity: 1, abv: 4.6, note: null, consumed_at: '2026-06-02T09:00:00Z', created_at: '2026-06-02T09:00:00Z' },
  ],
  comments: [
    { id: 'c1', session_id: 'session-1', user_id: 'u3', body: 'Skål', created_at: '2026-06-02T10:30:00Z', updated_at: null, username: 'Someone', avatar_url: 'a3.png' },
  ],
  photos: [
    { id: 'p1', session_id: 'session-1', image_url: 'p1.jpg', is_keeper: true, expires_at: null, created_at: '2026-06-02T09:00:00Z' },
  ],
});

assert.equal(mapped.sessionId, 'session-1', 'mapper keeps the session id');
assert.deepEqual(mapped.author, { username: 'Beist', avatarUrl: 'avatar.png' }, 'mapper builds the author profile');
assert.equal(mapped.cheersCount, 2, 'mapper carries the server cheers_count');
assert.deepEqual(mapped.cheers[0], { userId: 'u2', username: 'Tubpac', avatarUrl: 'a2.png', createdAt: '2026-06-02T10:00:00Z' }, 'mapper normalizes cheers');
assert.equal(mapped.comments[0].userId, 'u3', 'mapper normalizes comment author id');
assert.equal(mapped.comments[0].username, 'Someone', 'mapper carries comment author username');
assert.equal(mapped.beers[0].beer_name, 'Tuborg', 'mapper passes beers through in app shape');
assert.equal(mapped.photos[0].is_keeper, true, 'mapper passes photos through in app shape');

const emptyMapped = feedDetails.mapSessionFeedDetailRow({
  session_id: 'session-2',
  author_username: null,
  author_avatar_url: null,
  cheers_count: 0,
  cheers: null,
  beers: null,
  comments: null,
  photos: null,
});
assert.equal(emptyMapped.author, null, 'mapper returns null author when profile is missing');
assert.deepEqual(emptyMapped.cheers, [], 'mapper tolerates null jsonb arrays');
assert.deepEqual(emptyMapped.photos, [], 'mapper tolerates null photo arrays');

const feedLibSource = fs.readFileSync(path.join(root, 'src/lib/sessionFeedDetails.ts'), 'utf8');
assert.match(feedLibSource, /rpc\('get_session_feed_details'/, 'client lib should call the feed details RPC');

// ---- Feed wiring ----
const feedScreenSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');
assert.match(feedScreenSource, /fetchSessionFeedDetails/, 'feed should fetch session details through the consolidated RPC');
assert.doesNotMatch(feedScreenSource, /\.from\('session_cheers'\)\s*\n\s*\.select/, 'feed should no longer query session_cheers directly');
assert.match(feedScreenSource, /fetchSessionBuddySummaries/, 'feed should still fetch drinking buddy summaries');
assert.match(feedScreenSource, /get_session_chug_attempt_summaries/, 'feed should still fetch chug summaries');

console.log('session feed details checks passed');

// author_current_streak maps through, defaulting to 0 when absent
const streakRow = feedDetails.mapSessionFeedDetailRow({
  session_id: 's-streak',
  author_username: 'streaker',
  author_avatar_url: null,
  cheers_count: 0,
  cheers: [],
  beers: [],
  comments: [],
  photos: [],
  author_current_streak: 5,
});
assert.equal(streakRow.authorCurrentStreak, 5);

const noStreakRow = feedDetails.mapSessionFeedDetailRow({
  session_id: 's-nostreak',
  author_username: 'casual',
  author_avatar_url: null,
  cheers_count: 0,
  cheers: [],
  beers: [],
  comments: [],
  photos: [],
});
assert.equal(noStreakRow.authorCurrentStreak, 0);

console.log('author current streak mapping passed');
