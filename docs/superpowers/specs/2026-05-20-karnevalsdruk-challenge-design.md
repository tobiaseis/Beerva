# KarnevalsDruk Challenge Design

## Summary

Add **KarnevalsDruk** as an official Beerva challenge for Karneval 2026. It is an opt-in, winner-takes-most leaderboard challenge: joined users compete on total true pints logged during one local-day window, and the highest true-pint total wins.

The challenge window is **May 23, 2026 06:00 Europe/Copenhagen** through **May 24, 2026 06:00 Europe/Copenhagen**, stored in UTC as an exclusive range:

- `starts_at`: `2026-05-23 04:00:00+00`
- `ends_at`: `2026-05-24 04:00:00+00`
- `join_closes_at`: `2026-05-24 04:00:00+00`

After the challenge ends, Beerva finalizes the result automatically. The winner receives a persistent trophy named **Winner of Karneval 2026**, and the feed gets one official Beerva announcement post naming the winner and showing the winning stats.

## Requirements

- Add a new official challenge:
  - `slug`: `karnevalsdruk-2026`
  - `title`: `KarnevalsDruk`
  - `metric_type`: `true_pints`
  - `challenge_type`: `leaderboard`
  - no completion target
- Existing target challenges, including `Drink 15 beers in May`, must keep working.
- KarnevalsDruk leaderboard includes only users who joined.
- Progress counts retroactively within the challenge window after joining.
- All logged beverage types count through the existing true-pint normalization.
- Hidden pub crawl child sessions count because they are real published drinking sessions.
- Ranking uses unrounded true pints descending.
- If users tie exactly, the existing deterministic tie-break applies: earlier join time, then user id.
- The winner must have a progress total greater than `0.0` true pints.
- Finalization must be idempotent: repeated scheduled runs must not create duplicate awards or feed posts.

## Challenge Type

Extend `public.challenges` with `challenge_type text not null default 'target'`.

Supported values:

- `target`: existing behavior with `target_value`, progress display, and completed state.
- `leaderboard`: winner-takes-most behavior with no target or completed state.

For leaderboard challenges, `target_value` should be nullable. The check constraint should enforce:

- target challenges require `target_value > 0`
- leaderboard challenges require `target_value is null`

RPC responses should include `challenge_type` so clients can render the correct language.

## KarnevalsDruk Display

In the Challenges list:

- show `KarnevalsDruk`
- show status, entrants count, and joined user rank/progress if joined
- format joined progress as `{rank} - {truePints} true pints`, not `{progress}/{target}`

In the detail screen:

- title: `KarnevalsDruk`
- description: `Log drinks from 06:00 May 23 to 06:00 May 24. Highest true-pint total wins among joined drinkers.`
- joined summary:
  - `Your total`: one-decimal true pints
  - `Rank`
  - `Entered`
- pre-join copy: `Join to count your Karneval drinks from the full 06:00 to 06:00 window.`
- leaderboard row meta: `true pints`, not `Completed` or `In progress`

The feed preview strip should also use leaderboard formatting when KarnevalsDruk is active and joined.

## Award Trophy

Add `public.challenge_awards`:

- `id uuid primary key default gen_random_uuid()`
- `challenge_id uuid not null references public.challenges(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `award_slug text not null`
- `title text not null`
- `description text not null`
- `rank integer not null`
- `progress_value double precision not null`
- `metadata jsonb not null default '{}'::jsonb`
- `awarded_at timestamptz not null default now()`
- unique `(challenge_id, user_id, award_slug)`

For KarnevalsDruk:

- `award_slug`: `winner-of-karneval-2026`
- `title`: `Winner of Karneval 2026`
- `description`: `Won KarnevalsDruk 2026 by drinking the most true pints.`
- `rank`: `1`
- `progress_value`: winning true-pint total

Challenge awards are visible to authenticated users. They are inserted only by trusted finalization code, not by normal client writes.

Profile trophy cabinets should include challenge awards as earned trophies. Existing stats-based trophies remain unchanged. The implementation can fetch challenge awards separately and merge them with `getTrophies(stats)` before rendering.

## Official Feed Post

Add `public.official_feed_posts` for Beerva-authored announcements:

- `id uuid primary key default gen_random_uuid()`
- `challenge_id uuid references public.challenges(id) on delete set null`
- `kind text not null`
- `title text not null`
- `body text not null`
- `metadata jsonb not null default '{}'::jsonb`
- `published_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- unique `(challenge_id, kind)`

For KarnevalsDruk finalization, insert one post:

- `kind`: `challenge_winner`
- title: `Winner of Karneval 2026`
- body names the winner and summarizes the result
- metadata includes:
  - `winner_user_id`
  - `winner_username`
  - `winner_avatar_url`
  - `true_pints`
  - `drink_count`
  - `average_abv`
  - `session_count`
  - `challenge_slug`

The feed should merge official posts with session and pub crawl posts by `published_at`. The card should be clearly official Beerva content, compact, and non-editable by users. It does not need cheers or comments in v1.

The announcement should show at least:

- winner username
- winning true-pint total
- average ABV
- total drinks
- sessions logged during the challenge window

## Finalization

Add a trusted finalization RPC, for example `public.finalize_due_challenges(batch_size integer default 10)`.

For each ended, unfinalized leaderboard challenge:

1. Load leaderboard rows using the same calculation as the challenge detail screen.
2. Pick rank 1.
3. If rank 1 has `progress_value <= 0`, mark no winner and do not create an award or post.
4. Compute winner stats for the challenge window:
   - true pints
   - drink count
   - average ABV from logged drinks with non-null ABV, weighted by quantity
   - session count
5. Insert `challenge_awards` with conflict protection.
6. Insert `official_feed_posts` with conflict protection.
7. Mark the challenge finalized.

To mark finalization, add nullable result columns to `public.challenges`:

- `finalized_at timestamptz`
- `winner_user_id uuid references auth.users(id)`
- `winner_progress_value double precision`

This keeps finalization state easy to query and prevents duplicate work.

Add a scheduled Supabase Edge Function, similar to the existing hangover prompt worker. It runs after the challenge can end, calls the finalization RPC with the service role key, and is protected by a cron secret.

## Data Flow

1. User joins KarnevalsDruk from Pub Legends > Challenges.
2. User records drinks normally.
3. Challenge RPCs calculate true-pint leaderboard from `session_beers` in the exact UTC window.
4. After `ends_at`, the scheduled finalizer awards the winner and creates the official post.
5. Feed fetch merges official posts with regular feed items.
6. Profile screens fetch challenge awards and show **Winner of Karneval 2026** in the trophy cabinet.

## Error Handling

- If the finalizer runs before any eligible winner exists, it should leave a clear finalized/no-winner state without creating empty posts.
- If award insertion succeeds but feed post insertion fails, rerunning the finalizer should finish the missing post.
- If profile award fetching fails, normal stats trophies should still render.
- If official posts fail to load, regular feed content should still render.
- The challenge detail screen should keep showing leaderboard history after the challenge closes.

## Testing

Add source-level tests for:

- KarnevalsDruk seed data exists with exact slug, title, UTC start, UTC end, and leaderboard challenge type.
- `challenge_type` supports existing `target` challenges and new `leaderboard` challenges.
- Leaderboard challenges do not render `/target`, `Completed`, or `In progress`.
- KarnevalsDruk progress formats as one-decimal true pints.
- The finalizer requires a positive winning true-pint total.
- Finalizer inserts one `Winner of Karneval 2026` award idempotently.
- Finalizer inserts one official Beerva feed post idempotently.
- Official post metadata includes true pints, drink count, average ABV, session count, and winner profile data.
- Feed supports official post items without edit/delete/cheer/comment controls.
- Profile trophy cabinet can render challenge awards alongside stats trophies.
- Existing official challenge tests still pass.
- `npm run build:web` succeeds.

## Non-Goals

- No user-created challenges.
- No admin UI for challenge creation.
- No challenge comments or cheers.
- No push notification requirement for the winner announcement in v1.
- No retroactive editing controls on the official feed post.
- No changes to normal profile stats or normal session trophies beyond displaying challenge awards.
