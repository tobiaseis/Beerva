# Local And Global Challenge Leaderboards Design

## Summary

Beerva challenges will gain two leaderboard scopes:

- `Local`: the signed-in user's joined mutual followers, plus the signed-in user when they have joined the challenge.
- `Global`: every Beerva user who joined the challenge.

`Local` is the default comparison view because it gives users a more relevant social ranking as Beerva grows. The existing global leaderboard remains the canonical competition result for winners, finalization, and trophies.

## Requirements

- Add `Local | Global` scopes to official challenge leaderboards.
- Default challenge detail to `Local` whenever the screen opens.
- Local leaderboard membership is evaluated at read time.
- Local leaderboard includes:
  - mutual followers who joined the challenge
  - the signed-in user when they joined the challenge
- Local leaderboard excludes:
  - one-way follows
  - mutual followers who did not join the challenge
  - the signed-in user before they join the challenge
- Before joining, a user can still see joined mutual followers in the local leaderboard.
- Switching scope updates the leaderboard rows, current-user rank, entrant count, and empty state together.
- The current user's progress stays the same in both scopes.
- Compact challenge surfaces use local rank and local entrant count by default:
  - Challenges list in Pub Legends
  - joined active-challenge feed preview strip
- Global leaderboard membership and ranking remain unchanged.
- Official winners, challenge finalization, and trophies continue using the global leaderboard only.

## Data Design

### Canonical Global Leaderboard

Keep `public.get_challenge_leaderboard(target_challenge_id uuid)` as the canonical global competition leaderboard.

It continues to:

- include every joined challenge entrant
- calculate progress from drinks inside the challenge window
- rank by unrounded true-pint progress descending
- preserve the existing tie-breakers
- drive official finalization, winners, and trophies

Do not add viewer-specific filtering to this function. Existing callers that determine official outcomes must remain global by construction.

### Local Leaderboard

Add this viewer-aware local leaderboard RPC:

```sql
public.get_local_challenge_leaderboard(target_challenge_id uuid)
```

The function uses `auth.uid()` as the viewer and returns the same row shape as the global leaderboard:

- `rank`
- `user_id`
- `username`
- `avatar_url`
- `progress_value`
- `completed`

The local function should derive its rows from the canonical global leaderboard and filter membership to:

```text
leaderboard user is auth.uid()
OR public.is_mutual_follower(auth.uid(), leaderboard user)
```

Because the canonical global leaderboard already contains only joined entrants, the signed-in user appears locally only after joining and mutual followers appear only when they joined.

After filtering, local rows receive a fresh local rank ordered by the canonical leaderboard's rank. This preserves the existing progress and tie-break ordering while making local `#1` mean first among the visible local comparison group rather than the user's global rank.

### Mutual Follow Helper

Reuse `public.is_mutual_follower(first_user_id uuid, second_user_id uuid)`, which already exists for chug verification and drinking buddies.

Local membership is dynamic. A follow or unfollow affects the next challenge read or refresh without mutating challenge entries or official results.

### Challenge Detail RPC

Update `public.get_challenge_detail(target_challenge_slug text)` to return both scopes in one response:

```text
global: {
  entrants_count,
  current_user_rank,
  leaderboard
}
local: {
  entrants_count,
  current_user_rank,
  leaderboard
}
```

Shared challenge metadata remains top-level:

- challenge identity and copy
- metric and challenge type
- target
- challenge window
- join window
- joined state
- current-user progress

Returning both scopes in one request keeps tab switching immediate and preserves the existing single-request refresh loop.

### Challenge Summary RPC

Update `public.get_official_challenges()` so compact challenge surfaces receive local summary values as their default:

- local entrant count
- local current-user rank
- unchanged current-user progress

Expose these through the existing `entrants_count` and `current_user_rank` response fields so compact surfaces adopt local defaults without needing new UI branches. Do not add global summary fields to this list RPC; global values remain available on challenge detail where the user can switch scopes.

## Client Model

Update the challenge detail mapper in `src/lib/challenges.ts` to represent:

```text
leaderboards.local
leaderboards.global
```

Each scope contains:

- `entrantsCount`
- `currentUserRank`
- `entries`

Top-level challenge summary values remain the local defaults used by compact surfaces. Top-level current-user progress remains shared because progress does not depend on leaderboard scope.

## Challenge Detail UI

Add a compact `Local | Global` segmented control directly above the leaderboard heading in `ChallengeDetailScreen`.

Behavior:

- initialize selected scope to `Local`
- render the selected scope's leaderboard rows
- render the selected scope's rank in the `Rank` summary card
- render the selected scope's entrant count in the `Entered` summary card
- keep the progress card unchanged
- preserve pull-to-refresh and active leaderboard polling
- keep the selected scope while refreshes replace the underlying detail data

Pre-join behavior:

- keep the local leaderboard visible
- show joined mutual followers
- do not show the signed-in user
- preserve the existing join action while joining is open

Local empty state:

```text
No local entrants yet
Mutual followers who join this challenge will appear here.
```

Global empty state keeps the existing generic entrant copy.

## Compact Surfaces

### Pub Legends Challenges List

Continue using the challenge summary values already rendered by `PubLegendsScreen`, but source rank and entrant count from local summary values.

### Feed Preview Strip

Continue using the joined active-challenge summary rendered by `FeedScreen`, but show local rank by default. Progress remains unchanged.

No local/global toggle is added to compact surfaces. The challenge detail screen is the place for switching comparison scope.

## Error Handling

- If challenge detail loading fails, preserve the existing error treatment.
- Both leaderboard scopes are returned atomically from the same RPC, so the client does not need partial-scope loading states.
- An empty local group is a normal state, not an error.
- If the signed-in user has no mutual joined followers, joining still produces a valid one-person local leaderboard.

## Security And Privacy

- Keep official outcomes based on the canonical global leaderboard.
- Calculate local membership in the database using `auth.uid()`.
- Do not send the full global leaderboard merely to calculate local membership in client code.
- Continue allowing signed-in users to view challenge leaderboards, matching the existing public challenge experience.

## Testing

Add focused challenge tests for:

- local leaderboard RPC exists and uses `auth.uid()`
- local leaderboard derives from the canonical global leaderboard
- local leaderboard includes the signed-in user only after joining
- local leaderboard includes joined mutual followers
- local leaderboard excludes one-way follows
- local leaderboard excludes mutual followers who did not join
- local ranks are recalculated inside the local subset
- global leaderboard remains unchanged
- detail RPC returns both local and global scopes in one response
- challenge summary RPC exposes local defaults for compact surfaces
- detail screen defaults to `Local`
- switching scope updates rows, rank, and entrant count
- local empty-state copy is distinct from the global empty state
- active refresh polling still performs one detail request
- challenge finalization still calls `public.get_challenge_leaderboard`, not the local RPC
- `npm run test:challenges` passes
- `npm run build:web` succeeds

## Non-Goals

- No separate local challenge entries.
- No local winners, local trophies, or local official announcements.
- No stored friend groups or geographic local ranking.
- No scope toggle in compact list or feed surfaces.
- No changes to challenge creation or admin tools.
- No changes to drink progress calculation.
