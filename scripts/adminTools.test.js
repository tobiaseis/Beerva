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
const retryMigrationPath = 'supabase/migrations/20260531180000_make_admin_challenge_save_retryable.sql';
const archiveMigrationPath = 'supabase/migrations/20260603120000_add_admin_challenge_archive.sql';
const beverageCategoryMigrationPath = 'supabase/migrations/20260617120000_add_admin_beverage_categories.sql';
const targetChallengeUnitsMigrationPath = 'supabase/migrations/20260618120000_target_challenges_use_alcohol_units.sql';
const drinkInvalidationMigrationPath = 'supabase/migrations/20260618160000_add_drink_invalidation.sql';
const beverageSubmissionsMigrationPath = 'supabase/migrations/20260708170000_add_user_beverage_submissions.sql';
assert.ok(exists(migrationPath), 'admin migration should exist');
assert.ok(exists(retryMigrationPath), 'admin challenge retry migration should exist');
assert.ok(exists(archiveMigrationPath), 'admin challenge archive migration should exist');
assert.ok(exists(beverageCategoryMigrationPath), 'admin beverage category migration should exist');
assert.ok(exists(targetChallengeUnitsMigrationPath), 'target challenge units migration should exist');
assert.ok(exists(drinkInvalidationMigrationPath), 'admin drink invalidation migration should exist');
assert.ok(exists(beverageSubmissionsMigrationPath), 'user beverage submissions migration should exist');
assert.ok(exists('src/lib/adminApi.ts'), 'admin API should exist');
assert.ok(exists('src/lib/beverageCatalogContext.tsx'), 'beverage catalog provider should exist');
assert.ok(exists('src/lib/adminTools.ts'), 'admin form helpers should exist');

const migrationSql = read(migrationPath);
assert.match(migrationSql, /add column if not exists is_admin boolean not null default false/i);
assert.match(migrationSql, /lower\(auth_users\.email\) = 'xdrengx@gmail\.com'/i);
assert.match(migrationSql, /create or replace function public\.prevent_profile_admin_self_promotion\(\)/i);
assert.match(migrationSql, /create trigger profiles_prevent_admin_self_promotion/i);
assert.match(migrationSql, /Profile admin access cannot be changed by signed-in users\./i);
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

const retryMigrationSql = read(retryMigrationPath);
assert.match(retryMigrationSql, /add column if not exists admin_request_key uuid/i);
assert.match(retryMigrationSql, /create unique index if not exists challenges_admin_request_key_idx/i);
assert.match(retryMigrationSql, /challenge_request_key uuid default null/i);
assert.match(retryMigrationSql, /where challenges\.admin_request_key = challenge_request_key/i);
assert.match(retryMigrationSql, /admin_request_key\s*\)\s*values/i);

const archiveMigrationSql = read(archiveMigrationPath);
const beverageCategoryMigrationSql = read(beverageCategoryMigrationPath);
const targetChallengeUnitsMigrationSql = read(targetChallengeUnitsMigrationPath);
const drinkInvalidationMigrationSql = read(drinkInvalidationMigrationPath);
const beverageSubmissionsMigrationSql = read(beverageSubmissionsMigrationPath);
assert.match(archiveMigrationSql, /add column if not exists archived_at timestamp with time zone/i);
assert.match(archiveMigrationSql, /add column if not exists archived_by uuid references auth\.users\(id\) on delete set null/i);
assert.match(archiveMigrationSql, /create index if not exists challenges_unarchived_window_idx/i);
assert.match(archiveMigrationSql, /create or replace function public\.admin_archive_challenge\(target_challenge_id uuid\)/i);
assert.match(archiveMigrationSql, /create or replace function public\.admin_restore_challenge\(target_challenge_id uuid\)/i);
assert.match(archiveMigrationSql, /raise exception 'Only ended challenges can be archived\.'/i);
assert.match(archiveMigrationSql, /public\.is_current_user_admin\(\)/i);
assert.match(archiveMigrationSql, /archived_at is null/i);
assert.match(archiveMigrationSql, /revoke execute on function public\.admin_archive_challenge\(uuid\) from public, anon;/i);
assert.match(archiveMigrationSql, /revoke execute on function public\.admin_restore_challenge\(uuid\) from public, anon;/i);
assert.match(archiveMigrationSql, /grant execute on function public\.admin_archive_challenge\(uuid\) to authenticated;/i);
assert.match(archiveMigrationSql, /grant execute on function public\.admin_restore_challenge\(uuid\) to authenticated;/i);
assert.match(
  targetChallengeUnitsMigrationSql,
  /Target units must be greater than 0\./,
  'database admin save validation should use target unit wording'
);
assert.match(
  targetChallengeUnitsMigrationSql,
  /case[\s\S]*when target_challenge_type = 'target' then 'alcohol_units'[\s\S]*else 'true_pints'[\s\S]*end/i,
  'admin save challenge should store metric type from challenge type'
);
assert.match(beverageCategoryMigrationSql, /alter table public\.admin_beverages[\s\S]*add column if not exists category text not null default 'beer'/i);
assert.match(beverageCategoryMigrationSql, /admin_beverages_category_check/i);
assert.match(beverageCategoryMigrationSql, /category in \('beer', 'wine', 'drink'\)/i);
assert.match(beverageCategoryMigrationSql, /alter table public\.session_beers[\s\S]*add column if not exists beverage_category text not null default 'beer'/i);
assert.match(beverageCategoryMigrationSql, /session_beers_beverage_category_check/i);
assert.match(beverageCategoryMigrationSql, /beverage_category in \('beer', 'wine', 'drink'\)/i);
assert.match(beverageCategoryMigrationSql, /returns table \([\s\S]*category text/i, 'admin beverages RPC should return category');
assert.match(beverageCategoryMigrationSql, /beverage_category text default 'beer'/i, 'admin save beverage should accept category');
assert.match(beverageCategoryMigrationSql, /clean_category not in \('beer', 'wine', 'drink'\)/i, 'admin save beverage should validate category');
assert.match(beverageCategoryMigrationSql, /insert into public\.admin_beverages \([\s\S]*category/i, 'admin save beverage should insert category');
assert.match(beverageCategoryMigrationSql, /set[\s\S]*category = clean_category/i, 'admin save beverage should update category');
assert.match(beverageCategoryMigrationSql, /drop function if exists public\.get_admin_beverages\(\)/i, 'migration should drop admin beverages RPC before changing its return type');
assert.match(beverageCategoryMigrationSql, /drop function if exists public\.admin_save_beverage\(uuid, text, numeric\)/i, 'migration should drop old admin save beverage signature');
assert.match(beverageCategoryMigrationSql, /grant execute on function public\.admin_save_beverage\(uuid, text, numeric, text\) to authenticated/i);
assert.match(beverageCategoryMigrationSql, /'beverage_category', sb\.beverage_category/i, 'feed details beverage JSON should include category');
assert.match(beverageCategoryMigrationSql, /session_beers\.beverage_category/i, 'profile stats should read captured beverage category');
assert.match(beverageCategoryMigrationSql, /not is_captured_wine and not is_captured_drink/i, 'strongest ABV should exclude captured wine and drink categories');
assert.match(beverageCategoryMigrationSql, /notify pgrst, 'reload schema'/i);
assert.match(
  drinkInvalidationMigrationSql,
  /excluded_from_stats boolean not null default false/i,
  'session_beers gets a durable ignored-in-stats flag'
);
assert.match(
  drinkInvalidationMigrationSql,
  /excluded_from_stats_at timestamp with time zone/i,
  'session_beers records when a drink was ignored'
);
assert.match(
  drinkInvalidationMigrationSql,
  /excluded_from_stats_by uuid/i,
  'session_beers records the admin who ignored a drink'
);
assert.match(
  drinkInvalidationMigrationSql,
  /excluded_from_stats_reason text/i,
  'session_beers records an optional admin reason'
);
assert.match(
  drinkInvalidationMigrationSql,
  /create or replace function public\.admin_get_moderation_drinks/i,
  'admin drink list RPC exists'
);
assert.match(
  drinkInvalidationMigrationSql,
  /create or replace function public\.admin_set_session_beer_excluded/i,
  'admin toggle RPC exists'
);
assert.match(
  drinkInvalidationMigrationSql,
  /public\.is_current_user_admin\(\)/i,
  'moderation RPCs enforce admin access'
);
assert.match(
  drinkInvalidationMigrationSql,
  /revoke execute on function public\.admin_get_moderation_drinks/i,
  'moderation list RPC is not public'
);
assert.match(
  drinkInvalidationMigrationSql,
  /grant execute on function public\.admin_get_moderation_drinks/i,
  'moderation list RPC is granted to authenticated users'
);
assert.doesNotMatch(
  drinkInvalidationMigrationSql,
  /insert into public\.notifications|insert into public\.push_notifications/i,
  'invalidating a drink should not create a user-facing warning'
);
assert.match(beverageSubmissionsMigrationSql, /create table if not exists public\.beverage_submissions/i);
assert.match(beverageSubmissionsMigrationSql, /session_beer_id uuid references public\.session_beers\(id\) on delete set null/i);
assert.match(beverageSubmissionsMigrationSql, /status text not null default 'pending'/i);
assert.match(beverageSubmissionsMigrationSql, /category text not null/i);
assert.match(beverageSubmissionsMigrationSql, /abv numeric not null/i);
assert.match(beverageSubmissionsMigrationSql, /beverage_submissions_status_check/i);
assert.match(beverageSubmissionsMigrationSql, /status in \('pending', 'approved', 'rejected'\)/i);
assert.match(beverageSubmissionsMigrationSql, /beverage_submissions_category_check/i);
assert.match(beverageSubmissionsMigrationSql, /category in \('beer', 'wine', 'drink'\)/i);
assert.match(beverageSubmissionsMigrationSql, /beverage_submissions_pending_name_category_idx/i);
assert.match(beverageSubmissionsMigrationSql, /where status = 'pending'/i);
assert.match(beverageSubmissionsMigrationSql, /add column if not exists beverage_submission_id uuid references public\.beverage_submissions\(id\) on delete set null/i);
assert.match(beverageSubmissionsMigrationSql, /add column if not exists beverage_submission_status text/i);
assert.match(beverageSubmissionsMigrationSql, /create or replace function public\.submit_session_beverage/i);
assert.match(beverageSubmissionsMigrationSql, /create or replace function public\.admin_get_beverage_submissions/i);
assert.match(beverageSubmissionsMigrationSql, /create or replace function public\.admin_approve_beverage_submission/i);
assert.match(beverageSubmissionsMigrationSql, /create or replace function public\.admin_reject_beverage_submission/i);
assert.match(beverageSubmissionsMigrationSql, /public\.is_current_user_admin\(\)/i);
assert.match(beverageSubmissionsMigrationSql, /insert into public\.notifications/i);
assert.match(beverageSubmissionsMigrationSql, /'beverage_submission'/i);
assert.match(beverageSubmissionsMigrationSql, /case[\s\S]*when submission_row\.category = 'wine' then 12[\s\S]*else 5[\s\S]*end/i);
assert.match(beverageSubmissionsMigrationSql, /set[\s\S]*beer_name = session_beers\.beer_name[\s\S]*abv = fallback_abv/i);
assert.match(beverageSubmissionsMigrationSql, /grant execute on function public\.submit_session_beverage/i);
assert.match(beverageSubmissionsMigrationSql, /grant execute on function public\.admin_get_beverage_submissions/i);
assert.match(beverageSubmissionsMigrationSql, /notify pgrst, 'reload schema'/i);

const sessionBeers = loadTypeScriptModule('src/lib/sessionBeers.ts');
const mergedCatalog = sessionBeers.mergeBeverageCatalog([
  { name: 'Codex Lager', abv: 6.4 },
  { name: 'Tuborg Classic', abv: 99 },
]);
assert.equal(sessionBeers.getBeverageCatalogItem('Codex Lager', mergedCatalog)?.abv, 6.4);
assert.equal(sessionBeers.getBeverageCatalogItem('Tuborg Classic', mergedCatalog)?.abv, 4.6);
assert.deepEqual(
  sessionBeers.beerDraftToPayload({ beerName: 'Codex Lager', volume: '33cl', quantity: 2 }, mergedCatalog),
  { beer_name: 'Codex Lager', volume: '33cl', quantity: 2, abv: 6.4, beverage_category: 'beer' }
);

const adminTools = loadTypeScriptModule('src/lib/adminTools.ts');
assert.equal(adminTools.toLocalDateTimeInput('2026-05-31T12:45:00.000Z', 0), '2026-05-31T12:45');
assert.equal(adminTools.fromLocalDateTimeInput('2026-05-31T12:45', 0), '2026-05-31T12:45:00.000Z');
assert.equal(adminTools.validateBeverageDraft({ name: '', abv: '5', category: 'beer' }), 'Beverage name is required.');
assert.equal(adminTools.validateBeverageDraft({ name: 'House Champagne', abv: '12', category: 'wine' }), null);
assert.equal(adminTools.validateBeverageDraft({ name: 'Mystery', abv: '5', category: 'other' }), 'Choose a beverage category.');
assert.equal(adminTools.createEmptyBeverageDraft().category, 'beer');
const baseChallengeDraft = {
  title: 'Summer sprint',
  description: 'Most units wins.',
  challengeType: 'target',
  startsAt: '2026-06-01T12:00',
  endsAt: '2026-06-02T12:00',
  joinClosesAt: '2026-06-02T12:00',
  targetValue: '0',
  winnerTrophyEnabled: false,
  winnerTrophyTitle: '',
  winnerTrophyDescription: '',
};
assert.equal(adminTools.validateChallengeDraft(baseChallengeDraft), 'Target units must be greater than 0.');
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
const adminApiSource = read('src/lib/adminApi.ts');
const adminToolsSource = read('src/lib/adminTools.ts');
assert.ok(exists('src/screens/AdminToolsScreen.tsx'), 'admin tools screen should exist');
const adminScreenSource = read('src/screens/AdminToolsScreen.tsx');
assert.match(navigatorSource, /BeverageCatalogProvider/);
assert.match(navigatorSource, /<Stack\.Screen name="AdminTools"/);
assert.match(profileSource, /profile\?\.is_admin === true/);
assert.match(profileSource, /Admin tools/);
assert.match(adminScreenSource, /Challenges/);
assert.match(adminScreenSource, /Beverages/);
assert.match(adminScreenSource, /Add beverage/);
assert.match(adminScreenSource, /Save Beverage/);
assert.match(adminScreenSource, /Beer[\s\S]*Wine[\s\S]*Drink/, 'admin beverage form should expose category options');
assert.match(adminScreenSource, /Winner trophy/);
assert.match(adminScreenSource, /Target units/, 'admin target challenge form should use units wording');
assert.match(adminScreenSource, /\$\{item\.targetValue\} units/, 'admin challenge rows should label target values as units');
assert.doesNotMatch(adminScreenSource, /Target true pints/);
assert.doesNotMatch(adminScreenSource, /targetValue\} true pints/);
assert.match(adminToolsSource, /Target units must be greater than 0\./);
assert.doesNotMatch(adminToolsSource, /Target true pints must be greater than 0\./);
assert.match(adminApiSource, /archived_at\?: string \| null;/);
assert.match(adminApiSource, /archivedBy: toStringOrNull\(row\.archived_by\)/);
assert.match(adminApiSource, /archiveAdminChallenge/);
assert.match(adminApiSource, /supabase\.rpc\('admin_archive_challenge'/);
assert.match(adminApiSource, /restoreAdminChallenge/);
assert.match(adminApiSource, /supabase\.rpc\('admin_restore_challenge'/);
assert.match(adminScreenSource, /Archive Challenge/);
assert.match(adminScreenSource, /Restore Challenge/);
assert.match(adminScreenSource, /confirmDestructive/);
assert.match(
  adminScreenSource,
  /const refreshChallengesAfterStateChange = async \(\) => \{[\s\S]*setSelectedChallenge\(null\);[\s\S]*setActiveModal\(null\);[\s\S]*setChallenges\(await fetchAdminChallenges\(\)\)/,
  'challenge archive and restore should close the modal before refreshing the list'
);
assert.doesNotMatch(adminScreenSource, /Delete challenge|Delete beer/);
assert.match(adminApiSource, /withRetryableTimeout/);
assert.match(adminApiSource, /challenge_request_key/);
assert.match(adminApiSource, /AdminBeverageCategory/, 'admin API should expose beverage category type');
assert.match(adminApiSource, /category: mapAdminBeverageCategory\(row\.category\)/, 'admin API should map beverage category');
assert.match(adminApiSource, /beverage_category: input\.category/, 'admin save payload should send category');
assert.match(adminApiSource, /AdminModerationDrink/, 'admin API should expose moderation drink type');
assert.match(adminApiSource, /fetchAdminModerationDrinks/, 'admin API should fetch moderation drink rows');
assert.match(adminApiSource, /setAdminDrinkExcluded/, 'admin API should toggle ignored drink state');
assert.match(adminApiSource, /admin_get_moderation_drinks/, 'admin API should call moderation list RPC');
assert.match(adminApiSource, /admin_set_session_beer_excluded/, 'admin API should call moderation toggle RPC');
assert.match(adminApiSource, /AdminBeverageSubmission/, 'admin API should expose beverage submission type');
assert.match(adminApiSource, /fetchAdminBeverageSubmissions/, 'admin API should fetch beverage submissions');
assert.match(adminApiSource, /approveAdminBeverageSubmission/, 'admin API should approve beverage submissions');
assert.match(adminApiSource, /rejectAdminBeverageSubmission/, 'admin API should reject beverage submissions');
assert.match(adminToolsSource, /getAdminModerationDrinkTitle/, 'admin tools helpers should format moderation rows');
assert.match(adminToolsSource, /getAdminModerationDrinkMeta/, 'admin tools helpers should format moderation metadata');
assert.match(adminToolsSource, /getAdminBeverageSubmissionTitle/, 'admin tools helpers should format submission titles');
assert.match(adminToolsSource, /getAdminBeverageSubmissionMeta/, 'admin tools helpers should format submission metadata');
assert.match(adminScreenSource, /moderation/, 'admin tools should include a moderation segment');
assert.match(adminScreenSource, /Moderation/, 'admin tools should label the moderation segment');
assert.match(adminScreenSource, /Ignore in stats/, 'moderation rows should expose ignore action copy');
assert.match(adminScreenSource, /Restore to stats/, 'moderation rows should expose restore action copy');
assert.match(adminScreenSource, /fetchAdminModerationDrinks/, 'admin tools should load moderation rows');
assert.match(adminScreenSource, /setAdminDrinkExcluded/, 'admin tools should toggle moderation rows');
assert.match(adminScreenSource, /submissions/, 'admin tools should include a submissions segment');
assert.match(adminScreenSource, /Submissions/, 'admin tools should label the submissions segment');
assert.match(adminScreenSource, /adminSegmentMenuVisible/, 'admin tools should open segments from a dropdown menu');
assert.match(adminScreenSource, /Choose admin tool/, 'admin tools dropdown should expose an accessible menu trigger');
assert.match(adminScreenSource, /styles\.segmentMenu/, 'admin tools should render a dropdown list for segment choices');
assert.match(adminScreenSource, /ADMIN_SEGMENT_OPTIONS/, 'admin tools should keep segment labels and icons in one option list');
assert.doesNotMatch(adminScreenSource, /ADMIN_SEGMENTS\.map\(\(segment\)/, 'admin tools should not render all five segments as a cramped horizontal bar');
assert.match(adminScreenSource, /Approve/, 'submission rows should expose approve action copy');
assert.match(adminScreenSource, /Reject/, 'submission rows should expose reject action copy');
assert.match(adminScreenSource, /fetchAdminBeverageSubmissions/, 'admin tools should load beverage submissions');
assert.match(adminScreenSource, /approveAdminBeverageSubmission/, 'admin tools should approve beverage submissions');
assert.match(adminScreenSource, /rejectAdminBeverageSubmission/, 'admin tools should reject beverage submissions');
assert.match(adminScreenSource, /initialSegment/, 'admin tools should accept an initial segment route param');
assert.doesNotMatch(adminScreenSource, /Admin beers/);
assert.doesNotMatch(adminScreenSource, /No admin-added beers yet/);

console.log('admin tools checks passed');
