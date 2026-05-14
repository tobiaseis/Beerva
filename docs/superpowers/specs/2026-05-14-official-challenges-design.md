# Official Challenges Design

## Summary

Beerva will add official competitive challenges without adding another bottom-nav item. Challenges are Beerva-created, opt-in competitions with public leaderboards for everyone who joins. The first MVP challenge is the May challenge:

**Drink 15 beers in May**

The headline uses Beerva's casual beer language, but the scoring rule is precise: reach 15 true pints between May 1 and May 31. All logged beverages count toward progress, normalized by serving size through the existing true-pint calculation.

Challenges should feel like a natural extension of Pub Legends and the Trophy Cabinet: competitive, compact, dark, premium, and integrated with the current app theme. They should not feel like large marketing banners or add chunky buttons to the interface.

## Requirements

- Add official Beerva-created challenges only.
- Do not allow regular users to create challenges.
- Start with one official challenge:
  - Title: `Drink 15 beers in May`
  - Detail copy: `Reach 15 true pints between May 1 and May 31. All logged beverages count toward your total, normalized by serving size.`
  - Metric: true pints.
  - Target: 15 true pints.
  - Window: May 1, 2026 through May 31, 2026.
  - Joining closes at the end of May 31, 2026.
- Progress counts retroactively from May 1 for users who join after the challenge has started.
- All beverage types count, not only drinks named beer.
- Challenge leaderboards include everyone who entered the challenge.
- Users who have not joined can view the challenge and leaderboard, but only joined users appear in the leaderboard.
- Do not add a challenge button to the floating bottom nav.
- Keep the feed preview tiny so it does not disturb the feed experience.
- Use the same color scheme and surface language as the rest of the app.
- Use compact, professional, integrated controls instead of big chunky buttons.

## Placement

### Pub Legends

The main challenge entry point belongs in the existing Pub Legends tab because this feature is competitive and leaderboard-driven.

At the top of `PubLegendsScreen`, add a compact segmented control:

```text
Pub Legends | Challenges
```

The existing Pub Legends view remains the default competitive pub leaderboard. The Challenges segment shows official Beerva challenges.

The Challenges list should show active official challenges first, then upcoming or completed challenges if present. For the MVP, one active May challenge is enough.

Each challenge row should be compact:

- challenge title
- status or time remaining
- entrants count
- user's progress if joined
- small `Join`, `View`, or `Joined` control

### Challenge Detail

Selecting a challenge opens a detail view inside the current navigation model. It can be a stack screen from Pub Legends rather than a new tab.

The detail screen should show:

- title: `Drink 15 beers in May`
- short details explaining true-pint scoring and that all beverages count
- current user's progress if joined
- rank if joined
- compact join control when joining is open
- read-only state after the join window closes
- public leaderboard of everyone who joined

Leaderboard rows should include:

- rank
- avatar
- username
- progress value
- target completion state

Example row:

```text
#3  Mads  6.2 / 15
```

### Feed Preview

The feed can show a very small joined-only active challenge strip near the top of the feed. It must read like a compact status line, not a full feed card.

Example:

```text
Drink 15 beers in May - #3 - 6.2/15 - 17d left
```

The strip should be tappable and open the challenge detail screen. It should only appear when the user has joined an active challenge. It should not push down the feed with a large card or large CTA.

### Record

Do not add a challenge button to Record. Logging drinks automatically contributes to joined challenges. A later enhancement may show a tiny post-log progress hint, but that is out of scope for the MVP.

### Profile

Do not make Profile the primary home for challenges. A later enhancement may add a small active-challenge summary near the Trophy Cabinet, but this MVP should keep the main challenge surface in Pub Legends.

## Visual Direction

Challenges should reuse the app-wide feed theme:

- deep dark app background
- feed-aligned raised surfaces
- soft slate borders
- amber primary accents
- muted metadata text
- compact avatar rows
- small integrated action controls

Do not introduce a separate bright event palette. Do not use large gradient banners, oversized hero cards, or chunky full-width challenge buttons.

Controls should feel like the compact feed actions and leaderboard affordances:

- `Join` as a small amber-accent text or pill control
- `View` as a quiet compact secondary control
- `Joined` as a subtle disabled/confirmed state
- no large marketing CTA blocks

Cards and rows should use existing `Surface`, shared colors, `radius`, and compact spacing patterns where practical.

## Data Model

Add challenge tables through a Supabase migration.

### `public.challenges`

Stores official Beerva-created challenges.

Fields:

- `id uuid primary key`
- `slug text unique not null`
- `title text not null`
- `description text not null`
- `metric_type text not null`
- `target_value numeric not null`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `join_closes_at timestamptz not null`
- `created_at timestamptz not null default now()`

For the MVP challenge:

- `slug`: `may-2026-15-true-pints`
- `title`: `Drink 15 beers in May`
- `metric_type`: `true_pints`
- `target_value`: `15`
- `starts_at`: `2026-04-30T22:00:00Z` (May 1, 2026 00:00 Europe/Copenhagen)
- `ends_at`: `2026-05-31T22:00:00Z` (June 1, 2026 00:00 Europe/Copenhagen), treated as exclusive
- `join_closes_at`: `2026-05-31T22:00:00Z` (June 1, 2026 00:00 Europe/Copenhagen), treated as exclusive

Using an exclusive `ends_at` avoids off-by-one issues at the end of May 31.

### `public.challenge_entries`

Stores opt-in participation.

Fields:

- `challenge_id uuid references public.challenges(id) on delete cascade`
- `user_id uuid references auth.users(id) on delete cascade`
- `joined_at timestamptz not null default now()`
- primary key: `(challenge_id, user_id)`

Users can join a challenge only while `now() < join_closes_at`. After that, the challenge remains visible but the join action is unavailable.

## Progress Calculation

Challenge progress should be calculated from logged beverages, not manually stored.

For `metric_type = 'true_pints'`:

1. Find joined users for the challenge.
2. Include their session beers whose drinking timestamp falls within `[starts_at, ends_at)`.
3. Use `coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at)` as the drinking timestamp, matching the profile stats fallback pattern.
4. Include child pub crawl stop sessions as normal counting sessions, even when they are hidden from the feed.
5. Sum `greatest(coalesce(session_beers.quantity, 1), 0) * public.beerva_serving_volume_ml(session_beers.volume) / 568`.
6. Round display values to one decimal place, while ranking by the unrounded numeric value.

All beverage names and categories count. The metric is based on normalized serving size, not on the text label of the drink.

The implementation should reuse the database `public.beerva_serving_volume_ml` function and keep parity with the client `getVolumeMl` true-pint logic so challenge progress stays consistent with profile stats and trophies.

## API Layer

Add `src/lib/challengesApi.ts` to keep screens out of direct SQL details.

Functions:

- `fetchOfficialChallenges()`
- `fetchChallengeDetail(challengeIdOrSlug)`
- `joinChallenge(challengeId)`
- `fetchJoinedActiveChallengeSummary()`

The API should return app-friendly challenge objects with:

- challenge metadata
- joined state for the current user
- current user's progress and rank when available
- entrants count
- leaderboard rows
- join availability

For MVP simplicity, progress can be calculated by a Supabase SQL view/RPC that returns leaderboard rows. This keeps ranking and true-pint math consistent and avoids duplicating large aggregation logic in the client.

## Screens And Components

### `PubLegendsScreen`

- Add segmented control state for `pub-legends` and `challenges`.
- Keep the current Pub Legends screen intact when the Pub Legends segment is active.
- Render the Challenges list when the Challenges segment is active.
- Preserve the floating bottom nav spacing.

### `ChallengeDetailScreen`

- New stack screen for challenge detail.
- Shows title, detail text, user's progress, join state, and leaderboard.
- Uses compact leaderboard rows.
- Uses integrated small controls.
- Handles loading, empty leaderboard, and error states.

### `FeedScreen`

- Add a tiny joined-active-challenge preview strip near the top of feed content.
- The strip opens challenge detail.
- The strip should not appear for users who have not joined an active challenge.
- The strip should not appear as a large card.

### Navigation

- Add the challenge detail route to the existing stack navigator.
- Do not add a new tab.
- Do not change existing tab order.

## Empty, Loading, And Closed States

- Challenges list loading: show compact skeleton rows or a small activity state.
- No challenges: show a quiet empty state in the Challenges segment.
- User has not joined: show a small `Join` control while joining is open.
- User has joined: show progress and `Joined` state.
- Joining closed: show `Closed` or `Ended` state and keep leaderboard read-only.
- Network/API errors: show a small retry affordance matching existing screen error styles.

## Non-Goals

- No user-created challenges.
- No admin UI for creating challenges.
- No push notifications for challenges.
- No comments or cheers on challenges.
- No challenge-specific feed posts.
- No rewards or trophies for completing a challenge in the MVP.
- No changes to the bottom navigation.
- No large feed challenge card.
- No Record-screen challenge controls.
- No new visual theme.

## Testing

Add focused tests for:

- May challenge seed/migration exists with the correct title, metric, target, and date window.
- Joining is allowed before `join_closes_at` and not allowed after.
- Progress counts retroactively from May 1 for joined users.
- Progress uses true-pint normalization and counts all beverage names/categories.
- Hidden pub crawl child sessions still count toward challenge progress.
- Leaderboard includes only users who joined.
- Leaderboard ranks by unrounded true-pint progress, highest first.
- Pub Legends contains a `Pub Legends | Challenges` segment without adding a new tab.
- Feed preview is present only for joined active challenges and uses compact strip styling.
- Challenge buttons use compact/integrated styles rather than full-width chunky buttons.
- `npm run build:web` succeeds.

Existing tests to keep passing:

- profile stats/trophies
- pub crawl
- pub legends
- feed redesign
- app theme screens
- floating nav
