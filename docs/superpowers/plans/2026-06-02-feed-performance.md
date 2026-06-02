# Feed Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the Feed screen's cold-load latency by removing two redundant `auth.getUser()` network round-trips from the feed hot path and collapsing the per-session detail fan-out (cheers + beers + comments + photos + profiles = 5 queries across 2 round-trips) into a single viewer-aware Postgres RPC.

**Architecture:** (1) Add a local `getCurrentUser`/`getCurrentUserId` helper backed by `supabase.auth.getSession()` (reads cached session, no network) and use it in the feed path. (2) Add a `public.get_session_feed_details(uuid[])` RPC — modeled exactly on the existing `public.get_session_buddy_summaries` / `public.get_session_chug_attempt_summaries` pattern — that returns, per visible published session, the author profile plus `jsonb` arrays of cheers (with cheerer profiles), beers, comments (with commenter profiles), and photos. A thin `src/lib/sessionFeedDetails.ts` wrapper maps the rows, and `FeedScreen.fetchSessions` swaps its 6-query `Promise.all` + dependent profiles query for `Promise.all([fetchSessionFeedDetails, get_session_chug_attempt_summaries, fetchSessionBuddySummaries, fetchOfficialPostLinkedChallengeSummaries])`. The chug and buddy summary RPCs and all pub-crawl/official-post hydration are left untouched.

**Tech Stack:** Supabase Postgres SQL/RPC (`security definer`, `stable`, `set search_path = public`), Expo React Native, TypeScript, React hooks, Node source-level regression scripts (`node:assert/strict` + `typescript` transpile).

---

## File Structure

### Create

- `src/lib/authSession.ts`
  - Shared `getCurrentUser()` / `getCurrentUserId()` helpers backed by `supabase.auth.getSession()` (no network). The single place id-only reads should go through.
- `scripts/authSession.test.js`
  - Unit tests for the helper (returns the cached session user id; returns `null` when there is no session) plus a source assertion that it uses `getSession`, not `getUser`.
- `supabase/migrations/20260602130000_add_session_feed_details_rpc.sql`
  - Adds a partial feed index on `public.sessions` and the viewer-aware `public.get_session_feed_details(uuid[])` RPC with grants and a PostgREST schema reload.
- `src/lib/sessionFeedDetails.ts`
  - Client wrapper: `SessionFeedDetail` types, `mapSessionFeedDetailRow`, and `fetchSessionFeedDetails(sessionIds): Promise<Map<string, SessionFeedDetail>>`.
- `scripts/sessionFeedDetails.test.js`
  - SQL contract checks for the migration, mapper unit tests for the client lib, and feed-wiring source checks.

### Modify

- `src/screens/FeedScreen.tsx`
  - Replace the feed-path `auth.getUser()` with `getCurrentUser()`; replace the cheers/beers/comments/photos `Promise.all` + dependent `profiles` query + per-table grouping with one `fetchSessionFeedDetails` call, and fold the official-post linked-challenge fetch into the same parallel batch.
- `src/lib/pubCrawlsApi.ts`
  - Replace the three `auth.getUser()` id-reads (the feed-path one at line 430, plus lines 280 and 508) with `getCurrentUser()`.
- `package.json`
  - Add `test:auth-session` and `test:session-feed-details` scripts.
- `scripts/sessionPhotos.test.js`
  - Update the assertion that the feed calls `.from('session_photos')` (no longer true) to assert it fetches photos via `fetchSessionFeedDetails`.

### Intentionally Unchanged

- `public.get_session_chug_attempt_summaries` and `public.get_session_buddy_summaries`
  - Already optimized batch RPCs that join their own profiles; `FeedScreen` keeps calling them in the same parallel batch.
- `src/lib/pubCrawlsApi.ts` `hydratePubCrawls`
  - The pub-crawl hydration waterfall is a separate, lower-traffic path. Deferred to keep this change reviewable; only its `getUser` id-read is fixed here.
- The remaining ~33 `auth.getUser()` call sites outside the feed path
  - Optional mechanical sweep captured in Task 5; not required to resolve the two red issues.
- `FeedSessionCard` and all card render code (`getVisibleSessionPhotoUrls(item.session_photos, item.image_url)`, etc.)
  - The card consumes the same `FeedSession` shape; only how that shape is assembled changes.

---

## Task 1: Add a cached-session auth helper

**Files:**
- Create: `src/lib/authSession.ts`
- Create: `scripts/authSession.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `scripts/authSession.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const makeSupabase = (session) => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      // Throw if anyone uses the network call instead of the cached session.
      getUser: async () => {
        throw new Error('authSession must not call auth.getUser()');
      },
    },
  },
});

(async () => {
  const withUser = loadTypeScriptModule('src/lib/authSession.ts', makeSupabase({
    user: { id: 'user-123' },
  }));
  assert.equal(await withUser.getCurrentUserId(), 'user-123', 'returns cached session user id');
  const user = await withUser.getCurrentUser();
  assert.equal(user && user.id, 'user-123', 'returns cached session user');

  const noSession = loadTypeScriptModule('src/lib/authSession.ts', makeSupabase(null));
  assert.equal(await noSession.getCurrentUserId(), null, 'returns null when there is no session');
  assert.equal(await noSession.getCurrentUser(), null, 'returns null user when there is no session');

  const source = fs.readFileSync(path.join(root, 'src/lib/authSession.ts'), 'utf8');
  assert.match(source, /getSession\(\)/, 'helper should read the cached session');
  assert.doesNotMatch(source, /getUser\(\)/, 'helper should not make the getUser network call');

  console.log('auth session checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/authSession.test.js`
Expected: FAIL — `Cannot find module '.../src/lib/authSession.ts'` (file does not exist yet).

- [ ] **Step 3: Create the helper**

Create `src/lib/authSession.ts`:

```ts
import type { User } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Reads the signed-in user from the locally cached session (no network round-trip).
 * Prefer this over `supabase.auth.getUser()` whenever you only need the user id —
 * `getUser()` revalidates the JWT against the auth server on every call.
 */
export const getCurrentUser = async (): Promise<User | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
};

export const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
};
```

- [ ] **Step 4: Wire the test script into `package.json`**

In `package.json` `scripts`, add beside the other `test:*` entries:

```json
    "test:auth-session": "node scripts/authSession.test.js",
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node scripts/authSession.test.js`
Expected: PASS — prints `auth session checks passed`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/authSession.ts scripts/authSession.test.js package.json
git commit -m "feat: add cached-session auth helper to avoid getUser network calls"
```

---

## Task 2: Use the helper in the feed-path getUser calls

**Files:**
- Modify: `src/screens/FeedScreen.tsx` (the `auth.getUser()` at the top of `fetchSessions`, ~line 830)
- Modify: `src/lib/pubCrawlsApi.ts` (lines 280, 430, 508)

- [ ] **Step 1: Replace the getUser call in `FeedScreen.fetchSessions`**

In `src/screens/FeedScreen.tsx`, add to the imports near the other `../lib` imports:

```ts
import { getCurrentUser } from '../lib/authSession';
```

Replace this block (currently ~lines 830-834):

```ts
      const { data: { user } } = await withTimeout(
        supabase.auth.getUser(),
        FEED_REQUEST_TIMEOUT_MS,
        'Feed sign-in check is taking too long.'
      );
      if (!isLatestRequest()) return;
```

with:

```ts
      const user = await getCurrentUser();
      if (!isLatestRequest()) return;
```

- [ ] **Step 2: Replace the getUser calls in `pubCrawlsApi.ts`**

In `src/lib/pubCrawlsApi.ts`, add to the imports:

```ts
import { getCurrentUser } from './authSession';
```

Replace each of the three occurrences of:

```ts
  const { data: { user } } = await supabase.auth.getUser();
```

(at lines 280, 430, and 508) with:

```ts
  const user = await getCurrentUser();
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors. (`user` keeps the same `User | null` shape, so `user?.id` / `if (!user)` call sites are unchanged.)

- [ ] **Step 4: Run the regression scripts that read these files**

Run: `node scripts/drinkingBuddies.test.js`
Expected: PASS — prints `drinking buddies checks passed` (it asserts the feed still calls `fetchSessionBuddySummaries`, which is untouched here).

- [ ] **Step 5: Commit**

```bash
git add src/screens/FeedScreen.tsx src/lib/pubCrawlsApi.ts
git commit -m "perf: read cached session in feed path instead of getUser network call"
```

---

## Task 3: Add the `get_session_feed_details` RPC and feed index

**Files:**
- Create: `supabase/migrations/20260602130000_add_session_feed_details_rpc.sql`
- Create: `scripts/sessionFeedDetails.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing SQL contract test**

Create `scripts/sessionFeedDetails.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260602130000_add_session_feed_details_rpc.sql');

assert.equal(fs.existsSync(migrationPath), true, 'session feed details migration should exist');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /create or replace function public\.get_session_feed_details\(session_ids uuid\[\]\)/i, 'feed details RPC should exist');
assert.match(sql, /security definer/i, 'RPC should run as definer to bypass per-table RLS');
assert.match(sql, /set search_path = public/i, 'RPC should pin search_path');
assert.match(sql, /stable/i, 'read-only RPC should be marked stable');
// Viewer-aware visibility, mirroring get_session_chug_attempt_summaries.
assert.match(sql, /sessions\.status = 'published'/i, 'RPC should only expose published sessions');
assert.match(sql, /follows\.follower_id = \(select auth\.uid\(\)\)/i, 'RPC should restrict to own and followed authors');
// One jsonb aggregate per relation.
assert.match(sql, /from public\.session_cheers/i, 'RPC should aggregate cheers');
assert.match(sql, /from public\.session_beers/i, 'RPC should aggregate beers');
assert.match(sql, /from public\.session_comments/i, 'RPC should aggregate comments');
assert.match(sql, /from public\.session_photos/i, 'RPC should aggregate photos');
assert.match(sql, /jsonb_agg/i, 'RPC should return jsonb arrays');
// Supporting index for the feed session list query.
assert.match(sql, /create index if not exists sessions_feed_published_idx/i, 'migration should add a partial feed index');
// Grants + schema reload, matching the buddy/chug migrations.
assert.match(sql, /grant execute on function public\.get_session_feed_details\(uuid\[\]\) to authenticated/i, 'authenticated users should execute the RPC');
assert.match(sql, /revoke execute on function public\.get_session_feed_details\(uuid\[\]\) from public, anon/i, 'anon should not execute the RPC');
assert.match(sql, /notify pgrst, 'reload schema'/i, 'migration should reload the PostgREST schema cache');

console.log('session feed details SQL checks passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/sessionFeedDetails.test.js`
Expected: FAIL — `session feed details migration should exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260602130000_add_session_feed_details_rpc.sql`:

```sql
-- supabase/migrations/20260602130000_add_session_feed_details_rpc.sql
-- Collapses the Feed screen's per-session detail fan-out (cheers + beers +
-- comments + photos + author/cheerer/commenter profiles) into a single
-- viewer-aware RPC, mirroring public.get_session_chug_attempt_summaries.

-- Supports the feed session-list query: in (user_ids) + status='published'
-- + hide_from_feed=false, ordered by published_at desc.
create index if not exists sessions_feed_published_idx
  on public.sessions (user_id, published_at desc)
  where status = 'published' and hide_from_feed = false;

create or replace function public.get_session_feed_details(session_ids uuid[])
returns table (
  session_id uuid,
  author_username text,
  author_avatar_url text,
  cheers_count integer,
  cheers jsonb,
  beers jsonb,
  comments jsonb,
  photos jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_sessions as (
    select s.id, s.user_id
    from public.sessions s
    where s.id = any(coalesce(session_ids, array[]::uuid[]))
      and s.status = 'published'
      and (
        s.user_id = (select auth.uid())
        or exists (
          select 1
          from public.follows
          where follows.follower_id = (select auth.uid())
            and follows.following_id = s.user_id
        )
      )
  )
  select
    vs.id as session_id,
    author.username as author_username,
    author.avatar_url as author_avatar_url,
    coalesce(cheer_agg.cheers_count, 0) as cheers_count,
    coalesce(cheer_agg.cheers, '[]'::jsonb) as cheers,
    coalesce(beer_agg.beers, '[]'::jsonb) as beers,
    coalesce(comment_agg.comments, '[]'::jsonb) as comments,
    coalesce(photo_agg.photos, '[]'::jsonb) as photos
  from visible_sessions vs
  left join public.profiles author
    on author.id = vs.user_id
  left join lateral (
    select
      count(*)::int as cheers_count,
      jsonb_agg(
        jsonb_build_object(
          'user_id', ch.user_id,
          'username', pr.username,
          'avatar_url', pr.avatar_url,
          'created_at', ch.created_at
        )
        order by ch.created_at asc nulls last
      ) as cheers
    from public.session_cheers ch
    left join public.profiles pr on pr.id = ch.user_id
    where ch.session_id = vs.id
  ) cheer_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', sb.id,
        'session_id', sb.session_id,
        'beer_name', sb.beer_name,
        'volume', sb.volume,
        'quantity', sb.quantity,
        'abv', sb.abv,
        'note', sb.note,
        'consumed_at', sb.consumed_at,
        'created_at', sb.created_at
      )
      order by sb.consumed_at asc nulls last
    ) as beers
    from public.session_beers sb
    where sb.session_id = vs.id
  ) beer_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', co.id,
        'session_id', co.session_id,
        'user_id', co.user_id,
        'body', co.body,
        'created_at', co.created_at,
        'updated_at', co.updated_at,
        'username', pr.username,
        'avatar_url', pr.avatar_url
      )
      order by co.created_at asc nulls last
    ) as comments
    from public.session_comments co
    left join public.profiles pr on pr.id = co.user_id
    where co.session_id = vs.id
  ) comment_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', ph.id,
        'session_id', ph.session_id,
        'image_url', ph.image_url,
        'is_keeper', ph.is_keeper,
        'expires_at', ph.expires_at,
        'created_at', ph.created_at
      )
      order by ph.is_keeper desc, ph.created_at asc nulls last
    ) as photos
    from public.session_photos ph
    where ph.session_id = vs.id
  ) photo_agg on true;
$$;

revoke execute on function public.get_session_feed_details(uuid[]) from public, anon;
grant execute on function public.get_session_feed_details(uuid[]) to authenticated;

comment on function public.get_session_feed_details(uuid[]) is
  'Returns author profile plus jsonb cheers/beers/comments/photos for visible published sessions in one round-trip for the feed.';

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the SQL test to verify it passes**

Run: `node scripts/sessionFeedDetails.test.js`
Expected: PASS — prints `session feed details SQL checks passed`.

- [ ] **Step 5: Wire the test script into `package.json`**

In `package.json` `scripts`, add:

```json
    "test:session-feed-details": "node scripts/sessionFeedDetails.test.js",
```

- [ ] **Step 6: Apply the migration to the linked Supabase project**

Run: `npx supabase db push`
Expected: the new migration `20260602130000_add_session_feed_details_rpc.sql` is reported as applied. (If the CLI prompts for the DB password, supply it; this project is already linked via `supabase/.temp/linked-project.json`.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260602130000_add_session_feed_details_rpc.sql scripts/sessionFeedDetails.test.js package.json
git commit -m "feat: add get_session_feed_details RPC and partial feed index"
```

---

## Task 4: Client wrapper + wire FeedScreen to the RPC

**Files:**
- Create: `src/lib/sessionFeedDetails.ts`
- Modify: `scripts/sessionFeedDetails.test.js` (add mapper + wiring assertions)
- Modify: `src/screens/FeedScreen.tsx` (`fetchSessions` detail batch + `pageSessions` builder)
- Modify: `scripts/sessionPhotos.test.js`

- [ ] **Step 1: Add the failing mapper + wiring assertions**

In `scripts/sessionFeedDetails.test.js`, replace the final `console.log('session feed details SQL checks passed');` line with the following (keep everything above it):

```js
// ---- Client mapper unit tests ----
const Module = require('node:module');
const ts = require('typescript');

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

const feedDetails = loadTypeScriptModule('src/lib/sessionFeedDetails.ts', {
  './supabase': { supabase: {} },
});

const mapped = feedDetails.mapSessionFeedDetailRow({
  session_id: 'session-1',
  author_username: 'Beist',
  author_avatar_url: 'avatar.png',
  cheers_count: 2,
  cheers: [
    { user_id: 'u2', username: 'Tubpac', avatar_url: 'a2.png', created_at: '2026-06-02T10:00:00Z' },
  ],
  beers: [
    { id: 'b1', session_id: 'session-1', beer_name: 'Tuborg', volume: '50cl', quantity: 1, abv: 4.6, note: null, consumed_at: '2026-06-02T09:00:00Z', created_at: '2026-06-02T09:00:00Z' },
  ],
  comments: [
    { id: 'c1', session_id: 'session-1', user_id: 'u3', body: 'Skål', created_at: '2026-06-02T10:30:00Z', updated_at: null, username: 'Someone', avatar_url: 'a3.png' },
  ],
  photos: [
    { id: 'p1', session_id: 'session-1', image_url: 'p1.jpg', is_keeper: true, expires_at: null, created_at: '2026-06-02T09:00:00Z' },
  ],
});

assert.equal(mapped.sessionId, 'session-1', 'mapper keeps the session id');
assert.deepEqual(mapped.author, { username: 'Beist', avatarUrl: 'avatar.png' }, 'mapper builds the author profile');
assert.equal(mapped.cheersCount, 2, 'mapper carries the server cheers_count');
assert.deepEqual(mapped.cheers[0], { userId: 'u2', username: 'Tubpac', avatarUrl: 'a2.png', createdAt: '2026-06-02T10:00:00Z' }, 'mapper normalizes cheers');
assert.equal(mapped.comments[0].userId, 'u3', 'mapper normalizes comment author id');
assert.equal(mapped.comments[0].username, 'Someone', 'mapper carries comment author username');
assert.equal(mapped.beers[0].beer_name, 'Tuborg', 'mapper passes beers through in app shape');
assert.equal(mapped.photos[0].is_keeper, true, 'mapper passes photos through in app shape');

const emptyMapped = feedDetails.mapSessionFeedDetailRow({
  session_id: 'session-2',
  author_username: null,
  author_avatar_url: null,
  cheers_count: 0,
  cheers: null,
  beers: null,
  comments: null,
  photos: null,
});
assert.equal(emptyMapped.author, null, 'mapper returns null author when profile is missing');
assert.deepEqual(emptyMapped.cheers, [], 'mapper tolerates null jsonb arrays');
assert.deepEqual(emptyMapped.photos, [], 'mapper tolerates null photo arrays');

const feedLibSource = fs.readFileSync(path.join(root, 'src/lib/sessionFeedDetails.ts'), 'utf8');
assert.match(feedLibSource, /rpc\('get_session_feed_details'/, 'client lib should call the feed details RPC');

// ---- Feed wiring ----
const feedScreenSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');
assert.match(feedScreenSource, /fetchSessionFeedDetails/, 'feed should fetch session details through the consolidated RPC');
assert.doesNotMatch(feedScreenSource, /\.from\('session_cheers'\)\s*\n\s*\.select/, 'feed should no longer query session_cheers directly');
assert.match(feedScreenSource, /fetchSessionBuddySummaries/, 'feed should still fetch drinking buddy summaries');
assert.match(feedScreenSource, /get_session_chug_attempt_summaries/, 'feed should still fetch chug summaries');

console.log('session feed details checks passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/sessionFeedDetails.test.js`
Expected: FAIL — `Cannot find module '.../src/lib/sessionFeedDetails.ts'`.

- [ ] **Step 3: Create the client wrapper**

Create `src/lib/sessionFeedDetails.ts`:

```ts
import { SessionBeer } from './sessionBeers';
import { SessionPhoto } from './sessionPhotos';
import { supabase } from './supabase';
import { withTimeout } from './timeouts';

const SESSION_FEED_DETAILS_TIMEOUT_MS = 15000;

export type FeedDetailAuthor = {
  username: string | null;
  avatarUrl: string | null;
};

export type FeedDetailCheer = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
};

export type FeedDetailComment = {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type SessionFeedDetail = {
  sessionId: string;
  author: FeedDetailAuthor | null;
  cheers: FeedDetailCheer[];
  cheersCount: number;
  comments: FeedDetailComment[];
  commentsCount: number;
  beers: SessionBeer[];
  photos: SessionPhoto[];
};

type SessionFeedDetailRow = {
  session_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  cheers_count: number | null;
  cheers: unknown;
  beers: unknown;
  comments: unknown;
  photos: unknown;
};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const mapSessionFeedDetailRow = (row: SessionFeedDetailRow): SessionFeedDetail => {
  const cheers: FeedDetailCheer[] = asArray<any>(row.cheers).map((cheer) => ({
    userId: cheer.user_id,
    username: cheer.username ?? null,
    avatarUrl: cheer.avatar_url ?? null,
    createdAt: cheer.created_at ?? null,
  }));

  const comments: FeedDetailComment[] = asArray<any>(row.comments).map((comment) => ({
    id: comment.id,
    userId: comment.user_id,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at ?? null,
    username: comment.username ?? null,
    avatarUrl: comment.avatar_url ?? null,
  }));

  const hasAuthor = row.author_username !== null || row.author_avatar_url !== null;

  return {
    sessionId: row.session_id,
    author: hasAuthor
      ? { username: row.author_username, avatarUrl: row.author_avatar_url }
      : null,
    cheers,
    cheersCount: row.cheers_count ?? cheers.length,
    comments,
    commentsCount: comments.length,
    beers: asArray<SessionBeer>(row.beers),
    photos: asArray<SessionPhoto>(row.photos),
  };
};

export const fetchSessionFeedDetails = async (
  sessionIds: string[]
): Promise<Map<string, SessionFeedDetail>> => {
  const bySession = new Map<string, SessionFeedDetail>();
  const cleanIds = Array.from(new Set(sessionIds.filter(Boolean)));
  if (cleanIds.length === 0) return bySession;

  const { data, error } = await withTimeout(
    supabase.rpc('get_session_feed_details', { session_ids: cleanIds }),
    SESSION_FEED_DETAILS_TIMEOUT_MS,
    'Feed details are taking too long.'
  );

  if (error) throw error;

  ((data || []) as SessionFeedDetailRow[]).forEach((row) => {
    const detail = mapSessionFeedDetailRow(row);
    if (detail.sessionId) bySession.set(detail.sessionId, detail);
  });

  return bySession;
};
```

- [ ] **Step 4: Add the import to FeedScreen**

In `src/screens/FeedScreen.tsx`, add near the other `../lib` imports:

```ts
import { fetchSessionFeedDetails } from '../lib/sessionFeedDetails';
```

- [ ] **Step 5: Replace the detail fan-out in `fetchSessions`**

In `src/screens/FeedScreen.tsx`, replace the entire region that currently starts at the official-challenge fetch (`let officialPostChallengeSummaries = new Map<string, ChallengeSummary>();`, ~line 921) and ends with the close of the `pageSessions` builder (`});` after `has_cheered`, ~line 1116) with this block:

```ts
      const sessionIds = sessionRows.map((session) => session.id);

      const [detailsBySession, chugsResult, buddiesBySession, officialPostChallengeSummaries] = await withTimeout(
        Promise.all([
          sessionIds.length > 0
            ? fetchSessionFeedDetails(sessionIds)
            : Promise.resolve(new Map<string, Awaited<ReturnType<typeof fetchSessionFeedDetails>> extends Map<string, infer V> ? V : never>()),
          sessionIds.length > 0
            ? supabase.rpc('get_session_chug_attempt_summaries', { session_ids: sessionIds })
            : Promise.resolve({ data: [] as SessionChugAttemptRow[], error: null }),
          sessionIds.length > 0
            ? fetchSessionBuddySummaries(sessionIds).catch((error) => {
                console.error('Session buddies fetch error:', error);
                return new Map<string, SessionBuddy[]>();
              })
            : Promise.resolve(new Map<string, SessionBuddy[]>()),
          fetchOfficialPostLinkedChallengeSummaries(officialPosts).catch((error) => {
            console.error('Official challenge actions fetch error:', error);
            return new Map<string, ChallengeSummary>();
          }),
        ]),
        FEED_REQUEST_TIMEOUT_MS,
        'Feed details are taking too long.'
      );

      if (!isLatestRequest()) return;

      if (chugsResult.error) {
        console.error('Session chugs fetch error:', chugsResult.error);
      }

      setOfficialPostChallengesById((previous) => {
        const next = reset ? new Map<string, ChallengeSummary>() : new Map(previous);
        officialPostChallengeSummaries.forEach((challenge, id) => next.set(id, challenge));
        return next;
      });

      const chugRows = ((chugsResult.data || []) as SessionChugAttemptRow[]).map(mapChugAttemptRow);
      const chugsBySession = chugRows.reduce((acc, attempt) => {
        const existing = acc.get(attempt.sessionId) || [];
        existing.push(attempt);
        acc.set(attempt.sessionId, existing);
        return acc;
      }, new Map<string, SessionChugAttempt[]>());

      const pageSessions = sessionRows.map((session): FeedItem => {
        const detail = detailsBySession.get(session.id);
        const detailCheers = detail?.cheers || [];
        const detailComments = detail?.comments || [];
        const sessionBeers = (detail?.beers && detail.beers.length > 0)
          ? detail.beers
          : (session.beer_name
              ? [{
                  session_id: session.id,
                  beer_name: session.beer_name,
                  volume: session.volume,
                  quantity: session.quantity,
                  abv: session.abv ?? null,
                  consumed_at: session.created_at,
                }]
              : []);

        return {
          type: 'session',
          id: session.id,
          publishedAt: session.published_at || session.created_at,
          session: {
            ...session,
            session_photos: detail?.photos || [],
            session_beers: sessionBeers,
            session_chug_attempts: chugsBySession.get(session.id) || [],
            drinking_buddies: buddiesBySession.get(session.id) || [],
            profiles: detail?.author
              ? { username: detail.author.username, avatar_url: detail.author.avatarUrl }
              : null,
            cheer_profiles: detailCheers.map((cheer) => ({
              id: cheer.userId,
              username: cheer.username,
              avatar_url: cheer.avatarUrl,
            })),
            comments: detailComments.map((comment) => ({
              id: comment.id,
              session_id: session.id,
              user_id: comment.userId,
              body: comment.body,
              created_at: comment.createdAt,
              updated_at: comment.updatedAt,
              profiles: {
                id: comment.userId,
                username: comment.username,
                avatar_url: comment.avatarUrl,
              },
            })),
            comments_count: detail?.commentsCount ?? detailComments.length,
            cheers_count: detail?.cheersCount ?? detailCheers.length,
            has_cheered: user ? detailCheers.some((cheer) => cheer.userId === user.id) : false,
          }
        };
      });
```

Notes for the engineer:
- This deletes the old `cheersResult`/`beersResult`/`commentsResult`/`photosResult` `Promise.all`, the separate `profilesResult` query and `profilesById` map, and the `cheersBySession`/`beersBySession`/`commentsBySession`/`photosBySession` reducers — all of that data now comes from `detailsBySession`.
- The `Awaited<ReturnType<...>>` expression in the empty-array branch is only to keep the array element types aligned; if it reads awkwardly, replace that one line with `Promise.resolve(new Map<string, import('../lib/sessionFeedDetails').SessionFeedDetail>())` and add `SessionFeedDetail` to the existing `sessionFeedDetails` import instead.
- `user`, `officialPosts`, `sessionRows`, `isLatestRequest`, `mapChugAttemptRow`, `SessionChugAttempt`, `SessionChugAttemptRow`, `SessionBuddy`, `ChallengeSummary`, `fetchOfficialPostLinkedChallengeSummaries`, and `fetchSessionBuddySummaries` are all already in scope/imported in this file.

- [ ] **Step 6: Simplify the import branch (recommended cleanup)**

For readability, change the FeedScreen import added in Step 4 to also pull the type:

```ts
import { fetchSessionFeedDetails, SessionFeedDetail } from '../lib/sessionFeedDetails';
```

and replace the first array element's empty branch with:

```ts
          sessionIds.length > 0
            ? fetchSessionFeedDetails(sessionIds)
            : Promise.resolve(new Map<string, SessionFeedDetail>()),
```

- [ ] **Step 7: Update the photos test that asserted a direct query**

In `scripts/sessionPhotos.test.js`, replace this assertion (lines ~138-142):

```js
assert.match(
  feedScreenSource,
  /\.from\('session_photos'\)/,
  'feed should fetch session_photos for the normal session carousel'
);
```

with:

```js
assert.match(
  feedScreenSource,
  /fetchSessionFeedDetails/,
  'feed should fetch session photos through the consolidated feed details RPC'
);
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 9: Run the affected regression scripts**

Run: `node scripts/sessionFeedDetails.test.js`
Expected: PASS — prints `session feed details checks passed`.

Run: `node scripts/sessionPhotos.test.js`
Expected: PASS.

Run: `node scripts/drinkingBuddies.test.js`
Expected: PASS (feed still references `fetchSessionBuddySummaries`, `formatDrinkingBuddyNames`, `drinking_buddies:`).

- [ ] **Step 10: Manual smoke test (web)**

Run: `npm run web`
Open the app, sign in, and confirm on the Feed tab:
- Sessions render with avatars, pub name, drink label, photos (carousel + dots), cheers count + cheerer avatars, comment previews.
- "More stats" still shows drinks/true pints/avg ABV/chug + drinking buddies.
- Cheering and commenting still update optimistically.
- In browser DevTools → Network, a feed refresh now shows one `get_session_feed_details` POST instead of separate `session_cheers`/`session_beers`/`session_comments`/`session_photos`/`profiles` requests, and no `/auth/v1/user` request.

- [ ] **Step 11: Commit**

```bash
git add src/lib/sessionFeedDetails.ts src/screens/FeedScreen.tsx scripts/sessionFeedDetails.test.js scripts/sessionPhotos.test.js
git commit -m "perf: load feed session details via single RPC instead of 5-query fan-out"
```

---

## Task 5 (Optional): Sweep the remaining getUser id-reads

Not required to close the two red issues, but completes the win — the same `getUser → getCurrentUser` swap applied to the ~33 non-feed call sites. Each is the identical mechanical change from Task 2 Step 2: add `import { getCurrentUser } from '../lib/authSession';` (or `'./authSession'` for files in `src/lib`) and replace `const { data: { user } } = await supabase.auth.getUser();` with `const user = await getCurrentUser();`.

**Do not change** any site that needs server-side JWT revalidation for a security decision (none were found in review, but verify before each edit). Skip sites where the surrounding code already destructures `error` from `getUser()` and acts on it.

- [ ] **Step 1: Apply to screens (one commit per screen or grouped)**

Files and line references from review:
- `src/screens/RecordScreen.tsx` (lines 442, 599, 848, 1052, 1195, 1456, 1506, 1519, 1583) — note line 599 destructures `userError`; convert to `const user = await getCurrentUser();` and drop the `userError` branch only if it was solely a no-session guard.
- `src/screens/EditSessionScreen.tsx` (120, 235, 375, 529)
- `src/screens/ProfileScreen.tsx` (180, 388)
- `src/screens/PostDetailScreen.tsx` (125, 158)
- `src/screens/ProfileSetupScreen.tsx` (60, 150)
- `src/screens/NotificationsScreen.tsx` (109)
- `src/screens/PeopleScreen.tsx` (58)
- `src/screens/UserProfileScreen.tsx` (150)
- `src/screens/HangoverRatingScreen.tsx` (62)
- `src/screens/AdminToolsScreen.tsx` (333)

- [ ] **Step 2: Apply to lib + components**

- `src/lib/notificationsContext.tsx` (26)
- `src/lib/pubDirectory.ts` (150)
- `src/lib/pushNotifications.ts` (182, 227, 245)
- `src/lib/timezone.ts` (18)
- `src/components/DrinkingBuddiesPicker.tsx` (55)
- `src/components/PushReminderPrompt.tsx` (41)

- [ ] **Step 3: Verify nothing references getUser in app code**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `git grep -n "auth.getUser()" src/`
Expected: no results (or only deliberately-kept revalidation sites you can name).

- [ ] **Step 4: Run the full regression suite**

Run each previously-passing `test:*` script touched by these files, e.g.:
`node scripts/notifications.test.js`, `node scripts/timeouts.test.js`, `node scripts/drinkingBuddies.test.js`, `node scripts/profileStats.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "perf: read cached session instead of getUser across remaining screens"
```

---

## Self-Review Notes

- **Spec coverage:** Red issue #2 (getUser in hot path) → Tasks 1-2 (helper + feed/pub-crawl sites), fully closed; Task 5 optional extension. Red issue #1 (feed waterfall) → Tasks 3-4: removes the dependent profiles round-trip, collapses 5 queries into 1 RPC, and parallelizes the official-post linked-challenge fetch into the same batch.
- **Round-trip math:** feed cold load goes from ~8 sequential round-trips (getUser → follows → [sessions|crawls(getUser+2 stages)|official] → linked challenges → [6 detail queries] → profiles) to ~4 (follows → [sessions|crawls|official] → [feed details | chugs | buddies | linked challenges]), with two `/auth/v1/user` calls eliminated.
- **Type consistency:** lib exposes camelCase (`userId`, `avatarUrl`, `createdAt`); FeedScreen converts to the existing snake_case `ProfilePreview`/`FeedComment`/`FeedSession` shapes the card already consumes. `beers`/`photos` pass through as the shared `SessionBeer`/`SessionPhoto` types (RPC emits matching snake_case keys).
- **RLS:** the RPC is `security definer` (bypasses per-table RLS) but reimposes feed visibility (`status='published'` AND own-or-followed) exactly like `get_session_chug_attempt_summaries`, so it cannot leak private/unfollowed sessions.
- **Pagination unaffected:** the session list query, its 21-row `hasMore` probe, and all crawl/official-post merging are unchanged; only per-session detail assembly is swapped.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-02-feed-performance.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
