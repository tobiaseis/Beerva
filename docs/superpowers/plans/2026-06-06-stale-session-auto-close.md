# Stale Session Auto-Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically close active drinking sessions and active pub crawls after 12 hours without drink activity, publishing records with drinks and cancelling records with zero drinks.

**Architecture:** Add one Supabase migration with a security-definer cleanup function, a locked-down cron wrapper, supporting active-row indexes, and a `pg_cron` schedule. Keep the client unchanged and rely on existing session/pub crawl/live mate triggers to remove live rows and feed published records through existing paths.

**Tech Stack:** Supabase Postgres, PL/pgSQL, `pg_cron`, Node script tests using `node:assert`.

---

## File Structure

- Create `scripts/staleSessionAutoClose.test.js`: static migration and script wiring checks for the stale auto-close feature.
- Modify `package.json`: add `test:stale-sessions` script.
- Create `supabase/migrations/20260606130000_auto_close_stale_sessions.sql`: indexes, cleanup function, cron wrapper, schedule, permissions, comments, schema reload.

## Task 1: Add The Failing Migration Test

**Files:**
- Create: `scripts/staleSessionAutoClose.test.js`
- Modify: `package.json`
- Test: `scripts/staleSessionAutoClose.test.js`

- [ ] **Step 1: Create the stale session migration test**

Create `scripts/staleSessionAutoClose.test.js` with this complete content:

```js
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
```

- [ ] **Step 2: Add the package script**

In `package.json`, add this entry in the existing `scripts` object immediately after `test:live-mates`:

```json
"test:stale-sessions": "node scripts/staleSessionAutoClose.test.js",
```

The surrounding lines should look like this after the edit:

```json
"test:session-feed-details": "node scripts/sessionFeedDetails.test.js",
"test:feed-pagination": "node scripts/feedPagination.test.js",
"test:live-mates": "node scripts/liveMateSessions.test.js",
"test:stale-sessions": "node scripts/staleSessionAutoClose.test.js",
"test:mentions": "node scripts/mentions.test.js",
"test:navigation-back": "node scripts/navigationBackHistory.test.js"
```

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
npm run test:stale-sessions
```

Expected result: FAIL with `stale session auto-close migration should exist`.

- [ ] **Step 4: Commit the red test**

Run:

```powershell
git add package.json scripts/staleSessionAutoClose.test.js
git commit -m "test: add stale session auto-close checks"
```

## Task 2: Add The Stale Session Cleanup Migration

**Files:**
- Create: `supabase/migrations/20260606130000_auto_close_stale_sessions.sql`
- Test: `scripts/staleSessionAutoClose.test.js`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260606130000_auto_close_stale_sessions.sql` with this complete content:

```sql
create extension if not exists pg_cron;

create index if not exists sessions_active_started_at_idx
  on public.sessions ((coalesce(started_at, created_at)))
  where status = 'active';

create index if not exists pub_crawls_active_started_at_idx
  on public.pub_crawls ((coalesce(started_at, created_at)))
  where status = 'active';

drop function if exists public.close_stale_active_sessions(integer);

create or replace function public.close_stale_active_sessions(max_rows integer default 100)
returns table (
  published_sessions integer,
  cancelled_sessions integer,
  published_crawls integer,
  cancelled_crawls integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff_at timestamp with time zone := now() - interval '12 hours';
  now_value timestamp with time zone := now();
  row_limit integer := least(greatest(coalesce(max_rows, 100), 1), 500);
  crawl_row record;
  session_row record;
  drink_count integer;
begin
  published_sessions := 0;
  cancelled_sessions := 0;
  published_crawls := 0;
  cancelled_crawls := 0;

  for crawl_row in
    select c.id
    from public.pub_crawls c
    where c.status = 'active'
      and coalesce(c.started_at, c.created_at, now_value) <= cutoff_at
      and public.get_live_pub_crawl_last_activity(c.id) <= cutoff_at
    order by coalesce(c.started_at, c.created_at, now_value) asc
    limit row_limit
    for update skip locked
  loop
    select coalesce(sum(greatest(coalesce(sb.quantity, 1), 0)), 0)::integer
    into drink_count
    from public.sessions s
    join public.session_beers sb
      on sb.session_id = s.id
    where s.pub_crawl_id = crawl_row.id
      and s.is_crawl_stop = true
      and s.status in ('active', 'published');

    if drink_count <= 0 then
      update public.pub_crawls
      set status = 'cancelled',
          ended_at = now_value
      where id = crawl_row.id
        and status = 'active';

      if found then
        update public.sessions
        set status = 'cancelled',
            ended_at = coalesce(ended_at, now_value),
            hide_from_feed = true
        where pub_crawl_id = crawl_row.id;

        cancelled_crawls := cancelled_crawls + 1;
      end if;
    else
      update public.pubs
      set use_count = use_count + 1,
          updated_at = now_value
      where id in (
        select distinct s.pub_id
        from public.sessions s
        where s.pub_crawl_id = crawl_row.id
          and s.status = 'active'
          and s.is_crawl_stop = true
          and s.pub_id is not null
      )
        and status = 'active';

      update public.sessions
      set status = 'published',
          ended_at = now_value,
          published_at = now_value,
          hide_from_feed = true
      where pub_crawl_id = crawl_row.id
        and status = 'active'
        and is_crawl_stop = true;

      update public.sessions
      set hide_from_feed = true
      where pub_crawl_id = crawl_row.id
        and is_crawl_stop = true
        and hide_from_feed = false;

      update public.pub_crawls
      set status = 'published',
          ended_at = now_value,
          published_at = now_value
      where id = crawl_row.id
        and status = 'active';

      if found then
        published_crawls := published_crawls + 1;
      end if;
    end if;
  end loop;

  for session_row in
    select s.id, s.pub_id
    from public.sessions s
    where s.status = 'active'
      and s.pub_crawl_id is null
      and coalesce(s.started_at, s.created_at, now_value) <= cutoff_at
      and public.get_live_session_last_activity(s.id) <= cutoff_at
    order by coalesce(s.started_at, s.created_at, now_value) asc
    limit row_limit
    for update skip locked
  loop
    select coalesce(sum(greatest(coalesce(sb.quantity, 1), 0)), 0)::integer
    into drink_count
    from public.session_beers sb
    where sb.session_id = session_row.id;

    if drink_count <= 0 then
      update public.sessions
      set status = 'cancelled',
          ended_at = now_value
      where id = session_row.id
        and status = 'active';

      if found then
        cancelled_sessions := cancelled_sessions + 1;
      end if;
    else
      update public.sessions
      set status = 'published',
          ended_at = now_value,
          published_at = now_value
      where id = session_row.id
        and status = 'active';

      if found then
        update public.pubs
        set use_count = use_count + 1,
            updated_at = now_value
        where id = session_row.pub_id
          and status = 'active';

        published_sessions := published_sessions + 1;
      end if;
    end if;
  end loop;

  return next;
end;
$$;

create or replace function public.invoke_stale_session_closer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform *
  from public.close_stale_active_sessions(100);
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-close-stale-sessions') then
    perform cron.unschedule('beerva-close-stale-sessions');
  end if;

  perform cron.schedule(
    'beerva-close-stale-sessions',
    '*/15 * * * *',
    'select public.invoke_stale_session_closer();'
  );
end;
$$;

revoke execute on function public.close_stale_active_sessions(integer) from public, anon, authenticated;
grant execute on function public.close_stale_active_sessions(integer) to service_role;
revoke execute on function public.invoke_stale_session_closer() from public, anon, authenticated;

comment on function public.close_stale_active_sessions(integer) is
  'Closes active sessions and pub crawls after 12 hours without drink activity; publishes records with drinks and cancels records with zero drinks.';
comment on function public.invoke_stale_session_closer() is
  'Cron target for closing stale active drinking sessions and pub crawls.';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Run the new test and verify GREEN**

Run:

```powershell
npm run test:stale-sessions
```

Expected result: PASS with `stale session auto-close migration checks passed`.

- [ ] **Step 3: Commit the migration**

Run:

```powershell
git add supabase/migrations/20260606130000_auto_close_stale_sessions.sql
git commit -m "feat: auto-close stale active sessions"
```

## Task 3: Run Regression Checks

**Files:**
- Verify: `scripts/staleSessionAutoClose.test.js`
- Verify: `scripts/liveMateSessions.test.js`
- Verify: `scripts/pubCrawl.test.js`
- Verify: `supabase/migrations/20260604130000_add_live_mate_sessions.sql`
- Verify: `supabase/migrations/20260510220000_add_pub_crawls.sql`

- [ ] **Step 1: Run stale-session checks**

Run:

```powershell
npm run test:stale-sessions
```

Expected result: PASS with `stale session auto-close migration checks passed`.

- [ ] **Step 2: Run live mate regression checks**

Run:

```powershell
npm run test:live-mates
```

Expected result: PASS with `live mate feed wiring checks passed`.

- [ ] **Step 3: Run pub crawl regression checks**

Run:

```powershell
npm run test:pub-crawl
```

Expected result: PASS. The script prints its existing pub crawl success output and exits with code 0.

- [ ] **Step 4: Inspect the final diff**

Run:

```powershell
git status --short
git diff --stat
git diff -- package.json scripts/staleSessionAutoClose.test.js supabase/migrations/20260606130000_auto_close_stale_sessions.sql
```

Expected result: only the stale-session test, package script, and migration are modified or newly added.

- [ ] **Step 5: Commit any verification-only adjustments**

If the regression checks required a small edit, run:

```powershell
git add package.json scripts/staleSessionAutoClose.test.js supabase/migrations/20260606130000_auto_close_stale_sessions.sql
git commit -m "fix: stabilize stale session auto-close migration"
```

If no edits were needed after Task 2, leave the tree clean.
