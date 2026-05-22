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
const karnevalsdrukHangoverMigrationPath = 'supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql';
const karnevalsdrukJoinResilienceMigrationPath = 'supabase/migrations/20260522120000_make_karnevalsdruk_join_resilient.sql';

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
assert.match(nightDedupeMigrationSql, /drop\s+index\s+if\s+exists\s+public\.hangover_prompts_session_id_unique_idx/i, 'migration should drop the legacy per-session prompt unique index before representative reassignment');
assert.match(nightDedupeMigrationSql, /drop\s+index\s+if\s+exists\s+public\.hangover_prompts_pub_crawl_id_unique_idx/i, 'migration should drop the legacy per-pub-crawl prompt unique index before representative reassignment');
assert.match(nightDedupeMigrationSql, /create\s+or\s+replace\s+function\s+public\.find_hangover_replacement_session/i, 'migration should define a session replacement helper for grouped prompt representatives');
assert.match(nightDedupeMigrationSql, /create\s+or\s+replace\s+function\s+public\.find_hangover_replacement_pub_crawl/i, 'migration should define a pub crawl replacement helper for grouped prompt representatives');
assert.match(nightDedupeMigrationSql, /create\s+or\s+replace\s+function\s+public\.reassign_hangover_prompt_from_session/i, 'migration should define a session representative reassignment trigger function');
assert.match(nightDedupeMigrationSql, /create\s+or\s+replace\s+function\s+public\.reassign_hangover_prompt_from_pub_crawl/i, 'migration should define a pub crawl representative reassignment trigger function');
assert.match(nightDedupeMigrationSql, /before\s+delete\s+or\s+update\s+of\s+status,\s*hide_from_feed\s+on\s+public\.sessions/i, 'session representatives should be reassigned before deletion or eligibility updates can cascade or stale prompts');
assert.match(nightDedupeMigrationSql, /before\s+delete\s+or\s+update\s+of\s+status\s+on\s+public\.pub_crawls/i, 'pub crawl representatives should be reassigned before deletion or non-published updates can cascade or stale prompts');
assert.match(nightDedupeMigrationSql, /find_hangover_replacement_session[\s\S]*from\s+public\.sessions\s+as\s+sessions[\s\S]*sessions\.status\s*=\s*'published'[\s\S]*coalesce\(sessions\.hide_from_feed,\s*false\)\s*=\s*false[\s\S]*details\.drinking_day\s*=\s*target_drinking_day/i, 'session replacement helper should choose eligible sessions from the same drinking night');
assert.match(nightDedupeMigrationSql, /find_hangover_replacement_pub_crawl[\s\S]*from\s+public\.pub_crawls\s+as\s+pub_crawls[\s\S]*pub_crawls\.status\s*=\s*'published'[\s\S]*details\.drinking_day\s*=\s*target_drinking_day/i, 'pub crawl replacement helper should choose eligible pub crawls from the same drinking night');
assert.match(nightDedupeMigrationSql, /update\s+public\.notifications\s+as\s+notifications[\s\S]*where\s+notifications\.id\s*=\s*hangover_prompts\.notification_id/i, 'representative reassignment should retarget existing notifications by prompt notification_id');
assert.match(nightDedupeMigrationSql, /update\s+public\.notifications\s+as\s+notifications[\s\S]*notifications\.type\s*=\s*'hangover_check'/i, 'representative reassignment should only retarget hangover_check notifications');
assert.match(nightDedupeMigrationSql, /jsonb_set\([\s\S]*metadata[\s\S]*target_type/i, 'representative reassignment should update notification metadata target_type');
assert.match(nightDedupeMigrationSql, /tg_op\s*=\s*'UPDATE'[\s\S]*set\s+completed_at\s*=\s*coalesce\(hangover_prompts\.completed_at,\s*now\(\)\)[\s\S]*last_error\s*=\s*'No eligible hangover prompt representative remains for this drinking night\.'/i, 'update ineligibility with no replacement should complete the prompt with a clear reason');
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

assert.ok(exists(karnevalsdrukHangoverMigrationPath), 'KarnevalsDruk hangover migration should exist');
const karnevalsdrukHangoverMigrationSql = read(karnevalsdrukHangoverMigrationPath);

assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts/i,
  'KarnevalsDruk should have an idempotent prompt creation function'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*slug\s*=\s*'karnevalsdruk-2026'/i,
  'KarnevalsDruk prompt creation should stay scoped to the real one-off challenge'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*join\s+public\.challenge_entries/i,
  'KarnevalsDruk prompts should only be created for joined users'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*sessions\.status\s*=\s*'published'(?:(?!\$\$;)[\s\S])*coalesce\(sessions\.hide_from_feed,\s*false\)\s*=\s*false/i,
  'KarnevalsDruk session prompt targets should be published and visible'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*pub_crawls\.status\s*=\s*'published'/i,
  'KarnevalsDruk pub crawl prompt targets should be published'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /time\s+'11:00'[\s\S]*Europe\/Copenhagen/i,
  'KarnevalsDruk prompts should target May 24 11am Copenhagen time'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /alter\s+table\s+public\.hangover_prompts[\s\S]*add\s+column\s+if\s+not\s+exists\s+challenge_id\s+uuid/i,
  'KarnevalsDruk prompts should carry an explicit challenge scope'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /drop\s+index\s+if\s+exists\s+public\.hangover_prompts_user_drinking_day_unique_idx[\s\S]*create\s+unique\s+index[\s\S]*hangover_prompts_user_drinking_day_unique_idx[\s\S]*on\s+public\.hangover_prompts\s*\(\s*user_id\s*,\s*drinking_day\s*\)[\s\S]*where\s+drinking_day\s+is\s+not\s+null\s+and\s+challenge_id\s+is\s+null/i,
  'normal hangover prompts should keep user drinking-day dedupe without blocking challenge prompts'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+unique\s+index[\s\S]*hangover_prompts_user_challenge_unique_idx[\s\S]*on\s+public\.hangover_prompts\s*\(\s*user_id\s*,\s*challenge_id\s*\)[\s\S]*where\s+challenge_id\s+is\s+not\s+null/i,
  'KarnevalsDruk prompts should dedupe by user and challenge instead of drinking_day alone'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /insert\s+into\s+public\.hangover_prompts\s*\([\s\S]*challenge_id[\s\S]*\)[\s\S]*target_challenge\.id[\s\S]*on\s+conflict\s*\(\s*user_id\s*,\s*challenge_id\s*\)\s*where\s+challenge_id\s+is\s+not\s+null\s+do\s+nothing/i,
  'KarnevalsDruk prompt insertion should use challenge-scoped conflict handling'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.is_karnevalsdruk_hangover_target[\s\S]*returns\s+boolean[\s\S]*security\s+definer[\s\S]*slug\s*=\s*'karnevalsdruk-2026'/i,
  'KarnevalsDruk hangover target checks should be owner-scoped and limited to the real one-off challenge'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.is_karnevalsdruk_hangover_target[\s\S]*join\s+public\.challenge_entries/i,
  'KarnevalsDruk hangover target checks should require joined challenge entries'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.is_karnevalsdruk_hangover_target[\s\S]*target_published_at\s*>=\s*challenges\.starts_at[\s\S]*target_published_at\s*<\s*challenges\.ends_at/i,
  'KarnevalsDruk hangover target checks should only match posts inside the official event window'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_hangover_prompt_for_session(?:(?!\$\$;)[\s\S])*is_karnevalsdruk_hangover_target\(\s*new\.user_id\s*,\s*target_published_at\s*\)(?:(?!\$\$;)[\s\S])*return\s+new(?:(?!\$\$;)[\s\S])*insert\s+into\s+public\.hangover_prompts/i,
  'normal session prompt creation should skip joined-user KarnevalsDruk targets before inserting'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_hangover_prompt_for_pub_crawl(?:(?!\$\$;)[\s\S])*is_karnevalsdruk_hangover_target\(\s*new\.user_id\s*,\s*target_published_at\s*\)(?:(?!\$\$;)[\s\S])*return\s+new(?:(?!\$\$;)[\s\S])*insert\s+into\s+public\.hangover_prompts/i,
  'normal pub crawl prompt creation should skip joined-user KarnevalsDruk targets before inserting'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.suppress_karnevalsdruk_normal_hangover_prompts/i,
  'KarnevalsDruk should have a helper to suppress stale normal hangover prompts'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.suppress_karnevalsdruk_normal_hangover_prompts(?:(?!\$\$;)[\s\S])*update\s+public\.hangover_prompts(?:(?!\$\$;)[\s\S])*set\s+drinking_day\s*=\s*null(?:(?!\$\$;)[\s\S])*completed_at\s*=\s*coalesce\(hangover_prompts\.completed_at,\s*now\(\)\)/i,
  'KarnevalsDruk suppression should complete stale normal prompts and clear their drinking_day'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.suppress_karnevalsdruk_normal_hangover_prompts(?:(?!\$\$;)[\s\S])*(?:from|join)\s+public\.sessions\s+as\s+sessions(?:(?!\$\$;)[\s\S])*(?:from|join)\s+public\.pub_crawls\s+as\s+pub_crawls/i,
  'KarnevalsDruk suppression should cover event-window session and pub crawl targets'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.suppress_karnevalsdruk_normal_hangover_prompts(?:(?!\$\$;)[\s\S])*hangover_prompts\.challenge_id\s+is\s+null/i,
  'KarnevalsDruk suppression should only complete stale normal prompts'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*perform\s+public\.suppress_karnevalsdruk_normal_hangover_prompts\(null\)(?:(?!\$\$;)[\s\S])*insert\s+into\s+public\.hangover_prompts/i,
  'KarnevalsDruk finalizer prompt creation should suppress stale normal prompts before inserting the event prompt'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*already_handled_users(?:(?!\$\$;)[\s\S])*hangover_prompts\.challenge_id\s+is\s+null(?:(?!\$\$;)[\s\S])*hangover_prompts\.sent_at\s+is\s+not\s+null/i,
  'KarnevalsDruk finalizer should treat already-sent normal event prompts as handled'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*completed_normal_ratings(?:(?!\$\$;)[\s\S])*coalesce\(session_scores\.hangover_score,\s*pub_crawl_scores\.hangover_score\)\s+is\s+not\s+null/i,
  'KarnevalsDruk finalizer should only treat completed normal prompts as handled when a score exists'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*update\s+public\.sessions\s+as\s+sessions(?:(?!\$\$;)[\s\S])*hangover_score\s*=\s*completed_normal_ratings\.hangover_score(?:(?!\$\$;)[\s\S])*from\s+target_challenge,\s*completed_normal_ratings/i,
  'KarnevalsDruk finalizer should propagate completed pre-join normal session ratings across event sessions'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts(?:(?!\$\$;)[\s\S])*update\s+public\.pub_crawls\s+as\s+pub_crawls(?:(?!\$\$;)[\s\S])*hangover_score\s*=\s*completed_normal_ratings\.hangover_score(?:(?!\$\$;)[\s\S])*from\s+target_challenge,\s*completed_normal_ratings/i,
  'KarnevalsDruk finalizer should propagate completed pre-join normal pub crawl ratings across event pub crawls'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /already_handled_users\s+as\s*\([\s\S]*select\s+completed_normal_ratings\.user_id\s+from\s+completed_normal_ratings/i,
  'KarnevalsDruk finalizer should skip a second prompt after propagating a completed normal rating'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /representative_targets\s+as\s*\([\s\S]*from\s+eligible_targets[\s\S]*where\s+not\s+exists\s*\([\s\S]*from\s+already_handled_users/i,
  'KarnevalsDruk finalizer should skip inserting a second prompt for already-handled event users'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /after\s+update\s+of\s+finalized_at\s+on\s+public\.challenges(?:(?!;)[\s\S])*execute\s+function\s+public\.create_karnevalsdruk_hangover_prompts_after_finalize\(\)/i,
  'KarnevalsDruk prompt creation should run from challenge finalization'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.suppress_karnevalsdruk_hangover_prompts_after_join/i,
  'KarnevalsDruk should suppress stale normal prompts when a user joins after posting'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /after\s+insert\s+on\s+public\.challenge_entries(?:(?!;)[\s\S])*execute\s+function\s+public\.suppress_karnevalsdruk_hangover_prompts_after_join\(\)/i,
  'joining KarnevalsDruk should trigger suppression of stale normal hangover prompts'
);
assert.ok(exists(karnevalsdrukJoinResilienceMigrationPath), 'KarnevalsDruk join resilience migration should exist');
const karnevalsdrukJoinResilienceMigrationSql = read(karnevalsdrukJoinResilienceMigrationPath);

assert.match(
  karnevalsdrukJoinResilienceMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.suppress_karnevalsdruk_hangover_prompts_after_join/i,
  'KarnevalsDruk join resilience migration should replace the after-join trigger function'
);
assert.match(
  karnevalsdrukJoinResilienceMigrationSql,
  /exception\s+when\s+others\s+then[\s\S]*raise\s+warning/i,
  'KarnevalsDruk after-join cleanup failures should be logged instead of aborting challenge entry inserts'
);
assert.match(
  karnevalsdrukJoinResilienceMigrationSql,
  /exception\s+when\s+others\s+then[\s\S]*return\s+new/i,
  'KarnevalsDruk after-join cleanup failures should still allow the joined challenge entry'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /find_hangover_replacement_session\(\s*target_user_id\s+uuid,\s*target_drinking_day\s+date,\s*target_challenge_id\s+uuid,\s*excluded_session_id\s+uuid\s*\)/i,
  'session representative replacement should receive the prompt challenge scope'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /find_hangover_replacement_session[\s\S]*target_challenge_id\s+is\s+null[\s\S]*calculate_hangover_prompt_details[\s\S]*target_challenge_id\s+is\s+not\s+null[\s\S]*sessions\.status\s*=\s*'published'[\s\S]*starts_at[\s\S]*ends_at/i,
  'session replacement should keep normal and KarnevalsDruk candidates in separate scopes'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /find_hangover_replacement_session[\s\S]*target_challenge_id\s+is\s+null[\s\S]*not\s+public\.is_karnevalsdruk_hangover_target\(\s*sessions\.user_id\s*,\s*coalesce\(sessions\.published_at,\s*sessions\.ended_at,\s*sessions\.created_at\)\s*\)/i,
  'normal session replacement should exclude joined-user KarnevalsDruk event posts'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /find_hangover_replacement_pub_crawl\(\s*target_user_id\s+uuid,\s*target_drinking_day\s+date,\s*target_challenge_id\s+uuid,\s*excluded_pub_crawl_id\s+uuid\s*\)/i,
  'pub crawl representative replacement should receive the prompt challenge scope'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /find_hangover_replacement_pub_crawl[\s\S]*target_challenge_id\s+is\s+null[\s\S]*calculate_hangover_prompt_details[\s\S]*target_challenge_id\s+is\s+not\s+null[\s\S]*pub_crawls\.status\s*=\s*'published'[\s\S]*starts_at[\s\S]*ends_at/i,
  'pub crawl replacement should keep normal and KarnevalsDruk candidates in separate scopes'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /find_hangover_replacement_pub_crawl[\s\S]*target_challenge_id\s+is\s+null[\s\S]*not\s+public\.is_karnevalsdruk_hangover_target\(\s*pub_crawls\.user_id\s*,\s*coalesce\(pub_crawls\.published_at,\s*pub_crawls\.ended_at,\s*pub_crawls\.created_at\)\s*\)/i,
  'normal pub crawl replacement should exclude joined-user KarnevalsDruk event posts'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.reassign_hangover_prompt_from_session[\s\S]*hangover_prompts\.challenge_id[\s\S]*find_hangover_replacement_session\(\s*prompt_record\.user_id,\s*prompt_record\.drinking_day,\s*prompt_record\.challenge_id,\s*old\.id\s*\)/i,
  'session reassignment should pass the prompt challenge scope into replacement lookup'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.reassign_hangover_prompt_from_pub_crawl[\s\S]*hangover_prompts\.challenge_id[\s\S]*find_hangover_replacement_pub_crawl\(\s*prompt_record\.user_id,\s*prompt_record\.drinking_day,\s*prompt_record\.challenge_id,\s*old\.id\s*\)/i,
  'pub crawl reassignment should pass the prompt challenge scope into replacement lookup'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /revoke\s+execute\s+on\s+function\s+public\.find_hangover_replacement_session\(uuid,\s*date,\s*uuid,\s*uuid\)\s+from\s+public,\s*anon,\s*authenticated/i,
  'internal session replacement helper should not be directly executable by app roles'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /revoke\s+execute\s+on\s+function\s+public\.find_hangover_replacement_pub_crawl\(uuid,\s*date,\s*uuid,\s*uuid\)\s+from\s+public,\s*anon,\s*authenticated/i,
  'internal pub crawl replacement helper should not be directly executable by app roles'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.rate_hangover/i,
  'KarnevalsDruk migration should replace rating with the one-off event window branch'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.rate_hangover(?:(?!\$\$;)[\s\S])*join\s+public\.challenge_entries(?:(?!\$\$;)[\s\S])*challenge_entries\.user_id\s*=\s*requesting_user_id/i,
  'KarnevalsDruk rating should require a joined challenge user'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.rate_hangover(?:(?!\$\$;)[\s\S])*target_published_at\s*>=\s*challenges\.starts_at(?:(?!\$\$;)[\s\S])*target_published_at\s*<\s*challenges\.ends_at/i,
  'KarnevalsDruk rating should only branch for targets inside the event window'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.rate_hangover(?:(?!\$\$;)[\s\S])*night_start\s*:=\s*karnevalsdruk_row\.starts_at(?:(?!\$\$;)[\s\S])*night_end\s*:=\s*karnevalsdruk_row\.ends_at/i,
  'KarnevalsDruk rating should score the full official challenge window'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /karnevalsdruk_row\.id\s+is\s+not\s+null[\s\S]*hangover_prompts\.challenge_id\s*=\s*karnevalsdruk_row\.id/i,
  'KarnevalsDruk rating should complete the challenge-scoped prompt'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /else[\s\S]*hangover_prompts\.challenge_id\s+is\s+null[\s\S]*hangover_prompts\.drinking_day\s*=\s*resolved_drinking_day/i,
  'normal rating should complete only normal drinking-day prompts'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /from\s+public\.sessions\s+as\s+sessions[\s\S]*karnevalsdruk_row\.id\s+is\s+not\s+null[\s\S]*not\s+public\.is_karnevalsdruk_hangover_target\(\s*sessions\.user_id\s*,\s*coalesce\(sessions\.published_at,\s*sessions\.ended_at,\s*sessions\.created_at\)\s*\)/i,
  'normal session rating should exclude joined-user KarnevalsDruk event posts from overlapping local nights'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /from\s+public\.pub_crawls\s+as\s+pub_crawls[\s\S]*karnevalsdruk_row\.id\s+is\s+not\s+null[\s\S]*not\s+public\.is_karnevalsdruk_hangover_target\(\s*pub_crawls\.user_id\s*,\s*coalesce\(pub_crawls\.published_at,\s*pub_crawls\.ended_at,\s*pub_crawls\.created_at\)\s*\)/i,
  'normal pub crawl rating should exclude joined-user KarnevalsDruk event posts from overlapping local nights'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.rate_hangover(?:(?!\$\$;)[\s\S])*else(?:(?!\$\$;)[\s\S])*calculate_hangover_prompt_details(?:(?!\$\$;)[\s\S])*time\s+'21:00'(?:(?!\$\$;)[\s\S])*time\s+'06:00'/i,
  'rating should keep the normal late-night window outside KarnevalsDruk'
);

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
