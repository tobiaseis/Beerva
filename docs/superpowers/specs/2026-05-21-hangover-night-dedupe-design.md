# Hangover Night Dedupe Design

## Goal
Beerva should send only one 11am hangover prompt per user for each drinking night. If the user rates that one prompt, the same score should be applied to every eligible post from that drinking night.

## Drinking Night Rule
A drinking night uses the app's existing local 6am boundary. For a user's saved timezone:

- Posts published at or after 21:00 are eligible.
- Posts published before 06:00 are eligible and belong to the previous evening's drinking night.
- Posts from 06:00 through 20:59 do not create hangover prompts.
- The prompt is sent at 11:00 local time after the drinking night.

Example: posts from Wednesday 21:00 through Thursday 05:59 produce one Thursday 11:00 prompt. One rating updates all eligible posts from that window.

## Architecture
The database remains the source of truth. Prompt creation should group by user and drinking night so duplicate notifications are prevented before the scheduled worker runs.

`hangover_prompts` should store the resolved drinking-night date, and the database should enforce one active prompt per user per drinking night. The representative prompt can keep one target id for notification deep-linking, but the group date is what controls dedupe and bulk rating.

## Data Flow
When a session or pub crawl is published, the trigger resolves the target timezone and calculates the hangover prompt information:

1. Determine whether the published time is in the late-night eligibility window.
2. Calculate the drinking-night date using local time minus 6 hours.
3. Calculate the 11:00 local prompt time.
4. Insert one prompt for the user and drinking-night date with `on conflict do nothing`.

The scheduled Edge Function continues to claim due prompts and insert one `hangover_check` notification per claimed prompt. Because the database has already deduped prompts, the worker does not need to guess which notifications to suppress.

## Rating Behavior
`rate_hangover` should accept the current notification target as it does today, then resolve the target's user, timezone, and drinking-night date. It should update every published, visible session owned by that user whose published time falls in the same eligible drinking-night window.

If pub crawls use their own hangover score, the same group rule applies to eligible pub crawls for that user and drinking night. Hidden child sessions should stay hidden from direct session scoring, while their parent pub crawl receives the score when the prompt represents that pub crawl/night.

After a successful rating, all prompts for that user and drinking-night date should be marked completed so the notification list and future retries do not create another prompt for the same night.

## Migration Strategy
Add a new migration that:

- Adds `drinking_day date` to `hangover_prompts`.
- Backfills `drinking_day` for existing prompts from their target post timestamps and timezone.
- Adds a unique index for one prompt per user per `drinking_day`.
- Updates prompt calculation helpers to return both `prompt_at` and `drinking_day`.
- Updates session and pub crawl prompt triggers to insert by user and drinking day.
- Updates `rate_hangover` to apply a score across the resolved drinking night.

Existing prompts without enough target data can keep their current behavior; new prompts should use the grouped behavior.

## Testing
Add or extend contract tests to verify:

- The migration stores and dedupes by `drinking_day`.
- Prompt creation uses the 6am boundary and one prompt per user/night.
- The scheduled worker still sends one notification per prompt.
- `rate_hangover` updates all eligible posts for the resolved drinking night.
- Sessions from separate drinking nights still get separate prompts and separate ratings.
