# KarnevalsDruk Hangover Prompt Design

## Goal

KarnevalsDruk needs one hangover prompt for eligible joined users even when all of their event posts are made before the normal 21:00 late-night hangover window.

The one-off prompt should reuse the existing hangover notification and rating experience. After KarnevalsDruk, normal hangover prompt behavior remains unchanged.

## Event Scope

The exception applies only to the official KarnevalsDruk challenge:

- `slug`: `karnevalsdruk-2026`
- challenge window: May 23, 2026 06:00 Europe/Copenhagen through May 24, 2026 06:00 Europe/Copenhagen
- stored UTC range: `2026-05-23 04:00:00+00` through `2026-05-24 04:00:00+00`
- prompt time: May 24, 2026 11:00 Europe/Copenhagen

An eligible recipient must:

- have joined KarnevalsDruk through `challenge_entries`
- have at least one published visible session or published pub crawl in the KarnevalsDruk window

Users who joined but posted nothing during KarnevalsDruk should not receive a hangover prompt.

## Architecture

Keep the database-owned hangover prompt pipeline:

- `hangover_prompts` remains the durable prompt queue.
- The existing due-prompt Edge Function keeps sending `hangover_check` notifications.
- Push deep links keep pointing at a representative session or pub crawl.
- The existing hangover rating screen keeps submitting `rate_hangover`.

The KarnevalsDruk challenge finalizer is the best place to add the one-off prompt creation. It already runs after the challenge window ends and can make prompt insertion idempotent while the 11:00 delivery time is still in the future.

## Prompt Creation

When the official KarnevalsDruk challenge is finalized, it should create one prompt per eligible joined user:

1. Load the KarnevalsDruk challenge row and its exact `starts_at` and `ends_at` window.
2. Find joined users with at least one published visible session or published pub crawl whose hangover post timestamp falls inside that window.
3. Choose one eligible post as the prompt representative so notification delivery and deep-linking keep a real target id.
4. Insert a prompt scheduled for May 24, 2026 11:00 Europe/Copenhagen.

The event prompt should carry an explicit KarnevalsDruk challenge scope so it cannot collide with a normal local drinking-night prompt that happens to share the same `drinking_day`. A joined user who also has a normal after-21:00 KarnevalsDruk prompt path must still end up with one event notification, not a normal duplicate.

Prompt creation must be safe to retry. Repeated finalizer runs should not create duplicate hangover prompts or duplicate notifications.

## Rating Behavior

KarnevalsDruk rating broadens the group window for this one event.

If the authenticated user rates a representative session or pub crawl that belongs to KarnevalsDruk and that user joined the challenge, `rate_hangover` should apply the chosen score to every eligible published visible session and published pub crawl from that user in the full KarnevalsDruk challenge window.

For all other targets, `rate_hangover` should keep the existing drinking-night rule:

- prompt eligibility begins at 21:00 local time
- after-midnight posts before 06:00 belong to the prior drinking night
- one score applies only to the resolved 21:00 through 06:00 drinking-night window
- joined-user KarnevalsDruk event-window posts are excluded from normal ratings and normal representative reassignment, even if a non-Copenhagen local night overlaps the event window

Completing the KarnevalsDruk rating should complete the grouped prompt for that event window so retries do not surface another morning-after prompt for the same user.

## Data Flow

1. User joins KarnevalsDruk.
2. User publishes one or more sessions or pub crawls during the event window.
3. The challenge finalizer runs after May 24, 2026 06:00 Europe/Copenhagen.
4. Finalization creates one due-at-11:00 KarnevalsDruk hangover prompt for each eligible joined user.
5. The existing hangover worker claims due prompts and inserts the existing `hangover_check` notification.
6. User opens the notification and rates one representative target.
7. `rate_hangover` applies that score across the user's KarnevalsDruk posts in the full challenge window.

## Data and Migration Strategy

Add a new migration that extends the current grouped hangover behavior without turning KarnevalsDruk into a permanent special hangover mode.

The migration should:

- update trusted KarnevalsDruk finalization to create the event prompts
- keep normal prompt insertion idempotent through `(user_id, drinking_day)` while deduping KarnevalsDruk prompts through `(user_id, challenge_id)`
- update hangover rating logic to recognize joined KarnevalsDruk targets inside the official challenge window
- keep KarnevalsDruk prompt representatives replaceable from other eligible event-window posts when the selected target is deleted or made ineligible
- leave the normal post triggers and normal late-night prompt helper unchanged for non-KarnevalsDruk posts

The implementation may use the seeded challenge slug to resolve the event row instead of duplicating the window in application code. SQL should remain explicit that the exception is scoped to the official one-time challenge.

Session and pub crawl selection should use the same post timestamp fallback already used by hangover prompting: `coalesce(published_at, ended_at, created_at)`.

## Error Handling

- If a joined user has no published visible session or published pub crawl in the event window, skip prompt creation because there is no rating target.
- If the representative target disappears before delivery, choose another eligible KarnevalsDruk event-window target when one remains.
- If finalization is retried, conflict handling should preserve one event-scoped prompt per joined user for the KarnevalsDruk challenge.
- If a post-before-join normal event-window prompt was already sent, treat that notification as the user's one hangover prompt. If it was already completed with a score, propagate that score across the full event window and do not insert a second KarnevalsDruk prompt.
- If a rated target is outside the KarnevalsDruk scope, fall back to normal hangover rating behavior.

## Testing

Extend source-level contract tests to verify:

- KarnevalsDruk finalization creates one hangover prompt path for joined users with event posts.
- Joined users with no KarnevalsDruk posts are excluded.
- The special prompt targets May 24, 2026 11:00 Europe/Copenhagen.
- Daytime KarnevalsDruk posts can participate even when they are outside the normal 21:00 rule.
- Late-night KarnevalsDruk posts still dedupe to one challenge-scoped prompt without blocking normal prompts outside the event window.
- KarnevalsDruk rating uses the full challenge window for sessions and pub crawls.
- Normal hangover prompt and rating rules remain unchanged outside KarnevalsDruk.

Run the hangover, challenge, notification, and web build checks before completion.

## Non-Goals

- No permanent day-drinking exception for future challenges.
- No prompt for joined users with zero KarnevalsDruk posts.
- No new hangover rating UI for KarnevalsDruk.
- No separate KarnevalsDruk notification worker.
