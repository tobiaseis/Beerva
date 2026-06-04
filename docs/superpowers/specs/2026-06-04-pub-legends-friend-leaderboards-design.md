# Pub Legends Friend Leaderboards

## Goal

Add two follows-only friend leaderboards to the Pub Legends screen without making the default page feel crowded:

- **Hottest streak**: followed users ranked by longest current active drinking-day streak.
- **Most overdue**: followed users ranked by longest whole-hour time since their last logged beer/drink.

The default Pub Legends experience should remain pub-first. The new friend leaderboards should feel like compact social pressure, not a third large content mode.

## Placement

Keep the existing top-level segmented control:

```text
Pub Legends | Challenges
```

On the `Pub Legends` segment only, add a compact **Friends on Watch** strip above the existing `Current hotspot` strip. The strip contains two side-by-side spotlight tiles:

- **Hottest streak** tile
- **Most overdue** tile

The existing pub leaderboard remains the default list below the hero/spotlight area.

## Spotlight Tiles

Each tile is intentionally compact and shows only:

- micro label
- avatar
- username
- metric

The **Hottest streak** tile uses a light yellow treatment based on the existing Beerva primary color, such as `colors.primarySoft` with `colors.primaryBorder`. Its metric is formatted as days, for example `8 days`.

The **Most overdue** tile uses a light red treatment based on the danger palette, such as `colors.dangerSoft` with a subtle danger border. Its metric is formatted as rounded whole hours, for example `142h`.

The tiles do not show the viewer's own rank, runner-up data, explanatory copy, or extra secondary text. The whole point is a quick, slightly savage callout.

If a tile has no eligible followed user, show a quiet empty state inside that same tile footprint:

- Hottest streak: `No active streaks`
- Most overdue: `No one exposed`

## Interaction

Tapping either spotlight tile switches the Pub Legends list area into a full friend leaderboard view on the same screen:

- tapping **Hottest streak** shows `Active streaks among friends`
- tapping **Most overdue** shows `Most overdue among friends`

The screen keeps the top Pub Legends header and segment control in place. The friend leaderboard view replaces the pub rows with friend rows and adds a compact back chip, such as `Back to pubs`, above the list. The back chip returns to the normal pub leaderboard.

Do not use a modal for the full friend leaderboard. The same-screen swap keeps the feature discoverable and avoids stacking another transient surface on top of an already competitive page.

## Ranking Rules

Both leaderboards include only users followed by the current viewer. The current viewer is not included unless the app later introduces an explicit self-inclusion rule.

### Hottest streak

Use the canonical current streak definition already introduced for streak flames:

- a drinking day is the 6am-6am Europe/Copenhagen window
- only `sessions.status = 'published'` sessions count
- the current streak is the consecutive run ending at the user's most recent drinking day
- the streak is active only when the most recent drinking day is today or yesterday; otherwise it is `0`

Rank followed users by:

1. `current_streak` descending
2. latest drinking timestamp descending
3. username ascending

The spotlight tile should prefer a user with `current_streak > 0`. The full leaderboard can include zero-streak followed users at the bottom only if needed to avoid an empty list, but active streaks should be visually dominant.

### Most overdue

Use each followed user's most recent logged drink timestamp:

1. prefer `session_beers.consumed_at`
2. fall back to `sessions.started_at`
3. fall back to `sessions.created_at`

Only published sessions count. Rank followed users by whole hours since their last drink, descending. Round to the nearest whole hour for display so the leaderboard does not update every second.

Users with no published drink history should not rank above people with real drink history. They can be omitted from the MVP leaderboard.

## Data Flow

Add one Supabase RPC for the Pub Legends screen, for example `get_friend_pub_watch_leaderboards()`, scoped to `auth.uid()`.

The RPC should:

- read the current viewer's follow graph
- compute current streaks for followed users using the canonical streak logic
- compute last drink timestamps from `session_beers` with session timestamp fallbacks
- return enough rows for both spotlight tiles and the full friend leaderboards

Client mapping should live beside the existing Pub Legends API layer, likely in `src/lib/pubLegends.ts` and `src/lib/pubLegendsApi.ts`, so the screen does not own SQL-shaped row cleanup.

Refresh behavior should match the rest of the competitive surfaces:

- load on focus
- refresh on pull-to-refresh
- while the Pub Legends screen is focused, refresh at the next whole-hour boundary and then hourly
- recompute from server data, not cached client timers

The display value for "Most overdue" should not tick every second or every minute. Hour-boundary refreshes are enough because the displayed value is rounded to whole hours.

The Hottest streak board is also recomputed by the same server refreshes, so new published sessions become visible without storing a separate leaderboard table.

## UI Rows

Full friend leaderboard rows should be denser than pub rows:

- rank badge
- avatar
- username
- primary metric
- optional small secondary timestamp such as `Last beer: Tue 22:00` for overdue rows

Use the existing dark card style, small avatar rhythm, and compact pill language from `PubLegendsScreen` and `PubLegendDetailScreen`.

## Empty and Error States

If the viewer follows no one, the spotlight strip can show both empty tile states and the tapped full leaderboard can show:

```text
Follow friends to start the watchlist.
```

If followed users have no relevant published sessions, show:

```text
No friend data yet.
```

If the friend leaderboard RPC fails, keep the pub leaderboard usable and show a compact error message in the friend spotlight area instead of failing the entire Pub Legends screen.

## Testing

Add focused tests that assert:

- friend leaderboards are scoped to followed users
- current viewer is not included by default
- active streak ranking uses the canonical current-streak definition
- most-overdue ranking uses `session_beers.consumed_at` with session timestamp fallbacks
- most-overdue display rounds to whole hours
- Pub Legends still loads and keeps its existing pub leaderboard behavior
- the spotlight tiles do not render self-rank text

## Out of Scope

- Global friend leaderboards across all Beerva users
- A new bottom navigation tab
- A modal-based leaderboard detail surface
- Showing the viewer's own rank inside spotlight tiles
- New trophies, badges, or push notifications for being overdue
