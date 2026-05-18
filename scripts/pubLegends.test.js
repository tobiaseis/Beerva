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
const placeCategoryMigrationPath = 'supabase/migrations/20260513120000_add_pub_place_category.sql';
const placeCategoryRepairMigrationPath = 'supabase/migrations/20260518113000_add_pub_place_category_repair_rpc.sql';

assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', helpersPath)),
  'Pub Legends should define shared row mapping helpers'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', migrationPath)),
  'Pub Legends should add Supabase leaderboard RPCs'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', placeCategoryMigrationPath)),
  'Place category migration should update pub schema and leaderboard filtering'
);
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', placeCategoryRepairMigrationPath)),
  'Place category repair migration should let users reclassify their own manually added places'
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
const placeCategoryMigrationSql = fs.readFileSync(path.resolve(__dirname, '..', placeCategoryMigrationPath), 'utf8');
const placeCategoryRepairMigrationSql = fs.readFileSync(path.resolve(__dirname, '..', placeCategoryRepairMigrationPath), 'utf8');
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

const apiSource = fs.readFileSync(path.resolve(__dirname, '..', apiPath), 'utf8');
assert.match(apiSource, /setPubPlaceCategory/, 'Pub Legends API should expose a place reclassification helper');
assert.match(apiSource, /set_pub_place_category/, 'Pub Legends API helper should call the repair RPC');

const legendsScreenSource = fs.readFileSync(path.resolve(__dirname, '..', legendsScreenPath), 'utf8');
assert.match(legendsScreenSource, /pubId: item\.pubId/, 'Pub Legends list should pass pubId into the detail screen');

const legendDetailSource = fs.readFileSync(path.resolve(__dirname, '..', legendDetailScreenPath), 'utf8');
assert.match(legendDetailSource, /Exclude from Pub Legends/, 'Pub Legend detail should expose a cleanup action for wrongly categorized private places');
assert.match(legendDetailSource, /setPubPlaceCategory\(pubId, 'other'\)/, 'cleanup action should mark the place as other');

console.log('Pub Legends tests passed');
