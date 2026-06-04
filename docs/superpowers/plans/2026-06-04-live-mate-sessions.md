# Live Mate Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a red pulsating live button in the Feed header whenever followed users have active drinking sessions or active pub crawls, and open a top sheet with their current pub and true-pint progress.

**Architecture:** Add `public.live_mate_sessions` as a trigger-maintained live-state table, expose it through a follower-aware `get_live_mate_sessions()` RPC, and keep the client as a thin realtime consumer. The Feed screen uses a focused live-session hook plus two small UI components: a stable pulsating circular button and a top-anchored sheet.

**Tech Stack:** Supabase Postgres/RLS/RPC/triggers/realtime publication, Expo React Native, TypeScript, React hooks, React Native `Animated`, lucide-react-native, Node source-level regression scripts.

---

## File Structure

### Create

- `supabase/migrations/20260604130000_add_live_mate_sessions.sql`
  - Creates the live table, indexes, RLS policy, realtime publication entry, refresh functions, repair function, RPC, triggers, and initial repair backfill.
- `src/lib/liveMateSessions.ts`
  - Defines the app-facing live mate type, maps RPC rows, fetches the RPC, and formats count/true-pint/elapsed labels.
- `src/lib/useLiveMateSessions.ts`
  - Owns live mate fetch state, auth/focus refresh hooks, and Supabase realtime refresh wiring.
- `src/components/LiveMateButton.tsx`
  - Circular red live button with stable core and smooth animated pulse rings.
- `src/components/LiveMateSessionsSheet.tsx`
  - Top-anchored modal sheet that lists live mates.
- `scripts/liveMateSessions.test.js`
  - Source and helper checks for the migration, client API, hook, components, and Feed wiring.

### Modify

- `package.json`
  - Adds `test:live-mates`.
- `src/screens/FeedScreen.tsx`
  - Imports the live hook/components, refreshes live state on focus, renders the live button between Beerva and notifications, and opens/closes the top sheet.
- `scripts/feedHeader.test.js`
  - Adds a focused assertion that the live button is wired between the logo area and notification bell.

### Intentionally Unchanged

- `src/screens/RecordScreen.tsx`
  - Existing session/crawl start, drink, publish, and cancel flows continue writing their source tables; database triggers maintain live state.
- `src/lib/pubCrawlsApi.ts`
  - Existing pub crawl RPC calls remain the source of truth; trigger maintenance reacts to their source-table writes.
- Push notification code
  - Live presence is in-app only for this feature.

---

## Task 1: Add Database Live-State Contract

**Files:**
- Create: `scripts/liveMateSessions.test.js`
- Create: `supabase/migrations/20260604130000_add_live_mate_sessions.sql`
- Modify: `package.json`

- [ ] **Step 1: Write the failing migration contract test**

Create `scripts/liveMateSessions.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260604130000_add_live_mate_sessions.sql');
const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

const loadTypeScriptModule = (relativePath, mocks = {}) => {
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
  compiledModule.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return Module.prototype.require.call(compiledModule, request);
  };
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

assert.match(migrationSql, /create table if not exists public\.live_mate_sessions/, 'migration should create live_mate_sessions');
assert.match(migrationSql, /session_id uuid not null references public\.sessions\(id\) on delete cascade/, 'live rows should point at the active session or crawl stop');
assert.match(migrationSql, /pub_crawl_id uuid references public\.pub_crawls\(id\) on delete cascade/, 'live rows should optionally point at an active pub crawl');
assert.match(migrationSql, /true_pints double precision not null default 0/, 'live rows should cache true-pint progress');
assert.match(migrationSql, /constraint live_mate_sessions_user_unique unique \(user_id\)/, 'a user should have at most one live row');
assert.match(migrationSql, /constraint live_mate_sessions_session_unique unique \(session_id\)/, 'a session should have at most one live row');
assert.match(migrationSql, /live_mate_sessions_last_activity_idx/, 'live rows should be indexed by latest activity');
assert.match(migrationSql, /alter table public\.live_mate_sessions enable row level security/, 'live rows should enable RLS');
assert.match(migrationSql, /follows\.follower_id = \(select auth\.uid\(\)\)[\s\S]*follows\.following_id = live_mate_sessions\.user_id/, 'direct select policy should be follower-aware');
assert.match(migrationSql, /alter publication supabase_realtime add table public\.live_mate_sessions/, 'live rows should be added to the realtime publication');
assert.match(migrationSql, /create or replace function public\.get_live_session_true_pints/, 'migration should add normal-session true-pint helper');
assert.match(migrationSql, /public\.beerva_serving_volume_ml\(session_beers\.volume\)/, 'true-pint helper should use the shared serving volume parser');
assert.match(migrationSql, /\/ 568\.0/, 'true-pint helper should normalize to Beerva true pints');
assert.match(migrationSql, /round\([^;]+::numeric,\s*1\)::double precision/, 'true-pint helper should round to one decimal');
assert.match(migrationSql, /create or replace function public\.get_live_pub_crawl_true_pints/, 'migration should add crawl true-pint helper');
assert.match(migrationSql, /create or replace function public\.refresh_live_mate_session_for_session/, 'session refresh function should exist');
assert.match(migrationSql, /create or replace function public\.refresh_live_mate_session_for_pub_crawl/, 'pub crawl refresh function should exist');
assert.match(migrationSql, /create or replace function public\.repair_live_mate_sessions/, 'repair function should exist');
assert.match(migrationSql, /create or replace function public\.get_live_mate_sessions\(\)/, 'viewer RPC should exist');
assert.match(migrationSql, /security definer/g, 'live functions should use security definer where needed');
assert.match(migrationSql, /grant execute on function public\.get_live_mate_sessions\(\) to authenticated/, 'authenticated users should execute the viewer RPC');
assert.match(migrationSql, /revoke execute on function public\.repair_live_mate_sessions\(\) from public, anon, authenticated/, 'clients should not execute the repair function');
assert.match(migrationSql, /create trigger sessions_live_mate_refresh/, 'sessions trigger should maintain live rows');
assert.match(migrationSql, /create trigger session_beers_live_mate_refresh/, 'session_beers trigger should maintain true-pint totals');
assert.match(migrationSql, /create trigger pub_crawls_live_mate_refresh/, 'pub_crawls trigger should maintain crawl rows');
assert.match(migrationSql, /select public\.repair_live_mate_sessions\(\);/, 'migration should backfill current active live rows');

console.log('live mate database checks passed');
```

- [ ] **Step 2: Add the package script**

In `package.json`, add this entry inside `scripts` near the other feature tests:

```json
"test:live-mates": "node scripts/liveMateSessions.test.js",
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```powershell
npm run test:live-mates
```

Expected: FAIL with `migration should create live_mate_sessions`.

- [ ] **Step 4: Create the migration**

Create `supabase/migrations/20260604130000_add_live_mate_sessions.sql`:

```sql
create table if not exists public.live_mate_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  pub_crawl_id uuid references public.pub_crawls(id) on delete cascade,
  current_pub_name text not null,
  started_at timestamp with time zone not null,
  last_activity_at timestamp with time zone not null,
  true_pints double precision not null default 0,
  is_pub_crawl boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint live_mate_sessions_user_unique unique (user_id),
  constraint live_mate_sessions_session_unique unique (session_id)
);

create index if not exists live_mate_sessions_user_idx
  on public.live_mate_sessions(user_id);

create index if not exists live_mate_sessions_last_activity_idx
  on public.live_mate_sessions(last_activity_at desc);

create index if not exists live_mate_sessions_pub_crawl_idx
  on public.live_mate_sessions(pub_crawl_id)
  where pub_crawl_id is not null;

alter table public.live_mate_sessions enable row level security;

drop policy if exists "Live mate sessions are visible to followers" on public.live_mate_sessions;
create policy "Live mate sessions are visible to followers"
  on public.live_mate_sessions
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.follows
      where follows.follower_id = (select auth.uid())
        and follows.following_id = live_mate_sessions.user_id
    )
  );

revoke all on table public.live_mate_sessions from anon;
revoke insert, update, delete on table public.live_mate_sessions from authenticated;
grant select on table public.live_mate_sessions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_mate_sessions'
  ) then
    alter publication supabase_realtime add table public.live_mate_sessions;
  end if;
end $$;

create or replace function public.touch_live_mate_session_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists live_mate_sessions_touch_updated_at on public.live_mate_sessions;
create trigger live_mate_sessions_touch_updated_at
  before update on public.live_mate_sessions
  for each row
  execute function public.touch_live_mate_session_updated_at();

create or replace function public.get_live_session_true_pints(target_session_id uuid)
returns double precision
language sql
stable
set search_path = public
as $$
  select coalesce(
    round((
      coalesce(sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 1)
        / 568.0
      ), 0)
    )::numeric, 1)::double precision,
    0::double precision
  )
  from public.session_beers
  where session_beers.session_id = target_session_id;
$$;

create or replace function public.get_live_pub_crawl_true_pints(target_pub_crawl_id uuid)
returns double precision
language sql
stable
set search_path = public
as $$
  select coalesce(
    round((
      coalesce(sum(
        public.beerva_serving_volume_ml(session_beers.volume)
        * greatest(coalesce(session_beers.quantity, 1), 1)
        / 568.0
      ), 0)
    )::numeric, 1)::double precision,
    0::double precision
  )
  from public.sessions
  join public.session_beers
    on session_beers.session_id = sessions.id
  where sessions.pub_crawl_id = target_pub_crawl_id
    and sessions.is_crawl_stop = true
    and sessions.status in ('active', 'published');
$$;

create or replace function public.get_live_session_last_activity(target_session_id uuid)
returns timestamp with time zone
language sql
stable
set search_path = public
as $$
  select coalesce(
    max(coalesce(session_beers.consumed_at, session_beers.created_at)),
    (
      select coalesce(sessions.started_at, sessions.created_at, now())
      from public.sessions
      where sessions.id = target_session_id
    )
  )
  from public.session_beers
  where session_beers.session_id = target_session_id;
$$;

create or replace function public.get_live_pub_crawl_last_activity(target_pub_crawl_id uuid)
returns timestamp with time zone
language sql
stable
set search_path = public
as $$
  select coalesce(
    max(coalesce(session_beers.consumed_at, session_beers.created_at)),
    (
      select coalesce(pub_crawls.started_at, pub_crawls.created_at, now())
      from public.pub_crawls
      where pub_crawls.id = target_pub_crawl_id
    )
  )
  from public.sessions
  left join public.session_beers
    on session_beers.session_id = sessions.id
  where sessions.pub_crawl_id = target_pub_crawl_id
    and sessions.is_crawl_stop = true
    and sessions.status in ('active', 'published');
$$;

create or replace function public.refresh_live_mate_session_for_session(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.sessions;
  live_pub_name text;
begin
  select *
  into session_row
  from public.sessions
  where id = target_session_id;

  if session_row.id is null then
    delete from public.live_mate_sessions
    where session_id = target_session_id;
    return;
  end if;

  if session_row.pub_crawl_id is not null then
    perform public.refresh_live_mate_session_for_pub_crawl(session_row.pub_crawl_id);
    return;
  end if;

  if session_row.status <> 'active' then
    delete from public.live_mate_sessions
    where session_id = session_row.id
       or (user_id = session_row.user_id and pub_crawl_id is null);
    return;
  end if;

  live_pub_name := coalesce(nullif(btrim(session_row.pub_name), ''), 'Somewhere');

  insert into public.live_mate_sessions (
    user_id,
    session_id,
    pub_crawl_id,
    current_pub_name,
    started_at,
    last_activity_at,
    true_pints,
    is_pub_crawl
  )
  values (
    session_row.user_id,
    session_row.id,
    null,
    live_pub_name,
    coalesce(session_row.started_at, session_row.created_at, now()),
    public.get_live_session_last_activity(session_row.id),
    public.get_live_session_true_pints(session_row.id),
    false
  )
  on conflict (user_id)
  do update set
    session_id = excluded.session_id,
    pub_crawl_id = null,
    current_pub_name = excluded.current_pub_name,
    started_at = excluded.started_at,
    last_activity_at = excluded.last_activity_at,
    true_pints = excluded.true_pints,
    is_pub_crawl = false;
end;
$$;

create or replace function public.refresh_live_mate_session_for_pub_crawl(target_pub_crawl_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  crawl_row public.pub_crawls;
  active_stop public.sessions;
  live_pub_name text;
begin
  select *
  into crawl_row
  from public.pub_crawls
  where id = target_pub_crawl_id;

  if crawl_row.id is null or crawl_row.status <> 'active' then
    delete from public.live_mate_sessions
    where pub_crawl_id = target_pub_crawl_id;
    return;
  end if;

  select *
  into active_stop
  from public.sessions
  where pub_crawl_id = target_pub_crawl_id
    and user_id = crawl_row.user_id
    and status = 'active'
    and is_crawl_stop = true
  order by crawl_stop_order desc nulls last, started_at desc nulls last, created_at desc
  limit 1;

  if active_stop.id is null then
    return;
  end if;

  live_pub_name := coalesce(nullif(btrim(active_stop.pub_name), ''), 'Somewhere');

  insert into public.live_mate_sessions (
    user_id,
    session_id,
    pub_crawl_id,
    current_pub_name,
    started_at,
    last_activity_at,
    true_pints,
    is_pub_crawl
  )
  values (
    crawl_row.user_id,
    active_stop.id,
    crawl_row.id,
    live_pub_name,
    coalesce(crawl_row.started_at, active_stop.started_at, crawl_row.created_at, now()),
    public.get_live_pub_crawl_last_activity(crawl_row.id),
    public.get_live_pub_crawl_true_pints(crawl_row.id),
    true
  )
  on conflict (user_id)
  do update set
    session_id = excluded.session_id,
    pub_crawl_id = excluded.pub_crawl_id,
    current_pub_name = excluded.current_pub_name,
    started_at = excluded.started_at,
    last_activity_at = excluded.last_activity_at,
    true_pints = excluded.true_pints,
    is_pub_crawl = true;
end;
$$;

create or replace function public.handle_live_mate_session_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.pub_crawl_id is not null then
      perform public.refresh_live_mate_session_for_pub_crawl(old.pub_crawl_id);
    else
      delete from public.live_mate_sessions
      where session_id = old.id;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.pub_crawl_id is not null
    and old.pub_crawl_id is distinct from new.pub_crawl_id then
    perform public.refresh_live_mate_session_for_pub_crawl(old.pub_crawl_id);
  end if;

  perform public.refresh_live_mate_session_for_session(new.id);
  return new;
end;
$$;

drop trigger if exists sessions_live_mate_refresh on public.sessions;
create trigger sessions_live_mate_refresh
  after insert or update or delete on public.sessions
  for each row
  execute function public.handle_live_mate_session_change();

create or replace function public.handle_live_mate_beer_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_session_id uuid;
begin
  target_session_id := coalesce(new.session_id, old.session_id);
  perform public.refresh_live_mate_session_for_session(target_session_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists session_beers_live_mate_refresh on public.session_beers;
create trigger session_beers_live_mate_refresh
  after insert or update or delete on public.session_beers
  for each row
  execute function public.handle_live_mate_beer_change();

create or replace function public.handle_live_mate_pub_crawl_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.live_mate_sessions
    where pub_crawl_id = old.id;
    return old;
  end if;

  perform public.refresh_live_mate_session_for_pub_crawl(new.id);
  return new;
end;
$$;

drop trigger if exists pub_crawls_live_mate_refresh on public.pub_crawls;
create trigger pub_crawls_live_mate_refresh
  after insert or update or delete on public.pub_crawls
  for each row
  execute function public.handle_live_mate_pub_crawl_change();

create or replace function public.repair_live_mate_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row record;
  crawl_row record;
begin
  delete from public.live_mate_sessions;

  for session_row in
    select id
    from public.sessions
    where status = 'active'
      and pub_crawl_id is null
  loop
    perform public.refresh_live_mate_session_for_session(session_row.id);
  end loop;

  for crawl_row in
    select id
    from public.pub_crawls
    where status = 'active'
  loop
    perform public.refresh_live_mate_session_for_pub_crawl(crawl_row.id);
  end loop;
end;
$$;

create or replace function public.get_live_mate_sessions()
returns table (
  id uuid,
  user_id uuid,
  session_id uuid,
  pub_crawl_id uuid,
  username text,
  avatar_url text,
  current_pub_name text,
  started_at timestamp with time zone,
  last_activity_at timestamp with time zone,
  true_pints double precision,
  is_pub_crawl boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    live.id,
    live.user_id,
    live.session_id,
    live.pub_crawl_id,
    profiles.username,
    profiles.avatar_url,
    live.current_pub_name,
    live.started_at,
    live.last_activity_at,
    live.true_pints,
    live.is_pub_crawl
  from public.live_mate_sessions live
  left join public.profiles
    on profiles.id = live.user_id
  where exists (
    select 1
    from public.follows
    where follows.follower_id = (select auth.uid())
      and follows.following_id = live.user_id
  )
  order by live.last_activity_at desc nulls last, live.started_at desc nulls last;
$$;

revoke execute on function public.touch_live_mate_session_updated_at() from public, anon, authenticated;
revoke execute on function public.get_live_session_true_pints(uuid) from public, anon, authenticated;
revoke execute on function public.get_live_pub_crawl_true_pints(uuid) from public, anon, authenticated;
revoke execute on function public.get_live_session_last_activity(uuid) from public, anon, authenticated;
revoke execute on function public.get_live_pub_crawl_last_activity(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_live_mate_session_for_session(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_live_mate_session_for_pub_crawl(uuid) from public, anon, authenticated;
revoke execute on function public.handle_live_mate_session_change() from public, anon, authenticated;
revoke execute on function public.handle_live_mate_beer_change() from public, anon, authenticated;
revoke execute on function public.handle_live_mate_pub_crawl_change() from public, anon, authenticated;
revoke execute on function public.repair_live_mate_sessions() from public, anon, authenticated;
revoke execute on function public.get_live_mate_sessions() from public, anon;
grant execute on function public.get_live_mate_sessions() to authenticated;

comment on table public.live_mate_sessions is
  'Trigger-maintained follower-visible live state for active drinking sessions and active pub crawls.';
comment on function public.get_live_mate_sessions() is
  'Returns active live drinking state for users followed by the current viewer.';

select public.repair_live_mate_sessions();

notify pgrst, 'reload schema';
```

- [ ] **Step 5: Run the database contract test**

Run:

```powershell
npm run test:live-mates
```

Expected: PASS with `live mate database checks passed`.

- [ ] **Step 6: Commit the database contract**

```powershell
git add package.json scripts/liveMateSessions.test.js supabase/migrations/20260604130000_add_live_mate_sessions.sql
git commit -m "feat: add live mate sessions database contract"
```

---

## Task 2: Add Client Live Mate API

**Files:**
- Modify: `scripts/liveMateSessions.test.js`
- Create: `src/lib/liveMateSessions.ts`

- [ ] **Step 1: Extend the failing test for client helpers**

Replace the final `console.log('live mate database checks passed');` line in `scripts/liveMateSessions.test.js` with:

```js
assert.ok(fs.existsSync(path.join(root, 'src/lib/liveMateSessions.ts')), 'live mate client API should exist');

const liveMateSessions = loadTypeScriptModule('src/lib/liveMateSessions.ts', {
  './supabase': {
    supabase: {
      rpc: async () => ({ data: [], error: null }),
    },
  },
});

assert.deepEqual(
  liveMateSessions.mapLiveMateSessionRow({
    id: 'live-1',
    user_id: 'user-2',
    session_id: 'session-1',
    pub_crawl_id: null,
    username: 'Tubpac',
    avatar_url: 'avatar.png',
    current_pub_name: 'John Bull Pub',
    started_at: '2026-06-04T18:00:00Z',
    last_activity_at: '2026-06-04T19:00:00Z',
    true_pints: 2.44,
    is_pub_crawl: false,
  }),
  {
    id: 'live-1',
    userId: 'user-2',
    sessionId: 'session-1',
    pubCrawlId: null,
    username: 'Tubpac',
    avatarUrl: 'avatar.png',
    currentPubName: 'John Bull Pub',
    startedAt: '2026-06-04T18:00:00Z',
    lastActivityAt: '2026-06-04T19:00:00Z',
    truePints: 2.44,
    isPubCrawl: false,
  },
  'RPC rows should map to app shape'
);

assert.equal(
  liveMateSessions.mapLiveMateSessionRow({
    id: 'live-2',
    user_id: 'user-3',
    session_id: 'session-2',
    pub_crawl_id: 'crawl-1',
    username: '   ',
    avatar_url: '',
    current_pub_name: '  ',
    started_at: null,
    last_activity_at: null,
    true_pints: 'bad-number',
    is_pub_crawl: true,
  }).username,
  null,
  'blank profile names should map to null'
);

assert.equal(liveMateSessions.formatLiveMateCount(1), '1 drinking now', 'single count copy should be singular');
assert.equal(liveMateSessions.formatLiveMateCount(3), '3 drinking now', 'multi count copy should be plural-neutral');
assert.equal(liveMateSessions.formatLiveTruePints(0), '0.0 true pints', 'zero true-pint copy should include one decimal');
assert.equal(liveMateSessions.formatLiveTruePints(1), '1.0 true pint', 'one true pint should be singular');
assert.equal(liveMateSessions.formatLiveTruePints(2.44), '2.4 true pints', 'true pints should round to one decimal');
assert.equal(liveMateSessions.getLiveMateDisplayName({ username: null }), 'Someone', 'missing names should fall back');
assert.equal(liveMateSessions.getLiveMatePubName({ currentPubName: null }), 'Somewhere', 'missing pub names should fall back');
assert.equal(
  liveMateSessions.formatLiveStartedLabel('2026-06-04T17:30:00Z', new Date('2026-06-04T19:00:00Z')),
  '1h 30m',
  'elapsed labels should show hours and minutes'
);
assert.equal(
  liveMateSessions.formatLiveStartedLabel('2026-06-04T18:52:00Z', new Date('2026-06-04T19:00:00Z')),
  '8m',
  'elapsed labels should show minutes for short sessions'
);

const liveMateApiSource = fs.readFileSync(path.join(root, 'src/lib/liveMateSessions.ts'), 'utf8');
assert.match(liveMateApiSource, /rpc\('get_live_mate_sessions'\)/, 'client API should fetch live mates through RPC');

console.log('live mate client checks passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm run test:live-mates
```

Expected: FAIL with `live mate client API should exist`.

- [ ] **Step 3: Create the client API**

Create `src/lib/liveMateSessions.ts`:

```ts
import { supabase } from './supabase';

export type LiveMateSession = {
  id: string;
  userId: string;
  sessionId: string;
  pubCrawlId: string | null;
  username: string | null;
  avatarUrl: string | null;
  currentPubName: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  truePints: number;
  isPubCrawl: boolean;
};

type LiveMateSessionRow = {
  id?: string | null;
  user_id?: string | null;
  session_id?: string | null;
  pub_crawl_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  current_pub_name?: string | null;
  started_at?: string | null;
  last_activity_at?: string | null;
  true_pints?: number | string | null;
  is_pub_crawl?: boolean | null;
};

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const mapLiveMateSessionRow = (row: LiveMateSessionRow): LiveMateSession => ({
  id: toCleanString(row.id) || '',
  userId: toCleanString(row.user_id) || '',
  sessionId: toCleanString(row.session_id) || '',
  pubCrawlId: toCleanString(row.pub_crawl_id),
  username: toCleanString(row.username),
  avatarUrl: toCleanString(row.avatar_url),
  currentPubName: toCleanString(row.current_pub_name),
  startedAt: toCleanString(row.started_at),
  lastActivityAt: toCleanString(row.last_activity_at),
  truePints: toNumber(row.true_pints),
  isPubCrawl: Boolean(row.is_pub_crawl),
});

export const fetchLiveMateSessions = async (): Promise<LiveMateSession[]> => {
  const { data, error } = await supabase.rpc('get_live_mate_sessions');
  if (error) throw error;

  return ((data || []) as LiveMateSessionRow[])
    .map(mapLiveMateSessionRow)
    .filter((session) => session.id && session.userId && session.sessionId);
};

export const formatLiveMateCount = (count: number) => `${Math.max(0, count)} drinking now`;

export const formatLiveTruePints = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safeValue * 10) / 10;
  const label = rounded === 1 ? 'true pint' : 'true pints';
  return `${rounded.toFixed(1)} ${label}`;
};

export const getLiveMateDisplayName = (session: Pick<LiveMateSession, 'username'>) => (
  toCleanString(session.username) || 'Someone'
);

export const getLiveMatePubName = (session: Pick<LiveMateSession, 'currentPubName'>) => (
  toCleanString(session.currentPubName) || 'Somewhere'
);

export const formatLiveStartedLabel = (
  startedAt: string | null,
  now: Date = new Date()
) => {
  const started = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const elapsedMs = now.getTime() - started;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 'Just started';

  const totalMinutes = Math.max(1, Math.floor(elapsedMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};
```

- [ ] **Step 4: Run the client API test**

Run:

```powershell
npm run test:live-mates
```

Expected: PASS with `live mate client checks passed`.

- [ ] **Step 5: Commit the client API**

```powershell
git add scripts/liveMateSessions.test.js src/lib/liveMateSessions.ts
git commit -m "feat: add live mate sessions client API"
```

---

## Task 3: Add Realtime Live Mate Hook

**Files:**
- Modify: `scripts/liveMateSessions.test.js`
- Create: `src/lib/useLiveMateSessions.ts`

- [ ] **Step 1: Extend the failing test for realtime hook behavior**

Replace the final `console.log('live mate client checks passed');` line in `scripts/liveMateSessions.test.js` with:

```js
const liveMateHookPath = path.join(root, 'src/lib/useLiveMateSessions.ts');
assert.ok(fs.existsSync(liveMateHookPath), 'live mate hook should exist');
const liveMateHookSource = fs.readFileSync(liveMateHookPath, 'utf8');

assert.match(liveMateHookSource, /export const useLiveMateSessions = \(\)/, 'hook should export useLiveMateSessions');
assert.match(liveMateHookSource, /fetchLiveMateSessions\(\)/, 'hook should fetch live sessions through the shared client API');
assert.match(liveMateHookSource, /supabase\.auth\.getSession\(\)/, 'hook should avoid RPC calls when no user session exists');
assert.match(liveMateHookSource, /supabase\.auth\.onAuthStateChange/, 'hook should refresh on auth state changes');
assert.match(liveMateHookSource, /\.channel\(`live-mate-sessions-\$\{userId\}`\)/, 'hook should create a user-scoped realtime channel');
assert.match(liveMateHookSource, /table: 'live_mate_sessions'/, 'hook should subscribe to live_mate_sessions changes');
assert.match(liveMateHookSource, /supabase\.removeChannel\(channel\)/, 'hook should clean up realtime channels');
assert.match(liveMateHookSource, /setSessions\(\[\]\)/, 'hook should clear sessions when signed out or empty');

console.log('live mate hook checks passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm run test:live-mates
```

Expected: FAIL with `live mate hook should exist`.

- [ ] **Step 3: Create the realtime hook**

Create `src/lib/useLiveMateSessions.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchLiveMateSessions, LiveMateSession } from './liveMateSessions';
import { supabase } from './supabase';

type LiveMateSessionsState = {
  sessions: LiveMateSession[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export const useLiveMateSessions = (): LiveMateSessionsState => {
  const [sessions, setSessions] = useState<LiveMateSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const refreshId = refreshIdRef.current + 1;
    refreshIdRef.current = refreshId;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || null;

      if (!mountedRef.current || refreshId !== refreshIdRef.current) return;

      setUserId(currentUserId);
      if (!currentUserId) {
        setSessions([]);
        setError(null);
        setLoading(false);
        return;
      }

      const nextSessions = await fetchLiveMateSessions();
      if (!mountedRef.current || refreshId !== refreshIdRef.current) return;

      setSessions(nextSessions);
      setError(null);
    } catch (refreshError: any) {
      if (!mountedRef.current || refreshId !== refreshIdRef.current) return;

      console.warn('Could not refresh live mate sessions:', refreshError);
      setError(refreshError?.message || 'Could not load live mates.');
    } finally {
      if (mountedRef.current && refreshId === refreshIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`live-mate-sessions-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_mate_sessions',
        },
        () => {
          refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  return { sessions, loading, error, refresh };
};
```

- [ ] **Step 4: Run the hook test**

Run:

```powershell
npm run test:live-mates
```

Expected: PASS with `live mate hook checks passed`.

- [ ] **Step 5: Commit the realtime hook**

```powershell
git add scripts/liveMateSessions.test.js src/lib/useLiveMateSessions.ts
git commit -m "feat: add realtime live mate sessions hook"
```

---

## Task 4: Add Live Button And Top Sheet Components

**Files:**
- Modify: `scripts/liveMateSessions.test.js`
- Create: `src/components/LiveMateButton.tsx`
- Create: `src/components/LiveMateSessionsSheet.tsx`

- [ ] **Step 1: Extend the failing test for visual components**

Replace the final `console.log('live mate hook checks passed');` line in `scripts/liveMateSessions.test.js` with:

```js
const liveButtonPath = path.join(root, 'src/components/LiveMateButton.tsx');
assert.ok(fs.existsSync(liveButtonPath), 'LiveMateButton component should exist');
const liveButtonSource = fs.readFileSync(liveButtonPath, 'utf8');

assert.match(liveButtonSource, /export const LiveMateButton = \(\{ count, onPress \}: LiveMateButtonProps\)/, 'live button should expose count and press props');
assert.match(liveButtonSource, /Animated\.loop/, 'live button should use looped animation');
assert.match(liveButtonSource, /Easing\.inOut\(Easing\.sin\)/, 'live button pulse should use smooth easing');
assert.match(liveButtonSource, /coreCircle/, 'live button should keep a stable core circle');
assert.match(liveButtonSource, /pulseRing/, 'live button should render pulse rings');
assert.match(liveButtonSource, /animationRef\.current\?\.stop\(\)/, 'live button should stop animation loops on cleanup');
assert.match(liveButtonSource, /AccessibilityInfo\.isReduceMotionEnabled/, 'live button should respect reduced motion on initial render');
assert.match(liveButtonSource, /accessibilityLabel=\{`Open live mates, \$\{count\} drinking now`\}/, 'live button should expose useful accessibility copy');

const liveSheetPath = path.join(root, 'src/components/LiveMateSessionsSheet.tsx');
assert.ok(fs.existsSync(liveSheetPath), 'LiveMateSessionsSheet component should exist');
const liveSheetSource = fs.readFileSync(liveSheetPath, 'utf8');

assert.match(liveSheetSource, /export const LiveMateSessionsSheet = \(\{ visible, sessions, onClose \}: LiveMateSessionsSheetProps\)/, 'live sheet should expose visibility, sessions, and close props');
assert.match(liveSheetSource, /animationType="none"/, 'live sheet should own its top-drop animation');
assert.match(liveSheetSource, /translateY/, 'live sheet should animate from the top');
assert.match(liveSheetSource, />Live mates</, 'live sheet should render the approved title');
assert.match(liveSheetSource, /formatLiveMateCount\(sessions\.length\)/, 'live sheet should render count copy');
assert.match(liveSheetSource, /formatLiveTruePints\(session\.truePints\)/, 'live sheet should render true-pint progress');
assert.match(liveSheetSource, /formatLiveStartedLabel\(session\.startedAt\)/, 'live sheet should render elapsed time');
assert.match(liveSheetSource, /Pub crawl/, 'live sheet should show a small pub crawl indicator');
assert.match(liveSheetSource, /CachedImage/, 'live sheet should render avatars through CachedImage');

console.log('live mate component checks passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
npm run test:live-mates
```

Expected: FAIL with `LiveMateButton component should exist`.

- [ ] **Step 3: Create the live button**

Create `src/components/LiveMateButton.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Radio } from 'lucide-react-native';

import { colors } from '../theme/colors';
import { radius } from '../theme/layout';

type LiveMateButtonProps = {
  count: number;
  onPress: () => void;
};

export const LiveMateButton = ({ count, onPress }: LiveMateButtonProps) => {
  const progress = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    animationRef.current?.stop();
    progress.setValue(0);

    if (reduceMotion) return undefined;

    animationRef.current = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1900,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    animationRef.current.start();

    return () => {
      animationRef.current?.stop();
    };
  }, [progress, reduceMotion]);

  const outerScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1.78],
  });
  const outerOpacity = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.38, 0],
  });
  const innerScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.38],
  });
  const innerOpacity = progress.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.22, 0.34, 0],
  });

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`Open live mates, ${count} drinking now`}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          styles.outerRing,
          reduceMotion ? styles.motionOffRing : { opacity: outerOpacity, transform: [{ scale: outerScale }] },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          styles.innerRing,
          reduceMotion ? styles.motionOffRing : { opacity: innerOpacity, transform: [{ scale: innerScale }] },
        ]}
      />
      <View style={styles.coreCircle}>
        <Radio color={colors.background} size={15} strokeWidth={3} />
      </View>
      {count > 1 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  pulseRing: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.danger,
  },
  outerRing: {
    backgroundColor: 'rgba(239, 68, 68, 0.42)',
  },
  innerRing: {
    backgroundColor: 'rgba(248, 113, 113, 0.36)',
  },
  motionOffRing: {
    opacity: 0.18,
  },
  coreCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    shadowColor: '#EF4444',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  countBadge: {
    position: 'absolute',
    top: 0,
    right: -1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  countText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '900',
  },
});
```

- [ ] **Step 4: Create the top sheet**

Create `src/components/LiveMateSessionsSheet.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MapPin, Route, X } from 'lucide-react-native';

import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { CachedImage } from './CachedImage';
import {
  formatLiveMateCount,
  formatLiveStartedLabel,
  formatLiveTruePints,
  getLiveMateDisplayName,
  getLiveMatePubName,
  LiveMateSession,
} from '../lib/liveMateSessions';

type LiveMateSessionsSheetProps = {
  visible: boolean;
  sessions: LiveMateSession[];
  onClose: () => void;
};

export const LiveMateSessionsSheet = ({ visible, sessions, onClose }: LiveMateSessionsSheetProps) => {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 150,
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-28, 0],
  });

  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { opacity, transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Live mates</Text>
              <Text style={styles.subtitle}>{formatLiveMateCount(sessions.length)}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Close live mates"
            >
              <X color={colors.textMuted} size={18} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {sessions.map((session) => {
              const displayName = getLiveMateDisplayName(session);
              const pubName = getLiveMatePubName(session);

              return (
                <View key={session.id} style={styles.row}>
                  <CachedImage
                    uri={session.avatarUrl}
                    fallbackUri={`https://i.pravatar.cc/150?u=${session.userId}`}
                    recyclingKey={`live-mate-${session.userId}-${session.avatarUrl || 'fallback'}`}
                    style={styles.avatar}
                    accessibilityLabel={`${displayName}'s avatar`}
                  />
                  <View style={styles.rowCopy}>
                    <View style={styles.nameLine}>
                      <Text style={styles.username} numberOfLines={1}>{displayName}</Text>
                      {session.isPubCrawl ? (
                        <View style={styles.crawlPill}>
                          <Route color={colors.primary} size={11} />
                          <Text style={styles.crawlPillText}>Pub crawl</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.pubLine}>
                      <MapPin color={colors.textMuted} size={13} />
                      <Text style={styles.pubName} numberOfLines={1}>{pubName}</Text>
                    </View>
                  </View>
                  <View style={styles.stats}>
                    <Text style={styles.truePints}>{formatLiveTruePints(session.truePints)}</Text>
                    <Text style={styles.elapsed}>{formatLiveStartedLabel(session.startedAt)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.58)',
  },
  sheet: {
    marginTop: 0,
    width: '100%',
    maxHeight: '78%',
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 18,
    backgroundColor: colors.surfaceRaised,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.borderSoft,
    gap: spacing.md,
    ...shadows.raised,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    ...typography.h2,
    fontSize: 22,
    lineHeight: 28,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  list: {
    gap: spacing.sm,
    paddingBottom: 4,
  },
  row: {
    minHeight: 74,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  username: {
    ...typography.body,
    color: colors.text,
    fontWeight: '900',
    flexShrink: 1,
    minWidth: 0,
  },
  crawlPill: {
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  crawlPillText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  pubLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  pubName: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    minWidth: 0,
  },
  stats: {
    alignItems: 'flex-end',
    gap: 4,
  },
  truePints: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  elapsed: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
});
```

- [ ] **Step 5: Run component tests**

Run:

```powershell
npm run test:live-mates
```

Expected: PASS with `live mate component checks passed`.

- [ ] **Step 6: Commit the components**

```powershell
git add scripts/liveMateSessions.test.js src/components/LiveMateButton.tsx src/components/LiveMateSessionsSheet.tsx
git commit -m "feat: add live mate button and top sheet"
```

---

## Task 5: Wire Live Mates Into The Feed Header

**Files:**
- Modify: `scripts/liveMateSessions.test.js`
- Modify: `scripts/feedHeader.test.js`
- Modify: `src/screens/FeedScreen.tsx`

- [ ] **Step 1: Extend the failing tests for Feed wiring**

Replace the final `console.log('live mate component checks passed');` line in `scripts/liveMateSessions.test.js` with:

```js
const feedScreenSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');

assert.match(feedScreenSource, /import \{ LiveMateButton \} from '\.\.\/components\/LiveMateButton';/, 'Feed should import LiveMateButton');
assert.match(feedScreenSource, /import \{ LiveMateSessionsSheet \} from '\.\.\/components\/LiveMateSessionsSheet';/, 'Feed should import LiveMateSessionsSheet');
assert.match(feedScreenSource, /import \{ useLiveMateSessions \} from '\.\.\/lib\/useLiveMateSessions';/, 'Feed should import live mate hook');
assert.match(feedScreenSource, /const \{ sessions: liveMateSessions,[\s\S]*refresh: refreshLiveMateSessions \} = useLiveMateSessions\(\);/, 'Feed should read live mate hook state');
assert.match(feedScreenSource, /useFocusEffect\(\s*useCallback\(\(\) => \{\s*refreshLiveMateSessions\(\);/, 'Feed should refresh live mates on focus');
assert.match(feedScreenSource, /liveMateSessions\.length === 0[\s\S]*setLiveMateSheetVisible\(false\)/, 'Feed should close the sheet when the live list empties');
assert.match(feedScreenSource, /<LiveMateButton\s+count=\{liveMateSessions\.length\}\s+onPress=\{\(\) => setLiveMateSheetVisible\(true\)\}/, 'Feed should render the button only when live mates exist');
assert.match(feedScreenSource, /<LiveMateSessionsSheet\s+visible=\{liveMateSheetVisible\}\s+sessions=\{liveMateSessions\}/, 'Feed should mount the top sheet');
assert.match(feedScreenSource, /styles\.headerActions/, 'Feed header should group live button and bell actions');

console.log('live mate feed wiring checks passed');
```

In `scripts/feedHeader.test.js`, add this assertion before the final `console.log`:

```js
assert.match(
  feedScreenSource,
  /<View style=\{styles\.logoContainer\}>[\s\S]*<View style=\{styles\.headerActions\}>[\s\S]*<LiveMateButton[\s\S]*<TouchableOpacity\s+style=\{styles\.bellButton\}/,
  'feed header should place the live button between the Beerva logo area and notification bell'
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npm run test:live-mates
npm run test:feed-header
```

Expected: `test:live-mates` FAILS with `Feed should import LiveMateButton`. `test:feed-header` may also fail until the header is wired.

- [ ] **Step 3: Add imports to FeedScreen**

In `src/screens/FeedScreen.tsx`, add these imports near the existing component/lib imports:

```ts
import { LiveMateButton } from '../components/LiveMateButton';
import { LiveMateSessionsSheet } from '../components/LiveMateSessionsSheet';
import { useLiveMateSessions } from '../lib/useLiveMateSessions';
```

- [ ] **Step 4: Add live mate state inside `FeedScreen`**

After the existing fake beer state declaration:

```ts
  const [fakeBeerUnlocking, setFakeBeerUnlocking] = useState(false);
```

add:

```ts
  const [liveMateSheetVisible, setLiveMateSheetVisible] = useState(false);
  const { sessions: liveMateSessions, refresh: refreshLiveMateSessions } = useLiveMateSessions();
```

- [ ] **Step 5: Refresh live mates on focus**

Add this effect near the other `useFocusEffect` calls:

```ts
  useFocusEffect(
    useCallback(() => {
      refreshLiveMateSessions();
    }, [refreshLiveMateSessions])
  );
```

- [ ] **Step 6: Close the sheet when the live list empties**

Add this `useEffect` near the other short state-sync effects:

```ts
  useEffect(() => {
    if (liveMateSessions.length === 0) {
      setLiveMateSheetVisible(false);
    }
  }, [liveMateSessions.length]);
```

- [ ] **Step 7: Replace the header action area**

In `src/screens/FeedScreen.tsx`, replace the current bell button block immediately after `</View>` for `styles.logoContainer`:

```tsx
        <TouchableOpacity
          style={styles.bellButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Bell color={colors.text} size={24} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
```

with:

```tsx
        <View style={styles.headerActions}>
          {liveMateSessions.length > 0 ? (
            <LiveMateButton
              count={liveMateSessions.length}
              onPress={() => setLiveMateSheetVisible(true)}
            />
          ) : null}
          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel="Open notifications"
          >
            <Bell color={colors.text} size={24} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
```

- [ ] **Step 8: Mount the top sheet**

Immediately after the closing `</View>` for `styles.header`, before the fetch-error banner, add:

```tsx
      <LiveMateSessionsSheet
        visible={liveMateSheetVisible}
        sessions={liveMateSessions}
        onClose={() => setLiveMateSheetVisible(false)}
      />
```

- [ ] **Step 9: Add Feed header styles**

In the StyleSheet near `bellButton`, add:

```ts
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
```

In `logoContainer`, add a right-side shrink guard so long wordmark layouts cannot push the buttons offscreen:

```ts
    flexShrink: 1,
    minWidth: 0,
```

- [ ] **Step 10: Run focused tests**

Run:

```powershell
npm run test:live-mates
npm run test:feed-header
```

Expected: both commands PASS. `test:live-mates` prints `live mate feed wiring checks passed`.

- [ ] **Step 11: Typecheck**

Run:

```powershell
npx tsc --noEmit
```

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 12: Commit Feed wiring**

```powershell
git add scripts/liveMateSessions.test.js scripts/feedHeader.test.js src/screens/FeedScreen.tsx
git commit -m "feat: show live mate sessions in feed header"
```

---

## Task 6: Database And UI Verification

**Files:**
- Verify only unless a command fails.

- [ ] **Step 1: Run focused source tests**

Run:

```powershell
npm run test:live-mates
npm run test:feed-header
npm run test:pub-crawl
npm run test:record-session-drinks
npm run test:session-beers
```

Expected: all commands PASS.

- [ ] **Step 2: Run TypeScript and web build**

Run:

```powershell
npx tsc --noEmit
npm run build:web
```

Expected: TypeScript exits 0 and Expo web export completes.

- [ ] **Step 3: Apply the migration to the linked Supabase project**

Run:

```powershell
npx supabase db push
```

Expected: migration `20260604130000_add_live_mate_sessions.sql` is applied. If Supabase reports the migration is already applied, continue.

- [ ] **Step 4: Manual smoke test**

Run:

```powershell
npm run web
```

Open the web app and verify:

- With no followed users drinking, the Feed header shows no live button between Beerva and the notification bell.
- When a followed user starts a normal session, a red pulsating circular button appears in the Feed header.
- Pressing the button opens a top sheet from the top of the screen.
- The normal session row shows avatar, username, pub, elapsed time, and `0.0 true pints` before drinks.
- Adding a drink to that session updates the true-pint number after realtime refresh.
- Converting that session to a pub crawl keeps one live row and shows the `Pub crawl` indicator.
- Changing the current crawl pub updates the row pub name.
- Ending/publishing or cancelling removes the row and hides the button if no other live mates exist.

- [ ] **Step 5: Inspect git status**

Run:

```powershell
git status --short
```

Expected: no uncommitted files except generated web export output that the repo normally ignores.

- [ ] **Step 6: Final implementation handoff**

Report:

```text
Live mate sessions are backed by public.live_mate_sessions and get_live_mate_sessions(). The Feed header now shows a red pulsating live button only when followed users are actively drinking, and the top sheet lists current pub, true pints, elapsed time, and pub crawl status. Focused tests, TypeScript, and web build passed.
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the live table, trigger maintenance, follower-only database visibility, pub crawl rows, true-pint caching, realtime publication, and repair function. Task 2 covers client mapping and display formatting. Task 3 covers realtime refresh, auth changes, and recovery refresh. Task 4 covers the polished red pulse and top sheet. Task 5 covers hidden-empty rendering, header placement, focus refresh, and sheet closing.
- **Type consistency:** Database rows use snake_case names; `src/lib/liveMateSessions.ts` converts to camelCase. The hook returns `LiveMateSession[]`; components consume that exact type. Feed state names are `liveMateSessions`, `liveMateSheetVisible`, and `refreshLiveMateSessions` throughout.
- **Security:** The table has RLS and direct select is follower-aware. Clients cannot insert/update/delete live rows. The RPC is security-definer but reimposes `follows.follower_id = auth.uid()` and returns only followed users.
- **Realtime:** The client subscribes to all `live_mate_sessions` changes and always refreshes through the RPC, so realtime never becomes the privacy filter.
- **Scope:** This plan intentionally avoids push notifications, session opt-out, chat/join actions, and individual drink lines.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-live-mate-sessions.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
