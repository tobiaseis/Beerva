const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.resolve(__dirname, '..', relativePath));
const root = path.resolve(__dirname, '..');
const allMigrationSql = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => fs.readFileSync(path.join(root, 'supabase/migrations', file), 'utf8'))
  .join('\n');

const migrationSql = read('supabase/migrations/20260512170000_add_hangover_prompts.sql');
const nightDedupeMigrationPath = 'supabase/migrations/20260521130000_group_hangover_prompts_by_drinking_night.sql';

assert.match(migrationSql, /add column if not exists timezone text/i, 'sessions and pub crawls should snapshot a timezone');
assert.match(migrationSql, /add column if not exists hangover_score smallint/i, 'posts should store a hangover score');
assert.match(migrationSql, /create table if not exists public\.hangover_prompts/i, 'database should track due hangover prompts');
assert.match(migrationSql, /check \(hangover_score is null or \(hangover_score >= 1 and hangover_score <= 10\)\)/i, 'hangover scores must be constrained to 1-10');
assert.match(migrationSql, /extract\(hour from local_published_at\) >= 21/i, 'prompts should be created for posts published from 9pm onward');
assert.match(migrationSql, /extract\(hour from local_published_at\) < 6/i, 'after-midnight posts should still count as the same drinking night');
assert.match(migrationSql, /time '11:00'/i, 'hangover prompts should target 11am local time');
assert.match(migrationSql, /create or replace function public\.rate_hangover/i, 'rating should go through an owner-scoped RPC');
assert.match(migrationSql, /create or replace function public\.claim_due_hangover_prompts/i, 'scheduled delivery should claim due prompts atomically');
assert.match(migrationSql, /hangover_check/i, 'notifications should support hangover prompt type');

assert.ok(exists(nightDedupeMigrationPath), 'hangover night dedupe migration should exist');
const nightDedupeMigrationSql = read(nightDedupeMigrationPath);

assert.match(nightDedupeMigrationSql, /alter\s+table\s+public\.hangover_prompts[\s\S]*add\s+column\s+if\s+not\s+exists\s+drinking_day\s+date/i, 'hangover prompts should store the grouped drinking night');
assert.match(nightDedupeMigrationSql, /calculate_hangover_prompt_details/i, 'migration should expose prompt details with prompt time and drinking day');
assert.match(nightDedupeMigrationSql, /returns table \(\s*prompt_at timestamp with time zone,\s*drinking_day date\s*\)/i, 'prompt details should return prompt_at and drinking_day');
assert.match(nightDedupeMigrationSql, /row_number\(\) over \(\s*partition by hangover_prompts\.user_id,\s*hangover_prompts\.drinking_day/i, 'migration should dedupe already-created prompts before adding the unique index');
assert.match(nightDedupeMigrationSql, /drop\s+index\s+if\s+exists\s+public\.hangover_prompts_user_drinking_day_unique_idx[\s\S]*create\s+unique\s+index[\s\S]*hangover_prompts_user_drinking_day_unique_idx/i, 'migration should drop the drinking-night unique index before rerun backfill and recreate it after dedupe');
assert.match(nightDedupeMigrationSql, /create\s+unique\s+index[\s\S]*hangover_prompts_user_drinking_day_unique_idx[\s\S]*on\s+public\.hangover_prompts\s*\(\s*user_id\s*,\s*drinking_day\s*\)[\s\S]*where\s+drinking_day\s+is\s+not\s+null/i, 'database should enforce one prompt per user per drinking night');
assert.match(nightDedupeMigrationSql, /on\s+conflict\s*\(\s*user_id\s*,\s*drinking_day\s*\)\s*where\s+drinking_day\s+is\s+not\s+null\s+do\s+nothing/i, 'prompt creation should dedupe by user and drinking night');
assert.match(nightDedupeMigrationSql, /target_score\s+is\s+null[\s\S]*target_score\s*<\s*1[\s\S]*target_score\s*>\s*10/i, 'rating should reject null hangover scores before range validation');
assert.match(nightDedupeMigrationSql, /select\s+coalesce\(array_agg\(sessions\.id\),\s*array\[\]::uuid\[\]\)[\s\S]*from\s+public\.sessions\s+as\s+sessions[\s\S]*sessions\.status\s*=\s*'published'/i, 'bulk session rating should only include published sessions');
assert.match(nightDedupeMigrationSql, /select\s+coalesce\(array_agg\(sessions\.id\),\s*array\[\]::uuid\[\]\)[\s\S]*from\s+public\.sessions\s+as\s+sessions[\s\S]*coalesce\(sessions\.hide_from_feed,\s*false\)\s*=\s*false/i, 'bulk session rating should skip hidden sessions');
assert.match(nightDedupeMigrationSql, /coalesce\(sessions\.published_at, sessions\.ended_at, sessions\.created_at\) >= night_start/i, 'rating should find sessions inside the resolved drinking-night window');
assert.match(nightDedupeMigrationSql, /coalesce\(sessions\.published_at, sessions\.ended_at, sessions\.created_at\) < night_end/i, 'rating should stop the session group at the 6am boundary');
assert.match(nightDedupeMigrationSql, /select\s+coalesce\(array_agg\(pub_crawls\.id\),\s*array\[\]::uuid\[\]\)[\s\S]*from\s+public\.pub_crawls\s+as\s+pub_crawls[\s\S]*pub_crawls\.status\s*=\s*'published'/i, 'bulk pub crawl rating should only include published pub crawls');
assert.match(nightDedupeMigrationSql, /coalesce\(pub_crawls\.published_at, pub_crawls\.ended_at, pub_crawls\.created_at\) >= night_start/i, 'rating should include pub crawls inside the same drinking-night window');
assert.match(nightDedupeMigrationSql, /coalesce\(pub_crawls\.published_at, pub_crawls\.ended_at, pub_crawls\.created_at\) < night_end/i, 'rating should stop the pub crawl group at the 6am boundary');
assert.match(nightDedupeMigrationSql, /session_id = any\(session_ids\)/i, 'rating should complete legacy session prompt rows in the group');
assert.match(nightDedupeMigrationSql, /pub_crawl_id = any\(pub_crawl_ids\)/i, 'rating should complete legacy pub crawl prompt rows in the group');
assert.match(nightDedupeMigrationSql, /drinking_day = resolved_drinking_day/i, 'rating should complete grouped prompt rows for the resolved night');

const sendPushSource = read('supabase/functions/send-push/index.ts');
assert.match(sendPushSource, /hangover_check/, 'push delivery should support hangover notifications');
assert.match(sendPushSource, /hangover=1/, 'hangover push clicks should deep-link to the rating screen');
assert.match(sendPushSource, /target_type/, 'hangover push URLs should include the target kind');

const schedulerSource = read('supabase/functions/send-hangover-prompts/index.ts');
assert.match(schedulerSource, /claim_due_hangover_prompts/, 'scheduled function should use the atomic claim RPC');
assert.match(schedulerSource, /type: 'hangover_check'/, 'scheduled function should insert hangover notifications');
assert.match(schedulerSource, /sent_at/, 'scheduled function should mark prompts as sent after notification insert');
assert.match(schedulerSource, /HANGOVER_CRON_SECRET/, 'scheduled function should support a shared cron secret');
assert.match(schedulerSource, /x-beerva-cron-secret/i, 'scheduled function should validate the cron secret from a custom header');

const supabaseConfig = read('supabase/config.toml');
assert.match(
  supabaseConfig,
  /\[functions\.send-hangover-prompts\][\s\S]*?verify_jwt\s*=\s*false/,
  'send-hangover-prompts should disable gateway JWT verification and rely on its cron secret'
);

assert.match(allMigrationSql, /create extension if not exists pg_cron/i, 'database should enable pg_cron for hangover scheduling');
assert.match(allMigrationSql, /cron\.schedule/i, 'database should schedule the hangover prompt worker');
assert.match(allMigrationSql, /functions\/v1\/send-hangover-prompts/i, 'hangover schedule should call the send-hangover-prompts edge function');
assert.match(allMigrationSql, /beerva_hangover_cron_secret/i, 'hangover schedule should read its cron secret from Vault');
assert.match(allMigrationSql, /x-beerva-cron-secret/i, 'hangover schedule should send the cron secret in a custom header');

const rootNavigatorSource = read('src/navigation/RootNavigator.tsx');
assert.match(rootNavigatorSource, /HangoverRating/, 'navigator should register the hangover rating screen');
assert.match(rootNavigatorSource, /hangover=1/, 'navigator should parse hangover launch URLs');

const ratingScreenSource = read('src/screens/HangoverRatingScreen.tsx');
assert.match(ratingScreenSource, /rate_hangover/, 'rating screen should submit through the rate_hangover RPC');
assert.match(ratingScreenSource, /Array\.from\(\{ length: 10 \}/, 'rating screen should render a 1-10 quick rating grid');

const feedScreenSource = read('src/screens/FeedScreen.tsx');
assert.match(feedScreenSource, /hangover_score/, 'feed sessions should fetch hangover scores');
assert.match(feedScreenSource, /hangoverBadge/, 'feed sessions should render a hangover badge');
assert.match(feedScreenSource, /alignSelf: 'flex-end'/, 'hangover badge should sit at the bottom right of post content');

const crawlCardSource = read('src/components/PubCrawlFeedCard.tsx');
assert.match(crawlCardSource, /hangoverScore/, 'pub crawl cards should render hangover scores');
assert.match(crawlCardSource, /hangoverBadge/, 'pub crawl hangover badge should use the shared bottom-right treatment');

const pubCrawlsApiSource = read('src/lib/pubCrawlsApi.ts');
assert.match(pubCrawlsApiSource, /hangover_score/, 'pub crawl feed API should fetch hangover scores');

const pubCrawlsSource = read('src/lib/pubCrawls.ts');
assert.match(pubCrawlsSource, /row\.hangover_score === null \|\| row\.hangover_score === undefined/, 'pub crawl mapping should not coerce missing hangover scores to 0');

const recordScreenSource = read('src/screens/RecordScreen.tsx');
assert.match(recordScreenSource, /getCurrentTimezone/, 'session publishing should snapshot the current timezone');
assert.match(recordScreenSource, /timezone: getCurrentTimezone\(\)/, 'new sessions should store the local timezone');

console.log('hangover feature contract checks passed');
