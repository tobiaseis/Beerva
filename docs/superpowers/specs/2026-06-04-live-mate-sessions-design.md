# Live Mate Sessions Design

## Summary

Add a live mate signal to the feed header. When any followed user has an active drinking session or active pub crawl, Beerva shows a polished red pulsating circular button between the Beerva wordmark and the notification bell. Pressing the button opens a top-anchored sheet over the feed with the followed users who are currently drinking, where they are drinking, whether they are on a pub crawl, and their current true-pint total.

The feature uses a dedicated live-state table maintained by database triggers. This keeps the client simple, makes realtime updates reliable, and keeps the follower-only visibility rule in the database.

## Goals

- Show the live button only when at least one followed user is currently drinking.
- Treat "mates" as users the current user follows.
- Make active sessions visible to followers by default.
- Show normal active sessions and active pub crawls.
- For pub crawls, show the current pub stop and a small pub-crawl indicator.
- Show true pints only for drink progress.
- Keep live state smooth through realtime updates without assembling raw session data in the client.
- Make the pulsating red button feel stable, smooth, and professional.

## Non-Goals

- No opt-out or hide-live-session setting in this first version.
- No push notification changes.
- No chat, join flow, or direct interaction from the live sheet.
- No display of individual drink lines in the live sheet.
- No bottom sheet; the sheet opens from the top header area.

## Existing Context

Beerva already has:

- Active session lifecycle through `sessions.status = 'active'`.
- Active pub crawls through `pub_crawls.status = 'active'`.
- Current pub crawl stop as the active child `sessions` row under an active `pub_crawl_id`.
- Drink rows in `session_beers`.
- True-pint calculation using `public.beerva_serving_volume_ml(volume) / 568.0`.
- Feed header UI in `src/screens/FeedScreen.tsx`.
- Notification context with a Supabase realtime subscription pattern.

This design builds on those pieces instead of querying several source tables directly from the client.

## Data Model

Create `public.live_mate_sessions`.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `session_id uuid not null references public.sessions(id) on delete cascade`
- `pub_crawl_id uuid references public.pub_crawls(id) on delete cascade`
- `current_pub_name text not null`
- `started_at timestamp with time zone not null`
- `last_activity_at timestamp with time zone not null`
- `true_pints double precision not null default 0`
- `is_pub_crawl boolean not null default false`
- `created_at timestamp with time zone not null default now()`
- `updated_at timestamp with time zone not null default now()`

Constraints and indexes:

- Unique `user_id`, because a user can only have one active normal session or pub crawl.
- Unique `session_id`, so the same active stop cannot create duplicate live rows.
- Index `(user_id)`.
- Index `(last_activity_at desc)`.
- Index `(pub_crawl_id)` where `pub_crawl_id is not null`.

Status meanings:

- A row exists only while the user has live drinking activity.
- Normal session rows have `pub_crawl_id = null` and `is_pub_crawl = false`.
- Pub crawl rows have `pub_crawl_id` set and `is_pub_crawl = true`; `session_id` points at the current active stop session.

## Database Functions

Add a helper to calculate one session's live true-pint total:

- Uses `sum(public.beerva_serving_volume_ml(session_beers.volume) * greatest(quantity, 1) / 568.0)`.
- Rounds to one decimal.
- Returns `0.0` when no drinks exist.

Add `public.refresh_live_mate_session_for_session(target_session_id uuid)`:

- Locks and inspects the target session.
- If it is a normal active session, upserts a live row for the session owner.
- If it is an active pub crawl stop, upserts a live row for the crawl owner, points `session_id` at the active stop, and sets `is_pub_crawl = true`.
- If the session is no longer live, removes stale rows for that `session_id`.
- Sets `last_activity_at` to the latest drink `consumed_at` or `created_at`, falling back to the session `started_at`.

Add `public.refresh_live_mate_session_for_pub_crawl(target_pub_crawl_id uuid)`:

- Finds the active pub crawl and its active stop.
- Upserts the live row using the active stop's pub name and total true pints across all sessions attached to that active crawl.
- Removes the live row when the crawl is published or cancelled.

Add `public.repair_live_mate_sessions()`:

- Deletes stale live rows.
- Rebuilds rows from currently active normal sessions and active pub crawls.
- Exists as a recovery path for migration backfills, failed trigger deployments, or manual maintenance.

Add `public.get_live_mate_sessions()`:

- Security-definer RPC returning only rows where the live user is followed by `auth.uid()`.
- Joins `profiles` for `username` and `avatar_url`.
- Excludes the current user's own live row unless the current user follows themselves, which normal app flows do not create.
- Orders by `last_activity_at desc`, then `started_at desc`.

Returned fields:

- `id`
- `user_id`
- `session_id`
- `pub_crawl_id`
- `username`
- `avatar_url`
- `current_pub_name`
- `started_at`
- `last_activity_at`
- `true_pints`
- `is_pub_crawl`

## Trigger Flow

Session triggers:

- Insert/update on `sessions` calls `refresh_live_mate_session_for_session(new.id)`.
- If an updated session changes `pub_crawl_id`, status, pub name, or crawl stop order, also refreshes the old related crawl/session where needed.
- Delete on `sessions` removes or refreshes affected live rows.

Drink triggers:

- Insert/update/delete on `session_beers` calls `refresh_live_mate_session_for_session(session_id)`.
- For crawl stop sessions, the session refresh delegates to the parent pub crawl refresh so the total covers all crawl stops.

Pub crawl triggers:

- Insert/update on `pub_crawls` calls `refresh_live_mate_session_for_pub_crawl(new.id)`.
- Delete on `pub_crawls` removes the live row.

Pub crawl RPC interactions:

- Converting a normal session into a crawl updates the existing live row to `is_pub_crawl = true`.
- Updating the active stop pub updates `current_pub_name`.
- Finishing a stop and starting the next stop moves `session_id` to the new active stop.
- Publishing or cancelling the crawl removes the live row.

## Security

Enable RLS on `live_mate_sessions`.

Direct select policy:

- Authenticated users may select rows for users they follow.
- A user may select their own row for debugging and future reuse.

No direct insert/update/delete grants to authenticated clients. Writes happen only through triggers and security-definer functions.

The RPC `get_live_mate_sessions()` is the primary client API. It enforces the same follower visibility rule, so unfollowing someone immediately removes them from results without needing to mutate the live row.

## Client API

Create `src/lib/liveMateSessions.ts`.

Responsibilities:

- Define `LiveMateSession`.
- Map RPC rows to app shape.
- Fetch live mate sessions through `get_live_mate_sessions`.
- Format true-pint values as one decimal with singular/plural copy.
- Format elapsed time from `started_at`.

The client does not calculate true pints and does not join raw active sessions, crawls, follows, or drink rows.

## Realtime State

Create a small provider or hook near the feed header, either:

- `LiveMateSessionsProvider` wrapping the authenticated app, or
- `useLiveMateSessions` local to `FeedScreen` if no other screen needs it yet.

Behavior:

- Fetch on mount/auth change.
- Fetch on feed focus.
- Subscribe to postgres changes on `live_mate_sessions`.
- Refresh through `get_live_mate_sessions()` when changes arrive.
- Hide the live button when the fetched list is empty.
- Show the latest known list if a refresh fails, and retry on the next realtime/focus event.

Because direct realtime filters cannot express "users I follow" cleanly, the subscription can listen to table changes and use the RPC as the visibility filter. This keeps security in the database and avoids client-side privacy logic.

## Feed Header Button

Add a `LiveMateButton` component.

Behavior:

- Renders only when `liveMateSessions.length > 0`.
- Sits between the Beerva text/logo group and the notification bell.
- Is a circular red button with a stable center.
- Uses animated outer rings for the pulse.
- Has an accessibility label such as `Open live mates`.
- Pressing it opens the live mates top sheet.

Animation details:

- Use React Native `Animated`.
- Keep the core circle static so layout and hit target do not jitter.
- Animate ring scale and opacity with `useNativeDriver: true`.
- Use a slow loop, around 1600-2200 ms.
- Use smooth easing such as `Easing.inOut(Easing.sin)`.
- Stop loops on unmount.
- Respect reduced motion where practical by rendering a static red indicator.

## Top Sheet

Add `LiveMateSessionsSheet`.

Behavior:

- Opens from the top/header area over the feed.
- Uses a translucent backdrop.
- Closes by tapping backdrop, pressing close, or using the system back/modal close action.
- Does not show an empty state in normal use because the button is hidden when there are no live sessions.

Content:

- Header title: `Live mates`.
- Count copy: `1 drinking now` or `{n} drinking now`.
- One row per live session.
- Row fields: avatar, username, current pub, elapsed time, true pints.
- Pub crawl rows show a tiny `Pub crawl` pill or icon.

Sorting:

- `last_activity_at desc`.
- `started_at desc` as a tie-breaker.

Display copy:

- Unknown profile fallback: `Someone`.
- Unknown pub fallback should be avoided by database constraints, but the UI can display `Somewhere`.
- True pints: `0.0 true pints`, `1.0 true pint`, `2.4 true pints`.

## Error Handling

- If the live RPC fails during initial load, hide the button and log the error.
- If refresh fails after data exists, keep the last list and try again later.
- If realtime is disconnected, focus/auth refresh restores the state.
- If the live table has stale rows, `get_live_mate_sessions()` still only returns rows for followed users, and `repair_live_mate_sessions()` can rebuild source-of-truth state.
- If profile data is missing, use `Someone` and no avatar-specific crash path.
- If a live row is removed while the sheet is open, the sheet updates; if the list becomes empty, close the sheet and hide the button.

## Testing

Follow TDD during implementation.

Add tests for:

- Migration creates `live_mate_sessions`, indexes, RLS, refresh functions, repair function, triggers, and RPC grants.
- Normal active session insert creates a live row.
- Normal session publish/cancel/delete removes the live row.
- Drink insert/update/delete recalculates true pints.
- True pints use `public.beerva_serving_volume_ml(...) / 568.0` and round to one decimal.
- Converting a session to a pub crawl marks the row as a pub crawl.
- Active crawl stop pub changes update `current_pub_name`.
- Moving to the next crawl stop updates `session_id`.
- Publishing/cancelling a pub crawl removes the live row.
- `get_live_mate_sessions()` returns followed users and excludes non-followed users.
- Client mapper and formatting helpers handle missing profile data, count copy, elapsed time, and true-pint singular/plural copy.
- Feed header renders no live button for an empty list.
- Feed header renders the live button between Beerva and the notification bell for a non-empty list.
- Live button source uses a stable core plus animated pulse rings and cleanup.
- Top sheet renders pub name, true pints, elapsed time, and pub crawl indicator.

## Open Decisions

None. Approved behavior is: followed users only, visible by default, hidden button when no live mates exist, top sheet from the header, true pints only, and pub crawls included with a small crawl indicator.
