# Admin Official Post Editing Design

## Summary

Admins need to fix typos and small mistakes in already-published official Beerva announcement posts. The current official-post flow supports publishing and listing posts, but the original official-post design explicitly left editing out of scope. This design adds admin-only editing for published announcement posts while preserving the existing one-time notification and push behavior.

## Goals

- Let admins edit existing official announcement posts from the Admin tools `Official posts` list.
- Reuse the existing official-post composer in edit mode.
- Allow edits to title, feed body, linked challenge, optional photo, and existing in-app notification body.
- Update existing in-app notification metadata for the edited post so inbox copy reflects the correction.
- Never create new notification rows during an edit.
- Never re-send device push notifications during an edit.
- Keep challenge-winner official posts protected from manual announcement editing.

## Non-Goals

- Do not add deletion or unpublishing.
- Do not add scheduled publishing.
- Do not add edit history or rollback.
- Do not re-send push notifications after an edit.
- Do not allow editing `challenge_winner` official posts created by challenge finalization.
- Do not change the existing official-post publish retry behavior.

## Admin Experience

The `Official posts` segment keeps its current list and create button. Each announcement row becomes tappable. Tapping a row opens the same modal used for creating official posts, but in edit mode:

- modal title: `Edit official post`
- modal subtitle: `Official Beerva feed announcement`
- submit button: `Save Official Post`
- title and feed body are prefilled from the selected post
- linked challenge is selected when the post has `linkedChallengeId`
- current image is shown when the post has `imageUrl`
- notification body is shown and prefilled when the post originally created in-app notifications

Admins can replace the image, remove it, or leave it unchanged. The existing photo picker and upload pipeline still handles newly selected replacement images. Removing the image sends `null` as the edited image URL.

The notification and push toggles are not shown in edit mode. Those controls remain create-only because editing should repair existing copy, not rebroadcast the announcement. A post that did not create in-app notifications cannot create them later through editing.

## Data Flow

Create mode remains unchanged and continues to call `publishAdminOfficialPost()`.

Edit mode calls a new client API:

```ts
updateAdminOfficialPost({
  id,
  title,
  body,
  imageUrl,
  linkedChallengeId,
  notificationBody,
})
```

The API calls a new Supabase RPC:

```sql
public.admin_update_official_post(
  target_post_id uuid,
  post_title text,
  post_body text,
  post_image_url text default null,
  linked_challenge_id uuid default null,
  notification_body text default null
)
```

The RPC returns the updated `official_feed_posts` row, which the client maps through the existing official-post mapper and merges into the local `officialPosts` list.

## Database Behavior

`admin_update_official_post` uses `security definer` and requires `public.is_current_user_admin()`.

The RPC validates:

- `target_post_id` exists
- the post has `kind = 'announcement'`
- title and body are non-empty after trimming
- the optional image URL is either null or belongs to the current admin's `official_post_images/admins/<admin-id>/posts/` folder
- the optional linked challenge exists
- notification body is non-empty when the post originally created in-app notifications

The RPC updates `public.official_feed_posts`:

- `title`
- `body`
- `image_url`
- `linked_challenge_id`
- `metadata.challenge_id`
- `metadata.challenge_slug`
- `metadata.notification_body` when the post originally created in-app notifications
- existing push metadata remains unchanged

The RPC also updates existing `public.notifications` rows for the same official post:

- match `type = 'official_post'`
- match `reference_id = target_post_id`
- update `metadata.official_title`
- update `metadata.notification_body`
- update `metadata.challenge_id`
- update `metadata.challenge_slug`
- preserve existing `metadata.push_enabled`, `metadata.push_title`, and `metadata.push_body`

This keeps existing notification inbox rows corrected without inserting new rows. Since no new notification rows are inserted, the existing push delivery path is not triggered again. Posts that never created in-app notifications skip the notification metadata update.

## Image Handling

Existing images are represented as a lightweight selected image state when opening edit mode. If the admin leaves the image unchanged, the current `imageUrl` is submitted back to the update RPC.

If the admin chooses a new photo, the client uploads it to `official_post_images` before saving. If the update is definitively rejected after uploading a replacement, the client deletes the newly uploaded object. If the update succeeds and the previous image belonged to `official_post_images`, the old object can be deleted best-effort after the row has been updated. Failed cleanup must not fail the saved edit.

If the admin removes the image, the client sends `imageUrl: null`. Deleting the old object is best-effort after a successful update.

## Client Modules

### `src/lib/adminApi.ts`

Add `UpdateAdminOfficialPostInput` and `updateAdminOfficialPost()`. The function mirrors other admin save APIs: call the RPC with a timeout, require a returned row, map it with `mapOfficialFeedPostRow()`, and surface a clear edit failure message.

### `src/lib/adminTools.ts`

Add `officialPostToDraft(post)` so Admin tools can prefill the existing composer from an `OfficialFeedPost`, including `raw.metadata.notification_body` when present.

Reuse `validateOfficialPostDraft()` for title/body validation. In edit mode, push fields are ignored by the submit handler, and notification body is required only when the selected post already has notification metadata.

### `src/screens/AdminToolsScreen.tsx`

Track the selected official post separately from create mode. The official-post modal derives its title, submit label, and submit handler from whether a post is selected.

Add an `openOfficialPost(post)` handler for announcement posts. The row remains visually consistent with other editable admin rows by using the existing `Edit3` icon. Challenge-winner rows should not open in edit mode.

`handleSaveOfficialPost()` handles edit mode:

1. validate title and body
2. require notification body only for posts that already had one
3. upload a replacement image only when a new local image was selected
4. call `updateAdminOfficialPost()`
5. merge the returned post into the local list
6. close the modal and clear edit state
7. delete replaced or removed old images best-effort

## Error Handling

- Validation errors stay in the modal.
- If replacement upload fails, the selected preview remains for retry.
- If the update RPC fails definitively after uploading a replacement, the newly uploaded image is deleted.
- If old-image cleanup fails after a successful edit, the edit remains successful.
- Create-mode uncertain publish handling remains unchanged and is not used for edits.

## Testing

Extend `scripts/officialBeervaPosts.test.js` to verify:

- a migration creates or replaces `admin_update_official_post`
- the update RPC requires admin access
- the update RPC rejects non-announcement posts
- the update RPC updates `official_feed_posts`
- the update RPC updates existing `official_post` notification metadata
- the update RPC does not insert new notifications
- the update RPC does not trigger push re-send behavior
- `adminApi.ts` exposes `updateAdminOfficialPost()`
- `adminTools.ts` can turn an `OfficialFeedPost` into an edit draft
- `AdminToolsScreen.tsx` opens existing announcement rows in edit mode
- edit mode uses `Save Official Post`
- edit mode exposes existing notification body copy without notification or push toggles

Run the focused official-post test, TypeScript, and the web build after implementation.
