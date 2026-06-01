# Beer Chugging Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved 33cl bottled-beer chug feature with local MediaPipe timing, immediate unverified feed stats, and mutual-follower verification.

**Architecture:** Add a dedicated `session_chug_attempts` table and private `chug_videos` storage bucket, then keep client behavior in focused helpers and small components. Record flow creates unverified attempts; feed/detail views read public chug summaries; a verifier review screen approves or rejects through a secure RPC that clears proof video paths.

**Tech Stack:** Expo React Native/Web, Supabase Postgres/RLS/Storage/RPC, `expo-image-picker` video capture, `@mediapipe/tasks-vision` for web/PWA analysis, existing Node script tests.

---

## Scope Check

This feature touches database, storage, notifications, record UI, MediaPipe analysis, feed rendering, and review UI. These pieces are dependent on each other and produce one end-to-end feature, so keep them in one plan but commit after each task.

The MediaPipe Tasks Vision package is web-focused in this Expo app. V1 should enable analysis on web/PWA and show a clear disabled message on native until a custom native MediaPipe integration is chosen.

Official docs used while planning:

- MediaPipe Object Detector Web guide: `https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector/web_js`
- MediaPipe Face Landmarker guide: `https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker`

## File Structure

- Create `src/lib/chugAttempts.ts`: chug types, 33cl eligibility helpers, fastest-stat helpers, duration/status formatting, row mapping.
- Create `src/lib/chugDetection.ts`: pure rectangle overlap and stable contact state machine.
- Create `src/lib/chugMediaPipe.ts`: web-only MediaPipe model loading and video frame analysis.
- Create `src/lib/chugProofStorage.ts`: proof video upload and signed URL helpers for the private bucket.
- Create `src/components/ChugAttemptModal.tsx`: active-session setup, eligible drink choice, mutual verifier choice, recording/retry/accept states.
- Create `src/screens/ChugVerificationScreen.tsx`: verifier review screen with proof video and approve/reject actions.
- Modify `src/screens/RecordScreen.tsx`: show chug action, fetch mutual followers, capture video, run analysis, save attempt, send notification.
- Modify `src/screens/FeedScreen.tsx`: fetch and render fastest visible chug summaries.
- Modify `src/screens/PostDetailScreen.tsx`: fetch and render chug summaries for deep-linked session posts.
- Modify `src/screens/NotificationsScreen.tsx`: include chug verification notification type and route to review screen.
- Modify `src/navigation/RootNavigator.tsx`: add chug review route and web launch params.
- Modify `src/lib/notificationMessages.ts`: add chug verification metadata and copy.
- Modify `supabase/functions/send-push/index.ts`: add push copy and deep link for chug verification.
- Create `supabase/migrations/20260601120000_add_session_chug_attempts.sql`: table, storage bucket, RLS policies, public summary RPC, review RPC, notification type and policy.
- Create tests:
  - `scripts/chugAttempts.test.js`
  - `scripts/chugDetection.test.js`
  - `scripts/chugDatabase.test.js`
  - `scripts/chugNotifications.test.js`
  - `scripts/chugRecordScreen.test.js`
  - `scripts/chugFeedStats.test.js`

---

### Task 1: Domain Helpers

**Files:**
- Create: `src/lib/chugAttempts.ts`
- Create: `scripts/chugAttempts.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `scripts/chugAttempts.test.js`:

```js
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = require('node:fs').readFileSync(filename, 'utf8');
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

const {
  CHUG_REQUIRED_VOLUME,
  formatChugDuration,
  formatChugStatusLabel,
  getFastestVisibleChugAttempt,
  getChugStatSubtitle,
  isBottleChugEligibleBeer,
  mapChugAttemptRow,
} = loadTypeScriptModule('src/lib/chugAttempts.ts');

const catalog = [
  { name: 'Tuborg Gron', abv: 4.6 },
  { name: 'Breezer Lime', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Sambuca Shot', abv: 40, kind: 'mixed', defaultVolume: '2cl', countedVolume: '2cl' },
];

assert.equal(CHUG_REQUIRED_VOLUME, '33cl');
assert.equal(isBottleChugEligibleBeer({ beer_name: 'Tuborg Gron', volume: '33cl', quantity: 1 }, catalog), true);
assert.equal(isBottleChugEligibleBeer({ beer_name: 'Tuborg Gron', volume: '50cl', quantity: 1 }, catalog), false);
assert.equal(isBottleChugEligibleBeer({ beer_name: 'Breezer Lime', volume: '33cl', quantity: 1 }, catalog), false);
assert.equal(isBottleChugEligibleBeer({ beer_name: 'Sambuca Shot', volume: '33cl', quantity: 1 }, catalog), false);

assert.equal(formatChugDuration(4800), '4.8s');
assert.equal(formatChugDuration(4250), '4.25s');
assert.equal(formatChugStatusLabel('unverified'), 'Unverified');
assert.equal(formatChugStatusLabel('verified'), 'Verified');
assert.equal(formatChugStatusLabel('rejected'), 'Rejected');

const attempts = [
  { id: 'slow', sessionId: 's1', status: 'verified', durationMs: 6200, requiredVolume: '33cl', containerType: 'bottle' },
  { id: 'bad', sessionId: 's1', status: 'rejected', durationMs: 3000, requiredVolume: '33cl', containerType: 'bottle' },
  { id: 'fast', sessionId: 's1', status: 'unverified', durationMs: 4100, requiredVolume: '33cl', containerType: 'bottle' },
];

assert.equal(getFastestVisibleChugAttempt(attempts).id, 'fast');
assert.equal(getChugStatSubtitle(attempts[2]), '33cl bottle - Unverified');

assert.deepEqual(
  mapChugAttemptRow({
    id: 'row-1',
    session_id: 'session-1',
    session_beer_id: 'beer-1',
    user_id: 'user-1',
    verifier_user_id: 'verifier-1',
    status: 'verified',
    duration_ms: 5123,
    confidence_score: 0.86,
    detected_start_ms: 1200,
    detected_end_ms: 6323,
    container_type: 'bottle',
    required_volume: '33cl',
    created_at: '2026-06-01T12:00:00Z',
    verified_at: '2026-06-01T12:03:00Z',
    beer_name: 'Tuborg Gron',
  }),
  {
    id: 'row-1',
    sessionId: 'session-1',
    sessionBeerId: 'beer-1',
    userId: 'user-1',
    verifierUserId: 'verifier-1',
    status: 'verified',
    durationMs: 5123,
    confidenceScore: 0.86,
    detectedStartMs: 1200,
    detectedEndMs: 6323,
    containerType: 'bottle',
    requiredVolume: '33cl',
    createdAt: '2026-06-01T12:00:00Z',
    verifiedAt: '2026-06-01T12:03:00Z',
    beerName: 'Tuborg Gron',
  }
);

console.log('chug attempt helper checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/chugAttempts.test.js`

Expected: FAIL with a module-not-found error for `src/lib/chugAttempts.ts`.

- [ ] **Step 3: Add the helper implementation**

Create `src/lib/chugAttempts.ts`:

```ts
import { BeerCatalogItem, getBeverageCatalogItem, SessionBeer } from './sessionBeers';

export const CHUG_REQUIRED_VOLUME = '33cl';
export const CHUG_CONTAINER_TYPE = 'bottle';
export const CHUG_VIDEO_MAX_SECONDS = 15;
export const CHUG_VIDEO_MAX_MS = CHUG_VIDEO_MAX_SECONDS * 1000;

export type ChugVerificationStatus = 'unverified' | 'verified' | 'rejected';

export type SessionChugAttempt = {
  id: string;
  sessionId: string;
  sessionBeerId: string;
  userId?: string | null;
  verifierUserId?: string | null;
  status: ChugVerificationStatus;
  durationMs: number;
  confidenceScore?: number | null;
  detectedStartMs?: number | null;
  detectedEndMs?: number | null;
  containerType?: string | null;
  requiredVolume?: string | null;
  createdAt?: string | null;
  verifiedAt?: string | null;
  beerName?: string | null;
};

export type SessionChugAttemptRow = {
  id: string;
  session_id: string;
  session_beer_id: string;
  user_id?: string | null;
  verifier_user_id?: string | null;
  status: ChugVerificationStatus | string;
  duration_ms: number;
  confidence_score?: number | null;
  detected_start_ms?: number | null;
  detected_end_ms?: number | null;
  container_type?: string | null;
  required_volume?: string | null;
  created_at?: string | null;
  verified_at?: string | null;
  beer_name?: string | null;
};

const normalizeVolume = (volume?: string | null) => (
  (volume || '').trim().toLowerCase().replace(/\s+/g, '')
);

const normalizeStatus = (status?: string | null): ChugVerificationStatus => {
  if (status === 'verified' || status === 'rejected') return status;
  return 'unverified';
};

export const isBottleChugEligibleBeer = (
  beer: Pick<SessionBeer, 'beer_name' | 'volume'>,
  catalog: BeerCatalogItem[] = []
) => {
  if (normalizeVolume(beer.volume) !== normalizeVolume(CHUG_REQUIRED_VOLUME)) return false;
  const beverage = getBeverageCatalogItem(beer.beer_name || '', catalog);
  return !beverage?.kind || beverage.kind === 'beer';
};

export const formatChugDuration = (durationMs?: number | null) => {
  const safeMs = Math.max(0, Math.round(Number(durationMs) || 0));
  const seconds = safeMs / 1000;
  const decimals = safeMs % 1000 === 0 ? 0 : safeMs % 100 === 0 ? 1 : 2;
  return `${seconds.toFixed(decimals)}s`;
};

export const formatChugStatusLabel = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'verified') return 'Verified';
  if (normalized === 'rejected') return 'Rejected';
  return 'Unverified';
};

export const getChugStatSubtitle = (attempt: Pick<SessionChugAttempt, 'status' | 'requiredVolume' | 'containerType'>) => {
  const volume = attempt.requiredVolume || CHUG_REQUIRED_VOLUME;
  const container = attempt.containerType || CHUG_CONTAINER_TYPE;
  return `${volume} ${container} - ${formatChugStatusLabel(attempt.status)}`;
};

export const getFastestVisibleChugAttempt = <T extends Pick<SessionChugAttempt, 'status' | 'durationMs'>>(
  attempts: T[] = []
) => {
  return attempts
    .filter((attempt) => attempt.status !== 'rejected' && attempt.durationMs > 0)
    .sort((a, b) => a.durationMs - b.durationMs)[0] || null;
};

export const mapChugAttemptRow = (row: SessionChugAttemptRow): SessionChugAttempt => ({
  id: row.id,
  sessionId: row.session_id,
  sessionBeerId: row.session_beer_id,
  userId: row.user_id ?? null,
  verifierUserId: row.verifier_user_id ?? null,
  status: normalizeStatus(row.status),
  durationMs: Math.round(Number(row.duration_ms) || 0),
  confidenceScore: row.confidence_score ?? null,
  detectedStartMs: row.detected_start_ms ?? null,
  detectedEndMs: row.detected_end_ms ?? null,
  containerType: row.container_type ?? CHUG_CONTAINER_TYPE,
  requiredVolume: row.required_volume ?? CHUG_REQUIRED_VOLUME,
  createdAt: row.created_at ?? null,
  verifiedAt: row.verified_at ?? null,
  beerName: row.beer_name ?? null,
});
```

- [ ] **Step 4: Add the package script**

Modify `package.json` scripts:

```json
"test:chugs": "node scripts/chugAttempts.test.js"
```

Keep the existing scripts and add the new entry after `test:session-beers`.

- [ ] **Step 5: Run helper test to verify it passes**

Run: `npm run test:chugs`

Expected: PASS and prints `chug attempt helper checks passed`.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json scripts/chugAttempts.test.js src/lib/chugAttempts.ts
git commit -m "feat: add chug attempt helpers"
```

---

### Task 2: Database, Storage, RLS, And RPCs

**Files:**
- Create: `supabase/migrations/20260601120000_add_session_chug_attempts.sql`
- Create: `scripts/chugDatabase.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing database source test**

Create `scripts/chugDatabase.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.resolve(__dirname, '..', 'supabase/migrations/20260601120000_add_session_chug_attempts.sql');
const source = fs.readFileSync(migrationPath, 'utf8');

assert.match(source, /create table if not exists public\.session_chug_attempts/, 'migration should create session_chug_attempts');
assert.match(source, /status in \('unverified', 'verified', 'rejected'\)/, 'migration should constrain chug status');
assert.match(source, /required_volume = '33cl'/, 'migration should constrain required volume');
assert.match(source, /container_type = 'bottle'/, 'migration should constrain bottle container');
assert.match(source, /insert into storage\.buckets/, 'migration should create chug_videos storage bucket');
assert.match(source, /create or replace function public\.is_mutual_follower/, 'migration should expose mutual follower helper');
assert.match(source, /create or replace function public\.get_session_chug_attempt_summaries/, 'migration should expose feed summary RPC');
assert.match(source, /create or replace function public\.review_chug_attempt/, 'migration should expose verifier review RPC');
assert.match(source, /delete from storage\.objects/, 'review RPC should delete temporary proof objects');
assert.match(source, /'chug_verification'/, 'notification type should include chug_verification');
assert.match(source, /Users can create chug verification notifications/, 'notification policy should allow attempt owner to notify chosen verifier');

console.log('chug database migration checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/chugDatabase.test.js`

Expected: FAIL with `ENOENT` for the migration file.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260601120000_add_session_chug_attempts.sql`:

```sql
create table if not exists public.session_chug_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  session_beer_id uuid not null references public.session_beers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  verifier_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'unverified',
  duration_ms integer not null,
  confidence_score double precision,
  detected_start_ms integer,
  detected_end_ms integer,
  container_type text not null default 'bottle',
  required_volume text not null default '33cl',
  video_path text,
  thumbnail_path text,
  verifier_note text,
  created_at timestamp with time zone not null default now(),
  verified_at timestamp with time zone,
  constraint session_chug_attempts_status_check check (status in ('unverified', 'verified', 'rejected')),
  constraint session_chug_attempts_duration_check check (duration_ms > 0 and duration_ms <= 15000),
  constraint session_chug_attempts_container_check check (container_type = 'bottle'),
  constraint session_chug_attempts_required_volume_check check (required_volume = '33cl'),
  constraint session_chug_attempts_no_self_verify check (user_id <> verifier_user_id)
);

create index if not exists session_chug_attempts_session_status_duration_idx
  on public.session_chug_attempts(session_id, status, duration_ms);

create index if not exists session_chug_attempts_user_created_at_idx
  on public.session_chug_attempts(user_id, created_at desc);

create index if not exists session_chug_attempts_verifier_status_created_at_idx
  on public.session_chug_attempts(verifier_user_id, status, created_at desc);

create index if not exists session_chug_attempts_session_beer_id_idx
  on public.session_chug_attempts(session_beer_id);

alter table public.session_chug_attempts enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chug_videos',
  'chug_videos',
  false,
  15728640,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_mutual_follower(first_user_id uuid, second_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.follows outgoing_follow
    join public.follows incoming_follow
      on incoming_follow.follower_id = second_user_id
     and incoming_follow.following_id = first_user_id
    where outgoing_follow.follower_id = first_user_id
      and outgoing_follow.following_id = second_user_id
  );
$$;

drop policy if exists "Session chug attempts are viewable by owner and verifier" on public.session_chug_attempts;
create policy "Session chug attempts are viewable by owner and verifier"
  on public.session_chug_attempts
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or verifier_user_id = (select auth.uid())
  );

drop policy if exists "Users can create valid chug attempts" on public.session_chug_attempts;
create policy "Users can create valid chug attempts"
  on public.session_chug_attempts
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'unverified'
    and container_type = 'bottle'
    and required_volume = '33cl'
    and public.is_mutual_follower(user_id, verifier_user_id)
    and exists (
      select 1
      from public.sessions
      where sessions.id = session_chug_attempts.session_id
        and sessions.user_id = session_chug_attempts.user_id
    )
    and exists (
      select 1
      from public.session_beers
      where session_beers.id = session_chug_attempts.session_beer_id
        and session_beers.session_id = session_chug_attempts.session_id
        and lower(replace(coalesce(session_beers.volume, ''), ' ', '')) = '33cl'
    )
  );

drop policy if exists "Users can upload their own chug proofs" on storage.objects;
create policy "Users can upload their own chug proofs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chug_videos'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

drop policy if exists "Chug proof videos are viewable by owner and verifier" on storage.objects;
create policy "Chug proof videos are viewable by owner and verifier"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chug_videos'
    and exists (
      select 1
      from public.session_chug_attempts attempts
      where attempts.video_path = storage.objects.name
        and (attempts.user_id = (select auth.uid()) or attempts.verifier_user_id = (select auth.uid()))
    )
  );

drop policy if exists "Users can delete their own unreviewed chug proofs" on storage.objects;
create policy "Users can delete their own unreviewed chug proofs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chug_videos'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = (select auth.uid())::text
  );

create or replace function public.get_session_chug_attempt_summaries(session_ids uuid[])
returns table (
  id uuid,
  session_id uuid,
  session_beer_id uuid,
  status text,
  duration_ms integer,
  confidence_score double precision,
  detected_start_ms integer,
  detected_end_ms integer,
  container_type text,
  required_volume text,
  created_at timestamp with time zone,
  verified_at timestamp with time zone,
  beer_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    attempts.id,
    attempts.session_id,
    attempts.session_beer_id,
    attempts.status,
    attempts.duration_ms,
    attempts.confidence_score,
    attempts.detected_start_ms,
    attempts.detected_end_ms,
    attempts.container_type,
    attempts.required_volume,
    attempts.created_at,
    attempts.verified_at,
    session_beers.beer_name
  from public.session_chug_attempts attempts
  join public.sessions
    on sessions.id = attempts.session_id
  join public.session_beers
    on session_beers.id = attempts.session_beer_id
  where attempts.session_id = any(session_ids)
    and attempts.status <> 'rejected'
    and sessions.status = 'published'
    and (
      sessions.user_id = (select auth.uid())
      or exists (
        select 1
        from public.follows
        where follows.follower_id = (select auth.uid())
          and follows.following_id = sessions.user_id
      )
    );
$$;

create or replace function public.review_chug_attempt(
  target_attempt_id uuid,
  next_status text,
  note text default null
)
returns public.session_chug_attempts
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  attempt public.session_chug_attempts;
  cleaned_note text := nullif(btrim(coalesce(note, '')), '');
begin
  if next_status not in ('verified', 'rejected') then
    raise exception 'Chug review status must be verified or rejected.';
  end if;

  select *
  into attempt
  from public.session_chug_attempts
  where id = target_attempt_id
  for update;

  if attempt.id is null then
    raise exception 'Chug attempt not found.';
  end if;

  if attempt.verifier_user_id <> (select auth.uid()) then
    raise exception 'Only the chosen verifier can review this chug attempt.';
  end if;

  if attempt.status <> 'unverified' then
    raise exception 'This chug attempt has already been reviewed.';
  end if;

  delete from storage.objects
  where bucket_id = 'chug_videos'
    and name in (
      select media.path
      from unnest(array[attempt.video_path, attempt.thumbnail_path]) as media(path)
      where media.path is not null and btrim(media.path) <> ''
    );

  update public.session_chug_attempts
  set
    status = next_status,
    verifier_note = cleaned_note,
    verified_at = now(),
    video_path = null,
    thumbnail_path = null
  where id = target_attempt_id
  returning * into attempt;

  return attempt;
end;
$$;

grant execute on function public.is_mutual_follower(uuid, uuid) to authenticated;
grant execute on function public.get_session_chug_attempt_summaries(uuid[]) to authenticated;
grant execute on function public.review_chug_attempt(uuid, text, text) to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications drop constraint notifications_type_check;
  end if;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'cheer',
      'invite',
      'session_started',
      'comment',
      'invite_response',
      'pub_crawl_started',
      'hangover_check',
      'follow',
      'chug_verification'
    ));
end $$;

drop policy if exists "Users can create chug verification notifications" on public.notifications;
create policy "Users can create chug verification notifications"
  on public.notifications
  for insert
  to authenticated
  with check (
    type = 'chug_verification'
    and actor_id = (select auth.uid())
    and exists (
      select 1
      from public.session_chug_attempts attempts
      where attempts.id = notifications.reference_id
        and attempts.user_id = notifications.actor_id
        and attempts.verifier_user_id = notifications.user_id
        and attempts.status = 'unverified'
    )
  );

comment on table public.session_chug_attempts is 'Timed 33cl bottled-beer chug attempts attached to session beers.';
comment on function public.get_session_chug_attempt_summaries(uuid[]) is 'Returns public chug stat metadata for published sessions without proof video paths.';
comment on function public.review_chug_attempt(uuid, text, text) is 'Lets the chosen verifier approve or reject a chug attempt and clears temporary proof media.';
```

- [ ] **Step 4: Add the package script**

Modify `package.json` scripts:

```json
"test:chug-db": "node scripts/chugDatabase.test.js"
```

- [ ] **Step 5: Run database source test**

Run: `npm run test:chug-db`

Expected: PASS and prints `chug database migration checks passed`.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json scripts/chugDatabase.test.js supabase/migrations/20260601120000_add_session_chug_attempts.sql
git commit -m "feat: add chug attempt database model"
```

---

### Task 3: Notifications And Deep Link Plumbing

**Files:**
- Create: `scripts/chugNotifications.test.js`
- Modify: `src/lib/notificationMessages.ts`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/NotificationsScreen.tsx`
- Modify: `supabase/functions/send-push/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing notification test**

Create `scripts/chugNotifications.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
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

const { getNotificationMessage } = loadTypeScriptModule('src/lib/notificationMessages.ts');

assert.equal(
  getNotificationMessage({ type: 'chug_verification', metadata: { duration_ms: 4800, beer_name: 'Tuborg Gron' } }),
  ' wants you to verify a 33cl bottle chug.'
);

const rootNavigatorSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/navigation/RootNavigator.tsx'), 'utf8');
assert.match(rootNavigatorSource, /ChugVerificationScreen/, 'root navigator should register chug verification screen');
assert.match(rootNavigatorSource, /getChugVerificationLaunchParamsFromUrl/, 'root navigator should parse chug verification launch params');

const notificationsScreenSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/NotificationsScreen.tsx'), 'utf8');
assert.match(notificationsScreenSource, /chug_verification/, 'notifications screen should know the chug verification type');
assert.match(notificationsScreenSource, /openChugVerification/, 'notifications screen should route chug verification notifications');

const pushSource = fs.readFileSync(path.resolve(__dirname, '..', 'supabase/functions/send-push/index.ts'), 'utf8');
assert.match(pushSource, /chug_verification/, 'push function should support chug verification notifications');
assert.match(pushSource, /chug_verification=1/, 'push URL should deep-link to chug verification review');

console.log('chug notification checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/chugNotifications.test.js`

Expected: FAIL because `chug_verification` is not handled.

- [ ] **Step 3: Update notification message metadata and copy**

In `src/lib/notificationMessages.ts`, extend `NotificationMetadata`:

```ts
export type NotificationMetadata = {
  pub_name?: string | null;
  prompt_id?: string | null;
  target_type?: 'session' | 'pub_crawl' | 'chug_attempt' | string | null;
  session_id?: string | null;
  beer_name?: string | null;
  duration_ms?: number | string | null;
};
```

Add this branch before the invite fallback in `getNotificationMessage`:

```ts
if (item.type === 'chug_verification') return ' wants you to verify a 33cl bottle chug.';
```

- [ ] **Step 4: Add chug verification route parsing**

In `src/navigation/RootNavigator.tsx`, import the screen:

```ts
import { ChugVerificationScreen } from '../screens/ChugVerificationScreen';
```

Add a launch param type near `HangoverLaunchParams`:

```ts
type ChugVerificationLaunchParams = {
  attemptId: string;
  notificationId?: string | null;
};
```

Add parser and clearer:

```ts
const getChugVerificationLaunchParamsFromUrl = (): ChugVerificationLaunchParams | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('chug_verification') !== '1') return null;
  const attemptId = params.get('attempt_id') || params.get('id');
  if (!attemptId) return null;
  return {
    attemptId,
    notificationId: params.get('notificationId'),
  };
};

const clearChugVerificationLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('chug_verification');
  url.searchParams.delete('attempt_id');
  url.searchParams.delete('id');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};
```

Add pending ref inside `RootNavigator`:

```ts
const pendingChugVerificationOpenRef = useRef<ChugVerificationLaunchParams | null>(getChugVerificationLaunchParamsFromUrl());
```

In the pending navigation effect, before notifications fallback:

```ts
const pendingChugVerificationOpen = pendingChugVerificationOpenRef.current;
if (pendingChugVerificationOpen) {
  pendingChugVerificationOpenRef.current = null;
  navigationRef.navigate('ChugVerification', pendingChugVerificationOpen);
  clearChugVerificationLaunchParams();
  return;
}
```

Add the stack screen near `PostDetail`:

```tsx
<Stack.Screen name="ChugVerification" component={ChugVerificationScreen} />
```

- [ ] **Step 5: Update notifications list routing**

In `src/screens/NotificationsScreen.tsx`, extend `NotificationType`:

```ts
type NotificationType = 'cheer' | 'invite' | 'session_started' | 'comment' | 'invite_response' | 'pub_crawl_started' | 'hangover_check' | 'follow' | 'chug_verification';
```

Import an icon:

```ts
import { ArrowLeft, Beer, Check, Coffee, MapPin, MessageCircle, PartyPopper, Timer, UserPlus, XCircle } from 'lucide-react-native';
```

Add callback:

```ts
const openChugVerification = useCallback((item: NotificationRow) => {
  if (!item.reference_id) return;
  navigation.navigate('ChugVerification', {
    attemptId: item.reference_id,
    notificationId: item.id,
  });
}, [navigation]);
```

Add icon branch:

```tsx
if (item.type === 'chug_verification') return <Timer color={colors.primary} size={24} />;
```

In `renderItem`, add:

```ts
const opensChugVerification = item.type === 'chug_verification' && Boolean(item.reference_id);
const ContentWrapper: any = opensPost || opensChugVerification ? TouchableOpacity : View;
const contentWrapperProps = opensChugVerification
  ? {
      onPress: () => openChugVerification(item),
      activeOpacity: 0.75,
      accessibilityRole: 'button',
      accessibilityLabel: 'Open chug verification',
    }
  : opensPost
    ? {
        onPress: () => postTarget && openPost(postTarget),
        activeOpacity: 0.75,
        accessibilityRole: 'button',
        accessibilityLabel: postTarget?.targetType === 'pub_crawl' ? 'Open this pub crawl' : 'Open this post',
      }
    : {};
```

Replace the existing `ContentWrapper` and `contentWrapperProps` block with the block above.

- [ ] **Step 6: Update push function**

In `supabase/functions/send-push/index.ts`, extend `NotificationRow['type']`:

```ts
type: 'cheer' | 'invite' | 'session_started' | 'comment' | 'invite_response' | 'pub_crawl_started' | 'hangover_check' | 'follow' | 'chug_verification';
```

Extend metadata:

```ts
target_type?: 'session' | 'pub_crawl' | 'chug_attempt' | string | null;
session_id?: string | null;
beer_name?: string | null;
duration_ms?: number | string | null;
```

Add message branch after `follow`:

```ts
} else if (record.type === 'chug_verification') {
  title = 'Chug verification';
  bodyText = `${actorName} wants you to verify a 33cl bottle chug`;
```

Add URL branch before hangover:

```ts
if (record.type === 'chug_verification' && record.reference_id) {
  url = `/?chug_verification=1&attempt_id=${encodeURIComponent(record.reference_id)}&notificationId=${encodeURIComponent(record.id)}`;
} else if (record.type === 'hangover_check' && record.reference_id) {
```

- [ ] **Step 7: Add package script and run test**

Modify `package.json` scripts:

```json
"test:chug-notifications": "node scripts/chugNotifications.test.js"
```

Run: `npm run test:chug-notifications`

Expected: FAIL only if `ChugVerificationScreen` does not exist yet. If it fails for that reason, create a temporary screen file in Step 8. If it fails for a different reason, fix the message/routing/push snippets above before continuing.

- [ ] **Step 8: Create temporary review screen shell**

Create `src/screens/ChugVerificationScreen.tsx` so navigation compiles until Task 7 fills it in:

```tsx
import React from 'react';
import { Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export const ChugVerificationScreen = () => (
  <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <Text style={[typography.h2, { color: colors.text, textAlign: 'center' }]}>Chug verification</Text>
  </View>
);
```

Run: `npm run test:chug-notifications`

Expected: PASS and prints `chug notification checks passed`.

- [ ] **Step 9: Commit**

Run:

```bash
git add package.json scripts/chugNotifications.test.js src/lib/notificationMessages.ts src/navigation/RootNavigator.tsx src/screens/NotificationsScreen.tsx src/screens/ChugVerificationScreen.tsx supabase/functions/send-push/index.ts
git commit -m "feat: route chug verification notifications"
```

---

### Task 4: Local Chug Detection And MediaPipe Wrapper

**Files:**
- Create: `src/lib/chugDetection.ts`
- Create: `src/lib/chugMediaPipe.ts`
- Create: `scripts/chugDetection.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install MediaPipe Tasks Vision**

Run: `npm install @mediapipe/tasks-vision`

Expected: `package.json` and `package-lock.json` include `@mediapipe/tasks-vision`.

- [ ] **Step 2: Write the failing pure detection test**

Create `scripts/chugDetection.test.js`:

```js
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = require('node:fs').readFileSync(filename, 'utf8');
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

const {
  analyzeChugContactFrames,
  boxesOverlap,
  getMouthBoxFromLandmarks,
} = loadTypeScriptModule('src/lib/chugDetection.ts');

assert.equal(
  boxesOverlap({ x: 10, y: 10, width: 20, height: 20 }, { x: 25, y: 25, width: 20, height: 20 }),
  true
);
assert.equal(
  boxesOverlap({ x: 10, y: 10, width: 10, height: 10 }, { x: 40, y: 40, width: 10, height: 10 }),
  false
);

assert.deepEqual(
  getMouthBoxFromLandmarks([
    { x: 0.45, y: 0.5 },
    { x: 0.55, y: 0.5 },
    { x: 0.5, y: 0.54 },
  ], 1000, 1000),
  { x: 430, y: 480, width: 140, height: 80 }
);

const frames = [
  { timeMs: 0, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: null },
  { timeMs: 200, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 120, y: 100, width: 80, height: 120 } },
  { timeMs: 350, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 120, y: 100, width: 80, height: 120 } },
  { timeMs: 1000, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 120, y: 100, width: 80, height: 120 } },
  { timeMs: 4300, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 240, y: 100, width: 80, height: 120 } },
  { timeMs: 4650, mouthBox: { x: 100, y: 100, width: 60, height: 40 }, bottleBox: { x: 240, y: 100, width: 80, height: 120 } },
];

const result = analyzeChugContactFrames(frames);
assert.equal(result.ok, true);
assert.equal(result.detectedStartMs, 200);
assert.equal(result.detectedEndMs, 4300);
assert.equal(result.durationMs, 4100);
assert.ok(result.confidenceScore > 0.5);

const failed = analyzeChugContactFrames([{ timeMs: 0, mouthBox: null, bottleBox: null }]);
assert.equal(failed.ok, false);
assert.equal(failed.reason, 'No stable mouth and bottle contact detected.');

console.log('chug detection checks passed');
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node scripts/chugDetection.test.js`

Expected: FAIL with a module-not-found error for `src/lib/chugDetection.ts`.

- [ ] **Step 4: Add pure detection implementation**

Create `src/lib/chugDetection.ts`:

```ts
export type ChugRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChugLandmark = {
  x: number;
  y: number;
};

export type ChugDetectionFrame = {
  timeMs: number;
  mouthBox: ChugRect | null;
  bottleBox: ChugRect | null;
};

export type ChugDetectionResult = {
  ok: boolean;
  durationMs?: number;
  detectedStartMs?: number;
  detectedEndMs?: number;
  confidenceScore?: number;
  reason?: string;
};

const CONTACT_DEBOUNCE_MS = 120;
const CONTACT_END_GRACE_MS = 300;
const MOUTH_PADDING_X = 20;
const MOUTH_PADDING_Y = 20;

export const boxesOverlap = (a: ChugRect | null, b: ChugRect | null) => {
  if (!a || !b) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
};

export const getMouthBoxFromLandmarks = (
  landmarks: ChugLandmark[] = [],
  videoWidth: number,
  videoHeight: number
): ChugRect | null => {
  if (landmarks.length === 0 || videoWidth <= 0 || videoHeight <= 0) return null;
  const xs = landmarks.map((landmark) => landmark.x * videoWidth);
  const ys = landmarks.map((landmark) => landmark.y * videoHeight);
  const minX = Math.min(...xs) - MOUTH_PADDING_X;
  const maxX = Math.max(...xs) + MOUTH_PADDING_X;
  const minY = Math.min(...ys) - MOUTH_PADDING_Y;
  const maxY = Math.max(...ys) + MOUTH_PADDING_Y;
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
};

export const analyzeChugContactFrames = (frames: ChugDetectionFrame[] = []): ChugDetectionResult => {
  const orderedFrames = [...frames].sort((a, b) => a.timeMs - b.timeMs);
  let firstContactMs: number | null = null;
  let stableStartMs: number | null = null;
  let lastContactMs: number | null = null;
  let firstNoContactAfterStartMs: number | null = null;
  let usableFrames = 0;
  let contactFrames = 0;

  for (const frame of orderedFrames) {
    const usable = Boolean(frame.mouthBox && frame.bottleBox);
    if (usable) usableFrames += 1;

    const touching = boxesOverlap(frame.mouthBox, frame.bottleBox);
    if (touching) {
      contactFrames += 1;
      firstNoContactAfterStartMs = null;
      if (firstContactMs === null) firstContactMs = frame.timeMs;
      if (stableStartMs === null && frame.timeMs - firstContactMs >= CONTACT_DEBOUNCE_MS) {
        stableStartMs = firstContactMs;
      }
      if (stableStartMs !== null) {
        lastContactMs = frame.timeMs;
      }
      continue;
    }

    firstContactMs = null;
    if (stableStartMs !== null && lastContactMs !== null) {
      if (firstNoContactAfterStartMs === null) firstNoContactAfterStartMs = frame.timeMs;
      if (frame.timeMs - firstNoContactAfterStartMs >= CONTACT_END_GRACE_MS) {
        const durationMs = firstNoContactAfterStartMs - stableStartMs;
        const usableRatio = orderedFrames.length > 0 ? usableFrames / orderedFrames.length : 0;
        const contactRatio = usableFrames > 0 ? contactFrames / usableFrames : 0;
        const confidenceScore = Math.max(0.1, Math.min(1, (usableRatio * 0.6) + (contactRatio * 0.4)));
        return {
          ok: durationMs > 0,
          detectedStartMs: stableStartMs,
          detectedEndMs: firstNoContactAfterStartMs,
          durationMs,
          confidenceScore: Number(confidenceScore.toFixed(2)),
        };
      }
    }
  }

  if (stableStartMs !== null && lastContactMs !== null && lastContactMs > stableStartMs) {
    const durationMs = lastContactMs - stableStartMs;
    return {
      ok: true,
      detectedStartMs: stableStartMs,
      detectedEndMs: lastContactMs,
      durationMs,
      confidenceScore: 0.55,
    };
  }

  return {
    ok: false,
    reason: 'No stable mouth and bottle contact detected.',
  };
};
```

- [ ] **Step 5: Add MediaPipe web wrapper**

Create `src/lib/chugMediaPipe.ts`:

```ts
import { Platform } from 'react-native';

import {
  analyzeChugContactFrames,
  ChugDetectionFrame,
  getMouthBoxFromLandmarks,
} from './chugDetection';

const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const OBJECT_MODEL_URL = 'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const FRAME_STEP_MS = 100;
const MOUTH_LANDMARK_IDS = [13, 14, 61, 291, 78, 308];
const BOTTLE_LABELS = new Set(['bottle']);

export type ChugVideoAnalysisInput = {
  uri: string;
  blob?: Blob;
};

export const analyzeChugVideo = async (input: ChugVideoAnalysisInput) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('Chug timing is available in the web app for this version.');
  }

  const {
    FilesetResolver,
    FaceLandmarker,
    ObjectDetector,
  } = await import('@mediapipe/tasks-vision');

  const objectUrl = input.blob ? URL.createObjectURL(input.blob) : input.uri;

  try {
    const video = document.createElement('video');
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not load chug video for analysis.'));
    });

    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const [faceLandmarker, objectDetector] = await Promise.all([
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL },
        runningMode: 'VIDEO',
        numFaces: 1,
      }),
      ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: OBJECT_MODEL_URL },
        runningMode: 'VIDEO',
        scoreThreshold: 0.35,
        maxResults: 5,
      }),
    ]);

    const frames: ChugDetectionFrame[] = [];
    const durationMs = Math.min(Math.round(video.duration * 1000), 15000);

    for (let timeMs = 0; timeMs <= durationMs; timeMs += FRAME_STEP_MS) {
      video.currentTime = timeMs / 1000;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      const faceResult = faceLandmarker.detectForVideo(video, timeMs);
      const objectResult = objectDetector.detectForVideo(video, timeMs);
      const faceLandmarks = faceResult.faceLandmarks?.[0] || [];
      const mouthLandmarks = MOUTH_LANDMARK_IDS
        .map((index) => faceLandmarks[index])
        .filter(Boolean)
        .map((landmark) => ({ x: landmark.x, y: landmark.y }));

      const mouthBox = getMouthBoxFromLandmarks(mouthLandmarks, video.videoWidth, video.videoHeight);
      const bottle = objectResult.detections
        ?.filter((detection) => detection.categories?.some((category) => BOTTLE_LABELS.has((category.categoryName || '').toLowerCase())))
        .sort((a, b) => (b.categories?.[0]?.score || 0) - (a.categories?.[0]?.score || 0))[0];
      const box = bottle?.boundingBox;
      const bottleBox = box
        ? { x: box.originX, y: box.originY, width: box.width, height: box.height }
        : null;

      frames.push({ timeMs, mouthBox, bottleBox });
    }

    faceLandmarker.close();
    objectDetector.close();

    return analyzeChugContactFrames(frames);
  } finally {
    if (input.blob) URL.revokeObjectURL(objectUrl);
  }
};
```

- [ ] **Step 6: Add package script and run tests**

Modify `package.json` scripts:

```json
"test:chug-detection": "node scripts/chugDetection.test.js"
```

Run: `npm run test:chug-detection`

Expected: PASS and prints `chug detection checks passed`.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json package-lock.json scripts/chugDetection.test.js src/lib/chugDetection.ts src/lib/chugMediaPipe.ts
git commit -m "feat: add local chug detection"
```

---

### Task 5: Proof Video Storage Helpers

**Files:**
- Create: `src/lib/chugProofStorage.ts`

- [ ] **Step 1: Add storage helper implementation**

Create `src/lib/chugProofStorage.ts`:

```ts
import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from './supabase';

export const CHUG_VIDEO_BUCKET = 'chug_videos';

export type SelectedChugVideo = {
  uri: string;
  blob?: Blob;
  file?: File;
  mimeType?: string;
  fileName?: string;
};

const cleanPathSegment = (segment: string) => segment.replace(/[^a-zA-Z0-9_-]/g, '');

const getExtension = (video: SelectedChugVideo) => {
  const typeExtension = video.mimeType?.split('/')[1];
  if (typeExtension) return typeExtension === 'quicktime' ? 'mov' : typeExtension;
  const uriExtension = video.uri.split('?')[0].split('.').pop();
  return uriExtension && uriExtension.length <= 5 ? uriExtension : 'mp4';
};

const getContentType = (video: SelectedChugVideo) => (
  video.mimeType || (getExtension(video) === 'webm' ? 'video/webm' : 'video/mp4')
);

export const chugVideoFromPickerAsset = async (asset: ImagePickerAsset): Promise<SelectedChugVideo> => {
  if (Platform.OS === 'web') {
    let blob = asset.file;
    if (!blob) {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Could not read the recorded chug video.');
      blob = await response.blob() as File;
    }
    return {
      uri: asset.uri,
      blob,
      file: asset.file,
      mimeType: asset.mimeType || blob.type || 'video/mp4',
      fileName: asset.fileName || asset.file?.name,
    };
  }

  return {
    uri: asset.uri,
    mimeType: asset.mimeType || 'video/mp4',
    fileName: asset.fileName || 'chug.mp4',
  };
};

export const uploadChugProofVideo = async (video: SelectedChugVideo, userId: string) => {
  const extension = getExtension(video);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const storagePath = `users/${cleanPathSegment(userId)}/chugs/${fileName}`;
  const contentType = getContentType(video);

  if (Platform.OS === 'web') {
    let body = video.blob || video.file;
    if (!body) {
      const response = await fetch(video.uri);
      if (!response.ok) throw new Error('Could not read the recorded chug video.');
      body = await response.blob();
    }
    const { error } = await supabase.storage
      .from(CHUG_VIDEO_BUCKET)
      .upload(storagePath, await body.arrayBuffer(), {
        contentType,
        upsert: false,
      });
    if (error) throw error;
    return storagePath;
  }

  const FileSystem = await import('expo-file-system/legacy');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await FileSystem.uploadAsync(
    `https://yzrfihijpusvjypypnip.supabase.co/storage/v1/object/${CHUG_VIDEO_BUCKET}/${storagePath}`,
    video.uri,
    {
      httpMethod: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: 'sb_publishable_s-eJ6PwDoAIjnVlAH_ul1w_E3sgmM9v',
        'Content-Type': contentType,
      },
    }
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error('Failed to upload chug proof video: ' + response.body);
  }

  return storagePath;
};

export const createChugProofSignedUrl = async (path?: string | null) => {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(CHUG_VIDEO_BUCKET)
    .createSignedUrl(path, 60 * 15);
  if (error) throw error;
  return data.signedUrl;
};
```

- [ ] **Step 2: Verify publishable key reuse**

Run: `rg -n "sb_publishable_s-eJ6PwDoAIjnVlAH_ul1w_E3sgmM9v" src/lib/chugProofStorage.ts src/lib/imageUpload.ts`

Expected: one match in `src/lib/chugProofStorage.ts` and one match in `src/lib/imageUpload.ts`.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/lib/chugProofStorage.ts
git commit -m "feat: add chug proof storage helpers"
```

---

### Task 6: Record Session Chug Flow

**Files:**
- Create: `src/components/ChugAttemptModal.tsx`
- Create: `scripts/chugRecordScreen.test.js`
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write the failing record-flow source test**

Create `scripts/chugRecordScreen.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recordSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'), 'utf8');
const modalSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/components/ChugAttemptModal.tsx'), 'utf8');

assert.match(recordSource, /ChugAttemptModal/, 'record screen should render the chug modal');
assert.match(recordSource, /How fast can you chug\?/, 'record screen should expose the chug entry point');
assert.match(recordSource, /ImagePicker\.launchCameraAsync\(\{[\s\S]*mediaTypes:\s*\['videos'\]/, 'record flow should launch camera in video mode');
assert.match(recordSource, /videoMaxDuration:\s*CHUG_VIDEO_MAX_SECONDS/, 'record flow should cap chug video length');
assert.match(recordSource, /analyzeChugVideo/, 'record flow should analyze chug video locally');
assert.match(recordSource, /uploadChugProofVideo/, 'record flow should upload accepted proof video');
assert.match(recordSource, /\.from\('session_chug_attempts'\)\s*[\s\S]*?\.insert/, 'record flow should insert a chug attempt');
assert.match(recordSource, /type:\s*'chug_verification'/, 'record flow should notify chosen verifier');
assert.match(recordSource, /isBottleChugEligibleBeer/, 'record flow should filter 33cl bottled beers');
assert.match(modalSource, /mutualFollowers/, 'chug modal should receive mutual followers');
assert.match(modalSource, /eligibleBeers/, 'chug modal should receive eligible beers');
assert.match(modalSource, /Chugs are 33cl bottled beers only for now\./, 'modal should explain 33cl-only rule');

console.log('chug record screen checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/chugRecordScreen.test.js`

Expected: FAIL because `ChugAttemptModal.tsx` does not exist.

- [ ] **Step 3: Create chug modal component**

Create `src/components/ChugAttemptModal.tsx`:

```tsx
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Beer, CheckCircle2, Timer, UserCheck, X } from 'lucide-react-native';

import { AppButton } from './AppButton';
import { BeerDraftForm } from './BeerDraftForm';
import { BeerDraft, SessionBeer, getBeerLine } from '../lib/sessionBeers';
import { formatChugDuration } from '../lib/chugAttempts';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type MutualFollower = {
  id: string;
  username?: string | null;
  avatar_url?: string | null;
};

type AnalysisPreview = {
  durationMs: number;
  confidenceScore?: number | null;
};

type ChugAttemptModalProps = {
  visible: boolean;
  eligibleBeers: SessionBeer[];
  mutualFollowers: MutualFollower[];
  beerDraft: BeerDraft;
  selectedBeerId: string | null;
  selectedVerifierId: string | null;
  analysisPreview: AnalysisPreview | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onBeerDraftChange: (draft: BeerDraft) => void;
  onSelectBeer: (beerId: string) => void;
  onCreateBeer: (draft?: BeerDraft) => void;
  onSelectVerifier: (verifierId: string) => void;
  onRecord: () => void;
  onRetry: () => void;
  onAccept: () => void;
};

export const ChugAttemptModal = ({
  visible,
  eligibleBeers,
  mutualFollowers,
  beerDraft,
  selectedBeerId,
  selectedVerifierId,
  analysisPreview,
  busy,
  error,
  onClose,
  onBeerDraftChange,
  onSelectBeer,
  onCreateBeer,
  onSelectVerifier,
  onRecord,
  onRetry,
  onAccept,
}: ChugAttemptModalProps) => {
  const selectedBeer = eligibleBeers.find((beer) => beer.id === selectedBeerId) || null;
  const selectedVerifier = mutualFollowers.find((follower) => follower.id === selectedVerifierId) || null;
  const canRecord = Boolean(selectedBeer && selectedVerifier && !busy);
  const canAccept = Boolean(analysisPreview && selectedBeer && selectedVerifier && !busy);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>33cl bottle challenge</Text>
              <Text style={styles.title}>How fast can you chug?</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} disabled={busy}>
              <X color={colors.text} size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>Choose beer</Text>
            {eligibleBeers.length === 0 ? (
              <View style={styles.emptyBox}>
                <Beer color={colors.textMuted} size={22} />
                <Text style={styles.emptyText}>Chugs are 33cl bottled beers only for now.</Text>
              </View>
            ) : (
              eligibleBeers.map((beer) => (
                <TouchableOpacity
                  key={beer.id || `${beer.beer_name}-${beer.consumed_at}`}
                  style={[styles.optionRow, selectedBeerId === beer.id ? styles.optionRowActive : null]}
                  onPress={() => beer.id && onSelectBeer(beer.id)}
                  activeOpacity={0.76}
                >
                  <Beer color={selectedBeerId === beer.id ? colors.background : colors.primary} size={18} />
                  <View style={styles.optionText}>
                    <Text style={[styles.optionTitle, selectedBeerId === beer.id ? styles.optionTitleActive : null]}>{beer.beer_name}</Text>
                    <Text style={[styles.optionMeta, selectedBeerId === beer.id ? styles.optionMetaActive : null]}>{getBeerLine(beer)}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            <View style={styles.formBox}>
              <Text style={styles.sectionTitle}>Add a 33cl bottle</Text>
              <BeerDraftForm
                draft={beerDraft}
                onChange={onBeerDraftChange}
                onSubmit={onCreateBeer}
                submitLabel="Add 33cl Bottle"
                loading={busy}
              />
            </View>

            <Text style={styles.sectionTitle}>Verifier</Text>
            {mutualFollowers.length === 0 ? (
              <View style={styles.emptyBox}>
                <UserCheck color={colors.textMuted} size={22} />
                <Text style={styles.emptyText}>Add a mutual follower before chug verification.</Text>
              </View>
            ) : (
              mutualFollowers.map((follower) => (
                <TouchableOpacity
                  key={follower.id}
                  style={[styles.optionRow, selectedVerifierId === follower.id ? styles.optionRowActive : null]}
                  onPress={() => onSelectVerifier(follower.id)}
                  activeOpacity={0.76}
                >
                  <Image
                    source={{ uri: follower.avatar_url || `https://i.pravatar.cc/150?u=${follower.id}` }}
                    style={styles.avatar}
                  />
                  <Text style={[styles.optionTitle, selectedVerifierId === follower.id ? styles.optionTitleActive : null]}>
                    {follower.username || 'Someone'}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {analysisPreview ? (
              <View style={styles.resultBox}>
                <Timer color={colors.primary} size={24} />
                <View>
                  <Text style={styles.resultValue}>{formatChugDuration(analysisPreview.durationMs)}</Text>
                  <Text style={styles.resultMeta}>Unverified until {selectedVerifier?.username || 'your mate'} reviews it</Text>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {analysisPreview ? (
              <>
                <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} disabled={busy}>
                  <Text style={styles.secondaryButtonText}>Retry</Text>
                </TouchableOpacity>
                <View style={styles.primaryWrap}>
                  <AppButton label="Accept Attempt" onPress={onAccept} loading={busy} disabled={!canAccept} />
                </View>
              </>
            ) : (
              <AppButton label="Record Chug" onPress={onRecord} loading={busy} disabled={!canRecord} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  kicker: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  content: {
    padding: 18,
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  emptyBox: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  emptyText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  optionRow: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  optionRowActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  optionTitleActive: {
    color: colors.background,
  },
  optionMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  optionMetaActive: {
    color: colors.background,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  formBox: {
    marginTop: 4,
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  resultBox: {
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultValue: {
    ...typography.h2,
    color: colors.text,
  },
  resultMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  footer: {
    padding: 18,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  primaryWrap: {
    flex: 1,
  },
});
```

- [ ] **Step 4: Wire RecordScreen state and imports**

In `src/screens/RecordScreen.tsx`, add imports:

```ts
import { ChugAttemptModal } from '../components/ChugAttemptModal';
import {
  CHUG_CONTAINER_TYPE,
  CHUG_REQUIRED_VOLUME,
  CHUG_VIDEO_MAX_SECONDS,
  isBottleChugEligibleBeer,
} from '../lib/chugAttempts';
import { analyzeChugVideo } from '../lib/chugMediaPipe';
import { chugVideoFromPickerAsset, SelectedChugVideo, uploadChugProofVideo } from '../lib/chugProofStorage';
```

Add state near other modal state:

```ts
const [chugVisible, setChugVisible] = useState(false);
const [chugBusy, setChugBusy] = useState(false);
const [chugError, setChugError] = useState<string | null>(null);
const [chugBeerDraft, setChugBeerDraft] = useState(() => ({ ...createEmptyBeerDraft(), volume: CHUG_REQUIRED_VOLUME }));
const [chugSelectedBeerId, setChugSelectedBeerId] = useState<string | null>(null);
const [chugSelectedVerifierId, setChugSelectedVerifierId] = useState<string | null>(null);
const [chugAnalysisPreview, setChugAnalysisPreview] = useState<{ durationMs: number; confidenceScore?: number | null; detectedStartMs?: number | null; detectedEndMs?: number | null } | null>(null);
const [chugVideo, setChugVideo] = useState<SelectedChugVideo | null>(null);
const [mutualFollowers, setMutualFollowers] = useState<Array<{ id: string; username?: string | null; avatar_url?: string | null }>>([]);
```

In `resetActiveState`, clear chug state:

```ts
setChugVisible(false);
setChugBusy(false);
setChugError(null);
setChugBeerDraft({ ...createEmptyBeerDraft(), volume: CHUG_REQUIRED_VOLUME });
setChugSelectedBeerId(null);
setChugSelectedVerifierId(null);
setChugAnalysisPreview(null);
setChugVideo(null);
setMutualFollowers([]);
```

- [ ] **Step 5: Add RecordScreen chug helpers**

Add these functions before `handleImageAsset`:

```ts
const eligibleChugBeers = sessionBeers.filter((beer) => (
  Boolean(beer.id) && isBottleChugEligibleBeer(beer, catalog)
));

const loadMutualFollowers = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const [followingResult, followersResult] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', user.id),
    supabase.from('follows').select('follower_id').eq('following_id', user.id),
  ]);
  if (followingResult.error) throw followingResult.error;
  if (followersResult.error) throw followersResult.error;
  const followers = new Set(((followersResult.data || []) as FollowInRow[]).map((row) => row.follower_id));
  const mutualIds = ((followingResult.data || []) as FollowOutRow[])
    .map((row) => row.following_id)
    .filter((id) => followers.has(id));
  if (mutualIds.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', mutualIds)
    .order('username', { ascending: true });
  if (error) throw error;
  return (data || []) as Array<{ id: string; username?: string | null; avatar_url?: string | null }>;
};

const openChugFlow = async () => {
  if (!activeSession) return;
  setChugVisible(true);
  setChugError(null);
  setChugAnalysisPreview(null);
  setChugVideo(null);
  setChugBeerDraft({ ...createEmptyBeerDraft(), volume: CHUG_REQUIRED_VOLUME });
  setChugSelectedBeerId(eligibleChugBeers[0]?.id || null);
  try {
    const followers = await loadMutualFollowers();
    setMutualFollowers(followers);
    setChugSelectedVerifierId(followers[0]?.id || null);
  } catch (error: any) {
    setChugError(error?.message || 'Could not load mutual followers.');
  }
};

const createChugBeer = async (draftOverride?: typeof chugBeerDraft) => {
  const nextDraft = { ...(draftOverride || chugBeerDraft), volume: CHUG_REQUIRED_VOLUME, quantity: 1 };
  setChugBeerDraft(nextDraft);
  const createdBeer = await addBeerToSession(nextDraft);
  if (createdBeer?.id) setChugSelectedBeerId(createdBeer.id);
};

const recordChugVideo = async () => {
  if (!activeSession || !chugSelectedBeerId || !chugSelectedVerifierId || chugBusy) return;
  setChugBusy(true);
  setChugError(null);
  setChugAnalysisPreview(null);
  setChugVideo(null);
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setChugError('Camera access is needed to record a chug attempt.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 0.65,
      videoMaxDuration: CHUG_VIDEO_MAX_SECONDS,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Low,
      cameraType: ImagePicker.CameraType.back,
    });
    if (result.canceled || !result.assets[0]) return;
    const preparedVideo = await chugVideoFromPickerAsset(result.assets[0]);
    const analysis = await analyzeChugVideo(preparedVideo);
    if (!analysis.ok || !analysis.durationMs) {
      setChugError(analysis.reason || 'Could not detect a clean chug start and stop.');
      setChugVideo(preparedVideo);
      return;
    }
    setChugVideo(preparedVideo);
    setChugAnalysisPreview({
      durationMs: analysis.durationMs,
      confidenceScore: analysis.confidenceScore,
      detectedStartMs: analysis.detectedStartMs,
      detectedEndMs: analysis.detectedEndMs,
    });
  } catch (error: any) {
    setChugError(error?.message || 'Could not analyze this chug attempt.');
  } finally {
    setChugBusy(false);
  }
};

const acceptChugAttempt = async () => {
  if (!activeSession || !chugSelectedBeerId || !chugSelectedVerifierId || !chugAnalysisPreview || !chugVideo || chugBusy) return;
  setChugBusy(true);
  setChugError(null);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');
    const videoPath = await uploadChugProofVideo(chugVideo, user.id);
    const { data: attempt, error } = await supabase
      .from('session_chug_attempts')
      .insert({
        session_id: activeSession.id,
        session_beer_id: chugSelectedBeerId,
        user_id: user.id,
        verifier_user_id: chugSelectedVerifierId,
        status: 'unverified',
        duration_ms: chugAnalysisPreview.durationMs,
        confidence_score: chugAnalysisPreview.confidenceScore ?? null,
        detected_start_ms: chugAnalysisPreview.detectedStartMs ?? null,
        detected_end_ms: chugAnalysisPreview.detectedEndMs ?? null,
        container_type: CHUG_CONTAINER_TYPE,
        required_volume: CHUG_REQUIRED_VOLUME,
        video_path: videoPath,
      })
      .select('id')
      .single();
    if (error) throw error;
    const selectedBeer = sessionBeers.find((beer) => beer.id === chugSelectedBeerId);
    const { error: notifError } = await supabase.from('notifications').insert({
      user_id: chugSelectedVerifierId,
      actor_id: user.id,
      type: 'chug_verification',
      reference_id: attempt.id,
      metadata: {
        target_type: 'chug_attempt',
        session_id: activeSession.id,
        beer_name: selectedBeer?.beer_name || null,
        duration_ms: chugAnalysisPreview.durationMs,
        pub_name: activeSession.pub_name,
      },
    });
    if (notifError) console.error('Chug verification notification insert error:', notifError);
    setChugVisible(false);
    setChugAnalysisPreview(null);
    setChugVideo(null);
    hapticSuccess();
    showAlert('Chug saved', 'Your result is on the post as unverified until your mate reviews it.');
  } catch (error: any) {
    setChugError(error?.message || 'Could not save chug attempt.');
  } finally {
    setChugBusy(false);
  }
};
```

After implementing, fix stale selected beer after `createChugBeer` by selecting the inserted row returned by `addBeerToSession`. To do that, change `addBeerToSession` to return the inserted `SessionBeer | null`:

```ts
const addBeerToSession = async (draftOverride?: typeof beerDraft): Promise<SessionBeer | null> => {
```

Return `data as SessionBeer` after success and `null` from early exits and catch. In `createChugBeer`, use:

```ts
const createdBeer = await addBeerToSession(nextDraft);
if (createdBeer?.id) setChugSelectedBeerId(createdBeer.id);
```

- [ ] **Step 6: Render the entry point and modal**

Inside the active Drinks surface, after the drink list and before `BeerDraftForm`, add:

```tsx
<TouchableOpacity
  style={styles.chugButton}
  onPress={openChugFlow}
  activeOpacity={0.76}
  accessibilityRole="button"
  accessibilityLabel="Record a 33cl bottle chug attempt"
>
  <Timer color={colors.primary} size={20} />
  <View style={styles.chugButtonText}>
    <Text style={styles.chugButtonTitle}>How fast can you chug?</Text>
    <Text style={styles.chugButtonSubtitle}>33cl bottled beers only</Text>
  </View>
</TouchableOpacity>
```

Add `Timer` to the lucide import in `RecordScreen.tsx`.

Render `ChugAttemptModal` near the other modals:

```tsx
<ChugAttemptModal
  visible={chugVisible}
  eligibleBeers={eligibleChugBeers}
  mutualFollowers={mutualFollowers}
  beerDraft={chugBeerDraft}
  selectedBeerId={chugSelectedBeerId}
  selectedVerifierId={chugSelectedVerifierId}
  analysisPreview={chugAnalysisPreview}
  busy={chugBusy}
  error={chugError}
  onClose={() => setChugVisible(false)}
  onBeerDraftChange={(draft) => setChugBeerDraft({ ...draft, volume: CHUG_REQUIRED_VOLUME, quantity: 1 })}
  onSelectBeer={setChugSelectedBeerId}
  onCreateBeer={createChugBeer}
  onSelectVerifier={setChugSelectedVerifierId}
  onRecord={recordChugVideo}
  onRetry={recordChugVideo}
  onAccept={acceptChugAttempt}
/>
```

Add styles:

```ts
chugButton: {
  minHeight: 62,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.primaryBorder,
  backgroundColor: colors.primarySoft,
  paddingHorizontal: 14,
  paddingVertical: 12,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
},
chugButtonText: {
  flex: 1,
  minWidth: 0,
},
chugButtonTitle: {
  ...typography.body,
  color: colors.text,
  fontWeight: '900',
},
chugButtonSubtitle: {
  ...typography.caption,
  color: colors.textMuted,
},
```

- [ ] **Step 7: Add package script and run test**

Modify `package.json` scripts:

```json
"test:chug-record": "node scripts/chugRecordScreen.test.js"
```

Run: `npm run test:chug-record`

Expected: PASS and prints `chug record screen checks passed`.

- [ ] **Step 8: Commit**

Run:

```bash
git add package.json scripts/chugRecordScreen.test.js src/components/ChugAttemptModal.tsx src/screens/RecordScreen.tsx
git commit -m "feat: add chug recording flow"
```

---

### Task 7: Verifier Review Screen

**Files:**
- Modify: `src/screens/ChugVerificationScreen.tsx`

- [ ] **Step 1: Replace temporary screen with real review flow**

Replace `src/screens/ChugVerificationScreen.tsx` with:

```tsx
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react-native';

import { createChugProofSignedUrl } from '../lib/chugProofStorage';
import { formatChugDuration, formatChugStatusLabel } from '../lib/chugAttempts';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type ReviewAttempt = {
  id: string;
  user_id: string;
  verifier_user_id: string;
  status: string;
  duration_ms: number;
  confidence_score?: number | null;
  video_path?: string | null;
  verifier_note?: string | null;
  sessions?: { pub_name?: string | null } | null;
  session_beers?: { beer_name?: string | null; volume?: string | null } | null;
};

type OwnerProfile = {
  username?: string | null;
  avatar_url?: string | null;
};

const WebVideo = ({ uri }: { uri: string }) => {
  if (Platform.OS !== 'web') return null;
  return React.createElement('video', {
    src: uri,
    controls: true,
    playsInline: true,
    style: {
      width: '100%',
      maxHeight: 360,
      borderRadius: 8,
      backgroundColor: '#000',
    },
  });
};

export const ChugVerificationScreen = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const attemptId = route?.params?.attemptId as string | undefined;
  const notificationId = route?.params?.notificationId as string | undefined;
  const [attempt, setAttempt] = useState<ReviewAttempt | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<OwnerProfile | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<'verified' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAttempt = useCallback(async () => {
    if (!attemptId) {
      setError('Chug attempt not found.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('session_chug_attempts')
        .select(`
          id,
          user_id,
          verifier_user_id,
          status,
          duration_ms,
          confidence_score,
          video_path,
          verifier_note,
          sessions(pub_name),
          session_beers(beer_name, volume)
        `)
        .eq('id', attemptId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!data) throw new Error('Chug attempt not found.');
      const row = data as ReviewAttempt;
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', row.user_id)
        .maybeSingle();
      if (profileError) console.error('Chug owner profile fetch error:', profileError);
      setAttempt(row);
      setOwnerProfile(profileData || null);
      setNote(row.verifier_note || '');
      setVideoUrl(row.video_path ? await createChugProofSignedUrl(row.video_path) : null);
      if (notificationId) {
        supabase.from('notifications').update({ read: true }).eq('id', notificationId).then(() => {});
      }
    } catch (reviewError: any) {
      setError(reviewError?.message || 'Could not load chug attempt.');
    } finally {
      setLoading(false);
    }
  }, [attemptId, notificationId]);

  useFocusEffect(
    useCallback(() => {
      fetchAttempt();
    }, [fetchAttempt])
  );

  const reviewAttempt = useCallback(async (nextStatus: 'verified' | 'rejected') => {
    if (!attemptId || reviewing) return;
    setReviewing(nextStatus);
    setError(null);
    try {
      const { error: reviewError } = await supabase.rpc('review_chug_attempt', {
        target_attempt_id: attemptId,
        next_status: nextStatus,
        note,
      });
      if (reviewError) throw reviewError;
      await fetchAttempt();
    } catch (reviewError: any) {
      setError(reviewError?.message || 'Could not review chug attempt.');
    } finally {
      setReviewing(null);
    }
  }, [attemptId, fetchAttempt, note, reviewing]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft color={colors.text} size={22} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Chug verification</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : attempt ? (
        <View style={styles.content}>
          <View style={styles.panel}>
            <Text style={styles.kicker}>{attempt.sessions?.pub_name || 'Session chug'}</Text>
            <Text style={styles.meta}>{ownerProfile?.username || 'Someone'} asked you to review this</Text>
            <Text style={styles.title}>{attempt.session_beers?.beer_name || '33cl beer'}</Text>
            <Text style={styles.duration}>{formatChugDuration(attempt.duration_ms)}</Text>
            <Text style={styles.meta}>{formatChugStatusLabel(attempt.status)}</Text>
          </View>

          {videoUrl ? (
            <View style={styles.videoPanel}>
              <WebVideo uri={videoUrl} />
              {Platform.OS !== 'web' ? (
                <Text style={styles.meta}>Proof video review is available in the web app for this version.</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.meta}>Proof video has already been cleared.</Text>
            </View>
          )}

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note"
            placeholderTextColor={colors.textMuted}
            style={styles.noteInput}
            multiline
            maxLength={160}
          />

          {attempt.status === 'unverified' ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => reviewAttempt('rejected')}
                disabled={Boolean(reviewing)}
              >
                {reviewing === 'rejected' ? <ActivityIndicator color={colors.text} /> : <XCircle color={colors.text} size={18} />}
                <Text style={styles.actionText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => reviewAttempt('verified')}
                disabled={Boolean(reviewing)}
              >
                {reviewing === 'verified' ? <ActivityIndicator color={colors.background} /> : <CheckCircle2 color={colors.background} size={18} />}
                <Text style={[styles.actionText, styles.approveText]}>Verify</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingTop: Platform.OS === 'web' ? 18 : 54,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  backButtonPlaceholder: {
    width: 38,
  },
  screenTitle: {
    ...typography.h3,
    color: colors.text,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    padding: 18,
    gap: spacing.md,
  },
  panel: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
  },
  videoPanel: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 10,
  },
  kicker: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  title: {
    ...typography.h3,
    color: colors.text,
  },
  duration: {
    ...typography.h1,
    color: colors.text,
    marginTop: 10,
  },
  meta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  noteInput: {
    minHeight: 88,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: 12,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rejectButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  approveButton: {
    backgroundColor: colors.primary,
  },
  actionText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
  },
  approveText: {
    color: colors.background,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Run notification test again**

Run: `npm run test:chug-notifications`

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/screens/ChugVerificationScreen.tsx
git commit -m "feat: add chug verification review screen"
```

---

### Task 8: Feed And Post Detail Chug Stats

**Files:**
- Create: `scripts/chugFeedStats.test.js`
- Modify: `src/screens/FeedScreen.tsx`
- Modify: `src/screens/PostDetailScreen.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write failing feed stat test**

Create `scripts/chugFeedStats.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const feedSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/FeedScreen.tsx'), 'utf8');
const postDetailSource = fs.readFileSync(path.resolve(__dirname, '..', 'src/screens/PostDetailScreen.tsx'), 'utf8');

assert.match(feedSource, /session_chug_attempts/, 'feed screen should know chug attempt summaries');
assert.match(feedSource, /get_session_chug_attempt_summaries/, 'feed should fetch public chug attempt summaries through RPC');
assert.match(feedSource, /getFastestVisibleChugAttempt/, 'feed card should compute fastest visible chug');
assert.match(feedSource, /Fastest chug/, 'feed card should render fastest chug label');
assert.match(feedSource, /formatChugDuration/, 'feed card should render formatted chug duration');
assert.match(feedSource, /getChugStatSubtitle/, 'feed card should render volume and verification status');
assert.match(postDetailSource, /get_session_chug_attempt_summaries/, 'post detail should hydrate chug summaries');

console.log('chug feed stat checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/chugFeedStats.test.js`

Expected: FAIL because feed does not fetch chug summaries.

- [ ] **Step 3: Update FeedScreen types and imports**

In `src/screens/FeedScreen.tsx`, import helpers:

```ts
import {
  formatChugDuration,
  getChugStatSubtitle,
  getFastestVisibleChugAttempt,
  mapChugAttemptRow,
  SessionChugAttempt,
  SessionChugAttemptRow,
} from '../lib/chugAttempts';
```

Add to `FeedSession`:

```ts
  session_chug_attempts: SessionChugAttempt[];
```

Inside `FeedSessionCard`, after `beerBreakdownLines`:

```ts
const fastestChug = getFastestVisibleChugAttempt(item.session_chug_attempts || []);
```

Inside the `detailGrid`, after Avg ABV:

```tsx
{fastestChug ? (
  <View style={styles.detailPill}>
    <Text style={styles.detailLabel}>Fastest chug</Text>
    <Text style={styles.detailValue}>{formatChugDuration(fastestChug.durationMs)}</Text>
    <Text style={styles.detailHint}>{getChugStatSubtitle(fastestChug)}</Text>
  </View>
) : null}
```

Add style:

```ts
detailHint: {
  ...typography.caption,
  color: colors.textMuted,
  textAlign: 'center',
  marginTop: 3,
},
```

- [ ] **Step 4: Fetch chug summaries in FeedScreen**

In `loadSessions`, add a fourth details result next to beers/comments:

```ts
const [cheersResult, beersResult, commentsResult, chugsResult] = await withTimeout(
  Promise.all([
    ...
    sessionIds.length > 0
      ? supabase.rpc('get_session_chug_attempt_summaries', { session_ids: sessionIds })
      : Promise.resolve({ data: [] as SessionChugAttemptRow[], error: null }),
  ]),
  FEED_REQUEST_TIMEOUT_MS,
  'Feed details are taking too long.'
);
```

After comment rows:

```ts
if (chugsResult.error) {
  console.error('Session chug attempts fetch error:', chugsResult.error);
}
const chugRows: SessionChugAttempt[] = ((chugsResult.data || []) as SessionChugAttemptRow[]).map(mapChugAttemptRow);
const chugsBySession = chugRows.reduce((acc, attempt) => {
  const existing = acc.get(attempt.sessionId) || [];
  existing.push(attempt);
  acc.set(attempt.sessionId, existing);
  return acc;
}, new Map<string, SessionChugAttempt[]>());
```

When assembling each session:

```ts
session_chug_attempts: chugsBySession.get(session.id) || [],
```

Add `session_chug_attempts: []` to the legacy fallback object in any optimistic session updates that construct `FeedSession`.

- [ ] **Step 5: Hydrate PostDetail chug summaries**

In `src/screens/PostDetailScreen.tsx`, import:

```ts
import { mapChugAttemptRow, SessionChugAttemptRow } from '../lib/chugAttempts';
```

Add chugs query to the session detail `Promise.all`:

```ts
supabase.rpc('get_session_chug_attempt_summaries', { session_ids: [sessionId] }),
```

Read result:

```ts
if (chugsResult.error) console.error('Post chug attempts fetch error:', chugsResult.error);
const chugRows = ((chugsResult.data || []) as SessionChugAttemptRow[]).map(mapChugAttemptRow);
```

Add to assembled session:

```ts
session_chug_attempts: chugRows,
```

- [ ] **Step 6: Add package script and run feed stat test**

Modify `package.json` scripts:

```json
"test:chug-feed": "node scripts/chugFeedStats.test.js"
```

Run: `npm run test:chug-feed`

Expected: PASS and prints `chug feed stat checks passed`.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json scripts/chugFeedStats.test.js src/screens/FeedScreen.tsx src/screens/PostDetailScreen.tsx
git commit -m "feat: show fastest chug stats"
```

---

### Task 9: Final Verification And Build

**Files:**
- Modify only files required by failed verification output.

- [ ] **Step 1: Run focused chug tests**

Run:

```bash
npm run test:chugs
npm run test:chug-db
npm run test:chug-notifications
npm run test:chug-detection
npm run test:chug-record
npm run test:chug-feed
```

Expected: all six scripts print their pass messages.

- [ ] **Step 2: Run adjacent regression tests**

Run:

```bash
npm run test:session-beers
npm run test:record-session-drinks
npm run test:notifications
npm run test:feed-redesign
```

Expected: all four scripts pass.

- [ ] **Step 3: Build web**

Run: `npm run build:web`

Expected: Expo web export exits with code 0.

- [ ] **Step 4: Inspect git diff**

Run: `git status --short`

Expected: only intended chug feature files are modified or added.

Run: `git diff --stat`

Expected: changes are concentrated in the files listed in this plan.

- [ ] **Step 5: Commit final verification fixes**

If Step 1, Step 2, or Step 3 required fixes, commit those fixes:

```bash
git add .
git commit -m "fix: stabilize chug feature verification"
```

If no fixes were required and every task commit already exists, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage: Tasks cover the 33cl-only rule, existing/new drink attachment, mutual verifier selection before recording, local MediaPipe timing, temporary proof upload, unverified feed display, verifier approve/reject, proof deletion, notification routing, and tests.
- Privacy coverage: Public feed uses `get_session_chug_attempt_summaries`, which omits proof paths. Owner and verifier table reads still include proof paths for review.
- Platform coverage: Web/PWA gets MediaPipe analysis. Native gets a clear unsupported message in `analyzeChugVideo` for v1.
- Testing coverage: Helper behavior, detection state machine, migration source, notification routing, record source wiring, and feed stat wiring all have script tests. Final task runs adjacent regression tests and web build.
