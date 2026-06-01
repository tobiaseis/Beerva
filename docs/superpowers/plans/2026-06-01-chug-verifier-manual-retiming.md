# Chug Verifier Manual Retiming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the chosen chug verifier manually retime a proof video at `0.75x` speed after pressing Reject, while preserving the AI timing for audit purposes.

**Architecture:** Add a follow-up Supabase migration that stores AI and manual timing separately and extends the secure review RPC. Keep playback timestamp math in a small pure helper, then extend the existing inline verifier screen with review, reject-options, and manual-timing modes. The proof video remains private and is deleted only when the verifier reaches a final outcome.

**Tech Stack:** Expo React Native/Web, React web video element, Supabase Postgres/RPC/Storage, existing Node script tests.

---

## Scope Check

This is one focused extension to the existing chug feature. It changes the database contract, record insert, verifier UI, and related tests together so manual timing remains secure and auditable.

## File Structure

- Create `supabase/migrations/20260601130000_add_chug_manual_retiming.sql`: add audit fields and replace the review RPC.
- Create `src/lib/chugManualTiming.ts`: pure playback timestamp conversion and duration validation.
- Create `scripts/chugManualTiming.test.js`: execute the pure timing helper behavior.
- Modify `scripts/chugDatabase.test.js`: inspect the follow-up migration contract.
- Modify `src/screens/RecordScreen.tsx`: save the initial MediaPipe duration as `ai_duration_ms`.
- Modify `scripts/chugRecordScreen.test.js`: require the AI timing insert.
- Modify `src/screens/ChugVerificationScreen.tsx`: add inline reject options and manual Start/Stop timing.
- Modify `scripts/chugVerificationScreen.test.js`: require the new review states and RPC parameters.
- Modify `package.json`: expose the new focused test command.

---

### Task 1: Manual Timing Helper

**Files:**
- Create: `scripts/chugManualTiming.test.js`
- Create: `src/lib/chugManualTiming.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing helper test**

Create `scripts/chugManualTiming.test.js`:

```js
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, moduleFilename) => {
  const moduleSource = fs.readFileSync(moduleFilename, 'utf8');
  const { outputText: compiledSource } = ts.transpileModule(moduleSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: moduleFilename,
  });
  module._compile(compiledSource, moduleFilename);
};

const filename = path.resolve(__dirname, '..', 'src/lib/chugManualTiming.ts');
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

const {
  CHUG_MANUAL_PLAYBACK_RATE,
  calculateManualChugDuration,
  getVideoPlaybackTimestampMs,
} = compiledModule.exports;

assert.equal(CHUG_MANUAL_PLAYBACK_RATE, 0.75);
assert.equal(getVideoPlaybackTimestampMs(1.234), 1234);
assert.equal(getVideoPlaybackTimestampMs(0), 0);
assert.equal(getVideoPlaybackTimestampMs(-1), null);
assert.equal(getVideoPlaybackTimestampMs(Number.NaN), null);
assert.equal(calculateManualChugDuration(1200, 6100), 4900);
assert.equal(calculateManualChugDuration(null, 6100), null);
assert.equal(calculateManualChugDuration(6100, 1200), null);
assert.equal(calculateManualChugDuration(0, 15001), null);

console.log('chug manual timing checks passed');
```

- [ ] **Step 2: Add the package script**

Add to `package.json`:

```json
"test:chug-manual-timing": "node scripts/chugManualTiming.test.js",
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
npm run test:chug-manual-timing
```

Expected: FAIL because `src/lib/chugManualTiming.ts` does not exist.

- [ ] **Step 4: Add the minimal helper**

Create `src/lib/chugManualTiming.ts`:

```ts
import { CHUG_VIDEO_MAX_MS } from './chugAttempts';

export const CHUG_MANUAL_PLAYBACK_RATE = 0.75;

export const getVideoPlaybackTimestampMs = (currentTimeSeconds?: number | null) => {
  if (typeof currentTimeSeconds !== 'number' || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
    return null;
  }
  return Math.round(currentTimeSeconds * 1000);
};

export const calculateManualChugDuration = (
  startMs?: number | null,
  endMs?: number | null
) => {
  if (startMs === null || startMs === undefined || endMs === null || endMs === undefined) {
    return null;
  }
  const durationMs = endMs - startMs;
  if (startMs < 0 || durationMs <= 0 || durationMs > CHUG_VIDEO_MAX_MS) return null;
  return durationMs;
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```bash
npm run test:chug-manual-timing
```

Expected: PASS with `chug manual timing checks passed`.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/chugManualTiming.test.js src/lib/chugManualTiming.ts
git commit -m "feat: add chug manual timing helpers"
```

---

### Task 2: Manual Timing Database Contract

**Files:**
- Create: `supabase/migrations/20260601130000_add_chug_manual_retiming.sql`
- Modify: `scripts/chugDatabase.test.js`

- [ ] **Step 1: Extend the migration source test**

Append to `scripts/chugDatabase.test.js`:

```js
const retimingMigrationPath = path.resolve(__dirname, '..', 'supabase/migrations/20260601130000_add_chug_manual_retiming.sql');
const retimingSource = fs.readFileSync(retimingMigrationPath, 'utf8');

assert.match(retimingSource, /add column if not exists ai_duration_ms integer/, 'retiming migration should preserve AI duration');
assert.match(retimingSource, /add column if not exists manual_start_ms integer/, 'retiming migration should store manual start');
assert.match(retimingSource, /add column if not exists manual_end_ms integer/, 'retiming migration should store manual end');
assert.match(retimingSource, /add column if not exists manual_duration_ms integer/, 'retiming migration should store manual duration');
assert.match(retimingSource, /add column if not exists timing_source text not null default 'ai'/, 'retiming migration should track timing source');
assert.match(retimingSource, /update public\.session_chug_attempts[\s\S]*set ai_duration_ms = duration_ms/, 'retiming migration should backfill existing attempts');
assert.match(retimingSource, /drop function if exists public\.review_chug_attempt\(uuid, text, text\)/, 'retiming migration should remove the old RPC signature');
assert.match(retimingSource, /manual_start_ms integer default null/, 'review RPC should accept manual start');
assert.match(retimingSource, /manual_end_ms integer default null/, 'review RPC should accept manual end');
assert.match(retimingSource, /Manual timing requires both start and end timestamps\./, 'review RPC should reject partial timing');
assert.match(retimingSource, /Manual timing is only allowed when verifying a chug attempt\./, 'review RPC should reject timestamps on complete rejection');
assert.match(retimingSource, /Manual chug timing must be between 1 and 15000 milliseconds\./, 'review RPC should validate manual duration');
assert.match(retimingSource, /timing_source = case when has_manual_timing then 'manual' else 'ai' end/, 'review RPC should mark manually corrected attempts');
assert.match(retimingSource, /duration_ms = case when has_manual_timing then reviewed_manual_duration_ms else attempt\.ai_duration_ms end/, 'review RPC should expose the effective verified duration');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:chug-db
```

Expected: FAIL because `supabase/migrations/20260601130000_add_chug_manual_retiming.sql` does not exist.

- [ ] **Step 3: Create the follow-up migration**

Create `supabase/migrations/20260601130000_add_chug_manual_retiming.sql`:

```sql
alter table public.session_chug_attempts
  add column if not exists ai_duration_ms integer,
  add column if not exists manual_start_ms integer,
  add column if not exists manual_end_ms integer,
  add column if not exists manual_duration_ms integer,
  add column if not exists timing_source text not null default 'ai';

update public.session_chug_attempts
set ai_duration_ms = duration_ms
where ai_duration_ms is null;

alter table public.session_chug_attempts
  alter column ai_duration_ms set not null,
  drop constraint if exists session_chug_attempts_ai_duration_check,
  drop constraint if exists session_chug_attempts_manual_range_check,
  drop constraint if exists session_chug_attempts_timing_source_check,
  drop constraint if exists session_chug_attempts_manual_source_check;

alter table public.session_chug_attempts
  add constraint session_chug_attempts_ai_duration_check
    check (ai_duration_ms > 0 and ai_duration_ms <= 15000),
  add constraint session_chug_attempts_manual_range_check
    check (
      (
        manual_start_ms is null
        and manual_end_ms is null
        and manual_duration_ms is null
      )
      or (
        manual_start_ms >= 0
        and manual_end_ms > manual_start_ms
        and manual_duration_ms = manual_end_ms - manual_start_ms
        and manual_duration_ms <= 15000
      )
    ),
  add constraint session_chug_attempts_timing_source_check
    check (timing_source in ('ai', 'manual')),
  add constraint session_chug_attempts_manual_source_check
    check (timing_source <> 'manual' or manual_duration_ms is not null);

drop function if exists public.review_chug_attempt(uuid, text, text);

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
    timing_source = case when has_manual_timing then 'manual' else 'ai' end,
    duration_ms = case when has_manual_timing then reviewed_manual_duration_ms else attempt.ai_duration_ms end
  where id = target_attempt_id
  returning * into attempt;

  return attempt;
end;
$$;

grant execute on function public.review_chug_attempt(uuid, text, text, integer, integer) to authenticated;

comment on function public.review_chug_attempt(uuid, text, text, integer, integer) is
  'Lets the chosen verifier approve, manually retime, or reject a chug attempt and clears temporary proof media.';
```

- [ ] **Step 4: Run the database test to verify it passes**

Run:

```bash
npm run test:chug-db
```

Expected: PASS with `chug database migration checks passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/chugDatabase.test.js supabase/migrations/20260601130000_add_chug_manual_retiming.sql
git commit -m "feat: add chug manual retiming database contract"
```

---

### Task 3: Preserve AI Timing On New Attempts

**Files:**
- Modify: `scripts/chugRecordScreen.test.js`
- Modify: `src/screens/RecordScreen.tsx`

- [ ] **Step 1: Write the failing record-flow assertion**

Append to `scripts/chugRecordScreen.test.js`:

```js
assert.match(recordSource, /ai_duration_ms:\s*chugAnalysisPreview\.durationMs/, 'record flow should preserve the original AI timing');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:chug-record
```

Expected: FAIL with `record flow should preserve the original AI timing`.

- [ ] **Step 3: Add the insert field**

In `src/screens/RecordScreen.tsx`, add `ai_duration_ms` beside `duration_ms` in the `session_chug_attempts` insert:

```ts
duration_ms: chugAnalysisPreview.durationMs,
ai_duration_ms: chugAnalysisPreview.durationMs,
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test:chug-record
```

Expected: PASS with `chug record screen checks passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/chugRecordScreen.test.js src/screens/RecordScreen.tsx
git commit -m "feat: preserve AI chug timing"
```

---

### Task 4: Inline Verifier Retiming Workflow

**Files:**
- Modify: `scripts/chugVerificationScreen.test.js`
- Modify: `src/screens/ChugVerificationScreen.tsx`

- [ ] **Step 1: Write the failing verifier-screen assertions**

Append to `scripts/chugVerificationScreen.test.js`:

```js
assert.match(source, /type ReviewMode = 'review' \| 'reject_options' \| 'manual_timing'/, 'review screen should use explicit inline modes');
assert.match(source, /Adjust time/, 'reject options should allow manual timing');
assert.match(source, /Reject chug completely/, 'reject options should expose final rejection');
assert.match(source, /CHUG_MANUAL_PLAYBACK_RATE/, 'manual timing should use the shared slow-motion rate');
assert.match(source, /getVideoPlaybackTimestampMs/, 'manual timing should read playback timestamps');
assert.match(source, /Start/, 'manual timing should render Start');
assert.match(source, /Stop/, 'manual timing should render Stop');
assert.match(source, /Approve time/, 'manual timing should render approval');
assert.match(source, /Re-do timing/, 'manual timing should support retry');
assert.match(source, /manual_start_ms:\s*manualTiming\?\.startMs \?\? null/, 'review RPC should receive manual start');
assert.match(source, /manual_end_ms:\s*manualTiming\?\.endMs \?\? null/, 'review RPC should receive manual end');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:chug-review
```

Expected: FAIL with `review screen should use explicit inline modes`.

- [ ] **Step 3: Extend imports and add the video handle**

In `src/screens/ChugVerificationScreen.tsx`, add `useRef` and the manual helper imports:

```ts
import React, { useCallback, useRef, useState } from 'react';
import {
  calculateManualChugDuration,
  CHUG_MANUAL_PLAYBACK_RATE,
  getVideoPlaybackTimestampMs,
} from '../lib/chugManualTiming';
```

Replace the existing `WebVideo` with:

```ts
type WebVideoHandle = {
  getCurrentTimestampMs: () => number | null;
  resetAndPlaySlowMotion: () => Promise<void>;
};

const WebVideo = React.forwardRef<WebVideoHandle, { uri: string }>(({ uri }, ref) => {
  const videoRef = useRef<any>(null);

  React.useImperativeHandle(ref, () => ({
    getCurrentTimestampMs: () => getVideoPlaybackTimestampMs(videoRef.current?.currentTime),
    resetAndPlaySlowMotion: async () => {
      if (!videoRef.current) return;
      videoRef.current.currentTime = 0;
      videoRef.current.playbackRate = CHUG_MANUAL_PLAYBACK_RATE;
      await videoRef.current.play();
    },
  }), []);

  if (Platform.OS !== 'web') return null;
  return React.createElement('video', {
    ref: videoRef,
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
});
```

- [ ] **Step 4: Add local workflow state**

Above `ChugVerificationScreen`, add:

```ts
type ReviewMode = 'review' | 'reject_options' | 'manual_timing';
```

Inside `ChugVerificationScreen`, add:

```ts
const videoRef = useRef<WebVideoHandle | null>(null);
const [reviewMode, setReviewMode] = useState<ReviewMode>('review');
const [manualStartMs, setManualStartMs] = useState<number | null>(null);
const [manualEndMs, setManualEndMs] = useState<number | null>(null);
const manualDurationMs = calculateManualChugDuration(manualStartMs, manualEndMs);
```

After loading an attempt in `fetchAttempt`, reset the local workflow:

```ts
setReviewMode('review');
setManualStartMs(null);
setManualEndMs(null);
```

- [ ] **Step 5: Extend the secure review call**

Change `reviewAttempt` to:

```ts
const reviewAttempt = useCallback(async (
  nextStatus: 'verified' | 'rejected',
  manualTiming?: { startMs: number; endMs: number }
) => {
  if (!attemptId || reviewing) return;
  setReviewing(nextStatus);
  setError(null);
  try {
    const { error: reviewError } = await supabase.rpc('review_chug_attempt', {
      target_attempt_id: attemptId,
      next_status: nextStatus,
      note,
      manual_start_ms: manualTiming?.startMs ?? null,
      manual_end_ms: manualTiming?.endMs ?? null,
    });
    if (reviewError) throw reviewError;
    await fetchAttempt();
  } catch (reviewError: any) {
    setError(reviewError?.message || 'Could not review chug attempt.');
  } finally {
    setReviewing(null);
  }
}, [attemptId, fetchAttempt, note, reviewing]);
```

- [ ] **Step 6: Add manual timing handlers**

Add:

```ts
const restartManualTiming = useCallback(async () => {
  setManualStartMs(null);
  setManualEndMs(null);
  setError(null);
  try {
    await videoRef.current?.resetAndPlaySlowMotion();
  } catch {
    setError('Could not start slow-motion playback. Use the video controls and try again.');
  }
}, []);

const enterManualTiming = useCallback(async () => {
  setReviewMode('manual_timing');
  await restartManualTiming();
}, [restartManualTiming]);

const captureManualTimestamp = useCallback(() => {
  const timestampMs = videoRef.current?.getCurrentTimestampMs() ?? null;
  if (timestampMs === null) {
    setError('Could not read the video position.');
    return;
  }

  if (manualStartMs === null) {
    setManualStartMs(timestampMs);
    setManualEndMs(null);
    setError(null);
    return;
  }

  if (calculateManualChugDuration(manualStartMs, timestampMs) === null) {
    setError('Stop must be after Start and within 15 seconds.');
    return;
  }

  setManualEndMs(timestampMs);
  setError(null);
}, [manualStartMs]);

const approveManualTiming = useCallback(() => {
  if (manualStartMs === null || manualEndMs === null || manualDurationMs === null) {
    setError('Record a valid Start and Stop time first.');
    return;
  }
  reviewAttempt('verified', { startMs: manualStartMs, endMs: manualEndMs });
}, [manualDurationMs, manualEndMs, manualStartMs, reviewAttempt]);
```

- [ ] **Step 7: Attach the ref and replace pending actions**

Change:

```tsx
<WebVideo uri={videoUrl} />
```

to:

```tsx
<WebVideo ref={videoRef} uri={videoUrl} />
```

Replace the existing `attempt.status === 'unverified'` action block with:

```tsx
{attempt.status === 'unverified' && reviewMode === 'review' ? (
  <View style={styles.actions}>
    <TouchableOpacity
      style={[styles.actionButton, styles.rejectButton]}
      onPress={() => setReviewMode('reject_options')}
      disabled={Boolean(reviewing)}
    >
      <XCircle color={colors.text} size={18} />
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

{attempt.status === 'unverified' && reviewMode === 'reject_options' ? (
  <View style={styles.decisionPanel}>
    <Text style={styles.decisionTitle}>What needs changing?</Text>
    <TouchableOpacity
      style={[styles.actionButton, styles.approveButton]}
      onPress={enterManualTiming}
      disabled={Platform.OS !== 'web' || !videoUrl}
    >
      <Text style={[styles.actionText, styles.approveText]}>Adjust time</Text>
    </TouchableOpacity>
    {Platform.OS !== 'web' ? (
      <Text style={styles.meta}>Manual timing is available in the web app for this version.</Text>
    ) : null}
    <TouchableOpacity
      style={[styles.actionButton, styles.destructiveButton]}
      onPress={() => reviewAttempt('rejected')}
      disabled={Boolean(reviewing)}
    >
      {reviewing === 'rejected' ? <ActivityIndicator color={colors.text} /> : <XCircle color={colors.text} size={18} />}
      <Text style={styles.actionText}>Reject chug completely</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.secondaryButton} onPress={() => setReviewMode('review')}>
      <Text style={styles.secondaryButtonText}>Back</Text>
    </TouchableOpacity>
  </View>
) : null}

{attempt.status === 'unverified' && reviewMode === 'manual_timing' ? (
  <View style={styles.decisionPanel}>
    <Text style={styles.decisionTitle}>Adjust chug time</Text>
    <Text style={styles.meta}>Video plays at 0.75x. Mark the exact drinking window.</Text>
    <TouchableOpacity
      style={[styles.timingButton, manualStartMs !== null && manualEndMs === null ? styles.stopTimingButton : null]}
      onPress={captureManualTimestamp}
      disabled={manualEndMs !== null}
    >
      <Text style={styles.timingButtonText}>{manualStartMs === null ? 'Start' : 'Stop'}</Text>
    </TouchableOpacity>
    {manualDurationMs !== null ? (
      <Text style={styles.manualDuration}>{formatChugDuration(manualDurationMs)}</Text>
    ) : null}
    {manualDurationMs !== null ? (
      <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={approveManualTiming}>
        <CheckCircle2 color={colors.background} size={18} />
        <Text style={[styles.actionText, styles.approveText]}>Approve time</Text>
      </TouchableOpacity>
    ) : null}
    <TouchableOpacity style={styles.secondaryButton} onPress={restartManualTiming}>
      <Text style={styles.secondaryButtonText}>Re-do timing</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.secondaryButton} onPress={() => setReviewMode('reject_options')}>
      <Text style={styles.secondaryButtonText}>Back</Text>
    </TouchableOpacity>
  </View>
) : null}
```

- [ ] **Step 8: Add focused styles**

Add to the stylesheet:

```ts
decisionPanel: {
  gap: spacing.sm,
  borderRadius: radius.md,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  padding: 16,
},
decisionTitle: {
  ...typography.h3,
  color: colors.text,
},
destructiveButton: {
  backgroundColor: colors.dangerSoft,
  borderWidth: 1,
  borderColor: colors.danger,
},
secondaryButton: {
  minHeight: 42,
  alignItems: 'center',
  justifyContent: 'center',
},
secondaryButtonText: {
  ...typography.body,
  color: colors.primary,
  fontWeight: '800',
},
timingButton: {
  minHeight: 82,
  borderRadius: radius.md,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: colors.primary,
},
stopTimingButton: {
  backgroundColor: colors.danger,
},
timingButtonText: {
  ...typography.h2,
  color: colors.background,
  fontWeight: '900',
},
manualDuration: {
  ...typography.h1,
  color: colors.text,
  textAlign: 'center',
  fontVariant: ['tabular-nums'],
},
```

- [ ] **Step 9: Run the verifier test to verify it passes**

Run:

```bash
npm run test:chug-review
```

Expected: PASS with `chug verification screen checks passed`.

- [ ] **Step 10: Commit**

```bash
git add scripts/chugVerificationScreen.test.js src/screens/ChugVerificationScreen.tsx
git commit -m "feat: add inline chug verifier retiming"
```

---

### Task 5: Verification Sweep

**Files:**
- Verify only

- [ ] **Step 1: Run focused chug tests**

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

- [ ] **Step 4: Inspect branch status**

```bash
git status --short --branch
```

Expected: clean `feature/beer-chugging` worktree.

- [ ] **Step 5: Finish the branch workflow**

Use `superpowers:finishing-a-development-branch` and present the standard merge, PR, keep, or discard options.
