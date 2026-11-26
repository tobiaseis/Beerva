# Sunday Weekly Recap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Sunday at about 18:00 Copenhagen time, send a "Your week on Beerva" push. Tapping it opens a "Your week" screen showing:
- nights out, units and drinks
- how many mates saw your posts, plus cheers and comments
- pubs visited and your top pub
- your weekly streak and best run of nights in a row
- your rank in active challenges
- which mates were out

**Architecture:** A security definer RPC, `get_weekly_recap(target_week_start)`, builds the whole recap for the signed-in user as one JSON object. It reuses the drinking-week helpers, `get_weekly_streaks`, the post-view tables and the real challenge leaderboard. A `pg_cron` job calls `queue_weekly_recaps()` every 15 minutes on Sunday evenings. Inside the 18:00–19:30 local window, it sends one `weekly_recap` notification per person who was out, or whose mates were out, using the `engagement_push_log` from the Friday nudge plan. `send-push` builds the text from the shared copy module and links to `/?recap=<week>`. The app parses that link on web and Android, opens a new `WeeklyRecap` screen (with previous/next week arrows), and also shows it from the notifications list and the profile.

**Tech Stack:** Supabase Postgres + `pg_cron`, Supabase Edge Functions (Deno), Expo React Native + PWA, React Navigation, TypeScript, Node assertion test scripts.

**Plan order:** Plan 3 of 3. It needs:
- `2026-11-26-weekly-streaks.md`: `beerva_drinking_day`, `beerva_drinking_week`, `get_weekly_streaks` and `formatWeeklyStreak`.
- `2026-11-26-friday-nudge.md`: `engagement_pushes_enabled`, `engagement_push_log`, the `weekly_recap` notification type and `engagementCopy.ts`.
- The seen-by feature already on master: `session_views` and `pub_crawl_views`.

---

## Decisions Baked Into This Plan

| Decision | Default | Where to change |
| --- | --- | --- |
| When | Sunday 18:00–19:30 Copenhagen. The job wakes every 15 minutes, with at most one recap per person per week. | Time window in `queue_weekly_recaps`; cron line in Task 2 |
| Who | Push enabled and opted in, and either you or at least one person you follow was out this week. A quiet week for everyone means no push. | `continue` rule in `queue_weekly_recaps` |
| Push text | "3 nights out, seen by 12 mates. Tap for your recap." If you stayed in: "4 mates were out this week. See what you missed." | `buildWeeklyRecapCopy` in Task 3 |
| Week | Monday to Sunday on drinking days (06:00–06:00). The screen shows the live week, so posts after 18:00 on Sunday still appear when it's opened. | `get_weekly_recap` |
| "Seen by" | Distinct people who saw any of this week's posts, at any time up to now. | `viewers` CTE |
| Challenges | Joined, not archived, and overlapping the week. Shows rank of entrants and your total. | `my_challenges` CTE |
| Mates | People you follow who were out this week. The top 5 by nights out are listed, and all of them are counted. | `mates` CTE |
| Entry points | The push, the notifications list ("See your week"), and "See your week →" on your profile. | Tasks 6–7 |

---

## File Structure

- Create `supabase/migrations/20261127140000_add_weekly_recap.sql`: `get_weekly_recap`, `queue_weekly_recaps` and the `beerva-weekly-recap` cron job.
- Modify `supabase/functions/_shared/engagementCopy.ts`: `buildWeeklyRecapCopy`.
- Modify `supabase/functions/send-push/index.ts`: type, metadata, copy and URL.
- Create `src/lib/recapLaunchParams.ts`: pure `?recap=` parsing, shared by web and Android routing.
- Create `src/lib/weeklyRecap.ts`: types, mapper, week formatting and the RPC wrapper.
- Create `src/screens/WeeklyRecapScreen.tsx`.
- Modify `src/navigation/RootNavigator.tsx` and `src/lib/nativeNotificationRouting.ts`: route, link and push launch.
- Modify `src/screens/NotificationsScreen.tsx` and `src/screens/ProfileScreen.tsx`: entry points.
- Create `scripts/weeklyRecap.test.js` and add `test:weekly-recap` to `package.json`.

---

### Task 1: Add The Failing Weekly Recap Test

**Files:**
- Create: `scripts/weeklyRecap.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

In `package.json`, replace:

```json
    "test:friday-nudge": "node scripts/fridayNudge.test.js"
```

with:

```json
    "test:friday-nudge": "node scripts/fridayNudge.test.js",
    "test:weekly-recap": "node scripts/weeklyRecap.test.js"
```

- [ ] **Step 2: Write the failing test**

Create `scripts/weeklyRecap.test.js` with this complete content:

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const { loadTypeScriptModule } = require('./loadTypeScriptModule');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

const loadWithMocks = (relativePath, mocks) => {
  const filename = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = (request) => (
    Object.prototype.hasOwnProperty.call(mocks, request) ? mocks[request] : Module.prototype.require.call(compiled, request)
  );
  compiled._compile(outputText, filename);
  return compiled.exports;
};

const main = async () => {
  // Migration.
  const sql = read('supabase/migrations/20261127140000_add_weekly_recap.sql');
  assert.ok(sql, 'weekly recap migration should exist');
  assert.match(sql, /create or replace function public\.get_weekly_recap\(target_week_start date default null\)/i);
  assert.match(sql, /returns jsonb/i);
  assert.match(sql, /viewer uuid := \(select auth\.uid\(\)\);/i, 'the recap is always the caller\'s own');
  assert.match(sql, /from public\.session_views/i, 'seen-by uses session views');
  assert.match(sql, /from public\.pub_crawl_views/i, 'seen-by uses pub crawl views');
  assert.match(sql, /public\.get_challenge_leaderboard\(mc\.id\)/i, 'challenge ranks come from the real leaderboard');
  assert.match(sql, /public\.get_weekly_streaks\(array\[viewer\]\)/i);
  assert.match(sql, /coalesce\(sb\.excluded_from_stats, false\) = false/i, 'invalidated drinks do not count');
  assert.match(sql, /'is_current_week', recap_week = public\.beerva_drinking_week\(now\(\)\)/i);
  assert.match(sql, /create or replace function public\.queue_weekly_recaps\(\s*force boolean default false,\s*only_user_id uuid default null\s*\)/i);
  assert.match(sql, /extract\(isodow from local_now\) <> 7/i, 'only on Sundays');
  assert.match(sql, /local_now::time < time '18:00'/i);
  assert.match(sql, /local_now::time >= time '19:30'/i);
  assert.match(sql, /if candidate\.nights_out = 0 and candidate\.mates_out = 0 then\s+continue;/i, 'quiet weeks get no push');
  assert.match(sql, /'weekly_recap',\s*null,/i);
  assert.match(sql, /revoke execute on function public\.queue_weekly_recaps\(boolean, uuid\) from public, anon, authenticated/i);
  assert.match(sql, /revoke execute on function public\.get_weekly_recap\(date\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_weekly_recap\(date\) to authenticated/i);
  assert.match(sql, /cron\.schedule\(\s*'beerva-weekly-recap',\s*'\*\/15 16-18 \* \* 0'/i, 'Sunday evenings in UTC cover both CET and CEST');

  // Shared copy.
  const copy = loadTypeScriptModule('supabase/functions/_shared/engagementCopy.ts');
  const title = 'Your week on Beerva 🍻';
  assert.deepEqual(copy.buildWeeklyRecapCopy({ nights_out: 3, seen_by: 12 }), { title, body: '3 nights out, seen by 12 mates. Tap for your recap.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy({ nights_out: 1, seen_by: 1 }), { title, body: '1 night out, seen by 1 mate. Tap for your recap.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy({ nights_out: 2, seen_by: 0 }), { title, body: '2 nights out this week. Tap for your recap.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy({ nights_out: 0, mates_out: 4 }), { title, body: '4 mates were out this week. See what you missed.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy({ mates_out: '1' }), { title, body: '1 mate was out this week. See what you missed.' });
  assert.deepEqual(copy.buildWeeklyRecapCopy(null), { title, body: 'Your weekly recap is ready.' });

  // Launch params (pure, shared by web and Android routing).
  const { getRecapLaunchParamsFromSearch } = loadTypeScriptModule('src/lib/recapLaunchParams.ts');
  assert.deepEqual(getRecapLaunchParamsFromSearch('?recap=2026-11-23&notificationId=n1'), { weekStart: '2026-11-23', notificationId: 'n1' });
  assert.deepEqual(getRecapLaunchParamsFromSearch('?recap=2026-11-23'), { weekStart: '2026-11-23', notificationId: null });
  assert.equal(getRecapLaunchParamsFromSearch('?recap=next-week'), null, 'only ISO dates are accepted');
  assert.equal(getRecapLaunchParamsFromSearch('?post=abc'), null);

  // Client module.
  const rpcCalls = [];
  let rpcResponse = { data: null, error: null };
  const recapModule = loadWithMocks('src/lib/weeklyRecap.ts', {
    './supabase': { supabase: { rpc: async (name, args) => { rpcCalls.push({ name, args }); return rpcResponse; } } },
    './timeouts': { withTimeout: (operation) => operation },
  });

  assert.equal(recapModule.formatWeekRange('2026-11-23', '2026-11-29'), '23–29 Nov');
  assert.equal(recapModule.formatWeekRange('2026-11-30', '2026-12-06'), '30 Nov – 6 Dec');
  assert.equal(recapModule.formatWeekRange('2026-12-28', '2027-01-03'), '28 Dec – 3 Jan');
  assert.equal(recapModule.shiftWeek('2026-11-23', -1), '2026-11-16');
  assert.equal(recapModule.shiftWeek('2026-12-28', 1), '2027-01-04');

  const row = {
    week_start: '2026-11-23', week_end: '2026-11-29', is_current_week: true,
    nights_out: 3, units: '18.4', drinks: 9, posts: 2, pubs: 3, top_pub: 'Kroen', seen_by: 12,
    cheers: 7, comments: 2, best_run: 2, weekly_streak: 5, mates_out: 4,
    challenges: [{ slug: 'julefrokost', title: 'Julefrokost Season', metric_type: 'alcohol_units', challenge_type: 'leaderboard', rank: 2, progress_value: '33.8', entrants: 14 }],
    mates: [{ user_id: 'u2', username: 'mads', avatar_url: null, nights_out: 3 }, { user_id: null, username: 'ghost', nights_out: 1 }],
  };
  const recap = recapModule.mapWeeklyRecap(row);
  assert.equal(recap.weekStart, '2026-11-23');
  assert.equal(recap.isCurrentWeek, true);
  assert.equal(recap.units, 18.4);
  assert.equal(recap.topPub, 'Kroen');
  assert.deepEqual(recap.challenges[0], { slug: 'julefrokost', title: 'Julefrokost Season', metricType: 'alcohol_units', challengeType: 'leaderboard', rank: 2, progressValue: 33.8, entrants: 14 });
  assert.equal(recap.mates.length, 1, 'mates without ids are dropped');
  assert.equal(recapModule.isRecapEmpty(recap), false);
  assert.equal(recapModule.isRecapEmpty(recapModule.mapWeeklyRecap({ week_start: '2026-11-23', week_end: '2026-11-29' })), true);

  rpcResponse = { data: row, error: null };
  await recapModule.fetchWeeklyRecap(null);
  assert.deepEqual(rpcCalls.pop(), { name: 'get_weekly_recap', args: { target_week_start: null } }, 'no week means the current week');
  await recapModule.fetchWeeklyRecap('2026-11-16');
  assert.deepEqual(rpcCalls.pop(), { name: 'get_weekly_recap', args: { target_week_start: '2026-11-16' } });
  rpcResponse = { data: null, error: new Error('boom') };
  await assert.rejects(() => recapModule.fetchWeeklyRecap(null), /boom/);

  // Edge function.
  const sendPush = read('supabase/functions/send-push/index.ts');
  assert.match(sendPush, /buildWeeklyRecapCopy/);
  assert.match(sendPush, /\| 'weekly_recap'/);
  assert.match(sendPush, /url = `\/\?recap=\$\{encodeURIComponent\(record\.metadata\.week_start\)\}&notificationId=\$\{encodeURIComponent\(record\.id\)\}`/);

  // Navigation and entry points.
  const navigator = read('src/navigation/RootNavigator.tsx');
  assert.match(navigator, /WeeklyRecap: \{ weekStart\?: string; notificationId\?: string \| null \} \| undefined;/);
  assert.match(navigator, /WeeklyRecap: 'recap\/:weekStart\?',/);
  assert.match(navigator, /<Stack\.Screen name="WeeklyRecap" component=\{WeeklyRecapScreen\} \/>/);
  assert.match(navigator, /getRecapLaunchParamsFromSearch\(window\.location\.search\)/, 'web push links open the recap');
  assert.match(navigator, /target\.kind === 'recap'/, 'android push links open the recap');

  const nativeRouting = read('src/lib/nativeNotificationRouting.ts');
  assert.match(nativeRouting, /\{ kind: 'recap'; weekStart: string; notificationId\?: string \| null \}/);
  assert.match(nativeRouting, /getRecapLaunchParamsFromSearch\(search\)/);

  const screen = read('src/screens/WeeklyRecapScreen.tsx');
  assert.match(screen, /export const WeeklyRecapScreen/);
  assert.match(screen, /fetchWeeklyRecap\(selectedWeek\)/);
  assert.match(screen, /disabled=\{!recap \|\| recap\.isCurrentWeek\}/, 'cannot page into the future');
  assert.match(screen, /Seen by/);
  assert.match(screen, /Who was out/);

  const notificationsScreen = read('src/screens/NotificationsScreen.tsx');
  assert.match(notificationsScreen, /\| 'weekly_recap'/);
  assert.match(notificationsScreen, /buildWeeklyRecapCopy\(item\.metadata\)/);
  assert.match(notificationsScreen, /See your week/);

  const profileScreen = read('src/screens/ProfileScreen.tsx');
  assert.match(profileScreen, /navigation\.navigate\('WeeklyRecap'\)/);
};

main()
  .then(() => console.log('weekly recap checks passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run test:weekly-recap`
Expected: FAIL with `weekly recap migration should exist`.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/weeklyRecap.test.js
git commit -m "test: add failing weekly recap checks"
```

---

### Task 2: Add The Recap RPC And Scheduler

**Files:**
- Create: `supabase/migrations/20261127140000_add_weekly_recap.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261127140000_add_weekly_recap.sql` with this complete content:

```sql
-- Sunday weekly recap: one RPC that builds the caller's week, and a
-- scheduler that queues one weekly_recap push per person on Sunday evening.
-- The opt-out column, engagement_push_log and the weekly_recap notification
-- type come from 20261127130000_add_friday_nudge.sql.

create or replace function public.get_weekly_recap(target_week_start date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := (select auth.uid());
  recap_week date := coalesce(
    date_trunc('week', target_week_start::timestamp)::date,
    public.beerva_drinking_week(now())
  );
  window_start timestamp with time zone := (recap_week::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  window_end timestamp with time zone := ((recap_week + 7)::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  result jsonb;
begin
  if viewer is null then
    return null;
  end if;

  with my_sessions as (
    select
      s.id,
      s.pub_name,
      s.hide_from_feed,
      s.volume,
      s.quantity,
      s.abv,
      coalesce(s.started_at, s.created_at) as started
    from public.sessions s
    where s.user_id = viewer
      and s.status = 'published'
      and coalesce(s.started_at, s.created_at) >= window_start
      and coalesce(s.started_at, s.created_at) < window_end
  ),
  my_crawls as (
    select c.id
    from public.pub_crawls c
    where c.user_id = viewer
      and c.status = 'published'
      and c.published_at >= window_start
      and c.published_at < window_end
  ),
  drinks as (
    select
      greatest(coalesce(sb.quantity, 1), 0) as quantity,
      public.beerva_challenge_progress_value('alcohol_units', sb.volume, sb.quantity::numeric, sb.abv::numeric) as units
    from my_sessions ms
    join public.session_beers sb on sb.session_id = ms.id
    where coalesce(sb.excluded_from_stats, false) = false
    union all
    select
      greatest(coalesce(ms.quantity, 1), 0) as quantity,
      public.beerva_challenge_progress_value('alcohol_units', ms.volume, ms.quantity::numeric, ms.abv::numeric) as units
    from my_sessions ms
    where not exists (
      select 1 from public.session_beers sb where sb.session_id = ms.id
    )
  ),
  nights as (
    select distinct public.beerva_drinking_day(ms.started) as night
    from my_sessions ms
  ),
  night_islands as (
    select nights.night, nights.night - (row_number() over (order by nights.night))::integer as island
    from nights
  ),
  named_pubs as (
    select btrim(ms.pub_name) as pub_name
    from my_sessions ms
    where nullif(btrim(coalesce(ms.pub_name, '')), '') is not null
  ),
  top_pub as (
    -- Same pub regardless of case; shown with its most common spelling.
    select mode() within group (order by named_pubs.pub_name) as pub_name
    from named_pubs
    group by lower(named_pubs.pub_name)
    order by count(*) desc, lower(named_pubs.pub_name)
    limit 1
  ),
  viewers as (
    select v.viewer_id
    from public.session_views v
    join my_sessions ms on ms.id = v.session_id
    union
    select v.viewer_id
    from public.pub_crawl_views v
    join my_crawls mc on mc.id = v.pub_crawl_id
  ),
  mates as (
    select
      pr.id as user_id,
      pr.username,
      pr.avatar_url,
      count(distinct public.beerva_drinking_day(coalesce(s.started_at, s.created_at)))::integer as nights_out
    from public.follows f
    join public.sessions s
      on s.user_id = f.following_id
     and s.status = 'published'
     and coalesce(s.started_at, s.created_at) >= window_start
     and coalesce(s.started_at, s.created_at) < window_end
    join public.profiles pr on pr.id = f.following_id
    where f.follower_id = viewer
    group by pr.id, pr.username, pr.avatar_url
  ),
  my_challenges as (
    select ch.id, ch.slug, ch.title, ch.metric_type, ch.challenge_type, ch.ends_at
    from public.challenge_entries ce
    join public.challenges ch on ch.id = ce.challenge_id
    where ce.user_id = viewer
      and ch.archived_at is null
      and ch.starts_at < window_end
      and ch.ends_at > window_start
  )
  select jsonb_build_object(
    'week_start', recap_week,
    'week_end', recap_week + 6,
    'is_current_week', recap_week = public.beerva_drinking_week(now()),
    'nights_out', (select count(*) from nights),
    'units', round(coalesce((select sum(drinks.units) from drinks), 0)::numeric, 1),
    'drinks', coalesce((select sum(drinks.quantity) from drinks), 0),
    'posts', (select count(*) from my_sessions where not coalesce(my_sessions.hide_from_feed, false))
      + (select count(*) from my_crawls),
    'pubs', (select count(distinct lower(named_pubs.pub_name)) from named_pubs),
    'top_pub', (select top_pub.pub_name from top_pub),
    'seen_by', (select count(*) from viewers),
    'cheers', (select count(*) from public.session_cheers c join my_sessions ms on ms.id = c.session_id)
      + (select count(*) from public.pub_crawl_cheers c join my_crawls mc on mc.id = c.pub_crawl_id),
    'comments', (select count(*) from public.session_comments c join my_sessions ms on ms.id = c.session_id)
      + (select count(*) from public.pub_crawl_comments c join my_crawls mc on mc.id = c.pub_crawl_id),
    'best_run', coalesce((
      select max(run_length)
      from (select count(*) as run_length from night_islands group by night_islands.island) runs
    ), 0),
    'weekly_streak', coalesce((select ws.weekly_streak from public.get_weekly_streaks(array[viewer]) ws), 0),
    'challenges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'slug', mc.slug,
          'title', mc.title,
          'metric_type', public.beerva_effective_challenge_metric_type(mc.challenge_type, mc.metric_type),
          'challenge_type', mc.challenge_type,
          'rank', lb.rank,
          'progress_value', round(coalesce(lb.progress_value, 0)::numeric, 1),
          'entrants', lb.entrants
        )
        order by mc.ends_at
      )
      from my_challenges mc
      cross join lateral (
        select
          max(l.rank) filter (where l.user_id = viewer) as rank,
          max(l.progress_value) filter (where l.user_id = viewer) as progress_value,
          count(*)::integer as entrants
        from public.get_challenge_leaderboard(mc.id) l
      ) lb
    ), '[]'::jsonb),
    'mates_out', (select count(*) from mates),
    'mates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', top_mates.user_id,
          'username', top_mates.username,
          'avatar_url', top_mates.avatar_url,
          'nights_out', top_mates.nights_out
        )
        order by top_mates.nights_out desc, top_mates.username
      )
      from (
        select mates.*
        from mates
        order by mates.nights_out desc, mates.username
        limit 5
      ) top_mates
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke execute on function public.get_weekly_recap(date) from public, anon;
grant execute on function public.get_weekly_recap(date) to authenticated;

comment on function public.get_weekly_recap(date) is
  'The signed-in user''s week (Monday-Sunday drinking days): nights, units, reach, streak, challenges and mates. Null week means the current week.';

create or replace function public.queue_weekly_recaps(
  force boolean default false,
  only_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := timezone('Europe/Copenhagen', now());
  this_week date := public.beerva_drinking_week(now());
  window_start timestamp with time zone := (this_week::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  queued integer := 0;
  candidate record;
  claimed_user uuid;
  new_notification_id uuid;
begin
  if not coalesce(force, false) and (
    extract(isodow from local_now) <> 7
    or local_now::time < time '18:00'
    or local_now::time >= time '19:30'
  ) then
    return 0;
  end if;

  for candidate in
    select
      p.id as user_id,
      (
        select count(distinct public.beerva_drinking_day(coalesce(s.started_at, s.created_at)))
        from public.sessions s
        where s.user_id = p.id
          and s.status = 'published'
          and coalesce(s.started_at, s.created_at) >= window_start
      )::integer as nights_out,
      (
        select count(distinct f.following_id)
        from public.follows f
        join public.sessions s
          on s.user_id = f.following_id
         and s.status = 'published'
         and coalesce(s.started_at, s.created_at) >= window_start
        where f.follower_id = p.id
      )::integer as mates_out,
      (
        select count(*)
        from (
          select v.viewer_id
          from public.session_views v
          join public.sessions s on s.id = v.session_id
          where s.user_id = p.id
            and s.status = 'published'
            and coalesce(s.started_at, s.created_at) >= window_start
          union
          select v.viewer_id
          from public.pub_crawl_views v
          join public.pub_crawls c on c.id = v.pub_crawl_id
          where c.user_id = p.id
            and c.status = 'published'
            and c.published_at >= window_start
        ) seen
      )::integer as seen_by
    from public.profiles p
    where p.engagement_pushes_enabled
      and (only_user_id is null or p.id = only_user_id)
      and (
        exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
        or exists (select 1 from public.native_push_tokens nt where nt.user_id = p.id)
      )
      and not exists (
        select 1
        from public.engagement_push_log l
        where l.user_id = p.id
          and l.kind = 'weekly_recap'
          and l.week_start = this_week
      )
  loop
    if candidate.nights_out = 0 and candidate.mates_out = 0 then
      continue;
    end if;

    claimed_user := null;
    insert into public.engagement_push_log (user_id, kind, week_start)
    values (candidate.user_id, 'weekly_recap', this_week)
    on conflict (user_id, kind, week_start) do nothing
    returning user_id into claimed_user;

    if claimed_user is null then
      continue;
    end if;

    insert into public.notifications (user_id, actor_id, type, reference_id, metadata)
    values (
      candidate.user_id,
      candidate.user_id,
      'weekly_recap',
      null,
      jsonb_build_object(
        'week_start', this_week,
        'nights_out', candidate.nights_out,
        'mates_out', candidate.mates_out,
        'seen_by', candidate.seen_by
      )
    )
    returning id into new_notification_id;

    update public.engagement_push_log
    set notification_id = new_notification_id
    where engagement_push_log.user_id = candidate.user_id
      and engagement_push_log.kind = 'weekly_recap'
      and engagement_push_log.week_start = this_week;

    queued := queued + 1;
  end loop;

  return queued;
end;
$$;

revoke execute on function public.queue_weekly_recaps(boolean, uuid) from public, anon, authenticated;

comment on function public.queue_weekly_recaps(boolean, uuid) is
  'Queues one weekly_recap notification per eligible user per week between 18:00 and 19:30 Copenhagen time on Sundays. For testing: force skips the time check, only_user_id limits it to one user.';

-- Every 15 minutes, 16:00-18:59 UTC on Sundays: covers 18:00-19:30 Copenhagen
-- in both winter and summer time. The function decides whether it is time.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-weekly-recap') then
    perform cron.unschedule('beerva-weekly-recap');
  end if;

  perform cron.schedule(
    'beerva-weekly-recap',
    '*/15 16-18 * * 0',
    $job$select public.queue_weekly_recaps();$job$
  );
end;
$$;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Run the test**

Run: `npm run test:weekly-recap`
Expected: FAIL at `buildWeeklyRecapCopy is not a function` (Task 3).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261127140000_add_weekly_recap.sql
git commit -m "feat: add weekly recap RPC and sunday scheduler"
```

---

### Task 3: Push Copy And send-push

**Files:**
- Modify: `supabase/functions/_shared/engagementCopy.ts`
- Modify: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Copy builder**

In `supabase/functions/_shared/engagementCopy.ts`, replace:

```typescript
  return {
    title: "Weekend's here 🍻",
    body: 'Heading out tonight? Log your first round on Beerva.',
  };
};
```

with:

```typescript
  return {
    title: "Weekend's here 🍻",
    body: 'Heading out tonight? Log your first round on Beerva.',
  };
};

export const buildWeeklyRecapCopy = (metadata?: EngagementMetadata | null): EngagementCopy => {
  const nightsOut = toCount(metadata?.nights_out);
  const seenBy = toCount(metadata?.seen_by);
  const matesOut = toCount(metadata?.mates_out);
  const title = 'Your week on Beerva 🍻';
  const nights = `${nightsOut} ${nightsOut === 1 ? 'night' : 'nights'}`;

  if (nightsOut > 0 && seenBy > 0) {
    return { title, body: `${nights} out, seen by ${seenBy} ${seenBy === 1 ? 'mate' : 'mates'}. Tap for your recap.` };
  }
  if (nightsOut > 0) {
    return { title, body: `${nights} out this week. Tap for your recap.` };
  }
  if (matesOut > 0) {
    return { title, body: `${matesOut} ${matesOut === 1 ? 'mate was' : 'mates were'} out this week. See what you missed.` };
  }
  return { title, body: 'Your weekly recap is ready.' };
};
```

- [ ] **Step 2: send-push import, type and metadata**

In `supabase/functions/send-push/index.ts`, replace:

```typescript
import { buildFridayNudgeCopy } from '../_shared/engagementCopy.ts';
```

with:

```typescript
import { buildFridayNudgeCopy, buildWeeklyRecapCopy } from '../_shared/engagementCopy.ts';
```

In `supabase/functions/send-push/index.ts`, replace:

```typescript
    | 'friday_nudge';
```

with:

```typescript
    | 'friday_nudge'
    | 'weekly_recap';
```

In `supabase/functions/send-push/index.ts`, replace:

```typescript
    mates_out?: number | string | null;
  } | null;
};
```

with:

```typescript
    mates_out?: number | string | null;
    nights_out?: number | string | null;
    seen_by?: number | string | null;
  } | null;
};
```

- [ ] **Step 3: send-push copy and URL**

In `supabase/functions/send-push/index.ts`, replace:

```typescript
  } else if (record.type === 'friday_nudge') {
    const nudgeCopy = buildFridayNudgeCopy(record.metadata);
    title = nudgeCopy.title;
    bodyText = nudgeCopy.body;
  }
```

with:

```typescript
  } else if (record.type === 'friday_nudge') {
    const nudgeCopy = buildFridayNudgeCopy(record.metadata);
    title = nudgeCopy.title;
    bodyText = nudgeCopy.body;
  } else if (record.type === 'weekly_recap') {
    const recapCopy = buildWeeklyRecapCopy(record.metadata);
    title = recapCopy.title;
    bodyText = recapCopy.body;
  }
```

In `supabase/functions/send-push/index.ts`, replace:

```typescript
  } else if (record.type === 'friday_nudge') {
    url = `/?tab=record&notificationId=${encodeURIComponent(record.id)}`;
```

with:

```typescript
  } else if (record.type === 'friday_nudge') {
    url = `/?tab=record&notificationId=${encodeURIComponent(record.id)}`;
  } else if (record.type === 'weekly_recap' && record.metadata?.week_start) {
    url = `/?recap=${encodeURIComponent(record.metadata.week_start)}&notificationId=${encodeURIComponent(record.id)}`;
```

- [ ] **Step 4: Run the test**

Run: `npm run test:weekly-recap`
Expected: FAIL at the missing `src/lib/recapLaunchParams.ts` (Task 4).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/engagementCopy.ts supabase/functions/send-push/index.ts
git commit -m "feat: send weekly recap pushes"
```

---

### Task 4: Client Modules

**Files:**
- Create: `src/lib/recapLaunchParams.ts`
- Create: `src/lib/weeklyRecap.ts`

- [ ] **Step 1: Launch params**

Create `src/lib/recapLaunchParams.ts` with this complete content:

```typescript
// Parses "?recap=YYYY-MM-DD&notificationId=..." from push links. Kept free of
// imports so the web and Android routing code can share it.

export type RecapLaunchParams = {
  weekStart: string;
  notificationId: string | null;
};

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const getRecapLaunchParamsFromSearch = (search: string): RecapLaunchParams | null => {
  const params = new URLSearchParams(search);
  const weekStart = params.get('recap')?.trim() || '';
  if (!WEEK_START_PATTERN.test(weekStart)) return null;

  return {
    weekStart,
    notificationId: params.get('notificationId')?.trim() || null,
  };
};
```

- [ ] **Step 2: Recap module**

Create `src/lib/weeklyRecap.ts` with this complete content:

```typescript
import { supabase } from './supabase';
import { withTimeout } from './timeouts';

const WEEKLY_RECAP_TIMEOUT_MS = 15000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type WeeklyRecapChallenge = {
  slug: string;
  title: string;
  metricType: 'alcohol_units' | 'true_pints';
  challengeType: string;
  rank: number | null;
  progressValue: number;
  entrants: number;
};

export type WeeklyRecapMate = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  nightsOut: number;
};

export type WeeklyRecap = {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  nightsOut: number;
  units: number;
  drinks: number;
  posts: number;
  pubs: number;
  topPub: string | null;
  seenBy: number;
  cheers: number;
  comments: number;
  bestRun: number;
  weeklyStreak: number;
  challenges: WeeklyRecapChallenge[];
  matesOut: number;
  mates: WeeklyRecapMate[];
};

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toCount = (value: unknown) => Math.max(0, Math.round(toNumber(value)));

const toText = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export const mapWeeklyRecap = (row: any): WeeklyRecap => ({
  weekStart: toText(row?.week_start) || '',
  weekEnd: toText(row?.week_end) || '',
  isCurrentWeek: row?.is_current_week === true,
  nightsOut: toCount(row?.nights_out),
  units: Math.round(toNumber(row?.units) * 10) / 10,
  drinks: toCount(row?.drinks),
  posts: toCount(row?.posts),
  pubs: toCount(row?.pubs),
  topPub: toText(row?.top_pub),
  seenBy: toCount(row?.seen_by),
  cheers: toCount(row?.cheers),
  comments: toCount(row?.comments),
  bestRun: toCount(row?.best_run),
  weeklyStreak: toCount(row?.weekly_streak),
  challenges: asArray(row?.challenges)
    .filter((challenge) => toText(challenge?.slug))
    .map((challenge) => ({
      slug: toText(challenge.slug) as string,
      title: toText(challenge.title) || 'Challenge',
      metricType: challenge.metric_type === 'alcohol_units' ? 'alcohol_units' : 'true_pints',
      challengeType: toText(challenge.challenge_type) || 'leaderboard',
      rank: challenge.rank === null || challenge.rank === undefined ? null : toCount(challenge.rank) || null,
      progressValue: toNumber(challenge.progress_value),
      entrants: toCount(challenge.entrants),
    })),
  matesOut: toCount(row?.mates_out),
  mates: asArray(row?.mates)
    .filter((mate) => toText(mate?.user_id))
    .map((mate) => ({
      userId: toText(mate.user_id) as string,
      username: toText(mate.username),
      avatarUrl: toText(mate.avatar_url),
      nightsOut: toCount(mate.nights_out),
    })),
});

export const isRecapEmpty = (recap: WeeklyRecap) => recap.nightsOut === 0 && recap.matesOut === 0;

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
};

// "23–29 Nov", "30 Nov – 6 Dec", "28 Dec – 3 Jan". Parsed by hand so device
// time zones never shift the dates.
export const formatWeekRange = (weekStart: string, weekEnd: string) => {
  const start = parseIsoDate(weekStart);
  const end = parseIsoDate(weekEnd);
  if (!start.day || !end.day) return '';
  if (start.month === end.month) {
    return `${start.day}–${end.day} ${MONTHS[end.month - 1]}`;
  }
  return `${start.day} ${MONTHS[start.month - 1]} – ${end.day} ${MONTHS[end.month - 1]}`;
};

export const shiftWeek = (weekStart: string, weeks: number) => {
  const { year, month, day } = parseIsoDate(weekStart);
  const shifted = new Date(Date.UTC(year, month - 1, day + weeks * 7));
  return shifted.toISOString().slice(0, 10);
};

export const fetchWeeklyRecap = async (weekStart: string | null): Promise<WeeklyRecap | null> => {
  const { data, error } = await withTimeout(
    supabase.rpc('get_weekly_recap', { target_week_start: weekStart || null }),
    WEEKLY_RECAP_TIMEOUT_MS,
    'Your week is taking too long to load.'
  );
  if (error) throw error;
  return data ? mapWeeklyRecap(data) : null;
};
```

- [ ] **Step 3: Run the test and type-check**

Run: `npm run test:weekly-recap`
Expected: FAIL at the navigator checks (Task 5).

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/recapLaunchParams.ts src/lib/weeklyRecap.ts
git commit -m "feat: add weekly recap client modules"
```

---

### Task 5: The Screen And Navigation

**Files:**
- Create: `src/screens/WeeklyRecapScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/lib/nativeNotificationRouting.ts`

- [ ] **Step 1: Write the screen**

Create `src/screens/WeeklyRecapScreen.tsx` with this complete content:

```tsx
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
  ArrowLeft,
  Beer,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  MapPin,
  MessageCircle,
  RefreshCw,
  Trophy,
} from 'lucide-react-native';
import { CachedImage } from '../components/CachedImage';
import { formatChallengeProgress, formatChallengeRank } from '../lib/challenges';
import { fetchWeeklyRecap, formatWeekRange, isRecapEmpty, shiftWeek, WeeklyRecap } from '../lib/weeklyRecap';
import { formatNightsInARow, formatWeeklyStreak } from '../lib/weeklyStreaks';
import { colors } from '../theme/colors';
import { radius } from '../theme/layout';
import { typography } from '../theme/typography';
import { usePwaParityInsets } from '../theme/usePwaParityInsets';

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => (
  `${count} ${count === 1 ? singular : pluralForm}`
);

const StatTile = ({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) => (
  <View style={styles.tile}>
    {icon}
    <Text style={styles.tileValue} numberOfLines={1}>{value}</Text>
    <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
  </View>
);

export const WeeklyRecapScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { screenTopBarPaddingTop } = usePwaParityInsets();
  const routeWeek = typeof route?.params?.weekStart === 'string' ? route.params.weekStart : null;

  const [selectedWeek, setSelectedWeek] = useState<string | null>(routeWeek);
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setErrorMessage(null);
      fetchWeeklyRecap(selectedWeek)
        .then((next) => {
          if (!cancelled) setRecap(next);
        })
        .catch((error) => {
          console.error('Weekly recap error:', error);
          if (!cancelled) setErrorMessage('Couldn’t load your week.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [selectedWeek, reloadToken])
  );

  const goToWeek = useCallback((weeks: number) => {
    if (!recap?.weekStart) return;
    setSelectedWeek(shiftWeek(recap.weekStart, weeks));
  }, [recap?.weekStart]);

  const renderBody = () => {
    if (loading && !recap) {
      return <ActivityIndicator style={styles.loader} color={colors.primary} />;
    }

    if (errorMessage) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.mutedText}>{errorMessage}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setReloadToken((value) => value + 1)}>
            <RefreshCw color={colors.background} size={15} />
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!recap) return null;

    if (isRecapEmpty(recap)) {
      return (
        <View style={styles.centerState}>
          <Beer color={colors.textMuted} size={30} />
          <Text style={styles.emptyTitle}>Quiet week</Text>
          <Text style={styles.mutedText}>Nobody you follow logged a night out this week.</Text>
          {recap.isCurrentWeek ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Record' })}>
              <Beer color={colors.background} size={15} />
              <Text style={styles.primaryButtonText}>Log a night</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }

    return (
      <>
        <View style={styles.hero}>
          <Text style={styles.heroValue}>{plural(recap.nightsOut, 'night')} out</Text>
          <Text style={styles.heroMeta}>
            {recap.units.toFixed(1)} units · {plural(recap.drinks, 'drink')} · {plural(recap.posts, 'post')}
          </Text>
        </View>

        <View style={styles.tiles}>
          <StatTile icon={<Eye color={colors.primary} size={18} />} value={String(recap.seenBy)} label="Seen by" />
          <StatTile icon={<Beer color={colors.primary} size={18} />} value={String(recap.cheers)} label="Cheers" />
          <StatTile icon={<MessageCircle color={colors.primary} size={18} />} value={String(recap.comments)} label="Comments" />
          <StatTile
            icon={<MapPin color={colors.primary} size={18} />}
            value={String(recap.pubs)}
            label={recap.topPub ? `Pubs · top: ${recap.topPub}` : 'Pubs'}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <CalendarCheck color={colors.primary} size={18} />
            <Text style={styles.cardTitle}>
              {recap.weeklyStreak > 0 ? formatWeeklyStreak(recap.weeklyStreak) : 'No weekly streak yet'}
            </Text>
          </View>
          {recap.bestRun >= 2 ? (
            <Text style={styles.cardMeta}>Best run: 🔥 {formatNightsInARow(recap.bestRun)}</Text>
          ) : null}
        </View>

        {recap.challenges.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Trophy color={colors.primary} size={18} />
              <Text style={styles.cardTitle}>Challenges</Text>
            </View>
            {recap.challenges.map((challenge) => (
              <TouchableOpacity
                key={challenge.slug}
                style={styles.listRow}
                onPress={() => navigation.navigate('ChallengeDetail', { challengeSlug: challenge.slug })}
                activeOpacity={0.75}
              >
                <Text style={styles.listTitle} numberOfLines={1}>{challenge.title}</Text>
                <Text style={styles.listMeta}>
                  {formatChallengeRank(challenge.rank)} of {challenge.entrants} · {formatChallengeProgress(challenge.progressValue, null, 'leaderboard', challenge.metricType)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {recap.mates.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Who was out</Text>
            {recap.mates.map((mate) => (
              <TouchableOpacity
                key={mate.userId}
                style={styles.mateRow}
                onPress={() => navigation.navigate('UserProfile', { userId: mate.userId })}
                activeOpacity={0.75}
              >
                <CachedImage
                  uri={mate.avatarUrl}
                  fallbackUri={`https://i.pravatar.cc/150?u=${mate.userId}`}
                  style={styles.mateAvatar}
                  recyclingKey={`recap-mate-${mate.userId}-${mate.avatarUrl || 'fallback'}`}
                  accessibilityLabel={`${mate.username || 'Someone'}'s avatar`}
                />
                <Text style={styles.listTitle} numberOfLines={1}>{mate.username || 'Someone'}</Text>
                <Text style={styles.listMeta}>{plural(mate.nightsOut, 'night')} out</Text>
              </TouchableOpacity>
            ))}
            {recap.matesOut > recap.mates.length ? (
              <Text style={styles.cardMeta}>+{recap.matesOut - recap.mates.length} more</Text>
            ) : null}
          </View>
        ) : null}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: screenTopBarPaddingTop }]}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft color={colors.text} size={21} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Your week</Text>
        <View style={styles.iconButtonPlaceholder} />
      </View>

      <View style={styles.weekPicker}>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => goToWeek(-1)}
          disabled={!recap}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
        >
          <ChevronLeft color={colors.text} size={20} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>
          {recap ? formatWeekRange(recap.weekStart, recap.weekEnd) : ' '}
        </Text>
        <TouchableOpacity
          style={[styles.iconButton, !recap || recap.isCurrentWeek ? styles.iconButtonDisabled : null]}
          onPress={() => goToWeek(1)}
          disabled={!recap || recap.isCurrentWeek}
          accessibilityRole="button"
          accessibilityLabel="Next week"
        >
          <ChevronRight color={colors.text} size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {renderBody()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screenTitle: {
    ...typography.h3,
    fontSize: 18,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  iconButtonDisabled: {
    opacity: 0.35,
  },
  iconButtonPlaceholder: {
    width: 38,
    height: 38,
  },
  weekPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  weekLabel: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  loader: {
    marginTop: 48,
  },
  centerState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 48,
  },
  emptyTitle: {
    ...typography.h3,
  },
  mutedText: {
    ...typography.bodyMuted,
    textAlign: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 14,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  heroValue: {
    ...typography.h1,
    color: colors.primary,
  },
  heroMeta: {
    ...typography.bodyMuted,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 14,
    gap: 4,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  tileValue: {
    ...typography.h2,
    color: colors.text,
  },
  tileLabel: {
    ...typography.caption,
  },
  card: {
    padding: 14,
    gap: 8,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  cardMeta: {
    ...typography.caption,
  },
  listRow: {
    gap: 2,
    paddingVertical: 6,
  },
  listTitle: {
    ...typography.body,
    color: colors.text,
    flexShrink: 1,
  },
  listMeta: {
    ...typography.caption,
  },
  mateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  mateAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});
```

- [ ] **Step 2: Register the route and web launch**

In `src/navigation/RootNavigator.tsx`, after the line `import { PostDetailScreen } from '../screens/PostDetailScreen';` add:

```typescript
import { WeeklyRecapScreen } from '../screens/WeeklyRecapScreen';
import { getRecapLaunchParamsFromSearch, RecapLaunchParams } from '../lib/recapLaunchParams';
```

In `src/navigation/RootNavigator.tsx`, replace:

```typescript
  AdminTools: { initialSegment?: 'submissions' } | undefined;
};
```

with:

```typescript
  AdminTools: { initialSegment?: 'submissions' } | undefined;
  WeeklyRecap: { weekStart?: string; notificationId?: string | null } | undefined;
};
```

In `src/navigation/RootNavigator.tsx`, replace:

```typescript
      AdminTools: 'admin',
```

with:

```typescript
      AdminTools: 'admin',
      WeeklyRecap: 'recap/:weekStart?',
```

In `src/navigation/RootNavigator.tsx`, replace:

```tsx
                  <Stack.Screen name="AdminTools" component={AdminToolsScreen} />
```

with:

```tsx
                  <Stack.Screen name="AdminTools" component={AdminToolsScreen} />
                  <Stack.Screen name="WeeklyRecap" component={WeeklyRecapScreen} />
```

In `src/navigation/RootNavigator.tsx`, replace:

```typescript
const clearChallengeLaunchParams = () => {
```

with:

```typescript
const getRecapLaunchParamsFromUrl = (): RecapLaunchParams | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return getRecapLaunchParamsFromSearch(window.location.search);
};

const clearRecapLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('recap');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const clearChallengeLaunchParams = () => {
```

In `src/navigation/RootNavigator.tsx`, replace:

```typescript
  const pendingChugVerificationOpenRef = useRef<ChugVerificationLaunchParams | null>(getChugVerificationLaunchParamsFromUrl());
```

with:

```typescript
  const pendingChugVerificationOpenRef = useRef<ChugVerificationLaunchParams | null>(getChugVerificationLaunchParamsFromUrl());
  const pendingRecapOpenRef = useRef<RecapLaunchParams | null>(getRecapLaunchParamsFromUrl());
```

In `src/navigation/RootNavigator.tsx`, replace:

```typescript
    const pendingChallengeOpen = pendingChallengeOpenRef.current;
```

with:

```typescript
    const pendingRecapOpen = pendingRecapOpenRef.current;
    if (pendingRecapOpen) {
      pendingRecapOpenRef.current = null;
      navigationRef.navigate('WeeklyRecap', {
        weekStart: pendingRecapOpen.weekStart,
        notificationId: pendingRecapOpen.notificationId,
      });
      markNotificationRead(pendingRecapOpen.notificationId);
      clearRecapLaunchParams();
      return;
    }

    const pendingChallengeOpen = pendingChallengeOpenRef.current;
```

- [ ] **Step 3: Android push launch**

In `src/lib/nativeNotificationRouting.ts`, after the line `import { getPostLaunchParamsFromSearch } from './postTargets';` add:

```typescript
import { getRecapLaunchParamsFromSearch } from './recapLaunchParams';
```

In `src/lib/nativeNotificationRouting.ts`, replace:

```typescript
  | { kind: 'challenge'; challengeSlug: string; notificationId?: string | null };
```

with:

```typescript
  | { kind: 'challenge'; challengeSlug: string; notificationId?: string | null }
  | { kind: 'recap'; weekStart: string; notificationId?: string | null };
```

In `src/lib/nativeNotificationRouting.ts`, replace:

```typescript
  const challenge = getChallengeLaunchParamsFromSearch(search);
  if (challenge) {
```

with:

```typescript
  const recap = getRecapLaunchParamsFromSearch(search);
  if (recap) {
    return { kind: 'recap', weekStart: recap.weekStart, notificationId: recap.notificationId };
  }

  const challenge = getChallengeLaunchParamsFromSearch(search);
  if (challenge) {
```

In `src/navigation/RootNavigator.tsx`, replace:

```typescript
    if (target.kind === 'record') {
      navigationRef.navigate('MainTabs', { screen: 'Record' });
      return true;
    }
```

with:

```typescript
    if (target.kind === 'recap') {
      navigationRef.navigate('WeeklyRecap', {
        weekStart: target.weekStart,
        notificationId: target.notificationId,
      });
      markNotificationRead(target.notificationId);
      return true;
    }

    if (target.kind === 'record') {
      navigationRef.navigate('MainTabs', { screen: 'Record' });
      return true;
    }
```

- [ ] **Step 4: Run the tests and type-check**

Run: `npm run test:weekly-recap`
Expected: FAIL at `| 'weekly_recap'` in `NotificationsScreen.tsx` (Task 6).

Run: `npm run test:native-notification-routing && npm run test:navigation-back && npm run test:challenges`
Expected: all pass.

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/screens/WeeklyRecapScreen.tsx src/navigation/RootNavigator.tsx src/lib/nativeNotificationRouting.ts
git commit -m "feat: add weekly recap screen and push routing"
```

---

### Task 6: Notifications List Entry

**Files:**
- Modify: `src/screens/NotificationsScreen.tsx`

- [ ] **Step 1: Imports and type**

In `src/screens/NotificationsScreen.tsx`, replace:

```typescript
import { buildFridayNudgeCopy } from '../../supabase/functions/_shared/engagementCopy';
```

with:

```typescript
import { buildFridayNudgeCopy, buildWeeklyRecapCopy } from '../../supabase/functions/_shared/engagementCopy';
```

In `src/screens/NotificationsScreen.tsx`, replace:

```typescript
import { ArrowLeft, Beer, Check, Coffee, MapPin, Megaphone, MessageCircle, PartyPopper, Timer, UserPlus, XCircle } from 'lucide-react-native';
```

with:

```typescript
import { ArrowLeft, Beer, CalendarCheck, Check, Coffee, MapPin, Megaphone, MessageCircle, PartyPopper, Timer, UserPlus, XCircle } from 'lucide-react-native';
```

In `src/screens/NotificationsScreen.tsx`, replace:

```typescript
  | 'beverage_submission'
  | 'friday_nudge';
```

with:

```typescript
  | 'beverage_submission'
  | 'friday_nudge'
  | 'weekly_recap';
```

- [ ] **Step 2: Navigation helper**

In `src/screens/NotificationsScreen.tsx`, replace:

```typescript
  const openRecord = useCallback(() => {
```

with:

```typescript
  const openRecap = useCallback((weekStart?: string | null) => {
    navigation.navigate('WeeklyRecap', weekStart ? { weekStart } : undefined);
  }, [navigation]);

  const openRecord = useCallback(() => {
```

- [ ] **Step 3: The card**

In `src/screens/NotificationsScreen.tsx`, replace:

```tsx
    if (item.type === 'friday_nudge') {
```

with:

```tsx
    if (item.type === 'weekly_recap') {
      const recapCopy = buildWeeklyRecapCopy(item.metadata);
      return (
        <View style={[styles.card, !item.read && styles.unreadCard]}>
          <View style={styles.avatarContainer}>
            <View style={styles.officialAvatar}>
              <Image source={beervaLogo} style={styles.officialLogo} />
            </View>
          </View>
          <View style={styles.content}>
            <Text style={styles.username}>{recapCopy.title}</Text>
            <Text style={styles.officialNotificationBody}>{recapCopy.body}</Text>
            <Text style={styles.time}>{getTimeAgo(item.created_at)}</Text>
            <TouchableOpacity
              style={styles.hangoverActionButton}
              onPress={() => openRecap(item.metadata?.week_start)}
              activeOpacity={0.76}
              accessibilityRole="button"
              accessibilityLabel="See your week"
            >
              <CalendarCheck color={colors.background} size={16} />
              <Text style={styles.hangoverActionText}>See your week</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (item.type === 'friday_nudge') {
```

In `src/screens/NotificationsScreen.tsx`, replace:

```typescript
openPost, openProfile, openRecord, respondToInvite, respondingInviteIds]);
```

with:

```typescript
openPost, openProfile, openRecap, openRecord, respondToInvite, respondingInviteIds]);
```

- [ ] **Step 4: Run the test**

Run: `npm run test:weekly-recap`
Expected: FAIL at `navigation.navigate('WeeklyRecap')` in `ProfileScreen.tsx` (Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/screens/NotificationsScreen.tsx
git commit -m "feat: show weekly recaps in notifications"
```

---

### Task 7: Profile Entry

**Files:**
- Modify: `src/screens/ProfileScreen.tsx`

- [ ] **Step 1: Link under the streak badge**

In `src/screens/ProfileScreen.tsx`, replace:

```tsx
          isOwnProfile
        />
```

with:

```tsx
          isOwnProfile
        />
        <TouchableOpacity
          style={styles.weekRecapLink}
          onPress={() => navigation.navigate('WeeklyRecap')}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="See your week"
        >
          <Text style={styles.weekRecapLinkText}>See your week →</Text>
        </TouchableOpacity>
```

In `src/screens/ProfileScreen.tsx`, replace:

```typescript
  pushButton: {
```

with:

```typescript
  weekRecapLink: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  weekRecapLinkText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  pushButton: {
```

- [ ] **Step 2: Run the tests and type-check**

Run: `npm run test:weekly-recap && npm run test:friday-nudge && npm run test:weekly-streaks && npm run test:profile-panel && npm run test:app-theme-screens`
Expected: all print their "passed" line.

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/ProfileScreen.tsx
git commit -m "feat: link to the weekly recap from the profile"
```

---

### Task 8: Deploy And Verify

- [ ] **Step 1: Run every test script**

Run: `for t in $(node -e "console.log(Object.keys(require('./package.json').scripts).filter(k=>k.startsWith('test:')).join(' '))"); do npm run -s $t >/dev/null 2>&1 || echo "FAIL $t"; done`
Expected: no `FAIL` lines (`test:serve-dist` needs a prior `npm run build:web`).

- [ ] **Step 2: Apply and deploy**

Run: `npx supabase db push`
Run: `npx supabase functions deploy send-push`

- [ ] **Step 3: Look at your own recap in the Supabase SQL editor**

```sql
select set_config('request.jwt.claim.sub', '<your user id>', false);
select jsonb_pretty(public.get_weekly_recap(null));
select jsonb_pretty(public.get_weekly_recap(current_date - 7));
```

Expected: your nights, units and pubs for this week and last week, matching what you posted.

- [ ] **Step 4: Send yourself a recap**

```sql
select public.queue_weekly_recaps(true, '<your user id>');
```

Expected: `1` if you or a mate were out this week. Tapping the push opens "Your week" for this week. Then clear the log row so the real Sunday run still includes you:

```sql
delete from public.engagement_push_log
where user_id = '<your user id>'
  and kind = 'weekly_recap'
  and week_start = public.beerva_drinking_week(now());
```

- [ ] **Step 5: Check the app**

- **Push:** the push opens the screen on the PWA and on Android.
- **Notifications list:** the list shows the recap with "See your week".
- **Profile:** "See your week →" opens the current week.
- **Week arrows:** "‹" goes back one week, and "›" is disabled on the current week.
- **Links:** challenge rows open the challenge, and mates open their profiles.
- **Quiet week:** a quiet week shows "Quiet week" (with "Log a night" only on the current week).

---

## Notes

- **Push budget:** Friday nudge plus Sunday recap is at most 2 automated pushes per person per week. Both respect the same opt-out toggle.
- **Win-back:** people who stopped posting still get a Sunday recap when their mates were out ("4 mates were out this week. See what you missed."). That's the intended way back in. If they turn it off, it stops.
- **Cost:** `get_weekly_recap` reads one user's week plus the leaderboards of their joined challenges. It only runs when someone opens the screen.
