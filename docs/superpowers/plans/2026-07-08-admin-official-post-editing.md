# Admin Official Post Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins edit existing official Beerva announcement posts, including typo fixes in feed and inbox copy, without inserting new notifications or re-sending pushes.

**Architecture:** Add one admin-only Supabase RPC for editing `official_feed_posts` rows with `kind = 'announcement'`. Reuse the existing Admin tools official-post composer in create/edit modes, and keep publish retry handling isolated to create mode. Contract tests stay in `scripts/officialBeervaPosts.test.js` because this feature extends the existing official-post surface.

**Tech Stack:** Expo React Native, TypeScript, Supabase RPC/Postgres migrations, Node source-contract tests, existing image upload helpers.

---

## File Structure

- Create `supabase/migrations/20260708190000_add_admin_official_post_editing.sql`: defines `public.admin_update_official_post(...)`, grants authenticated execution, and refreshes PostgREST schema.
- Modify `scripts/officialBeervaPosts.test.js`: adds RED checks for the migration, admin API, draft mapper, and Admin tools edit UI.
- Modify `src/lib/adminApi.ts`: adds `UpdateAdminOfficialPostInput` and `updateAdminOfficialPost()`.
- Modify `src/lib/adminTools.ts`: adds `officialPostToDraft(post)` for create/edit composer reuse.
- Modify `src/screens/AdminToolsScreen.tsx`: tracks selected official post, opens editable announcement rows, saves edits, and keeps notification/push controls create-only.

---

### Task 1: Database RPC

**Files:**
- Modify: `scripts/officialBeervaPosts.test.js`
- Create: `supabase/migrations/20260708190000_add_admin_official_post_editing.sql`

- [ ] **Step 1: Write the failing migration contract test**

In `scripts/officialBeervaPosts.test.js`, replace the migration constants near the top:

```js
const root = path.resolve(__dirname, '..');
const migrationPath = 'supabase/migrations/20260601160000_add_official_beerva_posts.sql';
const editMigrationPath = 'supabase/migrations/20260708190000_add_admin_official_post_editing.sql';
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const migrationSql = exists(migrationPath) ? read(migrationPath) : '';
const editMigrationSql = exists(editMigrationPath) ? read(editMigrationPath) : '';
```

After the existing `assert.match(migrationSql, /notify pgrst,\s*'reload schema'/i, 'migration should refresh PostgREST schema');` line, insert:

```js
assert.ok(exists(editMigrationPath), 'official post editing migration should exist');
assert.match(editMigrationSql, /create or replace function public\.admin_update_official_post/i, 'admins should be able to update official posts');
assert.match(editMigrationSql, /if requesting_user_id is null or not public\.is_current_user_admin\(\)/i, 'official post editing should require an admin');
assert.match(editMigrationSql, /current_post\.kind <> 'announcement'/i, 'official post editing should reject non-announcement posts');
assert.match(editMigrationSql, /update public\.official_feed_posts/i, 'official post editing should update the official post row');
assert.match(editMigrationSql, /metadata = jsonb_strip_nulls/i, 'official post editing should update metadata without replacing unrelated keys');
assert.match(editMigrationSql, /update public\.notifications/i, 'official post editing should update existing official notification metadata');
assert.match(editMigrationSql, /notifications\.type = 'official_post'/i, 'official post notification updates should stay scoped to official notifications');
assert.match(editMigrationSql, /notifications\.reference_id = target_post_id/i, 'official post notification updates should target the edited post');
assert.match(editMigrationSql, /notifications\.metadata \? 'push_enabled'/i, 'official post editing should preserve existing push metadata');
assert.doesNotMatch(editMigrationSql, /insert into public\.notifications/i, 'official post editing should not insert new notifications');
assert.match(editMigrationSql, /grant execute on function public\.admin_update_official_post/i, 'authenticated admins should be able to call the edit RPC');
assert.match(editMigrationSql, /notify pgrst,\s*'reload schema'/i, 'official post editing migration should refresh PostgREST schema');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test:official-posts
```

Expected: FAIL with `official post editing migration should exist`.

- [ ] **Step 3: Add the edit RPC migration**

Create `supabase/migrations/20260708190000_add_admin_official_post_editing.sql` with:

```sql
-- Migration: Admin official post editing

create or replace function public.admin_update_official_post(
  target_post_id uuid default null,
  post_title text default null,
  post_body text default null,
  post_image_url text default null,
  linked_challenge_id uuid default null,
  notification_body text default null
)
returns public.official_feed_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  clean_title text := nullif(btrim(coalesce(post_title, '')), '');
  clean_body text := nullif(btrim(coalesce(post_body, '')), '');
  clean_image_url text := nullif(btrim(coalesce(post_image_url, '')), '');
  clean_notification_body text := nullif(btrim(coalesce(notification_body, '')), '');
  expected_image_prefix text;
  linked_challenge public.challenges%rowtype;
  current_post public.official_feed_posts%rowtype;
  updated_row public.official_feed_posts;
  next_metadata jsonb;
begin
  if requesting_user_id is null or not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if target_post_id is null then
    raise exception 'Official post id is required.';
  end if;

  select official_feed_posts.*
  into current_post
  from public.official_feed_posts
  where official_feed_posts.id = target_post_id;

  if current_post.id is null then
    raise exception 'Official post not found.';
  end if;

  if current_post.kind <> 'announcement' then
    raise exception 'Only announcement posts can be edited.';
  end if;

  if clean_title is null then
    raise exception 'Official post title is required.';
  end if;

  if clean_body is null then
    raise exception 'Official post body is required.';
  end if;

  expected_image_prefix :=
    'https://yzrfihijpusvjypypnip.supabase.co/storage/v1/object/public/official_post_images/admins/'
    || requesting_user_id::text
    || '/posts/';

  if clean_image_url is not null
    and clean_image_url is distinct from current_post.image_url
    and clean_image_url not like expected_image_prefix || '%' then
    raise exception 'Official post image must come from your admin upload folder.';
  end if;

  if linked_challenge_id is not null then
    select challenges.*
    into linked_challenge
    from public.challenges
    where challenges.id = linked_challenge_id;

    if linked_challenge.id is null then
      raise exception 'Linked challenge not found.';
    end if;
  end if;

  if current_post.metadata ? 'notification_body'
    and clean_notification_body is null then
    raise exception 'Notification body is required.';
  end if;

  next_metadata := jsonb_strip_nulls(
    coalesce(current_post.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug,
      'notification_body', case
        when current_post.metadata ? 'notification_body' then clean_notification_body
        else null
      end
    )
  );

  update public.official_feed_posts
  set title = clean_title,
    body = clean_body,
    image_url = clean_image_url,
    linked_challenge_id = linked_challenge.id,
    metadata = next_metadata
  where id = target_post_id
  returning * into updated_row;

  update public.notifications
  set metadata = jsonb_strip_nulls(
    coalesce(notifications.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'official_title', clean_title,
      'notification_body', clean_notification_body,
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug,
      'push_enabled', notifications.metadata->'push_enabled',
      'push_title', notifications.metadata->'push_title',
      'push_body', notifications.metadata->'push_body'
    )
  )
  where notifications.type = 'official_post'
    and notifications.reference_id = target_post_id
    and current_post.metadata ? 'notification_body'
    and notifications.metadata ? 'push_enabled';

  update public.notifications
  set metadata = jsonb_strip_nulls(
    coalesce(notifications.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'official_title', clean_title,
      'notification_body', clean_notification_body,
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug
    )
  )
  where notifications.type = 'official_post'
    and notifications.reference_id = target_post_id
    and current_post.metadata ? 'notification_body'
    and not (notifications.metadata ? 'push_enabled');

  return updated_row;
end;
$$;

revoke execute on function public.admin_update_official_post(uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.admin_update_official_post(uuid, text, text, text, uuid, text) to authenticated;

comment on function public.admin_update_official_post(uuid, text, text, text, uuid, text)
  is 'Allows admins to edit published official announcement posts without creating new notifications or re-sending pushes.';

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the focused test and verify GREEN for migration checks**

Run:

```powershell
npm run test:official-posts
```

Expected: PASS, because only migration edit tests have been added so far.

- [ ] **Step 5: Commit the database slice**

Run:

```powershell
git add -- scripts/officialBeervaPosts.test.js supabase/migrations/20260708190000_add_admin_official_post_editing.sql
git commit -m "feat: add admin official post edit rpc"
```

Expected: commit succeeds.

---

### Task 2: Client API and Draft Mapping

**Files:**
- Modify: `scripts/officialBeervaPosts.test.js`
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminTools.ts`

- [ ] **Step 1: Write failing client helper and API tests**

In `scripts/officialBeervaPosts.test.js`, after the `juneDraft` assertions and before the existing validation assertions, insert:

```js
const editableOfficialDraft = adminTools.officialPostToDraft(
  officialFeedPosts.mapOfficialFeedPostRow({
    id: 'post-edit',
    kind: 'announcement',
    title: 'Typo title',
    body: 'Typo body',
    image_url: 'https://example.com/edit.jpg',
    linked_challenge_id: 'challenge-1',
    metadata: {
      notification_body: 'Inbox typo',
      push_enabled: true,
      push_title: 'Original push title',
      push_body: 'Original push body',
    },
  })
);
assert.equal(editableOfficialDraft.title, 'Typo title');
assert.equal(editableOfficialDraft.body, 'Typo body');
assert.equal(editableOfficialDraft.linkedChallengeId, 'challenge-1');
assert.equal(editableOfficialDraft.sendInAppNotification, true);
assert.equal(editableOfficialDraft.notificationBody, 'Inbox typo');
assert.equal(editableOfficialDraft.sendPushNotification, false);
assert.equal(editableOfficialDraft.pushTitle, '');
assert.equal(editableOfficialDraft.pushBody, '');
```

After the existing admin API assertions for `publishAdminOfficialPost`, insert:

```js
assert.match(adminApiSource, /UpdateAdminOfficialPostInput/, 'admin API should type official post edits');
assert.match(adminApiSource, /updateAdminOfficialPost/, 'admin API should update official posts');
assert.match(adminApiSource, /admin_update_official_post/, 'admin API should call the official post edit RPC');
assert.match(adminApiSource, /target_post_id:\s*input\.id/, 'admin API should send the edited official post id');
assert.match(adminApiSource, /notification_body:\s*input\.notificationBody/, 'admin API should send corrected notification body copy');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test:official-posts
```

Expected: FAIL with `adminTools.officialPostToDraft is not a function`.

- [ ] **Step 3: Add the official-post draft mapper**

In `src/lib/adminTools.ts`, add this import after the existing admin API type import block:

```ts
import type { OfficialFeedPost } from './officialFeedPosts';
```

Add this helper after `createEmptyOfficialPostDraft()`:

```ts
const toMetadataText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

export const officialPostToDraft = (post: OfficialFeedPost): AdminOfficialPostDraft => {
  const notificationBody = toMetadataText(post.raw.metadata?.notification_body);

  return {
    title: post.title,
    body: post.body,
    linkedChallengeId: post.linkedChallengeId,
    sendInAppNotification: notificationBody.length > 0,
    notificationBody,
    sendPushNotification: false,
    pushTitle: '',
    pushBody: '',
  };
};
```

- [ ] **Step 4: Run the focused test and verify the next RED**

Run:

```powershell
npm run test:official-posts
```

Expected: FAIL with `admin API should type official post edits`.

- [ ] **Step 5: Add the admin API update wrapper**

In `src/lib/adminApi.ts`, add this type after `PublishAdminOfficialPostInput`:

```ts
export type UpdateAdminOfficialPostInput = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkedChallengeId: string | null;
  notificationBody: string | null;
};
```

Add this function after `publishAdminOfficialPost()`:

```ts
export const updateAdminOfficialPost = async (
  input: UpdateAdminOfficialPostInput
): Promise<OfficialFeedPost> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_update_official_post', {
        target_post_id: input.id,
        post_title: input.title,
        post_body: input.body,
        post_image_url: input.imageUrl,
        linked_challenge_id: input.linkedChallengeId,
        notification_body: input.notificationBody,
      }),
      ADMIN_TIMEOUT_MS,
      'Saving the official post is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as OfficialFeedPostRow | OfficialFeedPostRow[] | null);
    if (!row) throw new Error('The saved official post was not returned.');
    return mapOfficialFeedPostRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not save official post.'));
  }
};
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```powershell
npm run test:official-posts
```

Expected: PASS.

- [ ] **Step 7: Commit the client helper/API slice**

Run:

```powershell
git add -- scripts/officialBeervaPosts.test.js src/lib/adminApi.ts src/lib/adminTools.ts
git commit -m "feat: add official post edit client helpers"
```

Expected: commit succeeds.

---

### Task 3: Admin Tools Edit Mode UI

**Files:**
- Modify: `scripts/officialBeervaPosts.test.js`
- Modify: `src/screens/AdminToolsScreen.tsx`

- [ ] **Step 1: Write failing Admin tools edit-mode source tests**

In `scripts/officialBeervaPosts.test.js`, after the existing Admin tools publish retry assertions, insert:

```js
assert.match(adminScreenSource, /updateAdminOfficialPost/, 'admin tools should save official post edits');
assert.match(adminScreenSource, /officialPostToDraft/, 'admin tools should prefill official edit drafts');
assert.match(adminScreenSource, /selectedOfficialPost/, 'admin tools should track the official post being edited');
assert.match(adminScreenSource, /officialPostImageChanged/, 'admin tools should distinguish unchanged images from replacements');
assert.match(adminScreenSource, /const isEditingOfficialPost = selectedOfficialPost !== null/, 'admin tools should derive official edit mode');
assert.match(adminScreenSource, /const selectedOfficialPostHasNotification = Boolean/, 'admin tools should know when inbox copy can be edited');
assert.match(adminScreenSource, /const openOfficialPost = \(post: OfficialFeedPost\)/, 'admin tools should open existing official posts');
assert.match(adminScreenSource, /isOfficialWinnerPost\(post\)/, 'admin tools should protect challenge winner official posts from manual editing');
assert.match(adminScreenSource, /handleSaveOfficialPost/, 'admin tools should handle official post edits separately from publication');
assert.match(adminScreenSource, /Save Official Post/, 'official edit mode should use save copy');
assert.match(adminScreenSource, /!isEditingOfficialPost && officialPostDraft\.sendInAppNotification/, 'push controls should stay create-only');
assert.match(adminScreenSource, /isEditingOfficialPost && selectedOfficialPostHasNotification/, 'edit mode should expose existing notification body copy');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm run test:official-posts
```

Expected: FAIL with `admin tools should save official post edits`.

- [ ] **Step 3: Add edit imports and state**

In `src/screens/AdminToolsScreen.tsx`, update the admin API import to include `updateAdminOfficialPost`:

```ts
  setAdminDrinkExcluded,
  updateAdminOfficialPost,
} from '../lib/adminApi';
```

Update the admin tools import to include `officialPostToDraft`:

```ts
  getAdminModerationDrinkTitle,
  officialPostToDraft,
  validateBeverageDraft,
```

Update the official feed post import:

```ts
import { isOfficialWinnerPost, OfficialFeedPost } from '../lib/officialFeedPosts';
```

Add state beside the existing official-post modal state:

```ts
  const [officialPostDraft, setOfficialPostDraft] = useState<AdminOfficialPostDraft>(createEmptyOfficialPostDraft);
  const [selectedOfficialPost, setSelectedOfficialPost] = useState<OfficialFeedPost | null>(null);
  const [selectedOfficialPostImage, setSelectedOfficialPostImage] = useState<SelectedImage | null>(null);
  const [officialPostImageChanged, setOfficialPostImageChanged] = useState(false);
  const [officialPostRequestKey, setOfficialPostRequestKey] = useState(createAdminRequestKey);
```

Add these derived booleans after the official-post state declarations:

```ts
  const isEditingOfficialPost = selectedOfficialPost !== null;
  const selectedOfficialPostHasNotification = Boolean(
    typeof selectedOfficialPost?.raw.metadata?.notification_body === 'string'
      && selectedOfficialPost.raw.metadata.notification_body.trim()
  );
```

- [ ] **Step 4: Update modal open/close and photo mutation helpers**

Replace the official-post branch in `closeModal()` with:

```ts
    if (activeModal === 'official-post') {
      if (officialPostPublishUncertain) {
        setFormError('Resolve the uncertain publish before closing this post. Press Publish Official Post again to confirm whether it was sent.');
        return;
      }
      setSelectedOfficialPost(null);
      setSelectedOfficialPostImage(null);
      setOfficialPostImageChanged(false);
      setPendingOfficialPostImageUrl(null);
      setOfficialPostPublishUncertain(false);
    }
```

Replace `openNewOfficialPost()` with:

```ts
  const openNewOfficialPost = () => {
    setSelectedOfficialPost(null);
    setOfficialPostDraft(createEmptyOfficialPostDraft());
    setSelectedOfficialPostImage(null);
    setOfficialPostImageChanged(false);
    setOfficialPostRequestKey(createAdminRequestKey());
    setPendingOfficialPostImageUrl(null);
    setOfficialPostPublishUncertain(false);
    setFormError(null);
    setActiveModal('official-post');
  };
```

Add this handler after `openNewOfficialPost()`:

```ts
  const openOfficialPost = (post: OfficialFeedPost) => {
    if (isOfficialWinnerPost(post)) return;

    setSelectedOfficialPost(post);
    setOfficialPostDraft(officialPostToDraft(post));
    setSelectedOfficialPostImage(post.imageUrl ? { uri: post.imageUrl } : null);
    setOfficialPostImageChanged(false);
    setPendingOfficialPostImageUrl(null);
    setOfficialPostPublishUncertain(false);
    setFormError(null);
    setActiveModal('official-post');
  };
```

In `setOfficialPostPhoto()`, after `setSelectedOfficialPostImage(await prepareOfficialPostImage(asset));`, add:

```ts
      setOfficialPostImageChanged(true);
```

Replace `removeOfficialPostPhoto()` with:

```ts
  const removeOfficialPostPhoto = () => {
    if (pendingOfficialPostImageUrl) {
      setFormError('Retry publishing before removing the photo.');
      return;
    }
    setSelectedOfficialPostImage(null);
    setOfficialPostImageChanged(true);
  };
```

- [ ] **Step 5: Add the edit submit handler**

Add this function after `handlePublishOfficialPost()`:

```ts
  const handleSaveOfficialPost = async () => {
    if (!selectedOfficialPost) {
      setFormError('Choose an official post to edit.');
      return;
    }

    const validationError = validateOfficialPostDraft({
      ...officialPostDraft,
      sendInAppNotification: selectedOfficialPostHasNotification,
      sendPushNotification: false,
      pushTitle: '',
      pushBody: '',
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);

    const previousImageUrl = selectedOfficialPost.imageUrl;
    let uploadedReplacementUrl: string | null = null;
    let nextImageUrl = officialPostImageChanged ? null : previousImageUrl;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in.');

      if (officialPostImageChanged && selectedOfficialPostImage) {
        uploadedReplacementUrl = await uploadImageToBucket(
          'official_post_images',
          selectedOfficialPostImage,
          `admins/${user.id}/posts`
        );
        nextImageUrl = uploadedReplacementUrl;
      }

      const updated = await updateAdminOfficialPost({
        id: selectedOfficialPost.id,
        title: officialPostDraft.title.trim(),
        body: officialPostDraft.body.trim(),
        imageUrl: nextImageUrl,
        linkedChallengeId: officialPostDraft.linkedChallengeId,
        notificationBody: selectedOfficialPostHasNotification
          ? officialPostDraft.notificationBody.trim()
          : null,
      });

      setOfficialPosts((current) => current.map((post) => (
        post.id === updated.id ? updated : post
      )));
      setSelectedOfficialPost(null);
      setSelectedOfficialPostImage(null);
      setOfficialPostImageChanged(false);
      setActiveModal(null);

      if (officialPostImageChanged && previousImageUrl && previousImageUrl !== nextImageUrl) {
        void deletePublicImageUrl('official_post_images', previousImageUrl);
      }
    } catch (error) {
      if (uploadedReplacementUrl) {
        void deletePublicImageUrl('official_post_images', uploadedReplacementUrl);
      }
      setFormError(error instanceof Error ? error.message : 'Could not save official post.');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 6: Make official announcement rows editable**

Replace `renderOfficialPost` with:

```tsx
  const renderOfficialPost = useCallback(({ item }: { item: OfficialFeedPost }) => {
    if (isOfficialWinnerPost(item)) {
      return (
        <View style={styles.row}>
          <View style={styles.rowIcon}>
            <Megaphone color={colors.primary} size={18} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.rowMeta} numberOfLines={2}>{item.body}</Text>
            {item.challengeSlug ? <Text style={styles.rowAccent}>Challenge: {item.challengeSlug}</Text> : null}
          </View>
        </View>
      );
    }

    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
        onPress={() => openOfficialPost(item)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.title}`}
      >
        <View style={styles.rowIcon}>
          <Megaphone color={colors.primary} size={18} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.rowMeta} numberOfLines={2}>{item.body}</Text>
          {item.challengeSlug ? <Text style={styles.rowAccent}>Challenge: {item.challengeSlug}</Text> : null}
        </View>
        <Edit3 color={colors.textMuted} size={17} />
      </Pressable>
    );
  }, []);
```

- [ ] **Step 7: Update the official-post modal copy and create-only controls**

In the modal title expression, replace the official-post fallback `'Create official post'` with:

```tsx
                      : isEditingOfficialPost ? 'Edit official post' : 'Create official post'}
```

After the challenge selector block and before the existing `Send in-app notification` switch row, insert:

```tsx
                  {isEditingOfficialPost && selectedOfficialPostHasNotification ? (
                    <>
                      <FormLabel>Notification body</FormLabel>
                      <FormInput
                        value={officialPostDraft.notificationBody}
                        onChangeText={(notificationBody) => setOfficialPostDraft((current) => ({ ...current, notificationBody }))}
                        placeholder="Short inbox copy"
                        multiline
                      />
                    </>
                  ) : null}
```

Wrap the existing `Send in-app notification` switch row with:

```tsx
                  {!isEditingOfficialPost ? (
                    <View style={styles.switchRow}>
                      <View style={styles.switchCopy}>
                        <Text style={styles.switchTitle}>Send in-app notification</Text>
                        <Text style={styles.switchDescription}>Add this announcement to every user's notification inbox.</Text>
                      </View>
                      <Switch
                        value={officialPostDraft.sendInAppNotification}
                        onValueChange={(sendInAppNotification) => setOfficialPostDraft((current) => ({
                          ...current,
                          sendInAppNotification,
                          sendPushNotification: sendInAppNotification ? current.sendPushNotification : false,
                        }))}
                        trackColor={{ false: colors.border, true: colors.primaryBorder }}
                        thumbColor={officialPostDraft.sendInAppNotification ? colors.primary : colors.textMuted}
                      />
                    </View>
                  ) : null}
```

Change the create-mode notification body block condition from:

```tsx
                  {officialPostDraft.sendInAppNotification ? (
```

to:

```tsx
                  {!isEditingOfficialPost && officialPostDraft.sendInAppNotification ? (
```

Change the push body block condition from:

```tsx
                  {officialPostDraft.sendPushNotification ? (
```

to:

```tsx
                  {!isEditingOfficialPost && officialPostDraft.sendPushNotification ? (
```

In the `AppButton` label expression, replace the official-post fallback with:

```tsx
                      : isEditingOfficialPost ? 'Save Official Post' : 'Publish Official Post'
```

In the `AppButton` `onPress` expression, replace the official-post fallback with:

```tsx
                      : isEditingOfficialPost ? handleSaveOfficialPost : handlePublishOfficialPost
```

- [ ] **Step 8: Run the focused test and verify GREEN**

Run:

```powershell
npm run test:official-posts
```

Expected: PASS.

- [ ] **Step 9: Commit the Admin tools UI slice**

Run:

```powershell
git add -- scripts/officialBeervaPosts.test.js src/screens/AdminToolsScreen.tsx
git commit -m "feat: edit admin official posts"
```

Expected: commit succeeds.

---

### Task 4: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run the focused official-post test**

Run:

```powershell
npm run test:official-posts
```

Expected: PASS with `official Beerva post checks passed`.

- [ ] **Step 2: Run TypeScript**

Run:

```powershell
npx tsc --noEmit
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run the web build**

Run:

```powershell
npm run build:web
```

Expected: PASS and `dist` is regenerated by Expo export.

- [ ] **Step 4: Inspect working tree**

Run:

```powershell
git status --short --branch
```

Expected: the branch shows the implementation commits, with no unexpected tracked changes. Generated build output may appear depending on the repo state; inspect it before committing or leaving it.
