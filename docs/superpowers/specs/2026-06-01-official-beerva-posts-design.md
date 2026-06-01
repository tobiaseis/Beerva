# Official Beerva Posts Design

## Summary

Beerva admins need a reusable way to publish official feed announcements from the existing Admin tools screen. An official post is always added to the feed and can optionally be linked to a challenge. The admin can independently choose whether the post also creates in-app notifications for all users and whether those notifications also send device pushes.

The first use is the already-created `Booze-in-June` challenge launch. This feature must support that campaign without hard-coding June-specific behavior.

## Goals

- Add an `Official posts` section to Admin tools.
- Let admins compose and publish official feed announcements at any time.
- Allow one optional compressed photo on an official feed announcement.
- Allow an optional challenge link on each official post.
- Render a linked challenge action on the feed card.
- Let admins toggle in-app notifications per post.
- Let admins toggle push delivery per post when in-app notifications are enabled.
- Show official broadcasts in the existing Notifications screen.
- Make linked challenge notification and push taps open the challenge detail screen.
- Keep publication retry-safe so a slow request cannot duplicate a post or fan-out.

## Non-Goals

- Do not create or modify the Booze-in-June challenge record.
- Do not add scheduled publication.
- Do not add editing or deletion of published official posts.
- Do not add multi-photo carousels for official posts.
- Do not send a push without creating the matching in-app notification.
- Do not change existing challenge winner post creation.
- Do not change existing person-to-person notifications.

## Admin Experience

Admin tools gains a third segment: `Official posts`.

The section lists previously published official posts newest-first and has a compose button. The compose sheet includes:

- `Title`
- `Feed body`
- optional photo picker with preview, replace, and remove actions
- optional linked challenge selector
- `Send in-app notification` toggle
- `Notification body`, shown and required when in-app notification is enabled
- `Send push notification` toggle, enabled only when in-app notification is enabled
- `Push title`, shown and required when push delivery is enabled
- `Push body`, shown and required when push delivery is enabled

Feed publication is always enabled. Turning off in-app notifications also turns off push delivery.

Each official post supports one optional photo. The compose sheet offers the same gallery and camera choices used for ordinary session photos. Selected photos are compressed before upload through the established image-preparation flow:

- web uses `prepareWebImageFromPickerAsset()`
- native uses `expo-image-manipulator` with the existing `UPLOAD_IMAGE_MAX_WIDTH` resize and JPEG compression settings
- both platforms upload through `uploadImageToBucket()`

The challenge selector lists existing challenges loaded through the current admin challenge API. Choosing a challenge pre-fills launch-oriented copy if the corresponding text fields are still empty. The admin can edit every prefilled field before publishing.

For the first Booze-in-June campaign, the intended copy is:

- Feed title: `Booze-in-June has begun`
- Feed body: `June is here, the taps are flowing, and your liver has been assigned a side quest. Join Booze-in-June, log your beers, and prove your pintsmanship before the month runs dry.`
- Push title: `New June challenge`
- Push body: `Booze-in-June is live. Tap to join before your first beer starts counting itself lonely.`

The in-app notification body should match the push body by default but remain independently editable.

## Feed Experience

Official feed cards become kind-aware.

Existing `challenge_winner` cards retain their trophy layout, winner profile action, and statistics.

General official announcements render:

- the existing verified `Official Beerva` badge
- announcement title
- announcement body
- the optional announcement photo
- a compact challenge action when a challenge is linked

The optional photo renders below the body through `CachedImage`. Pressing it opens the existing feed `ImageViewerModal`, matching ordinary post photos. Official post photos do not appear in in-app notifications or Web Push payloads.

For a linked challenge:

- tapping the title area or secondary detail action opens `ChallengeDetail`
- an unjoined user sees `Join challenge`
- pressing `Join challenge` calls the existing `joinChallenge(challengeId)` API immediately
- a successful join changes the action to `Joined`
- if joining is closed, the card shows `View challenge`
- failures remain visible on the card without hiding the detail action

The card fetches enough challenge state to show the current action. The feed screen should load linked challenge summaries once per feed refresh and pass them into announcement cards rather than issue one request per card.

## In-App Notification Experience

Add an `official_post` notification type.

Official notifications use Beerva as the visible sender. They do not display or link to the publishing admin's personal avatar or profile.

An official notification row renders:

- Beerva branding in the leading visual
- a title from snapshotted metadata
- the snapshotted notification body
- its timestamp
- a `View challenge` action when a challenge is linked

Tapping a linked official notification opens `ChallengeDetail` using the snapshotted challenge slug. An official notification without a linked challenge remains informational.

## Push Experience

The existing `send-push` Edge Function continues to deliver Web Push messages from inserted notification rows.

For `official_post`:

- return successfully without Web Push delivery when metadata `push_enabled` is not `true`
- use snapshotted metadata `push_title` and `push_body` when push delivery is enabled
- deep-link to `/?challenge=<slug>&notificationId=<id>` when a challenge is linked
- otherwise deep-link to `/?notifications=1&notificationId=<id>`

The root navigator parses the challenge deep link, opens `ChallengeDetail`, and marks the referenced notification as read when a `notificationId` is present.

## Database Design

### `public.official_feed_posts`

Extend the current table with:

- `admin_request_key uuid`
- `linked_challenge_id uuid references public.challenges(id) on delete set null`
- `image_url text`
- a unique partial index on `admin_request_key` where it is not null

Existing winner posts continue to use `challenge_id`, `kind = 'challenge_winner'`, and their current unique constraint.

General admin posts use `kind = 'announcement'`, keep the winner-oriented `challenge_id` column null, and use `linked_challenge_id` for their optional action. Multiple announcement posts may link to the same challenge. This preserves the existing winner-post uniqueness rule and finalization functions unchanged.

Announcement metadata stores:

```json
{
  "challenge_slug": "booze-in-june",
  "challenge_id": "uuid"
}
```

Both properties are omitted when the post is informational.

### Storage

Add a public Supabase Storage bucket:

```text
official_post_images
```

Uploaded objects use:

```text
admins/<admin-user-id>/posts/<generated-file-name>
```

Storage policies allow authenticated admins to upload and delete files inside their own admin folder. The bucket is public so feed clients can display published images through their public URLs. The shared uploader continues to generate unique filenames and returns the public URL stored in `official_feed_posts.image_url`.

### `public.notifications`

Extend the notification type check with `official_post`.

Official broadcasts are system-authored, so `actor_id` becomes nullable. Existing user-authored notification rows keep requiring an actor through their current insert policies and RPCs. The trusted admin publication RPC inserts `actor_id = null` for official notifications.

Official notification metadata stores:

```json
{
  "official_post_id": "uuid",
  "official_title": "Booze-in-June has begun",
  "notification_body": "Booze-in-June is live...",
  "push_enabled": true,
  "push_title": "New June challenge",
  "push_body": "Booze-in-June is live...",
  "challenge_slug": "booze-in-june",
  "challenge_id": "uuid"
}
```

Challenge properties are omitted when no challenge is linked. Push properties are omitted when push delivery is disabled.

### Admin RPCs

Add:

```sql
public.admin_get_official_posts()
public.admin_publish_official_post(
  post_title text,
  post_body text,
  post_image_url text default null,
  linked_challenge_id uuid default null,
  send_in_app_notification boolean default false,
  notification_body text default null,
  send_push_notification boolean default false,
  push_title text default null,
  push_body text default null,
  post_request_key uuid default null
)
```

Both functions require `public.is_current_user_admin()`.

`admin_publish_official_post` validates:

- title and feed body are non-empty
- image URL is null or belongs to the public `official_post_images` bucket
- the linked challenge exists when supplied
- push cannot be enabled without in-app notifications
- notification body is non-empty when in-app notifications are enabled
- push title and push body are non-empty when push is enabled
- request key is required

Within one transaction, the RPC:

1. returns the existing post when `post_request_key` has already been used
2. inserts one `official_feed_posts` announcement row with optional `image_url` and `linked_challenge_id`
3. inserts one `official_post` notification row per profile when in-app notifications are enabled
4. snapshots all display, routing, and push metadata into each notification
5. returns the published official feed post

The fan-out uses one set-based insert. The existing notification insert trigger invokes push delivery once per inserted notification. This is acceptable for the current application scale and preserves the established delivery path.

## Client Modules

### `src/lib/officialFeedPosts.ts`

Extend the mapper with `imageUrl`, announcement metadata, and helpers that distinguish winner cards from general announcements.

### `src/lib/officialFeedPostsApi.ts`

Keep public feed loading here. Add a helper for resolving linked challenge summaries in one load.

### `src/lib/imageUpload.ts`

Keep the shared upload behavior unchanged, but make its unreachable-storage error mention the requested bucket instead of hard-coding `session_images`.

### `src/lib/adminApi.ts`

Add official-post row types, list mapping, `fetchAdminOfficialPosts()`, and retry-safe `publishAdminOfficialPost()`.

### `src/lib/adminTools.ts`

Add the compose draft, empty draft factory, challenge-copy prefill helper, and validation. Validation mirrors the server rules so the compose sheet can fail early.

### `src/components/OfficialFeedPostCard.tsx`

Preserve the winner card and add an announcement variant with optional challenge actions.

### `src/screens/AdminToolsScreen.tsx`

Add the `Official posts` segment, list, and compose sheet. Reuse loaded admin challenges for the optional challenge selector. Reuse the existing image picker, platform-specific compression flow, and shared image uploader for one optional official-post photo.

### `src/screens/NotificationsScreen.tsx`

Support official notifications without assuming an actor profile exists. Render Beerva branding and linked challenge navigation.

### `src/navigation/RootNavigator.tsx`

Parse `?challenge=<slug>&notificationId=<id>` and open the challenge detail screen after app startup.

### `src/screens/FeedScreen.tsx`

Pass the existing image-viewer callback into official announcement cards so their optional photos open `ImageViewerModal`.

### `supabase/functions/send-push/index.ts`

Support nullable actors and `official_post`. Skip Web Push delivery when `push_enabled` is false and use snapshotted official copy and routing when enabled.

## Error Handling

- Publication validation failures stay inside the compose sheet.
- Retryable client timeouts reuse the same generated request key.
- Repeating an RPC request with the same key returns the original post without duplicate fan-out.
- If a selected photo is present, the client compresses and uploads it before calling the publication RPC.
- If photo upload fails, publication stops and the compose sheet keeps the selected preview for retry.
- If publication is definitively rejected after an upload, the client removes the newly uploaded object through `deletePublicImageUrl()`.
- If publication remains uncertain after retryable timeouts, the client does not remove the uploaded object because the committed post may already reference it.
- Feed challenge-join failures show inline while preserving a route to challenge detail.
- Push failures keep the in-app notification and feed post intact, matching existing best-effort delivery behavior.
- Expired push subscriptions continue to be removed by the existing Edge Function.

## Testing

Add focused source-contract and helper tests covering:

- migration exists and adds `official_post`
- migration creates the public `official_post_images` bucket and admin-only upload policies
- announcement rows accept one optional official-post image URL
- official notifications permit nullable actors only through trusted server publication
- admin RPCs enforce admin access
- publication validates toggles and required copy
- publication is retry-safe through `admin_request_key`
- fan-out uses one notification per profile
- announcement posts can repeat for the same linked challenge
- existing winner-post uniqueness, finalization, and rendering remain intact
- admin draft validation and Booze-in-June prefill copy
- admin photo picking uses existing web and native compression settings and uploads to the dedicated bucket
- official announcement mapping
- official announcement photos render through cached images and open the existing image viewer
- announcement CTA state and join wiring
- official in-app notification rendering without a user actor
- push suppression when disabled
- push copy and challenge deep link when enabled
- root navigator challenge deep-link parsing

Run the related existing notification, challenge, admin, push-delivery, and web build checks after the focused tests.

## Release Use

After the migration, Edge Function, and web app are deployed, publish the first campaign through Admin tools:

- link the existing Booze-in-June challenge
- use the approved campaign copy
- enable `Send in-app notification`
- enable `Send push notification`

This creates the official feed announcement, the in-app broadcast for all users, and Web Push delivery for subscribed devices.
