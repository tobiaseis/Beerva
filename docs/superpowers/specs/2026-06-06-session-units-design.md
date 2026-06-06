# Session Units Design

## Goal

Show Danish alcohol units on feed posts so users can see how much pure alcohol a session represents. One unit is 12 grams of pure alcohol. A 33cl drink at 4.6% ABV should display as 1.0 unit.

This feature should prepare the data path for possible future units-based leaderboards or challenge metrics, but it must not change those metrics now.

## Scope

Included:

- Normal session posts show a Units stat under More stats.
- Session detail posts inherit the same Units stat through the shared normal post card.
- Pub crawl posts show a total Units stat under More stats.
- Pub crawl detail posts inherit the same Units stat through the shared pub crawl card.
- Supabase exposes session units through the feed details RPC so units are server-owned for normal feed sessions.

Not included:

- Changing Pub Legends, challenge progress, trophies, profile stats, or rankings from true pints to units.
- Adding unit history graphs or profile-level unit totals.
- Persisting a new units column on every drink row.

## Calculation

Use existing drink data: serving volume, quantity, and ABV.

Formula:

```text
units = volume_ml * quantity * (abv / 100) * 0.789 / 12
```

Where:

- `0.789` is grams of alcohol per ml.
- `12` is grams of alcohol per Danish unit.
- Missing or invalid ABV contributes 0 units.
- Missing or invalid volume follows the app's existing serving-volume fallback rules.
- Display values are rounded to one decimal place, matching the existing stats style.

## Data Flow

Normal sessions:

1. Add a follow-up Supabase migration that updates `public.get_session_feed_details(uuid[])`.
2. The RPC should return `units double precision` for each visible session.
3. The SQL calculation should aggregate `public.session_beers`, using the shared `public.beerva_serving_volume_ml(session_beers.volume)` function.
4. The client mapper should carry `units` into `SessionFeedDetail`.
5. Feed hydration should set the session card's units value from the RPC response.
6. Legacy fallback sessions should still calculate units client-side if the RPC value is missing.

Pub crawls:

1. Keep pub crawl post rendering on the existing hydrated stop beer rows.
2. Extend `calculatePubCrawlSummary` with a `units` total using the same formula and volume parsing behavior.
3. This keeps the display correct now and leaves room to move pub crawl unit totals into SQL later if leaderboards or challenges need them.

## UI

Add a `Units` pill to the existing More stats grid.

Normal session More stats should include:

- Drinks
- True Pints
- Units
- Avg ABV when available
- Existing chug stat when available

Pub crawl More stats should include:

- Bars
- Drinks
- True Pints
- Units
- Avg ABV when available

The new pill should fit beside the existing pills. Tighten the existing pill sizing and label/value spacing as needed, but keep the same visual language and avoid a new layout pattern.

## Error Handling

- If the RPC omits units, the app falls back to local calculation from the session's beer rows or legacy fields.
- If ABV is missing, units should display as 0.0 rather than blocking the card.
- Existing feed detail timeout and RPC error behavior remains unchanged.

## Testing

Use test-first implementation.

Add or update tests for:

- `33cl` at `4.6%` ABV equals `1.0` unit.
- Multiple quantities and mixed serving sizes sum correctly.
- Missing ABV contributes 0 units.
- `get_session_feed_details` includes a `units` return field and calculates it with `beerva_serving_volume_ml`.
- Feed card source renders a `Units` pill in More stats.
- Pub crawl summary exposes `units`.
- Pub crawl card renders a `Units` pill.

## Acceptance Criteria

- Normal session posts and post details show Units under More stats.
- Pub crawl posts and pub crawl details show Units under More stats.
- A 33cl 4.6% drink displays as 1.0 unit.
- Existing true pints, ABV, chug, cheers, comments, and pub crawl stats continue to render.
- No leaderboard, challenge, trophy, or profile metric behavior changes.
