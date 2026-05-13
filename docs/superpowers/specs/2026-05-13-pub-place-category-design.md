# Pub Place Category Design

## Summary

Beerva will distinguish real pubs from other drinking places when a user manually adds a new place from the Record Session screen. Real pubs continue to appear in Pub Legends. Places marked as `other`, such as a backyard or home bar, remain usable for sessions but are excluded from Pub Legends leaderboards.

Existing database pubs stay classified as real pubs by default.

## Requirements

- Users can choose whether a newly added place is a `pub` or `other`.
- The category choice happens after pressing the add-new-pub footer on the Record Session screen.
- Existing pubs in the database are treated as `pub`.
- Sessions at `other` places can still be recorded normally.
- `other` places do not appear on the Pub Legends list or King of the Pub detail rankings.
- Search and selection should still surface `other` places so they can be reused later.

## Data Model

Add `place_category text not null default 'pub'` to `public.pubs`.

Allowed values:

- `pub`: a real pub/bar that counts toward Pub Legends.
- `other`: a non-pub place that can hold drinking sessions but is excluded from Pub Legends.

The migration backfills implicitly through the default, so all existing rows are `pub`.

## App Flow

On Record Session:

1. The user types a place name that has no exact match.
2. The existing add footer still appears.
3. Pressing it opens a bottom-sheet choice instead of immediately creating a pub.
4. Choosing `Pub` creates the place as `place_category = 'pub'`.
5. Choosing `Other` creates the place as `place_category = 'other'`.
6. The new place is selected and can start the session as today.

The selected place detail can include a lightweight `Other place` hint when the chosen record is categorized as `other`.

## Leaderboard Behavior

The Pub Legends database functions will only include sessions when:

- the session is published, and
- the linked pub row is absent or has `place_category = 'pub'`.

This keeps old fallback sessions safe while excluding newly categorized `other` rows. Because newly created places are stored in `pubs`, sessions at those places will be excluded when the row category is `other`.

## Components And Modules

- `src/lib/pubDirectory.ts`
  - Add a `PlaceCategory` type.
  - Include `place_category` in `PubRecord`.
  - Let `createUserPub` accept a category, defaulting to `pub`.
  - Include `place_category` in select results.

- `src/screens/RecordScreen.tsx`
  - Add a category-choice bottom sheet for the add-new-pub action.
  - Pass the chosen category into `createUserPub`.
  - Preserve existing start-session behavior for selected places.

- `supabase/migrations/*_add_pub_place_category.sql`
  - Add the column and check constraint.
  - Update `search_pubs` to return `place_category`.
  - Update Pub Legends RPCs to exclude `other` places.

- `scripts/pubLegends.test.js`
  - Assert the Pub Legends migration filters out `place_category = 'other'`.

## Error Handling

If creating the place fails, the existing "Could not add pub" alert is reused. If the category sheet is dismissed, no row is created and the typed place remains in the input.

## Testing

Use test-first implementation:

- Add/update a pub-directory test proving `createUserPub` sends the chosen category.
- Update the Pub Legends migration test to require an `other` exclusion.
- Run the relevant Node test scripts and a web build.

## Non-Goals

- No bulk UI for editing existing pub categories.
- No per-session override after a place is selected.
- No changes to feed visibility, profile stats, notifications, or session recording beyond the leaderboard exclusion.
