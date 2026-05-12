const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

const migrationSql = read('supabase/migrations/20260512170000_add_hangover_prompts.sql');

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

const sendPushSource = read('supabase/functions/send-push/index.ts');
assert.match(sendPushSource, /hangover_check/, 'push delivery should support hangover notifications');
assert.match(sendPushSource, /hangover=1/, 'hangover push clicks should deep-link to the rating screen');
assert.match(sendPushSource, /target_type/, 'hangover push URLs should include the target kind');

const schedulerSource = read('supabase/functions/send-hangover-prompts/index.ts');
assert.match(schedulerSource, /claim_due_hangover_prompts/, 'scheduled function should use the atomic claim RPC');
assert.match(schedulerSource, /type: 'hangover_check'/, 'scheduled function should insert hangover notifications');
assert.match(schedulerSource, /sent_at/, 'scheduled function should mark prompts as sent after notification insert');

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
