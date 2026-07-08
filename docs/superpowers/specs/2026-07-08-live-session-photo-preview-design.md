# Live Session Photo Preview Design

## Summary

Add a photo preview flow to the existing live-mates feature. When a viewer taps the live icon in the feed header, the current Live mates sheet still opens as a lightweight roster of followed users who are actively drinking. Tapping one live user opens a focused preview popup for that user's active session photos.

Photos are fetched only after the row is tapped. If the live session already has uploaded photos, the popup shows them in a swipeable, keeper-first carousel. If the session has no photos yet, the popup opens with a clear empty state saying "No photos yet." This helps the viewer decide whether the active session looks fun to join without forcing the live roster to preload media for everyone.

## Goals

- Let followers preview photos that a live user has already uploaded to their active session.
- Keep the feed header live button and live roster fast.
- Fetch live-session photos on demand when a live mate row is pressed.
- Show a popup for both photo-backed and no-photo sessions.
- Reuse the existing session photo visibility rules: keeper first, temporary photos only while unexpired, no duplicate URLs.
- Keep live previews follower-gated in the database.
- Preserve the existing live-mates sheet layout and row information.

## Non-Goals

- No public discovery of active sessions outside the existing live-mates entry point.
- No live row thumbnails or photo counts in the roster for this version.
- No join/request/invite flow.
- No comments, cheers, reactions, or chat inside the preview popup.
- No changes to how users upload active-session photos.
- No new privacy setting or per-session hide-live-preview toggle in this version.

## Existing Context

Beerva already has:

- `live_mate_sessions`, maintained by triggers for currently active drinking sessions and pub crawls.
- `get_live_mate_sessions()`, a follower-aware RPC used by `src/lib/liveMateSessions.ts`.
- `LiveMateButton` in the feed header.
- `LiveMateSessionsSheet`, a top sheet listing active followed users.
- `session_photos`, with up to five photos per session.
- Active-session photo persistence in `RecordScreen.tsx`, so photos can exist before the session is posted.
- `getVisibleSessionPhotoUrls(...)`, which orders keeper photos first, filters expired temporary photos, and removes duplicate URLs.
- Feed photo carousel UI patterns in `FeedScreen.tsx`.

This design connects those pieces without making the live roster heavier.

## User Experience

The viewer taps the live icon in the feed header. The current `LiveMateSessionsSheet` opens and lists followed users who are actively drinking.

Each live row becomes pressable. The row keeps the current content: avatar, display name, current pub, true pints, elapsed time, and pub crawl pill when relevant. It gains a press state and accessibility copy such as `Preview Tubpac's live session photos`.

When the viewer taps a row:

- A second popup opens immediately over the app.
- While photos load, it shows a small spinner and keeps the selected person's name in the header.
- If photos are returned, it shows a swipeable photo carousel with dot indicators.
- If no visible photos are returned, it shows "No photos yet."
- If the fetch fails, it shows a retry action inside the popup.
- If the selected session disappears from the refreshed live roster, it shows "This session is no longer live."

The live roster itself does not show thumbnails or photo counts in this version.

## Data Model

No new table is required.

Add a migration that creates a dedicated RPC:

`public.get_live_session_photos(target_session_id uuid)`

Returned fields:

- `id`
- `session_id`
- `image_url`
- `is_keeper`
- `expires_at`
- `created_at`

The RPC returns rows only when:

- `target_session_id` matches a currently live row in `public.live_mate_sessions`.
- The live row belongs to the current authenticated user, or the current authenticated user follows the live user.

Rows are ordered by:

- `is_keeper desc`
- `created_at asc nulls last`

The function should be `stable`, `security definer`, and use `set search_path = public`. Revoke execution from `public` and `anon`, then grant execution to `authenticated`.

The existing broad `session_photos` select policy can remain unchanged for compatibility, but the live preview client should use the new RPC instead of selecting directly from `session_photos`. That makes the intended live-preview access path match the live-mates visibility rule.

## Client API

Extend `src/lib/liveMateSessions.ts`, or add a nearby focused module if the file becomes crowded.

Responsibilities:

- Define a `LiveSessionPhoto` or reuse the existing `SessionPhoto` shape.
- Add `fetchLiveSessionPhotos(sessionId: string): Promise<SessionPhoto[]>`.
- Call `supabase.rpc('get_live_session_photos', { target_session_id: sessionId })`.
- Map nullish or malformed rows defensively.
- Return an empty list for an empty or missing `sessionId`.
- Let callers distinguish RPC errors from a legitimate empty result.

The popup should use `getVisibleSessionPhotoUrls(photos, null)` to produce the displayed carousel URLs.

## Components

Update `LiveMateSessionsSheet`:

- Add an `onPreviewSession` prop receiving the selected `LiveMateSession`.
- Render each row as a pressable control.
- Keep the existing row layout stable.
- Add accessibility labels and hints for previewing photos.

Add a new popup component, for example `LiveSessionPhotoPreviewModal`:

- Props: `visible`, `session`, `photos`, `loading`, `error`, `onRetry`, `onClose`.
- Header shows the display name and a close button.
- Loading state shows a spinner.
- Error state shows copy plus retry.
- No-photo state shows "No photos yet."
- Photo state shows a horizontal paging carousel and dot indicators.
- Images use `CachedImage`.
- The component should not know how to fetch; it only renders state.

Update `FeedScreen`:

- Own selected live session state.
- Open the preview popup on row press.
- Fetch photos on demand.
- Keep the popup open while loading.
- Clear stale preview state when closed.
- If the live session list empties, close both the live sheet and preview popup.
- If the selected session is no longer present after a live refresh, keep the popup open only long enough to show the no-longer-live state.

## Data Flow

1. Feed header renders `LiveMateButton` when `useLiveMateSessions()` returns at least one session.
2. Tapping the button opens `LiveMateSessionsSheet`.
3. Tapping a live row stores the selected `LiveMateSession` and opens `LiveSessionPhotoPreviewModal`.
4. `FeedScreen` calls `fetchLiveSessionPhotos(selected.sessionId)`.
5. The RPC checks current live visibility and returns photo rows for that active session.
6. The client maps rows, then `getVisibleSessionPhotoUrls(...)` builds the displayed URL list.
7. The modal renders loading, photos, empty, error, or no-longer-live state.

## Error Handling

- Missing `sessionId`: open the modal and show "This session is no longer live."
- RPC returns no rows: show "No photos yet."
- RPC error: show a retry state and keep the selected session in the header.
- Selected live row disappears from `liveMateSessions`: show "This session is no longer live."
- Image load failures: rely on `CachedImage` behavior; the modal remains stable.
- Closing the modal cancels the relevance of any in-flight result by comparing request ids or selected session ids before applying state.
- Reopening the same session refetches, so newly uploaded photos can appear.

## Accessibility

- Live rows use `accessibilityRole="button"`.
- Live rows include a label such as `Preview Tubpac's live session photos`.
- The preview modal close button has an explicit label.
- The carousel photos have labels such as `Tubpac's live session photo 1`.
- Retry is a button with clear label text.

## Testing

Follow TDD during implementation.

Database and API tests:

- Migration creates `get_live_session_photos(target_session_id uuid)`.
- RPC is `security definer`, pins `search_path`, revokes anon/public execution, and grants authenticated execution.
- RPC checks `live_mate_sessions` so only currently live sessions can return photos.
- RPC allows the live session owner.
- RPC allows followers.
- RPC excludes non-followers.
- RPC returns keeper-first photo rows.
- Client fetch helper calls `get_live_session_photos`.
- Client mapper tolerates empty and null-ish response data.

UI/source tests:

- `LiveMateSessionsSheet` accepts `onPreviewSession`.
- Live rows are pressable buttons.
- Row press passes the selected `LiveMateSession`.
- `FeedScreen` opens the preview modal on row press.
- `FeedScreen` fetches photos on demand rather than preloading them with the live roster.
- The preview modal renders loading, photos, "No photos yet.", retry, and no-longer-live states.
- The photo state uses `getVisibleSessionPhotoUrls(...)` for keeper-first visible URLs.
- The popup closes when the live list becomes empty.

## Open Decisions

None. Approved behavior is: fetch photos on row tap, show a popup for both photo-backed and no-photo sessions, use a follower-gated RPC, and keep the live roster lightweight.
