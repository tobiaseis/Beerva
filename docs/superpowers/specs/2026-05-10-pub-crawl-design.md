# Pub Crawl Design

Date: 2026-05-10

## Goal

Let a user turn an active drinking session into a pub crawl after the night has already started. The final feed should show one pub crawl post with a real route map, a horizontal carousel of crawl photos, total drink stats, and per-bar drink details. Under the hood, each bar stop still counts as an individual session for trophies, profile stats, and pub leaderboards.

The app is intended for a small group, around 50 people, so the design favors simple free infrastructure over paid map services or complex routing.

## Product Decisions

- Users start a normal session as they do today.
- While the session is active, they can press `Turn into Pub Crawl`.
- The existing active session becomes stop 1 of the crawl, keeping its current pub, drinks, comment, and photo.
- Mates are notified when the pub crawl starts, which means when the active session is converted.
- Users can change the current bar before moving on from that stop.
- Users can finish a bar without a photo, but the app warns them and offers `Add Photo` or `Move On`.
- Every stop must have at least one drink before moving on or ending the crawl.
- Ending the pub crawl publishes immediately. There is no review screen in v1.
- The feed shows one final pub crawl post, not one post per stop.

## Data Model

Add a `pub_crawls` table:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `status text not null check in ('active', 'published', 'cancelled')`
- `started_at timestamptz not null`
- `ended_at timestamptz`
- `published_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Extend `sessions`:

- `pub_crawl_id uuid null references public.pub_crawls(id) on delete set null`
- `crawl_stop_order integer null`
- `is_crawl_stop boolean not null default false`
- `hide_from_feed boolean not null default false`

Each pub crawl stop is still a normal `sessions` row with normal `session_beers`. The stop photo uses the existing `sessions.image_url`. Pub coordinates come from `pubs.latitude` and `pubs.longitude`.

Important constraints:

- A user may have at most one active pub crawl.
- A pub crawl may have at most one active child session at a time.
- Child crawl sessions should be `published` when finalized, so stats count them.
- Child crawl sessions should have `hide_from_feed = true`, so they do not appear as standalone feed posts.
- Cancelled crawls should not count. Cancelling a crawl should cancel all child sessions.

## Recording Flow

1. User starts a normal session from the Record tab.
2. Active session screen shows a secondary `Turn into Pub Crawl` action.
3. On conversion:
   - create `pub_crawls` with `status = active`
   - link the existing active session as stop 1
   - set `is_crawl_stop = true`, `crawl_stop_order = 1`, `pub_crawl_id = crawl.id`
   - keep the session `status = active`
   - send a `pub_crawl_started` notification to mates
4. Crawl mode replaces the normal active session actions:
   - add drinks
   - add/change photo
   - change current bar
   - move to next bar
   - end pub crawl
   - cancel pub crawl
5. `Move to next bar`:
   - blocks if the current stop has no drinks
   - warns if the current stop has no photo
   - publishes the current child session with `hide_from_feed = true`
   - increments pub use count for that stop
   - opens pub selection for the next bar
   - creates the next active child session with the next stop order
6. `End Pub Crawl`:
   - blocks if the current stop has no drinks
   - warns if the current stop has no photo
   - publishes the current child session with `hide_from_feed = true`
   - publishes the parent crawl
   - navigates to Feed

## Feed Post

The feed needs a new card type for published pub crawls.

Top summary:

- avatar, user name, time, and owner actions in the same style as normal posts
- title: `Pub Crawl`
- summary: `{barCount} bars - {drinkCount} drinks - {truePints} true pints`
- route text with pub names in order, shortened if needed

Main media carousel:

- one horizontal carousel in the same placement where a normal post image appears
- slide 1 is the route map
- slide 2+ are stop photos in crawl order
- stops without photos are skipped in the photo slides
- carousel should show position dots or a compact `1 / N` indicator
- cheers/comments belong to the parent crawl post

More stats:

- same expandable pattern as normal post stats
- per-bar sections include:
  - stop number
  - pub name
  - drink count
  - true pints
  - average ABV
  - drink breakdown
- do not include photos inside More stats

Standalone feed sessions:

- normal feed query excludes `hide_from_feed = true`
- published pub crawls are fetched and merged into the feed timeline by `published_at`

## Map

Use a real map for v1, limited to Denmark usage. The route map should:

- load on the first carousel slide
- use pub coordinates from `pubs`
- draw numbered markers for each mapped stop
- draw a line between mapped stops in stop order
- fit the viewport to the mapped stops
- show OSM attribution visibly
- handle missing coordinates gracefully with a note like `3 of 4 bars mapped`

Free-use constraints:

- Do not bulk prefetch tiles.
- Do not build offline tile packs.
- Load map tiles only when the feed card/map slide is visible.
- Rely on normal browser/native caching only.
- If usage grows beyond the small friend group, revisit map tile hosting/provider choice.

Relevant references:

- OpenStreetMap tile policy: https://operations.osmfoundation.org/policies/tiles/
- MapLibre project docs: https://maplibre.org/projects/gl-js/
- Supabase pricing/storage reference: https://supabase.com/pricing

## Stats, Trophies, and Pub Legends

The parent `pub_crawls` row is display/social metadata only. It must not add trophy or profile stats itself.

Stats continue to come from child `sessions` and `session_beers`:

- each crawl stop counts as one session
- a five-bar crawl counts as five sessions that day
- unique pubs, max pubs in one day, streaks, drink counts, RTD trophies, Jagerbomb trophies, Sambuca trophies, and max session pints all keep using normal published sessions
- Pub Legends counts crawl stops as bar visits

This avoids double-counting while preserving the requirement that crawl stops are individual sessions.

## Notifications

Add `pub_crawl_started` as a notification type.

Behavior:

- send when a normal active session is converted into a pub crawl
- message should mention the first bar
- normal `session_started` notification may already have gone out earlier; the crawl notification is allowed because it is a meaningful change of plan

## Error Handling

- If converting to a crawl fails, leave the normal active session untouched.
- If moving to the next bar fails after publishing the current stop, reload active crawl state and show the user where the app ended up.
- If photo upload fails, keep the local selected image visible where possible and let the user retry.
- If a map cannot render, show the ordered pub list and keep the photo carousel usable.
- If some pubs lack coordinates, render partial route instead of blocking publishing.

## MVP Boundaries

In scope:

- convert active normal session into pub crawl
- current-stop bar change
- add drinks/photo per stop
- no-photo warning
- move to next stop
- immediate publish
- one feed crawl post
- real map slide plus photo slides
- per-bar More stats without photos
- stats/trophies count child sessions

Out of scope for v1:

- review screen before publish
- editing published pub crawls
- deleting individual crawl stops after publish
- reordering bars
- route distance calculation
- offline maps
- paid map providers
- photo thumbnails in More stats

## Verification Plan

Automated tests should cover:

- converting a normal active session keeps existing drinks/photo/comment
- current bar can be changed before moving on
- moving to the next bar requires at least one drink
- no-photo warning branches to `Add Photo` and `Move On`
- moving to the next bar publishes the previous child session and hides it from feed
- ending the crawl publishes the parent crawl and latest child session
- cancelled crawls do not count
- feed hides child sessions and shows one crawl card
- stats/trophies count crawl child sessions once
- Pub Legends includes crawl child sessions
- map data handles missing pub coordinates

Manual checks:

- record flow on mobile viewport
- horizontal carousel swipe between map and photos
- map attribution visible
- feed timeline ordering with normal sessions and crawls mixed
