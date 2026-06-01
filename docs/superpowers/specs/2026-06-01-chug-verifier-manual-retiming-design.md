# Chug Verifier Manual Retiming Design

## Goal

Extend beer-chug verification so the chosen verifier can accept the detected time, reject the attempt completely, or manually correct the time before approving it.

## Scope

This extends the existing 33cl bottled-beer chug feature. It keeps the current mutual-follower verifier rule, proof-video storage lifecycle, public feed stat, and web/PWA proof-video review limitation.

Manual retiming is available only while an attempt is still `unverified`. Public posts continue to show the result as `Verified`; they do not expose whether a verifier manually adjusted the time.

## Review Flow

The pending verifier screen initially keeps its existing layout:

- Proof video with standard playback controls.
- AI-detected chug duration.
- Optional verifier note.
- **Reject** and **Verify** actions.

Pressing **Verify** accepts the AI-detected duration, marks the attempt as `verified`, and deletes the proof media.

Pressing **Reject** does not immediately modify the database. It reveals two explicit choices:

- **Adjust time** enters inline manual timing mode.
- **Reject chug completely** marks the attempt as `rejected` and deletes the proof media.

The verifier can return from the reject choices to the initial review without submitting anything.

## Manual Timing Mode

Manual timing stays inline on the existing verifier screen so the verifier keeps the same proof video and context.

When the verifier presses **Adjust time**:

1. The video seeks to the beginning.
2. Playback speed is set to `0.75x`.
3. The video autoplays.
4. Standard controls remain enabled, allowing pause and scrubbing before or during timing.
5. A large **Start** button captures the video's current playback position in milliseconds.
6. The button changes to **Stop**.
7. Pressing **Stop** captures the ending playback position in milliseconds.
8. The UI calculates and displays the proposed duration from the captured playback timestamps.

The duration uses video playback timestamps rather than elapsed wall-clock time. Slow-motion playback therefore improves precision without changing the resulting chug duration.

After a valid measurement:

- **Approve time** submits the manual timestamps and verifies the attempt.
- **Re-do timing** clears both timestamps, seeks the video to the beginning, keeps `0.75x` playback speed, and autoplays again.
- A back action returns to the reject choices without submitting anything.

## Data Model

`public.session_chug_attempts` remains the single source of truth. Add:

```sql
ai_duration_ms integer not null,
manual_start_ms integer,
manual_end_ms integer,
manual_duration_ms integer,
timing_source text not null default 'ai'
```

Add constraints:

```sql
constraint session_chug_attempts_ai_duration_check
  check (ai_duration_ms > 0 and ai_duration_ms <= 15000),
constraint session_chug_attempts_manual_range_check
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
constraint session_chug_attempts_timing_source_check
  check (timing_source in ('ai', 'manual')),
constraint session_chug_attempts_manual_source_check
  check (timing_source <> 'manual' or manual_duration_ms is not null)
```

For new attempts, the client inserts matching values for `duration_ms` and `ai_duration_ms`. Existing rows are backfilled with `ai_duration_ms = duration_ms` and `timing_source = 'ai'`.

Implement these changes in a new follow-up migration, `supabase/migrations/20260601130000_add_chug_manual_retiming.sql`. Do not rewrite the original chug migration, because it may already have been applied in a development database. The follow-up migration adds `ai_duration_ms` as nullable, backfills existing rows, then makes it `not null` before adding the constraints.

`duration_ms` remains the effective public result:

- For accepted AI timing, it keeps the AI duration.
- For manually adjusted timing, it is replaced with `manual_duration_ms`.

The public summary RPC continues returning `duration_ms`, so feed and post-detail rendering do not need a public manual-adjustment label.

## Secure Review RPC

Extend `public.review_chug_attempt` with optional manual timestamp parameters:

```sql
public.review_chug_attempt(
  target_attempt_id uuid,
  next_status text,
  note text default null,
  manual_start_ms integer default null,
  manual_end_ms integer default null
)
```

The follow-up migration drops the original three-argument RPC before creating the extended signature. This avoids leaving an ambiguous overloaded function behind when Supabase resolves RPC calls.

The RPC remains the only way to finalize review. It verifies:

- The caller is the chosen verifier.
- The attempt is still `unverified`.
- `next_status` is `verified` or `rejected`.
- Manual timestamps are either both absent or both present.
- Manual timestamps are accepted only when `next_status = 'verified'`.
- If present, `manual_start_ms >= 0`.
- If present, `manual_end_ms > manual_start_ms`.
- If present, their calculated duration is at most `15,000ms`.

When manual timestamps are present, the RPC stores them, calculates `manual_duration_ms`, replaces effective `duration_ms`, and sets `timing_source = 'manual'`.

When manual timestamps are absent and the attempt is verified, the RPC preserves the AI effective duration and sets `timing_source = 'ai'`.

When the attempt is rejected completely, the RPC stores the rejection and does not attach manual timestamps.

For every final outcome, the RPC deletes proof media from the private `chug_videos` bucket and clears `video_path` and `thumbnail_path`.

## Client Components

### `src/screens/ChugVerificationScreen.tsx`

Extend the existing screen with a small local state machine:

```ts
type ReviewMode = 'review' | 'reject_options' | 'manual_timing';
```

Add:

- A reusable web video ref so manual timing can read `currentTime`, change `playbackRate`, seek, and request playback.
- Local `manualStartMs` and `manualEndMs` state.
- Local helpers to enter manual timing, capture Start/Stop, re-do timing, and approve the manual time.
- Final rejection wording that makes the destructive outcome explicit.

The existing proof-video limitation remains clear on native platforms. Manual timing is web/PWA-only in this version because proof-video review is web/PWA-only.

## Error Handling

The client blocks submission and shows a concise message when:

- The video is unavailable.
- Playback timestamps cannot be read.
- **Stop** is pressed before **Start**.
- The measured duration is zero, negative, or above `15,000ms`.
- The secure RPC rejects stale or invalid review data.

The RPC remains authoritative so a manipulated client cannot submit invalid manual timing.

## Proof Video Lifecycle

The proof video stays available throughout pending review, reject-option selection, and manual timing.

It is deleted only after one of these final outcomes:

- **Verify**
- **Approve time**
- **Reject chug completely**

Returning between inline UI modes never deletes or modifies the proof video.

## Testing

Add focused checks for:

- New database columns and constraints.
- Existing-row backfill.
- Extended RPC signature.
- RPC validation for partial timestamps, invalid ranges, durations above `15,000ms`, and manual timestamps on rejection.
- RPC storage of manual timestamps, manual duration, effective duration, and `timing_source = 'manual'`.
- Proof-video deletion only inside the final review RPC.
- Inline reject choices.
- Manual timing mode using `0.75x`.
- Start/Stop capture from `video.currentTime`.
- **Re-do timing** seeking to the beginning and restarting playback.
- Manual approval passing timestamps to the secure RPC.
- Existing chug checks and web export.
