# Chug Recording UX And Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished one-bottle chug recording flow with local-analysis feedback, verifier search, manual-timing fallback, 24-hour proof expiry, and feed status fallbacks.

**Architecture:** Add one follow-up Supabase migration that keeps review status separate from timing source and schedules idempotent proof cleanup through `pg_cron`. Extend the small `chugAttempts` domain module to choose one visible feed stat, then simplify the existing chug modal into a purpose-built catalog-only setup flow. Reuse the current verifier retiming screen while adding direct manual mode and deadline-aware disabled states.

**Tech Stack:** Expo React Native/Web, TypeScript, Supabase Postgres/RPC/Storage, Supabase Cron (`pg_cron`), MediaPipe on-device analysis, existing Node source-contract tests.

---

## Scope Check

This is one cohesive follow-up to the existing chug feature. The database state model, feed fallback text, recording flow, and verifier flow must land together because each layer consumes the same `pending_manual` and `expired` semantics.

The normal `Add Booze` form stays unchanged. The MediaPipe detector stays unchanged. Gemini is not added.

## File Structure

- Create `supabase/migrations/20260601140000_add_chug_pending_manual_expiry.sql`: add pending-manual timing, expiry, secure late-review rejection, cleanup, summary RPC fields, and the Cron schedule.
- Modify `scripts/chugDatabase.test.js`: assert the additive migration contract.
- Modify `src/lib/chugAttempts.ts`: model nullable timing, timing sources, expired status, catalog-only chug options, and feed-stat priority.
- Modify `scripts/chugAttempts.test.js`: execute the pure helper behaviors.
- Modify `src/screens/FeedScreen.tsx`: render timed, pending-manual, or expired stats under More Stats.
- Modify `scripts/chugFeedStats.test.js`: assert feed rendering integration.
- Modify `src/components/ChugAttemptModal.tsx`: replace the generic drink form with the focused catalog-only chug setup, verifier search, taller guidance image, analysis overlay, and manual fallback actions.
- Modify `src/screens/RecordScreen.tsx`: move the chug panel, create one forced 33cl beer from selection, separate analysis state, and submit AI or pending-manual attempts.
- Modify `scripts/chugRecordScreen.test.js`: assert the streamlined recording UI and fallback orchestration.
- Modify `src/screens/ChugVerificationScreen.tsx`: open pending-manual attempts directly in slow-motion timing mode and disable expired reviews.
- Modify `scripts/chugVerificationScreen.test.js`: assert direct manual timing and expiry handling.

## Visual Implementation Note

Before implementing Task 3, invoke the available native UI and UX skills: `building-native-ui`, `bencium-controlled-ux-designer`, and `expo-react-native-performance`. The visual direction is already approved: use the current Beerva amber accent, restrained dark surfaces, existing typography, and compact spacing. The chug action should feel a little more competitive and lively without becoming a separate visual language.

---

### Task 1: Pending-Manual And Expiry Database Contract

**Files:**
- Create: `supabase/migrations/20260601140000_add_chug_pending_manual_expiry.sql`
- Modify: `scripts/chugDatabase.test.js`

- [ ] **Step 1: Write the failing migration-contract assertions**

Append to `scripts/chugDatabase.test.js`:

```js
const expiryMigrationPath = path.resolve(__dirname, '..', 'supabase/migrations/20260601140000_add_chug_pending_manual_expiry.sql');
const expirySource = fs.readFileSync(expiryMigrationPath, 'utf8');

assert.match(expirySource, /create extension if not exists pg_cron/i, 'expiry migration should enable Supabase Cron');
assert.match(expirySource, /add column if not exists expires_at timestamp with time zone/, 'attempts should carry a proof expiry deadline');
assert.match(expirySource, /created_at \+ interval '24 hours'/, 'existing attempts should receive a created-at based deadline');
assert.match(expirySource, /status in \('unverified', 'verified', 'rejected', 'expired'\)/, 'attempt status should include expired');
assert.match(expirySource, /timing_source in \('ai', 'manual', 'pending_manual'\)/, 'timing source should include pending_manual');
assert.match(expirySource, /timing_source = 'pending_manual'[\s\S]*duration_ms is null/, 'pending-manual attempts should allow an empty effective duration');
assert.match(expirySource, /timing_source = 'manual'[\s\S]*manual_duration_ms is not null/, 'manual attempts should require a manual duration');
assert.match(expirySource, /attempt\.expires_at <= now\(\)/, 'review RPC should reject late decisions');
assert.match(expirySource, /Pending manual chug attempts require manual timing before verification\./, 'pending-manual verification should require timestamps');
assert.match(expirySource, /create or replace function public\.expire_stale_chug_attempts\(\)/, 'migration should add stale proof cleanup');
assert.match(expirySource, /attempts\.status = 'unverified'[\s\S]*attempts\.expires_at <= now\(\)/, 'cleanup should only revisit overdue open attempts');
assert.match(expirySource, /status = 'expired'/, 'cleanup should retain expired rows');
assert.match(expirySource, /video_path = null/, 'cleanup should clear proof paths');
assert.match(expirySource, /cron\.schedule\([\s\S]*'beerva-expire-chug-attempts'[\s\S]*'\* \* \* \* \*'/, 'cleanup should run once per minute');
assert.match(expirySource, /timing_source text/, 'public summary RPC should return timing source');
assert.match(expirySource, /expires_at timestamp with time zone/, 'public summary RPC should return expiry');
```

- [ ] **Step 2: Run the focused database test to verify it fails**

Run:

```bash
npm run test:chug-db
```

Expected: FAIL because `supabase/migrations/20260601140000_add_chug_pending_manual_expiry.sql` does not exist.

- [ ] **Step 3: Create the additive migration**

Create `supabase/migrations/20260601140000_add_chug_pending_manual_expiry.sql`:

```sql
create extension if not exists pg_cron;

alter table public.session_chug_attempts
  add column if not exists expires_at timestamp with time zone;

update public.session_chug_attempts
set expires_at = created_at + interval '24 hours'
where expires_at is null;

alter table public.session_chug_attempts
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null,
  alter column duration_ms drop not null,
  alter column ai_duration_ms drop not null,
  drop constraint if exists session_chug_attempts_status_check,
  drop constraint if exists session_chug_attempts_duration_check,
  drop constraint if exists session_chug_attempts_ai_duration_check,
  drop constraint if exists session_chug_attempts_timing_source_check,
  drop constraint if exists session_chug_attempts_manual_source_check,
  drop constraint if exists session_chug_attempts_timing_state_check;

alter table public.session_chug_attempts
  add constraint session_chug_attempts_status_check
    check (status in ('unverified', 'verified', 'rejected', 'expired')),
  add constraint session_chug_attempts_duration_check
    check (
      (
        timing_source = 'pending_manual'
        and duration_ms is null
      )
      or (
        timing_source <> 'pending_manual'
        and duration_ms > 0
        and duration_ms <= 15000
      )
    ),
  add constraint session_chug_attempts_ai_duration_check
    check (
      ai_duration_ms is null
      or (ai_duration_ms > 0 and ai_duration_ms <= 15000)
    ),
  add constraint session_chug_attempts_timing_source_check
    check (timing_source in ('ai', 'manual', 'pending_manual')),
  add constraint session_chug_attempts_manual_source_check
    check (timing_source <> 'manual' or manual_duration_ms is not null),
  add constraint session_chug_attempts_timing_state_check
    check (
      (
        timing_source = 'ai'
        and duration_ms is not null
        and ai_duration_ms is not null
      )
      or (
        timing_source = 'pending_manual'
        and status in ('unverified', 'rejected', 'expired')
        and duration_ms is null
        and ai_duration_ms is null
        and manual_duration_ms is null
      )
      or (
        timing_source = 'manual'
        and duration_ms is not null
        and manual_duration_ms is not null
      )
    );

create index if not exists session_chug_attempts_status_expires_at_idx
  on public.session_chug_attempts(status, expires_at)
  where status = 'unverified';

drop function if exists public.get_session_chug_attempt_summaries(uuid[]);

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
  timing_source text,
  expires_at timestamp with time zone,
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
    attempts.timing_source,
    attempts.expires_at,
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

drop function if exists public.review_chug_attempt(uuid, text, text, integer, integer);

create or replace function public.review_chug_attempt(
  target_attempt_id uuid,
  next_status text,
  note text default null,
  manual_start_ms integer default null,
  manual_end_ms integer default null
)
returns public.session_chug_attempts
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  attempt public.session_chug_attempts;
  cleaned_note text := nullif(btrim(coalesce(note, '')), '');
  reviewed_manual_start_ms integer := $4;
  reviewed_manual_end_ms integer := $5;
  reviewed_manual_duration_ms integer;
  has_manual_timing boolean := reviewed_manual_start_ms is not null or reviewed_manual_end_ms is not null;
begin
  if next_status not in ('verified', 'rejected') then
    raise exception 'Chug review status must be verified or rejected.';
  end if;

  if (reviewed_manual_start_ms is null) <> (reviewed_manual_end_ms is null) then
    raise exception 'Manual timing requires both start and end timestamps.';
  end if;

  if next_status = 'rejected' and has_manual_timing then
    raise exception 'Manual timing is only allowed when verifying a chug attempt.';
  end if;

  if has_manual_timing then
    reviewed_manual_duration_ms := reviewed_manual_end_ms - reviewed_manual_start_ms;
    if reviewed_manual_start_ms < 0
      or reviewed_manual_duration_ms <= 0
      or reviewed_manual_duration_ms > 15000 then
      raise exception 'Manual chug timing must be between 1 and 15000 milliseconds.';
    end if;
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

  if attempt.expires_at <= now() then
    raise exception 'This chug verification has expired.';
  end if;

  if next_status = 'verified'
    and attempt.timing_source = 'pending_manual'
    and not has_manual_timing then
    raise exception 'Pending manual chug attempts require manual timing before verification.';
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
    thumbnail_path = null,
    manual_start_ms = case when has_manual_timing then reviewed_manual_start_ms else null end,
    manual_end_ms = case when has_manual_timing then reviewed_manual_end_ms else null end,
    manual_duration_ms = case when has_manual_timing then reviewed_manual_duration_ms else null end,
    timing_source = case when has_manual_timing then 'manual' else attempt.timing_source end,
    duration_ms = case when has_manual_timing then reviewed_manual_duration_ms else attempt.duration_ms end
  where id = target_attempt_id
  returning * into attempt;

  return attempt;
end;
$$;

create or replace function public.expire_stale_chug_attempts()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  expired_count integer;
begin
  delete from storage.objects
  where bucket_id = 'chug_videos'
    and name in (
      select media.path
      from public.session_chug_attempts attempts
      cross join lateral unnest(array[attempts.video_path, attempts.thumbnail_path]) as media(path)
      where attempts.status = 'unverified'
        and attempts.expires_at <= now()
        and media.path is not null
        and btrim(media.path) <> ''
    );

  update public.session_chug_attempts
  set
    status = 'expired',
    video_path = null,
    thumbnail_path = null
  where status = 'unverified'
    and expires_at <= now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

grant execute on function public.get_session_chug_attempt_summaries(uuid[]) to authenticated;
grant execute on function public.review_chug_attempt(uuid, text, text, integer, integer) to authenticated;
revoke execute on function public.expire_stale_chug_attempts() from public, anon, authenticated;
grant execute on function public.expire_stale_chug_attempts() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-expire-chug-attempts') then
    perform cron.unschedule('beerva-expire-chug-attempts');
  end if;

  perform cron.schedule(
    'beerva-expire-chug-attempts',
    '* * * * *',
    $job$select public.expire_stale_chug_attempts();$job$
  );
end;
$$;

comment on function public.expire_stale_chug_attempts() is
  'Deletes overdue temporary chug proofs and retains their attempts as expired audit rows.';
```

- [ ] **Step 4: Run the focused database test to verify it passes**

Run:

```bash
npm run test:chug-db
```

Expected: PASS with `chug database migration checks passed`.

- [ ] **Step 5: Commit the database lifecycle**

```bash
git add scripts/chugDatabase.test.js supabase/migrations/20260601140000_add_chug_pending_manual_expiry.sql
git commit -m "feat: expire stale chug proof videos"
```

---

### Task 2: Chug Domain State And Feed Priority

**Files:**
- Modify: `scripts/chugAttempts.test.js`
- Modify: `src/lib/chugAttempts.ts`
- Modify: `scripts/chugFeedStats.test.js`
- Modify: `src/screens/FeedScreen.tsx`

- [ ] **Step 1: Write failing pure-helper assertions**

In `scripts/chugAttempts.test.js`, import `getChugBeerOptions` and `getVisibleChugStat`, then append:

```js
assert.deepEqual(getChugBeerOptions(catalog), ['Tuborg Gron']);

const pendingAttempt = {
  id: 'pending',
  sessionId: 's1',
  status: 'unverified',
  timingSource: 'pending_manual',
  durationMs: null,
};
const expiredAttempt = {
  id: 'expired',
  sessionId: 's1',
  status: 'expired',
  timingSource: 'ai',
  durationMs: 3500,
};

assert.equal(getVisibleChugStat([expiredAttempt]).kind, 'expired');
assert.equal(getVisibleChugStat([expiredAttempt, pendingAttempt]).kind, 'pending_manual');
assert.equal(getVisibleChugStat([expiredAttempt, pendingAttempt, ...attempts]).kind, 'timed');
assert.equal(getFastestVisibleChugAttempt([expiredAttempt, ...attempts]).id, 'fast');

assert.deepEqual(
  mapChugAttemptRow({
    id: 'pending-row',
    session_id: 'session-1',
    session_beer_id: 'beer-1',
    status: 'unverified',
    duration_ms: null,
    timing_source: 'pending_manual',
    expires_at: '2026-06-02T12:00:00Z',
  }),
  {
    id: 'pending-row',
    sessionId: 'session-1',
    sessionBeerId: 'beer-1',
    userId: null,
    verifierUserId: null,
    status: 'unverified',
    durationMs: null,
    confidenceScore: null,
    detectedStartMs: null,
    detectedEndMs: null,
    containerType: 'bottle',
    requiredVolume: '33cl',
    timingSource: 'pending_manual',
    expiresAt: '2026-06-02T12:00:00Z',
    createdAt: null,
    verifiedAt: null,
    beerName: null,
  }
);
```

- [ ] **Step 2: Write failing feed-source assertions**

Append to `scripts/chugFeedStats.test.js`:

```js
assert.match(feedSource, /getVisibleChugStat/, 'feed card should choose one visible chug stat by priority');
assert.match(feedSource, /Pending manual timing/, 'feed card should show pending manual timing when no timed chug exists');
assert.match(feedSource, /Chugging verification expired/, 'feed card should show expiry when no stronger chug state exists');
```

- [ ] **Step 3: Run the focused helper and feed tests to verify they fail**

Run:

```bash
npm run test:chugs
npm run test:chug-feed
```

Expected: both commands FAIL because the new helper and feed fallback text do not exist.

- [ ] **Step 4: Extend the chug domain module**

In `src/lib/chugAttempts.ts`, make these type changes:

```ts
export type ChugVerificationStatus = 'unverified' | 'verified' | 'rejected' | 'expired';
export type ChugTimingSource = 'ai' | 'manual' | 'pending_manual';

export type SessionChugAttempt = {
  id: string;
  sessionId: string;
  sessionBeerId: string;
  userId?: string | null;
  verifierUserId?: string | null;
  status: ChugVerificationStatus;
  durationMs: number | null;
  confidenceScore?: number | null;
  detectedStartMs?: number | null;
  detectedEndMs?: number | null;
  containerType?: string | null;
  requiredVolume?: string | null;
  timingSource?: ChugTimingSource | null;
  expiresAt?: string | null;
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
  duration_ms: number | null;
  confidence_score?: number | null;
  detected_start_ms?: number | null;
  detected_end_ms?: number | null;
  container_type?: string | null;
  required_volume?: string | null;
  timing_source?: ChugTimingSource | string | null;
  expires_at?: string | null;
  created_at?: string | null;
  verified_at?: string | null;
  beer_name?: string | null;
};
```

Update status normalization and add timing-source normalization:

```ts
const normalizeStatus = (status?: string | null): ChugVerificationStatus => {
  if (status === 'verified' || status === 'rejected' || status === 'expired') return status;
  return 'unverified';
};

const normalizeTimingSource = (source?: string | null): ChugTimingSource => {
  if (source === 'manual' || source === 'pending_manual') return source;
  return 'ai';
};
```

Add a catalog-only helper:

```ts
export const getChugBeerOptions = (catalog: BeerCatalogItem[] = []) => (
  catalog
    .filter((beverage) => !beverage.kind || beverage.kind === 'beer')
    .map((beverage) => beverage.name)
);
```

Replace the fastest helper and add the feed-stat selector:

```ts
export const getFastestVisibleChugAttempt = <T extends Pick<SessionChugAttempt, 'status' | 'durationMs'>>(
  attempts: T[] = []
) => {
  return [...attempts]
    .filter((attempt) => (
      (attempt.status === 'verified' || attempt.status === 'unverified')
      && typeof attempt.durationMs === 'number'
      && attempt.durationMs > 0
    ))
    .sort((a, b) => (a.durationMs || 0) - (b.durationMs || 0))[0] || null;
};

export type VisibleChugStat =
  | { kind: 'timed'; attempt: SessionChugAttempt }
  | { kind: 'pending_manual'; attempt: SessionChugAttempt }
  | { kind: 'expired'; attempt: SessionChugAttempt };

export const getVisibleChugStat = (
  attempts: SessionChugAttempt[] = []
): VisibleChugStat | null => {
  const fastest = getFastestVisibleChugAttempt(attempts);
  if (fastest) return { kind: 'timed', attempt: fastest };

  const pendingManual = attempts.find((attempt) => (
    attempt.status === 'unverified' && attempt.timingSource === 'pending_manual'
  ));
  if (pendingManual) return { kind: 'pending_manual', attempt: pendingManual };

  const expired = attempts.find((attempt) => attempt.status === 'expired');
  return expired ? { kind: 'expired', attempt: expired } : null;
};
```

Add expiry labeling:

```ts
export const formatChugStatusLabel = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'verified') return 'Verified';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'expired') return 'Expired';
  return 'Unverified';
};
```

Extend `mapChugAttemptRow`:

```ts
durationMs: row.duration_ms === null ? null : Math.round(Number(row.duration_ms) || 0),
timingSource: normalizeTimingSource(row.timing_source),
expiresAt: row.expires_at ?? null,
```

In the existing verified-row expectation in `scripts/chugAttempts.test.js`, add:

```js
timingSource: 'ai',
expiresAt: null,
```

- [ ] **Step 5: Render one prioritized chug stat in the feed card**

In `src/screens/FeedScreen.tsx`, replace the `getFastestVisibleChugAttempt` import and call with:

```ts
import {
  formatChugDuration,
  getChugStatSubtitle,
  getVisibleChugStat,
  mapChugAttemptRow,
  SessionChugAttempt,
  SessionChugAttemptRow,
} from '../lib/chugAttempts';

const visibleChugStat = getVisibleChugStat(item.session_chug_attempts || []);
```

Replace the existing `fastestChug` detail pill:

```tsx
{visibleChugStat ? (
  <View style={styles.detailPill}>
    <Text style={styles.detailLabel}>
      {visibleChugStat.kind === 'timed' ? 'Fastest chug' : 'Chug verification'}
    </Text>
    {visibleChugStat.kind === 'timed' ? (
      <>
        <Text style={styles.detailValue}>{formatChugDuration(visibleChugStat.attempt.durationMs)}</Text>
        <Text style={styles.detailHint} numberOfLines={2}>{getChugStatSubtitle(visibleChugStat.attempt)}</Text>
      </>
    ) : (
      <Text style={styles.detailStateValue}>
        {visibleChugStat.kind === 'pending_manual'
          ? 'Pending manual timing'
          : 'Chugging verification expired'}
      </Text>
    )}
  </View>
) : null}
```

Add:

```ts
detailStateValue: {
  ...typography.caption,
  color: colors.text,
  fontWeight: '800',
  lineHeight: 18,
},
```

- [ ] **Step 6: Run the focused helper and feed tests to verify they pass**

Run:

```bash
npm run test:chugs
npm run test:chug-feed
```

Expected: PASS with `chug attempt helper checks passed` and `chug feed stat checks passed`.

- [ ] **Step 7: Commit the feed state model**

```bash
git add scripts/chugAttempts.test.js scripts/chugFeedStats.test.js src/lib/chugAttempts.ts src/screens/FeedScreen.tsx
git commit -m "feat: show pending and expired chug stats"
```

---

### Task 3: Focused And Polished Chug Recording Flow

**Files:**
- Modify: `scripts/chugRecordScreen.test.js`
- Modify: `src/components/ChugAttemptModal.tsx`
- Modify: `src/screens/RecordScreen.tsx`

- [ ] **Step 1: Invoke UI implementation guidance**

Invoke `building-native-ui`, `bencium-controlled-ux-designer`, and `expo-react-native-performance`. Apply their guidance within the already-approved Beerva visual direction. Do not introduce a new palette, nested cards, or decorative effects.

- [ ] **Step 2: Write failing record-flow assertions**

Append to `scripts/chugRecordScreen.test.js`:

```js
assert.doesNotMatch(modalSource, /BeerDraftForm/, 'chug modal should not reuse the generic drink form');
assert.doesNotMatch(modalSource, /eligibleBeers/, 'chug modal should not offer existing session beers');
assert.match(modalSource, /AutocompleteInput/, 'chug modal should use catalog-only beer search');
assert.match(modalSource, /getChugBeerOptions/, 'chug modal should filter search options to beer catalog items');
assert.match(modalSource, /verifierSearch/, 'chug modal should locally filter mutual followers');
assert.match(modalSource, /height:\s*220/, 'recording angle illustration should be taller');
assert.match(modalSource, /Your chug is being analyzed\. Be patient\.\.\./, 'analysis should cover the modal with progress feedback');
assert.match(modalSource, /Send for manual timing/, 'failed detection should allow verifier timing');
assert.match(recordSource, /const \[chugAnalyzing, setChugAnalyzing\]/, 'record flow should separate analysis progress from general busy state');
assert.match(recordSource, /timingSource: 'ai' \| 'pending_manual'/, 'record flow should save timed and pending-manual attempts');
assert.match(recordSource, /timing_source:\s*timingSource/, 'record insert should persist timing source');
assert.match(recordSource, /duration_ms:\s*durationMs/, 'record insert should allow missing pending-manual duration');
assert.match(recordSource, /onSubmitManualTiming=\{sendChugForManualTiming\}/, 'modal should submit preserved failed-analysis proof');

const addBoozeIndex = recordSource.indexOf('submitLabel="Add Booze"');
const chugPanelIndex = recordSource.indexOf('accessibilityLabel="Record a 33cl bottle chug attempt"');
const postDetailsIndex = recordSource.indexOf('<Text style={styles.sectionTitle}>Post Details</Text>');
assert.ok(
  addBoozeIndex !== -1 && chugPanelIndex > addBoozeIndex && postDetailsIndex > chugPanelIndex,
  'chug panel should sit between Add Booze and Post Details'
);
```

- [ ] **Step 3: Run the focused recording test to verify it fails**

Run:

```bash
npm run test:chug-record
```

Expected: FAIL because the modal still uses `BeerDraftForm`, existing eligible beers, and the old footer.

- [ ] **Step 4: Convert the modal imports and props**

In `src/components/ChugAttemptModal.tsx`, use:

```ts
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Beer, Search, Timer, UserCheck, X } from 'lucide-react-native';

import { AppButton } from './AppButton';
import { AutocompleteInput } from './AutocompleteInput';
import { getBeverageOptionSearchText, getBeerLine, SessionBeer } from '../lib/sessionBeers';
import { formatChugDuration, getChugBeerOptions } from '../lib/chugAttempts';
import { useBeverageCatalog } from '../lib/beverageCatalogContext';
```

Replace the modal props with:

```ts
type ChugAttemptModalProps = {
  visible: boolean;
  mutualFollowers: MutualFollower[];
  selectedBeer: SessionBeer | null;
  selectedVerifierId: string | null;
  analysisPreview: AnalysisPreview | null;
  needsManualTiming: boolean;
  analyzing: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreateBeer: (beerName: string) => void;
  onSelectVerifier: (verifierId: string) => void;
  onRecord: () => void;
  onRetry: () => void;
  onAccept: () => void;
  onSubmitManualTiming: () => void;
};
```

Replace the component destructuring with:

```ts
export const ChugAttemptModal = ({
  visible,
  mutualFollowers,
  selectedBeer,
  selectedVerifierId,
  analysisPreview,
  needsManualTiming,
  analyzing,
  busy,
  error,
  onClose,
  onCreateBeer,
  onSelectVerifier,
  onRecord,
  onRetry,
  onAccept,
  onSubmitManualTiming,
}: ChugAttemptModalProps) => {
```

- [ ] **Step 5: Add focused modal state and local search**

Inside `ChugAttemptModal`, add:

```ts
const { catalog } = useBeverageCatalog();
const [beerSearch, setBeerSearch] = useState('');
const [verifierSearch, setVerifierSearch] = useState('');
const chugBeerOptions = useMemo(() => getChugBeerOptions(catalog), [catalog]);
const selectedVerifier = mutualFollowers.find((follower) => follower.id === selectedVerifierId) || null;
const normalizedVerifierSearch = verifierSearch.trim().toLowerCase();
const filteredFollowers = mutualFollowers
  .filter((follower) => (
    !normalizedVerifierSearch
    || (follower.username || '').toLowerCase().includes(normalizedVerifierSearch)
  ))
  .slice(0, 20);
const canRecord = Boolean(selectedBeer && selectedVerifier && !busy);
const canAccept = Boolean(analysisPreview && selectedBeer && selectedVerifier && !busy);
const canSubmitManualTiming = Boolean(needsManualTiming && selectedBeer && selectedVerifier && !busy);

useEffect(() => {
  if (!visible) return;
  setBeerSearch('');
  setVerifierSearch('');
}, [visible]);
```

- [ ] **Step 6: Replace modal setup content**

Keep the guidance panel, change `guidanceImage.height` to `220`, and replace the beer and verifier controls with:

```tsx
<Text style={styles.ruleText}>Chugs are 33cl bottled beers only for now.</Text>

<Text style={styles.sectionTitle}>Beer</Text>
{selectedBeer ? (
  <View style={[styles.optionRow, styles.optionRowActive]}>
    <Beer color={colors.background} size={18} />
    <View style={styles.optionText}>
      <Text style={[styles.optionTitle, styles.optionTitleActive]}>{selectedBeer.beer_name}</Text>
      <Text style={[styles.optionMeta, styles.optionMetaActive]}>{getBeerLine(selectedBeer)}</Text>
    </View>
  </View>
) : (
  <AutocompleteInput
    value={beerSearch}
    onChangeText={setBeerSearch}
    onSelectItem={onCreateBeer}
    data={chugBeerOptions}
    placeholder="Search bottled beer"
    icon={<Beer color={colors.textMuted} size={20} />}
    getSearchText={(beerName) => getBeverageOptionSearchText(beerName, catalog)}
  />
)}

<Text style={styles.sectionTitle}>Verifier</Text>
{mutualFollowers.length === 0 ? (
  <View style={styles.emptyBox}>
    <UserCheck color={colors.textMuted} size={22} />
    <Text style={styles.emptyText}>Add a mutual follower before chug verification.</Text>
  </View>
) : (
  <>
    <View style={styles.searchBox}>
      <Search color={colors.textMuted} size={18} />
      <TextInput
        value={verifierSearch}
        onChangeText={setVerifierSearch}
        placeholder="Search mutual followers"
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
      />
    </View>
    {filteredFollowers.map((follower) => (
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
    ))}
  </>
)}
```

- [ ] **Step 7: Replace modal footer states and add analysis overlay**

Replace the footer with:

```tsx
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
  ) : needsManualTiming ? (
    <>
      <TouchableOpacity style={styles.secondaryButton} onPress={onRetry} disabled={busy}>
        <Text style={styles.secondaryButtonText}>Try again</Text>
      </TouchableOpacity>
      <View style={styles.primaryWrap}>
        <AppButton
          label="Send for manual timing"
          onPress={onSubmitManualTiming}
          loading={busy}
          disabled={!canSubmitManualTiming}
        />
      </View>
    </>
  ) : (
    <AppButton label="Record Chug" onPress={onRecord} loading={busy} disabled={!canRecord} />
  )}
</View>

{analyzing ? (
  <View style={styles.analysisOverlay}>
    <ActivityIndicator color={colors.primary} size="large" />
    <Text style={styles.analysisTitle}>Your chug is being analyzed.</Text>
    <Text style={styles.analysisText}>Be patient...</Text>
  </View>
) : null}
```

Add these styles:

```ts
sheet: {
  // keep existing declarations
  position: 'relative',
},
guidanceImage: {
  width: '100%',
  height: 220,
},
ruleText: {
  ...typography.caption,
  color: colors.textMuted,
  lineHeight: 18,
},
searchBox: {
  minHeight: 52,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.surface,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  paddingHorizontal: 12,
},
searchInput: {
  flex: 1,
  ...typography.body,
  color: colors.text,
},
analysisOverlay: {
  ...StyleSheet.absoluteFillObject,
  zIndex: 20,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: 24,
  backgroundColor: colors.overlay,
},
analysisTitle: {
  ...typography.h3,
  color: colors.text,
  textAlign: 'center',
},
analysisText: {
  ...typography.body,
  color: colors.textMuted,
  textAlign: 'center',
},
```

- [ ] **Step 8: Simplify record-screen state and setup**

In `src/screens/RecordScreen.tsx`:

1. Remove `chugBeerDraft`, `eligibleChugBeers`, and the now-unused `isBottleChugEligibleBeer` import.
2. Add:

```ts
const [chugAnalyzing, setChugAnalyzing] = useState(false);
const [chugNeedsManualTiming, setChugNeedsManualTiming] = useState(false);
const chugSelectedBeer = sessionBeers.find((beer) => beer.id === chugSelectedBeerId) || null;
```

3. Reset the new states in `resetActiveState` and `openChugFlow`:

```ts
setChugAnalyzing(false);
setChugNeedsManualTiming(false);
```

4. Do not preselect an existing beer or the first verifier in `openChugFlow`. Reset both before loading followers:

```ts
setChugSelectedBeerId(null);
setChugSelectedVerifierId(null);
```
5. Replace `createChugBeer` with:

```ts
const createChugBeer = async (beerName: string) => {
  if (chugBusy) return;
  setChugBusy(true);
  try {
    const createdBeer = await addBeerToSession({
      beerName,
      volume: CHUG_REQUIRED_VOLUME,
      quantity: 1,
    });
    if (createdBeer?.id) {
      setChugSelectedBeerId(createdBeer.id);
      setChugError(null);
    }
  } finally {
    setChugBusy(false);
  }
};
```

- [ ] **Step 9: Preserve failed-analysis proof and isolate analysis progress**

In `recordChugVideo`, reset `chugNeedsManualTiming` before recording:

```ts
setChugNeedsManualTiming(false);
```

After preparing the selected video, store it immediately and analyze it inside a nested progress block:

```ts
const preparedVideo = await chugVideoFromPickerAsset(result.assets[0]);
setChugVideo(preparedVideo);
setChugAnalyzing(true);

try {
  const analysis = await analyzeChugVideo(preparedVideo);

  if (!analysis.ok || !analysis.durationMs) {
    setChugNeedsManualTiming(true);
    setChugError(analysis.reason || 'Could not detect a clean chug start and stop.');
    return;
  }

  setChugAnalysisPreview({
    durationMs: analysis.durationMs,
    confidenceScore: analysis.confidenceScore,
    detectedStartMs: analysis.detectedStartMs,
    detectedEndMs: analysis.detectedEndMs,
  });
} catch (analysisError: any) {
  setChugNeedsManualTiming(true);
  setChugError(analysisError?.message || 'Could not analyze this chug attempt.');
} finally {
  setChugAnalyzing(false);
}
```

- [ ] **Step 10: Save AI and pending-manual attempts through one path**

Replace `acceptChugAttempt` with:

```ts
const saveChugAttempt = async (timingSource: 'ai' | 'pending_manual') => {
  const durationMs = timingSource === 'ai' ? chugAnalysisPreview?.durationMs ?? null : null;
  if (
    !activeSession
    || !chugSelectedBeerId
    || !chugSelectedVerifierId
    || !chugVideo
    || (timingSource === 'ai' && !chugAnalysisPreview)
    || chugBusy
  ) {
    return;
  }

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
        duration_ms: durationMs,
        ai_duration_ms: durationMs,
        timing_source: timingSource,
        confidence_score: chugAnalysisPreview?.confidenceScore ?? null,
        detected_start_ms: chugAnalysisPreview?.detectedStartMs ?? null,
        detected_end_ms: chugAnalysisPreview?.detectedEndMs ?? null,
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
        duration_ms: durationMs,
        pub_name: activeSession.pub_name,
      },
    });

    if (notifError) console.error('Chug verification notification insert error:', notifError);

    setChugVisible(false);
    setChugAnalysisPreview(null);
    setChugNeedsManualTiming(false);
    setChugVideo(null);
    hapticSuccess();
    showAlert(
      'Chug saved',
      timingSource === 'pending_manual'
        ? 'Your mate will set the time while reviewing the video.'
        : 'Your result is on the post as unverified until your mate reviews it.'
    );
  } catch (error: any) {
    setChugError(error?.message || 'Could not save chug attempt.');
  } finally {
    setChugBusy(false);
  }
};

const acceptChugAttempt = () => saveChugAttempt('ai');
const sendChugForManualTiming = () => saveChugAttempt('pending_manual');
```

- [ ] **Step 11: Move and wire the full-width chug panel**

In `src/screens/RecordScreen.tsx`, move the existing `TouchableOpacity` chug action after the closing Drinks `</Surface>` and before the Post Details `<Surface>`. Keep it as one full-width action panel, not a card nested inside another card.

Wire the streamlined modal:

```tsx
<ChugAttemptModal
  visible={chugVisible}
  mutualFollowers={mutualFollowers}
  selectedBeer={chugSelectedBeer}
  selectedVerifierId={chugSelectedVerifierId}
  analysisPreview={chugAnalysisPreview}
  needsManualTiming={chugNeedsManualTiming}
  analyzing={chugAnalyzing}
  busy={chugBusy}
  error={chugError}
  onClose={() => setChugVisible(false)}
  onCreateBeer={createChugBeer}
  onSelectVerifier={setChugSelectedVerifierId}
  onRecord={recordChugVideo}
  onRetry={recordChugVideo}
  onAccept={acceptChugAttempt}
  onSubmitManualTiming={sendChugForManualTiming}
/>
```

- [ ] **Step 12: Run the focused recording and drink-form tests**

Run:

```bash
npm run test:chug-record
npm run test:record-session-drinks
```

Expected: PASS with `chug record screen checks passed` and `record session drink checks passed`.

- [ ] **Step 13: Commit the focused recording flow**

```bash
git add scripts/chugRecordScreen.test.js src/components/ChugAttemptModal.tsx src/screens/RecordScreen.tsx
git commit -m "feat: streamline chug recording flow"
```

---

### Task 4: Deadline-Aware Direct Manual Verification

**Files:**
- Modify: `scripts/chugVerificationScreen.test.js`
- Modify: `src/screens/ChugVerificationScreen.tsx`

- [ ] **Step 1: Write failing verifier-screen assertions**

Append to `scripts/chugVerificationScreen.test.js`:

```js
assert.match(source, /timing_source/, 'review screen should fetch the timing source');
assert.match(source, /expires_at/, 'review screen should fetch the expiry deadline');
assert.match(source, /row\.timing_source === 'pending_manual'/, 'pending-manual review should open directly in manual timing mode');
assert.match(source, /Chugging verification expired\./, 'expired review should show a clear disabled state');
assert.match(source, /setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\)/, 'open verifier screen should notice expiry without a reload');
assert.match(source, /!reviewExpired/, 'review actions should be disabled after the deadline');
```

- [ ] **Step 2: Run the focused verifier test to verify it fails**

Run:

```bash
npm run test:chug-review
```

Expected: FAIL because the verifier screen does not fetch timing source or expiry.

- [ ] **Step 3: Extend verifier attempt fields and deadline state**

In `src/screens/ChugVerificationScreen.tsx`, add `useEffect` to the React import. Extend `ReviewAttempt`:

```ts
duration_ms: number | null;
timing_source?: 'ai' | 'manual' | 'pending_manual' | string | null;
expires_at?: string | null;
```

Inside the component add:

```ts
const [nowMs, setNowMs] = useState(Date.now());
const expiryMs = attempt?.expires_at ? Date.parse(attempt.expires_at) : Number.POSITIVE_INFINITY;
const reviewExpired = attempt?.status === 'expired' || expiryMs <= nowMs;

useEffect(() => {
  const timer = setInterval(() => setNowMs(Date.now()), 1000);
  return () => clearInterval(timer);
}, []);
```

- [ ] **Step 4: Fetch fields and enter direct manual mode**

Add `timing_source` and `expires_at` to the Supabase select. In `fetchAttempt`, replace `setReviewMode('review')` with:

```ts
setReviewMode(
  row.status === 'unverified' && row.timing_source === 'pending_manual'
    ? 'manual_timing'
    : 'review'
);
```

Change `enterManualTiming` so the playback effect owns slow-motion startup:

```ts
const enterManualTiming = useCallback(() => {
  setReviewMode('manual_timing');
}, []);

useEffect(() => {
  if (reviewMode !== 'manual_timing' || !videoUrl || reviewExpired) return;
  restartManualTiming();
}, [restartManualTiming, reviewExpired, reviewMode, videoUrl]);
```

- [ ] **Step 5: Render pending and expired states cleanly**

Replace the duration line:

```tsx
{attempt.duration_ms ? (
  <Text style={styles.duration}>{formatChugDuration(attempt.duration_ms)}</Text>
) : (
  <Text style={styles.pendingTiming}>Pending manual timing</Text>
)}
```

After the optional note input, add:

```tsx
{reviewExpired ? (
  <View style={styles.expiredPanel}>
    <Text style={styles.expiredTitle}>Chugging verification expired.</Text>
    <Text style={styles.meta}>The temporary proof video is no longer available for review.</Text>
  </View>
) : null}
```

Add styles:

```ts
pendingTiming: {
  ...typography.h3,
  color: colors.primary,
  marginTop: 10,
},
expiredPanel: {
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.surface,
  padding: 14,
  gap: 4,
},
expiredTitle: {
  ...typography.body,
  color: colors.text,
  fontWeight: '800',
},
```

- [ ] **Step 6: Hide expired proof playback**

Change the proof-video conditional from:

```tsx
{videoUrl ? (
```

to:

```tsx
{videoUrl && !reviewExpired ? (
```

- [ ] **Step 7: Disable late review actions**

Add `&& !reviewExpired` to all three action-block guards:

```tsx
attempt.status === 'unverified' && !reviewExpired && reviewMode === 'review'
attempt.status === 'unverified' && !reviewExpired && reviewMode === 'reject_options'
attempt.status === 'unverified' && !reviewExpired && reviewMode === 'manual_timing'
```

At the top of `reviewAttempt`, guard stale open screens before calling the RPC:

```ts
if (!attemptId || reviewing || reviewExpired) return;
```

Add `reviewExpired` to the callback dependency list.

- [ ] **Step 8: Run the focused verifier test to verify it passes**

Run:

```bash
npm run test:chug-review
```

Expected: PASS with `chug verification screen checks passed`.

- [ ] **Step 9: Commit the verifier deadline flow**

```bash
git add scripts/chugVerificationScreen.test.js src/screens/ChugVerificationScreen.tsx
git commit -m "feat: add pending chug verifier timing"
```

---

### Task 5: Verification Sweep And Visual Check

**Files:**
- Verify only

- [ ] **Step 1: Run the focused chug suite**

```bash
npm run test:chugs
npm run test:chug-db
npm run test:chug-notifications
npm run test:chug-detection
npm run test:chug-mediapipe-bundle
npm run test:chug-manual-timing
npm run test:chug-proof-storage
npm run test:chug-record
npm run test:chug-review
npm run test:chug-feed
```

Expected: every command exits `0`.

- [ ] **Step 2: Run adjacent regression tests**

```bash
npm run test:session-beers
npm run test:record-session-drinks
npm run test:notifications
npm run test:feed-redesign
```

Expected: every command exits `0`.

- [ ] **Step 3: Export the web app**

```bash
npm run build:web
```

Expected: exit `0` with `Exported: dist`.

- [ ] **Step 4: Start the local app and perform a responsive visual check**

Run:

```bash
npm start -- --web
```

Open the local Expo web URL. Check the active session page at a narrow mobile viewport and a desktop viewport:

- `How fast can you chug?` sits between Drinks and Post Details.
- The action panel matches existing Beerva surfaces while remaining visually distinct.
- The modal image is tall enough to show the recommended slight-side angle.
- Beer search, verifier search, selected rows, and footer actions do not overlap.
- The analysis overlay fully covers the modal and keeps the spinner and message centered.
- Long verifier names wrap or truncate without resizing controls.

If authentication or local data prevents opening the active-session modal, report that limitation after confirming the source-contract tests and web export.

- [ ] **Step 5: Inspect branch status**

```bash
git status --short --branch
```

Expected: clean `feature/beer-chugging` worktree.

- [ ] **Step 6: Request code review**

Invoke `requesting-code-review` and review the database constraints, record fallback state, feed priority, and verifier deadline flow.

- [ ] **Step 7: Finish the branch workflow**

Invoke `finishing-a-development-branch` and present the standard integration options.
