# Pub Crawl Implementation Plan

Date: 2026-05-10
Spec: `docs/superpowers/specs/2026-05-10-pub-crawl-design.md`

## Overview

Implement pub crawls as a parent `pub_crawls` post made from normal child `sessions` rows. Users start a normal session, then convert it into a pub crawl from the active session screen. Each stop remains a real session for stats, trophies, and Pub Legends, while the feed shows one final crawl post with a real OSM-based route map and a horizontal media carousel.

This plan is intended to be executed on a development branch or worktree, not directly on `master`.

## Guardrails

- Preserve existing normal-session behavior.
- Do not change trophy/stat counting rules except to account for hidden crawl child sessions still counting.
- Do not show child crawl sessions as standalone feed cards.
- Keep all map usage free: no paid provider, no offline tile bulk download, visible OSM attribution.
- Keep implementation test-first for pure helpers and data-shape behavior.
- Run the full verification set after each checkpoint where practical.

Verification commands:

```powershell
npm run test:stats
npm run test:roulette
npm run test:pub-legends
npm run test:pub-crawl
npx tsc --noEmit
npm run build:web
```

`npm run test:pub-crawl` will be added in Task 1.

## Task 1: Add Pub Crawl Test Harness and Pure Helper Contracts

Goal: Create tests that define the non-UI behavior before production code.

Files:

- `package.json`
- `scripts/pubCrawl.test.js`
- `src/lib/pubCrawls.ts`
- `src/lib/staticRouteMap.ts`

Steps:

1. Add `test:pub-crawl` script that runs `node scripts/pubCrawl.test.js`.
2. Create `scripts/pubCrawl.test.js` using the same TypeScript transpile pattern as the existing stats tests.
3. Write failing tests for:
   - mapping Supabase crawl rows to app-friendly crawl objects
   - computing crawl totals: bar count, drink count, true pints, average ABV
   - grouping stop beers under the right stop
   - omitting no-photo stops from media photo slides
   - returning a map slide even when no photos exist
   - map helper handling missing coordinates without failing
   - Denmark route bounds choosing a sane zoom/tile set
4. Add minimal `src/lib/pubCrawls.ts` helpers:
   - crawl row types
   - stop row types
   - `mapPubCrawlRow`
   - `calculatePubCrawlSummary`
   - `buildPubCrawlMediaSlides`
5. Add minimal `src/lib/staticRouteMap.ts` helpers:
   - `latLonToTile`
   - `projectLatLonToWorld`
   - `getMappedStops`
   - `getRouteBounds`
   - `getStaticMapViewport`
6. Run `npm run test:pub-crawl` and confirm it passes after helper implementation.

Checkpoint:

- `npm run test:pub-crawl`
- `npx tsc --noEmit`

## Task 2: Add Supabase Schema, RLS, and Transaction RPCs

Goal: Create a database model that keeps crawl lifecycle changes atomic and keeps stats compatible.

Files:

- `supabase/migrations/YYYYMMDDHHMMSS_add_pub_crawls.sql`
- `scripts/pubCrawl.test.js`

Schema:

- `public.pub_crawls`
  - `id`
  - `user_id`
  - `status`
  - `started_at`
  - `ended_at`
  - `published_at`
  - `created_at`
  - `updated_at`
- Extend `public.sessions`
  - `pub_crawl_id`
  - `crawl_stop_order`
  - `is_crawl_stop`
  - `hide_from_feed`
- Add crawl engagement tables:
  - `public.pub_crawl_cheers`
  - `public.pub_crawl_comments`

Indexes and constraints:

- one active crawl per user
- one active crawl stop per crawl
- unique `(pub_crawl_id, crawl_stop_order)` where `pub_crawl_id is not null`
- feed index on `pub_crawls(status, published_at desc)`
- child session index on `sessions(pub_crawl_id, crawl_stop_order)`

RLS:

- authenticated users can view published crawls
- owners can view their active/cancelled crawls
- owners can update their crawls
- authenticated users can view published crawl comments/cheers
- users can create/delete their own crawl cheers
- users can comment on published crawls

RPCs:

- `convert_session_to_pub_crawl(target_session_id uuid)`
  - verifies owner and active session
  - creates active crawl
  - links current active session as stop 1
  - sets `is_crawl_stop = true`
  - leaves session active
- `update_active_crawl_stop_pub(target_crawl_id uuid, target_pub_id uuid, fallback_pub_name text)`
  - updates only the active current stop
  - preserves drinks/photo/comment
- `finish_active_crawl_stop(target_crawl_id uuid)`
  - verifies current stop has at least one drink
  - publishes current child session
  - sets `hide_from_feed = true`
  - returns finalized stop
- `start_next_crawl_stop(target_crawl_id uuid, target_pub_id uuid, fallback_pub_name text)`
  - creates next active child session
  - uses next stop order
- `publish_pub_crawl(target_crawl_id uuid)`
  - finishes current child stop
  - publishes parent crawl
- `cancel_pub_crawl(target_crawl_id uuid)`
  - cancels parent and all child sessions

Notification migration:

- Extend `notifications.type` check with `pub_crawl_started`.
- Update notification insert policy so owners can notify mates about active pub crawls.

Test updates:

- Add SQL contract assertions in `scripts/pubCrawl.test.js` that the migration contains:
  - `pub_crawls`
  - `hide_from_feed`
  - `convert_session_to_pub_crawl`
  - `publish_pub_crawl`
  - `cancel_pub_crawl`
  - `pub_crawl_started`

Checkpoint:

- `npm run test:pub-crawl`
- `npm run test:stats`
- `npm run test:pub-legends`

## Task 3: Add Pub Crawl API Layer

Goal: Keep Record and Feed screens out of direct crawl SQL details.

Files:

- `src/lib/pubCrawlsApi.ts`
- `src/lib/pubCrawls.ts`
- `scripts/pubCrawl.test.js`

Functions:

- `fetchActivePubCrawl()`
  - returns active crawl, active stop, all stops, and beers
- `convertActiveSessionToPubCrawl(sessionId)`
- `updateCurrentCrawlStopPub(crawlId, pub)`
- `finishCrawlStopAndStartNext(crawlId, pub)`
- `publishPubCrawl(crawlId)`
- `cancelPubCrawl(crawlId)`
- `fetchPublishedPubCrawlsForFeed(limit)`
- `togglePubCrawlCheers(crawlId)`
- `addPubCrawlComment(crawlId, body)`
- `deletePubCrawlComment(commentId)`

Implementation notes:

- Use `withTimeout` for all network operations.
- Mirror existing session/image error handling style.
- Return camelCase app models from API functions.
- Keep photo upload using the existing `session_images` bucket and `sessions.image_url`.

Checkpoint:

- `npm run test:pub-crawl`
- `npx tsc --noEmit`

## Task 4: Refactor Record Screen Around Session Modes

Goal: Add crawl mode without breaking normal active session flow.

Files:

- `src/screens/RecordScreen.tsx`
- optional extraction:
  - `src/components/CrawlStopHeader.tsx`
  - `src/components/CrawlNoPhotoModal.tsx`
  - `src/components/CrawlNextPubPicker.tsx`

Steps:

1. Add active crawl state alongside active session state.
2. Update `fetchActiveSession` to also detect whether the active session belongs to an active crawl.
3. Add `Turn into Pub Crawl` secondary action on the normal active session screen.
4. On conversion:
   - call API
   - switch UI into crawl mode
   - send `pub_crawl_started` notifications to mates
5. In crawl mode, show:
   - stop number
   - current pub
   - button to change current pub
   - drinks list/form
   - photo control
   - `Move to next bar`
   - `End Pub Crawl`
   - `Cancel Pub Crawl`
6. Add current pub editing:
   - reuse existing pub search/autocomplete helpers
   - update active child session pub through API
7. Add no-photo warning modal:
   - shown before moving on or ending when current stop has no photo
   - actions: `Add Photo`, `Move On`
8. Add one-drink validation:
   - block move/end if the current stop has no drinks
9. Ensure normal `End Session` remains unchanged when not in crawl mode.
10. Ensure cancel behavior:
    - normal session cancel remains unchanged outside crawl mode
    - crawl cancel cancels the whole crawl and child sessions

Checkpoint:

- `npm run test:pub-crawl`
- `npm run test:stats`
- `npx tsc --noEmit`

Manual check:

- Start normal session.
- Add drinks/photo.
- Convert to crawl.
- Change current bar.
- Move to next bar with and without photo.
- End crawl.
- Cancel crawl.

## Task 5: Add Static OSM Route Map Component

Goal: Render a real map without adding a paid provider or heavy map dependency.

Files:

- `src/components/PubCrawlRouteMap.tsx`
- `src/lib/staticRouteMap.ts`
- `scripts/pubCrawl.test.js`

Approach:

- Build a static slippy-map tile viewport.
- Use `https://tile.openstreetmap.org/{z}/{x}/{y}.png` tile URLs.
- Render a small tile grid with React Native `Image`.
- Overlay route line and numbered markers with `react-native-svg`.
- Show OSM attribution on the map.
- Do not prefetch tiles.
- Do not load map when there are no mapped stops; show an ordered route fallback.

Steps:

1. Finish pure tile/projection helper tests.
2. Implement tile viewport selection:
   - bounds from mapped pub coordinates
   - max/min zoom suitable for Denmark/pub-level routes
   - 1-stop fallback centered on that stop
3. Implement component rendering:
   - fixed aspect ratio matching feed media slot
   - tile grid
   - SVG polyline
   - numbered markers
   - missing-coordinate note
   - attribution
4. Add a lightweight loading/error visual for failed tile images.

Checkpoint:

- `npm run test:pub-crawl`
- `npx tsc --noEmit`

Manual check:

- Route with 1 mapped stop.
- Route with several mapped stops.
- Route with some missing coordinates.
- Route with no mapped stops.

## Task 6: Add Pub Crawl Media Carousel and Feed Card

Goal: Show one polished crawl post in the feed with map-first carousel and per-bar stats.

Files:

- `src/components/PubCrawlMediaCarousel.tsx`
- `src/components/PubCrawlFeedCard.tsx`
- `src/screens/FeedScreen.tsx`
- `src/lib/pubCrawls.ts`
- `src/lib/pubCrawlsApi.ts`

Steps:

1. Create media carousel:
   - horizontal `FlatList` or `ScrollView` with paging
   - slide 1: `PubCrawlRouteMap`
   - slide 2+: `CachedImage` for each stop photo
   - no-photo stops skipped
   - position indicator
2. Create `PubCrawlFeedCard`:
   - user/avatar/time
   - title `Pub Crawl`
   - summary stats
   - route text
   - carousel
   - cheers/comments actions
   - `More stats`
3. Implement `More stats`:
   - per-stop sections
   - stop number
   - pub name
   - drink count
   - true pints
   - average ABV
   - drink breakdown
   - no photo thumbnails
4. Add crawl cheers/comments modals or extend current modals to support crawl post type.
5. Keep normal session card behavior unchanged.

Checkpoint:

- `npm run test:pub-crawl`
- `npx tsc --noEmit`

Manual check:

- Swipe from map to photos.
- Open/close More stats.
- Cheer crawl post.
- Comment on crawl post.

## Task 7: Merge Crawl Posts Into Feed Timeline

Goal: Feed shows normal sessions and pub crawls together, while hidden child sessions stay hidden.

Files:

- `src/screens/FeedScreen.tsx`
- `src/lib/pubCrawlsApi.ts`
- optional `src/lib/feedPosts.ts`

Steps:

1. Update normal session query:
   - exclude `hide_from_feed = true`
   - treat null `hide_from_feed` as visible for old rows
2. Fetch recent published crawl posts.
3. Merge normal sessions and crawl posts by `published_at`.
4. Use a discriminated union:
   - `{ type: 'session', session }`
   - `{ type: 'pub_crawl', crawl }`
5. Render the correct card type.
6. Keep pull-to-refresh and pagination stable.
7. For v1 small-group use, prefer fetching enough recent sessions/crawls and merging client-side over overbuilding pagination.

Checkpoint:

- `npm run test:pub-crawl`
- `npm run test:stats`
- `npm run test:pub-legends`
- `npx tsc --noEmit`

Manual check:

- Feed with only sessions.
- Feed with only crawls.
- Feed with mixed sessions/crawls.
- Hidden child sessions do not appear.

## Task 8: Ensure Stats, Trophies, and Pub Legends Still Count Crawl Stops

Goal: Confirm hidden crawl child sessions count everywhere they should.

Files:

- `src/lib/profileStatsApi.ts`
- `src/lib/profileStats.ts`
- `supabase/migrations/*get_profile_stats*.sql` if needed
- `supabase/migrations/20260510133000_add_pub_legends_leaderboards.sql` or a follow-up migration if needed
- `scripts/profileStats.test.js`
- `scripts/pubLegends.test.js`
- `scripts/pubCrawl.test.js`

Steps:

1. Confirm profile stats queries only filter `sessions.status = 'published'`, not feed visibility.
2. Confirm Pub Legends query only filters `sessions.status = 'published'`, not feed visibility.
3. Add tests that assert the plan/SQL keeps hidden crawl stops countable.
4. Avoid changing trophy thresholds or names.
5. Add any follow-up SQL comments documenting that `hide_from_feed` must not exclude stats.

Checkpoint:

- `npm run test:stats`
- `npm run test:pub-legends`
- `npm run test:pub-crawl`

## Task 9: Update Notifications

Goal: Mates get notified when a normal active session becomes a crawl.

Files:

- `src/screens/NotificationsScreen.tsx`
- `src/lib/notificationsContext.tsx`
- `src/screens/RecordScreen.tsx`
- Supabase notification migration from Task 2

Steps:

1. Add `pub_crawl_started` to notification TypeScript unions.
2. Update notification message text:
   - `started a pub crawl at {pub_name}.`
3. Fetch crawl/pub preview data for pub crawl notifications.
4. Add insert logic after successful conversion.
5. Make notification tap open the feed or future crawl detail if available. For v1, it can remain informational.

Checkpoint:

- `npx tsc --noEmit`
- manual notification check with two mutual mates

## Task 10: Final Verification and Cleanup

Goal: Verify the full feature and leave the repo in a clear state.

Run:

```powershell
npm run test:stats
npm run test:roulette
npm run test:pub-legends
npm run test:pub-crawl
npx tsc --noEmit
npm run build:web
```

Manual regression checklist:

- normal session start/end still works
- normal session photo still works
- normal feed card still works
- profile trophies still unlock from normal sessions
- Pub Legends still loads
- convert normal session into crawl
- add drinks/photo to multiple stops
- no-photo warning appears
- current bar can be changed before moving on
- final crawl post appears once
- child sessions do not appear as standalone posts
- crawl photos carousel works horizontally
- map attribution visible
- missing coordinates do not break the crawl post

Completion notes:

- Document any map tile limitations in release notes.
- If dependency additions are avoided by the static tile component, note that no paid/free-tier map dependency was added.
- If a map dependency becomes necessary during implementation, stop and confirm the dependency choice before adding it.
