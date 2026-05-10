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
const migrationPath = 'supabase/migrations/20260510133000_add_pub_legends_leaderboards.sql';

assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', helpersPath)),
  'Pub Legends should define shared row mapping helpers'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', migrationPath)),
  'Pub Legends should add Supabase leaderboard RPCs'
);

const { formatTruePints, mapPubKingSessionRow, mapPubLegendRow } = loadTypeScriptModule(helpersPath);

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

assert.equal(formatTruePints(8.25), '8.3 true pints');
assert.equal(formatTruePints(1), '1.0 true pint');
assert.equal(formatTruePints(Number.NaN), '0.0 true pints');

const migrationSql = fs.readFileSync(path.resolve(__dirname, '..', migrationPath), 'utf8');
assert.match(migrationSql, /get_pub_legends/, 'migration should create get_pub_legends');
assert.match(migrationSql, /get_pub_king_of_the_pub/, 'migration should create get_pub_king_of_the_pub');
assert.match(migrationSql, /status\s*=\s*'published'/, 'leaderboards should only use published sessions');
assert.match(migrationSql, /beerva_serving_volume_ml/, 'leaderboards should calculate true pints from serving volume');

console.log('Pub Legends tests passed');
