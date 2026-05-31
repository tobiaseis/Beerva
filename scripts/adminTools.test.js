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

const migrationPath = 'supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql';
assert.ok(exists(migrationPath), 'admin migration should exist');
assert.ok(exists('src/lib/adminApi.ts'), 'admin API should exist');
assert.ok(exists('src/lib/beverageCatalogContext.tsx'), 'beverage catalog provider should exist');
assert.ok(exists('src/lib/adminTools.ts'), 'admin form helpers should exist');

const migrationSql = read(migrationPath);
assert.match(migrationSql, /add column if not exists is_admin boolean not null default false/i);
assert.match(migrationSql, /lower\(auth_users\.email\) = 'xdrengx@gmail\.com'/i);
assert.match(migrationSql, /create or replace function public\.is_current_user_admin\(\)/i);
assert.match(migrationSql, /create table if not exists public\.admin_beverages/i);
assert.match(migrationSql, /create or replace function public\.admin_save_beverage/i);
assert.match(migrationSql, /create or replace function public\.admin_save_challenge/i);
assert.match(migrationSql, /winner_trophy_enabled boolean not null default false/i);
assert.match(migrationSql, /Winner trophies are only available for leaderboard challenges\./i);
assert.match(migrationSql, /insert into public\.challenge_awards/i);
assert.match(migrationSql, /challenges\.slug <> 'karnevalsdruk-2026'/i);
assert.match(migrationSql, /raise exception 'Admin access required\.'/i);
assert.match(migrationSql, /revoke execute on function public\.get_admin_beverages\(\) from public, anon;/i);
assert.match(migrationSql, /revoke execute on function public\.admin_get_challenges\(\) from public, anon;/i);
assert.match(migrationSql, /revoke execute on function public\.admin_save_beverage\(uuid, text, numeric\) from public, anon;/i);
assert.match(
  migrationSql,
  /revoke execute on function public\.admin_save_challenge\(uuid, text, text, text, numeric, timestamp with time zone, timestamp with time zone, timestamp with time zone, boolean, text, text\) from public, anon;/i
);

const sessionBeers = loadTypeScriptModule('src/lib/sessionBeers.ts');
const mergedCatalog = sessionBeers.mergeBeverageCatalog([
  { name: 'Codex Lager', abv: 6.4 },
  { name: 'Tuborg Classic', abv: 99 },
]);
assert.equal(sessionBeers.getBeverageCatalogItem('Codex Lager', mergedCatalog)?.abv, 6.4);
assert.equal(sessionBeers.getBeverageCatalogItem('Tuborg Classic', mergedCatalog)?.abv, 4.6);
assert.deepEqual(
  sessionBeers.beerDraftToPayload({ beerName: 'Codex Lager', volume: '33cl', quantity: 2 }, mergedCatalog),
  { beer_name: 'Codex Lager', volume: '33cl', quantity: 2, abv: 6.4 }
);

const adminTools = loadTypeScriptModule('src/lib/adminTools.ts');
assert.equal(adminTools.toLocalDateTimeInput('2026-05-31T12:45:00.000Z', 0), '2026-05-31T12:45');
assert.equal(adminTools.fromLocalDateTimeInput('2026-05-31T12:45', 0), '2026-05-31T12:45:00.000Z');
assert.equal(adminTools.validateBeerDraft({ name: '', abv: '5' }), 'Beer name is required.');
assert.equal(
  adminTools.validateChallengeDraft({
    title: 'Summer sprint',
    description: 'Most pints wins.',
    challengeType: 'leaderboard',
    startsAt: '2026-06-01T12:00',
    endsAt: '2026-06-02T12:00',
    joinClosesAt: '2026-06-02T12:00',
    targetValue: '',
    winnerTrophyEnabled: true,
    winnerTrophyTitle: '',
    winnerTrophyDescription: '',
  }),
  'Trophy title is required.'
);

const navigatorSource = read('src/navigation/RootNavigator.tsx');
const profileSource = read('src/screens/ProfileScreen.tsx');
assert.ok(exists('src/screens/AdminToolsScreen.tsx'), 'admin tools screen should exist');
const adminScreenSource = read('src/screens/AdminToolsScreen.tsx');
assert.match(navigatorSource, /BeverageCatalogProvider/);
assert.match(navigatorSource, /<Stack\.Screen name="AdminTools"/);
assert.match(profileSource, /profile\?\.is_admin === true/);
assert.match(profileSource, /Admin tools/);
assert.match(adminScreenSource, /Challenges/);
assert.match(adminScreenSource, /Beers/);
assert.match(adminScreenSource, /Winner trophy/);
assert.doesNotMatch(adminScreenSource, /Delete challenge|Delete beer/);

console.log('admin tools checks passed');
