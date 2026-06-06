const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260606130000_auto_close_stale_sessions.sql');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:stale-sessions'],
  'node scripts/staleSessionAutoClose.test.js',
  'package.json should expose the stale-session test script'
);

assert.equal(fs.existsSync(migrationPath), true, 'stale session auto-close migration should exist');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /create extension if not exists pg_cron/i, 'migration should enable pg_cron');
assert.match(sql, /create index if not exists sessions_active_started_at_idx/i, 'migration should index active sessions for stale scans');
assert.match(sql, /create index if not exists pub_crawls_active_started_at_idx/i, 'migration should index active pub crawls for stale scans');
assert.match(
  sql,
  /create or replace function public\.close_stale_active_sessions\(max_rows integer default 100\)/i,
  'cleanup function should use the approved public signature'
);
assert.match(sql, /returns table\s*\([\s\S]*published_sessions integer[\s\S]*cancelled_sessions integer[\s\S]*published_crawls integer[\s\S]*cancelled_crawls integer/i, 'cleanup function should return observable counts');
assert.match(sql, /security definer/i, 'cleanup function should run as security definer');
assert.match(sql, /set search_path = public/i, 'cleanup function should pin search_path');
assert.match(sql, /interval '12 hours'/i, 'cleanup should enforce the 12-hour inactivity rule');
assert.match(sql, /public\.get_live_session_last_activity\(s\.id\)/i, 'normal session scan should reuse the live last-activity helper');
assert.match(sql, /public\.get_live_pub_crawl_last_activity\(c\.id\)/i, 'pub crawl scan should reuse the crawl last-activity helper');
assert.match(sql, /for update skip locked/i, 'cleanup should lock rows without blocking overlapping runs');
assert.match(sql, /coalesce\(sum\(greatest\(coalesce\(sb\.quantity,\s*1\),\s*0\)\),\s*0\)::integer/i, 'cleanup should count drink quantity using app-compatible quantity rules');
assert.match(sql, /where s\.status = 'active'[\s\S]*s\.pub_crawl_id is null/i, 'normal session scan should exclude crawl child sessions');
assert.match(sql, /where c\.status = 'active'/i, 'pub crawl scan should only process active crawls');
assert.match(sql, /status = 'cancelled'[\s\S]*ended_at = now_value/i, 'zero-drink stale records should be cancelled with an end time');
assert.match(sql, /status = 'published'[\s\S]*published_at = now_value/i, 'stale records with drinks should be published');
assert.match(sql, /update public\.pub_crawls[\s\S]*status = 'cancelled'/i, 'zero-drink active pub crawls should be cancelled');
assert.match(sql, /update public\.pub_crawls[\s\S]*status = 'published'/i, 'active pub crawls with drinks should be published');
assert.match(sql, /hide_from_feed = true/i, 'crawl child sessions should stay hidden from the standalone feed');
assert.match(sql, /update public\.pubs[\s\S]*use_count = use_count \+ 1/i, 'auto-published records should mirror manual pub use count updates');
assert.match(sql, /create or replace function public\.invoke_stale_session_closer\(\)/i, 'migration should add a cron target function');
assert.match(sql, /cron\.schedule\([\s\S]*'beerva-close-stale-sessions'[\s\S]*'\*\/15 \* \* \* \*'/i, 'migration should schedule the closer every 15 minutes');
assert.match(sql, /revoke execute on function public\.close_stale_active_sessions\(integer\) from public, anon, authenticated/i, 'clients should not execute the cleanup function');
assert.match(sql, /grant execute on function public\.close_stale_active_sessions\(integer\) to service_role/i, 'service role should be able to run maintenance manually');
assert.match(sql, /revoke execute on function public\.invoke_stale_session_closer\(\) from public, anon, authenticated/i, 'clients should not execute the cron wrapper');
assert.match(sql, /comment on function public\.close_stale_active_sessions\(integer\)/i, 'cleanup function should be documented');
assert.match(sql, /notify pgrst, 'reload schema'/i, 'migration should reload the PostgREST schema cache');

console.log('stale session auto-close migration checks passed');
