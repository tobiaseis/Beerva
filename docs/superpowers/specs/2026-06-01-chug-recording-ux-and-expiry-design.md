# Chug Recording UX And Expiry Design

## Goal

Make the first-version beer chug flow easier to use in a busy bar, more forgiving when on-device bottle detection fails, and cheaper to operate over time.

The flow remains limited to one bottled 33cl beer per attempt. MediaPipe stays fully on-device. There is no Gemini fallback and no paid video-processing step.

## Experience Direction

The chug flow should feel integrated with the existing session-recording experience while carrying a little more competitive energy. It should be polished and playful without becoming a separate visual world.

Use the existing Beerva spacing, surfaces, typography, and button language. Give the chug action enough visual weight to feel special, keep the setup modal focused, and use clear progress and error states. Avoid novelty styling that makes the feature feel bolted on.

## Session Page Placement

Move `How fast can you chug?` out of the Drinks surface. Render it as a separate full-width action panel between Drinks and Post Details.

The normal `Add Booze` workflow remains unchanged.

## Chug Setup Modal

The chug modal becomes a focused setup flow:

1. Show the existing best-recording-angle image at a taller height so the person, bottle, and recommended slight-side angle are easier to inspect.
2. Show the rule as direct text: `Chugs are 33cl bottled beers only for now.`
3. Provide one catalog-only beer search.
4. When the user selects a catalog beer, immediately add one 33cl bottle to the active session and attach that drink record to the chug attempt.
5. Do not show volume buttons, quantity controls, an existing-session-beer picker, or custom beer entry.
6. Provide one local search box for selecting the verifier from the mutual followers loaded when the modal opens.

The selected beer and selected verifier remain visibly confirmed before recording starts.

## Recording And Local Analysis

Recording continues to use the camera and the existing on-device MediaPipe analysis.

While analysis runs, cover the chug modal with a loading state and spinner. Use the message:

`Your chug is being analyzed. Be patient...`

If MediaPipe finds stable mouth-and-bottle contact, show the AI-timed result and allow submission as before.

If analysis fails, preserve the recorded proof video and show:

- `Try again`
- `Send for manual timing`

`Try again` records a replacement video. `Send for manual timing` uploads the existing proof and creates an open verification request without an initial duration.

## Verification Experience

Only the selected mutual follower may review an attempt.

For an AI-timed attempt, preserve the existing review flow:

1. Show the proof video and AI duration.
2. Allow `Accept` or `Reject`.
3. After `Reject`, allow `Adjust time` or `Reject chug completely`.
4. Manual retiming plays the video at `0.75x`, provides a large `Start` button that changes to `Stop`, shows the resulting duration, and offers `Approve time` or `Re-do timing`.

For an attempt without an AI duration, open directly in the same manual retiming mode. It cannot be approved until the verifier supplies valid manual start and end timestamps.

If the attempt expired while the verifier screen was open, disable review actions and show that verification expired.

## Data Model

Keep verification status and timing source separate.

`status` values:

- `unverified`
- `verified`
- `rejected`
- `expired`

`timing_source` values:

- `ai`
- `manual`
- `pending_manual`

Add `expires_at`, defaulting to 24 hours after attempt creation.

Allow `duration_ms` to be null only while `timing_source = 'pending_manual'`. Allow `ai_duration_ms` to be null for pending-manual attempts and for manually verified attempts that never had an AI baseline. Once a pending-manual attempt is verified, save the manually selected effective duration, leave `ai_duration_ms` null, and change `timing_source` to `manual`.

Create a new additive migration. Do not rewrite the existing chug migrations.

## Review RPC Rules

Extend `review_chug_attempt` so that it:

- Accepts reviews only for `status = 'unverified'`.
- Rejects a review when `expires_at <= now()`.
- Requires both manual timestamps when approving a `pending_manual` attempt.
- Allows rejection without manual timestamps.
- Keeps the existing valid manual duration range of 1 to 15000 milliseconds.
- Deletes the proof video and thumbnail after verification or rejection.

## Automatic Expiry

Create a database cleanup function for overdue open attempts. It:

1. Selects attempts where `status = 'unverified'` and `expires_at <= now()`.
2. Deletes their temporary proof video and thumbnail from `storage.objects`.
3. Clears stored media paths.
4. Changes their status to `expired`.

Schedule the cleanup function once per minute with Supabase Cron. This deletes proof media within one minute after the 24-hour deadline. Supabase Cron uses the `pg_cron` Postgres extension and can run database functions directly: [Supabase Cron documentation](https://supabase.com/docs/guides/cron).

Cron must be enabled for the hosted Supabase project when the migration is applied.

## Feed Stats

Under More Stats, show one chug result using this priority:

1. Fastest timed chug with `status = 'verified'` or `status = 'unverified'`, preserving its verified or unverified label.
2. `Pending manual timing` when there is no timed chug and at least one open pending-manual attempt.
3. `Chugging verification expired` when there is no timed or pending attempt and at least one expired attempt.

Older expired attempts must not distract from a stronger timed or pending result. An expired attempt is never eligible as a timed chug, even if it retained an earlier AI duration in its database row.

## Error Handling

- Camera cancellation returns the user to the setup modal without creating an attempt.
- MediaPipe failure keeps the recorded proof available for retry or manual timing.
- Upload or insert failure keeps the modal open and surfaces the error.
- The database is authoritative for expiry, even if a verifier opened the screen before the deadline.
- Cleanup is idempotent: rerunning it does not affect reviewed attempts or already-cleared media.

## Testing

Add focused regression coverage for:

- Database constraints for nullable pending-manual timing.
- Expiry timestamp defaults and status rules.
- Cleanup function media deletion and idempotency.
- Review RPC rejection after expiry.
- Required manual timestamps for pending-manual approval.
- Feed stat priority: timed, then pending manual, then expired.
- Dedicated chug catalog search with forced 33cl quantity-one creation.
- Local mutual-follower verifier search.
- Taller angle image and direct rule text.
- Modal-wide analysis loading state.
- Failed-analysis retry and manual-submission paths.
- Direct manual timing mode for verifier review of pending-manual attempts.

Run the existing chug test suite and the web build after implementation.
