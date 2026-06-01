# Official Beerva Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins publish reusable official Beerva feed posts with one optional compressed photo, an optional challenge join action, optional in-app broadcast notifications, and optional Web Push delivery.

**Architecture:** Extend the existing `official_feed_posts` table and notification pipeline instead of introducing a parallel broadcast service. An admin-only retry-safe RPC inserts one announcement and optionally fans out `official_post` notification rows; the existing notification webhook continues to invoke `send-push`, which suppresses device delivery when the per-post push toggle is off. Client work adds a third Admin tools section, a kind-aware official feed card, challenge deep links, and Beerva-branded in-app notifications while preserving winner announcements.

**Tech Stack:** Expo React Native, React Native Web, Supabase Postgres/RLS/RPC, Supabase Storage, Supabase Edge Functions, Web Push, Node source-contract tests.

---

## File Structure

- Create `supabase/migrations/20260601160000_add_official_beerva_posts.sql`: announcement columns, image bucket, storage policies, nullable notification actor, `official_post` type, admin list RPC, and retry-safe publish RPC.
- Create `scripts/officialBeervaPosts.test.js`: focused database, mapper, admin, feed, notification, photo, and deep-link contract checks.
- Modify `package.json`: add `test:official-posts`.
- Modify `src/lib/officialFeedPosts.ts`: map announcement image and linked challenge fields and expose kind helpers.
- Modify `src/lib/officialFeedPostsApi.ts`: fetch new columns and resolve linked challenge summaries once per loaded page.
- Modify `src/lib/imageUpload.ts`: report the requested bucket in unreachable-storage errors.
- Modify `src/lib/adminApi.ts`: list and retry-safe publish API for official posts, including uncertain-timeout classification.
- Modify `src/lib/adminTools.ts`: compose draft, Booze-in-June prefill copy, toggle validation, and helper types.
- Modify `src/screens/AdminToolsScreen.tsx`: third section, read-only post list, composer, optional photo picker, compression, upload, cleanup, challenge selector, and delivery toggles.
- Modify `src/components/OfficialFeedPostCard.tsx`: preserve winner cards and add announcement rendering, photo viewer action, challenge join action, and inline join errors.
- Modify `src/screens/FeedScreen.tsx`: hydrate linked challenges once per loaded official-post page, join from announcement cards, and route announcement photos to the existing viewer.
- Create `src/lib/challengeLaunchParams.ts`: pure challenge deep-link parser shared by startup routing tests.
- Modify `src/lib/notificationMessages.ts`: official metadata and snapshotted copy helpers.
- Modify `src/screens/NotificationsScreen.tsx`: nullable actors, Beerva-branded official notification rows, and linked challenge navigation.
- Modify `src/navigation/RootNavigator.tsx`: parse `?challenge=...`, open challenge detail, and mark a push-opened notification read.
- Modify `supabase/functions/send-push/index.ts`: support nullable actors, suppress disabled official pushes, and route enabled campaign pushes to challenge detail.
- Modify `scripts/notifications.test.js`: official in-app copy and challenge navigation checks.
- Modify `scripts/pushDelivery.test.js`: official push suppression, copy, and deep-link checks.

---

### Task 1: Add The Focused Contract Test Harness

**Files:**
- Create: `scripts/officialBeervaPosts.test.js`
- Modify: `package.json`

- [ ] **Step 1: Create the initial failing migration contract test**

Create `scripts/officialBeervaPosts.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = 'supabase/migrations/20260601160000_add_official_beerva_posts.sql';
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const migrationSql = exists(migrationPath) ? read(migrationPath) : '';

const loadTypeScriptModule = (relativePath) => {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });

  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

assert.ok(exists(migrationPath), 'official posts migration should exist');
assert.match(migrationSql, /add column if not exists admin_request_key uuid/i, 'official posts should store retry keys');
assert.match(migrationSql, /add column if not exists linked_challenge_id uuid/i, 'official posts should store optional linked challenges');
assert.match(migrationSql, /add column if not exists image_url text/i, 'official posts should store one optional image');
assert.match(migrationSql, /official_feed_posts_admin_request_key_idx/i, 'official posts should index retry keys uniquely');
assert.match(migrationSql, /official_post_images/i, 'migration should create official post image storage');
assert.match(migrationSql, /Admins can upload their own official post images/i, 'official image uploads should require an admin folder policy');
assert.match(migrationSql, /alter column actor_id drop not null/i, 'official notifications should allow a null personal actor');
assert.match(migrationSql, /'official_post'/i, 'notifications should support official posts');
assert.match(migrationSql, /create or replace function public\.admin_get_official_posts\(\)/i, 'admins should list official posts');
assert.match(migrationSql, /create or replace function public\.admin_publish_official_post/i, 'admins should publish official posts');
assert.match(migrationSql, /if not public\.is_current_user_admin\(\)/i, 'publication should require an admin');
assert.match(migrationSql, /push notifications require in-app notifications/i, 'push should require in-app delivery');
assert.match(migrationSql, /where official_feed_posts\.admin_request_key = post_request_key/i, 'publication should reuse retry keys');
assert.match(migrationSql, /on conflict \(admin_request_key\)[\s\S]*do nothing/i, 'overlapping publication retries should converge on one post');
assert.match(migrationSql, /insert into public\.notifications/i, 'publication should fan out in-app notifications');
assert.match(migrationSql, /select profiles\.id/i, 'fan-out should create one row per profile');
assert.match(migrationSql, /'push_enabled'/i, 'fan-out should snapshot the push toggle');
assert.match(migrationSql, /notify pgrst,\s*'reload schema'/i, 'migration should refresh PostgREST schema');

console.log('official Beerva post checks passed');
```

- [ ] **Step 2: Add the package script**

Add this script in `package.json`:

```json
"test:official-posts": "node scripts/officialBeervaPosts.test.js"
```

- [ ] **Step 3: Run the test to prove the migration is missing**

Run:

```bash
npm run test:official-posts
```

Expected: FAIL with `official posts migration should exist`.

- [ ] **Step 4: Commit the red test**

```bash
git add package.json scripts/officialBeervaPosts.test.js
git commit -m "test: define official Beerva post contract"
```

---

### Task 2: Add Database, Storage, And Admin Publication RPCs

**Files:**
- Create: `supabase/migrations/20260601160000_add_official_beerva_posts.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260601160000_add_official_beerva_posts.sql`:

```sql
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'official_post_images',
  'official_post_images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can view official post images" on storage.objects;
create policy "Authenticated users can view official post images"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'official_post_images');

drop policy if exists "Admins can upload their own official post images" on storage.objects;
create policy "Admins can upload their own official post images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'official_post_images'
    and public.is_current_user_admin()
    and (storage.foldername(name))[1] = 'admins'
    and (storage.foldername(name))[2] = auth.uid()::text
    and (storage.foldername(name))[3] = 'posts'
  );

drop policy if exists "Admins can delete their own official post images" on storage.objects;
create policy "Admins can delete their own official post images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'official_post_images'
    and public.is_current_user_admin()
    and (storage.foldername(name))[1] = 'admins'
    and (storage.foldername(name))[2] = auth.uid()::text
    and (storage.foldername(name))[3] = 'posts'
  );

alter table public.official_feed_posts
  add column if not exists admin_request_key uuid,
  add column if not exists linked_challenge_id uuid references public.challenges(id) on delete set null,
  add column if not exists image_url text;

create unique index if not exists official_feed_posts_admin_request_key_idx
  on public.official_feed_posts(admin_request_key)
  where admin_request_key is not null;

alter table public.notifications
  alter column actor_id drop not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications drop constraint notifications_type_check;
  end if;

  alter table public.notifications
    add constraint notifications_type_check
    check (type in (
      'cheer',
      'invite',
      'session_started',
      'comment',
      'invite_response',
      'pub_crawl_started',
      'hangover_check',
      'follow',
      'chug_verification',
      'drinking_buddy_added',
      'official_post'
    ));
end $$;

create or replace function public.admin_get_official_posts()
returns setof public.official_feed_posts
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  return query
  select official_feed_posts.*
  from public.official_feed_posts
  order by official_feed_posts.published_at desc, official_feed_posts.created_at desc;
end;
$$;

create or replace function public.admin_publish_official_post(
  post_title text default null,
  post_body text default null,
  post_image_url text default null,
  linked_challenge_id uuid default null,
  send_in_app_notification boolean default false,
  notification_body text default null,
  send_push_notification boolean default false,
  push_title text default null,
  push_body text default null,
  post_request_key uuid default null
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
  clean_push_title text := nullif(btrim(coalesce(push_title, '')), '');
  clean_push_body text := nullif(btrim(coalesce(push_body, '')), '');
  expected_image_prefix text;
  linked_challenge public.challenges%rowtype;
  saved_row public.official_feed_posts;
begin
  if requesting_user_id is null or not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if post_request_key is null then
    raise exception 'A publication request key is required.';
  end if;

  select official_feed_posts.*
  into saved_row
  from public.official_feed_posts
  where official_feed_posts.admin_request_key = post_request_key
  limit 1;

  if saved_row.id is not null then
    return saved_row;
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

  if send_push_notification and not send_in_app_notification then
    raise exception 'Push notifications require in-app notifications.';
  end if;

  if send_in_app_notification and clean_notification_body is null then
    raise exception 'Notification body is required.';
  end if;

  if send_push_notification and clean_push_title is null then
    raise exception 'Push title is required.';
  end if;

  if send_push_notification and clean_push_body is null then
    raise exception 'Push body is required.';
  end if;

  insert into public.official_feed_posts (
    kind,
    title,
    body,
    image_url,
    linked_challenge_id,
    metadata,
    admin_request_key,
    published_at
  ) values (
    'announcement',
    clean_title,
    clean_body,
    clean_image_url,
    linked_challenge.id,
    jsonb_strip_nulls(jsonb_build_object(
      'challenge_id', linked_challenge.id,
      'challenge_slug', linked_challenge.slug
    )),
    post_request_key,
    now()
  )
  on conflict (admin_request_key)
  where admin_request_key is not null
  do nothing
  returning * into saved_row;

  if saved_row.id is null then
    select official_feed_posts.*
    into saved_row
    from public.official_feed_posts
    where official_feed_posts.admin_request_key = post_request_key
    limit 1;

    if saved_row.id is null then
      raise exception 'Could not resolve publication retry.';
    end if;

    return saved_row;
  end if;

  if send_in_app_notification then
    insert into public.notifications (
      user_id,
      actor_id,
      type,
      reference_id,
      metadata
    )
    select
      profiles.id,
      null,
      'official_post',
      saved_row.id,
      jsonb_strip_nulls(jsonb_build_object(
        'official_post_id', saved_row.id,
        'official_title', saved_row.title,
        'notification_body', clean_notification_body,
        'push_enabled', send_push_notification,
        'push_title', case when send_push_notification then clean_push_title else null end,
        'push_body', case when send_push_notification then clean_push_body else null end,
        'challenge_id', linked_challenge.id,
        'challenge_slug', linked_challenge.slug
      ))
    from public.profiles as profiles;
  end if;

  return saved_row;
end;
$$;

revoke execute on function public.admin_get_official_posts() from public, anon;
revoke execute on function public.admin_publish_official_post(
  text,
  text,
  text,
  uuid,
  boolean,
  text,
  boolean,
  text,
  text,
  uuid
) from public, anon;

grant execute on function public.admin_get_official_posts() to authenticated;
grant execute on function public.admin_publish_official_post(
  text,
  text,
  text,
  uuid,
  boolean,
  text,
  boolean,
  text,
  text,
  uuid
) to authenticated;

comment on column public.official_feed_posts.admin_request_key
  is 'Client-generated UUID used to make admin announcement publication retry-safe.';
comment on column public.official_feed_posts.linked_challenge_id
  is 'Optional challenge action for general Beerva announcements. Winner posts continue using challenge_id.';
comment on column public.official_feed_posts.image_url
  is 'Optional public URL for one compressed official announcement image.';
comment on function public.admin_get_official_posts()
  is 'Lists official Beerva feed posts for admins.';
comment on function public.admin_publish_official_post(text, text, text, uuid, boolean, text, boolean, text, text, uuid)
  is 'Publishes one retry-safe official Beerva announcement and optionally fans out in-app notifications.';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Run focused migration tests**

Run:

```bash
npm run test:official-posts
npm run test:notifications
npm run test:push-delivery
```

Expected: all three PASS. The first test prints `official Beerva post checks passed`.

- [ ] **Step 3: Commit the database contract**

```bash
git add supabase/migrations/20260601160000_add_official_beerva_posts.sql
git commit -m "feat: add official Beerva post publication RPC"
```

---

### Task 3: Add Official Post Models, Admin Helpers, And APIs

**Files:**
- Modify: `scripts/officialBeervaPosts.test.js`
- Modify: `src/lib/officialFeedPosts.ts`
- Modify: `src/lib/officialFeedPostsApi.ts`
- Modify: `src/lib/adminTools.ts`
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/imageUpload.ts`

- [ ] **Step 1: Extend the failing helper tests**

Append before the final log in `scripts/officialBeervaPosts.test.js`:

```js
const officialFeedPosts = loadTypeScriptModule('src/lib/officialFeedPosts.ts');
const adminTools = loadTypeScriptModule('src/lib/adminTools.ts');

const announcement = officialFeedPosts.mapOfficialFeedPostRow({
  id: 'post-1',
  kind: 'announcement',
  title: 'Booze-in-June has begun',
  body: 'June is here.',
  image_url: 'https://example.com/june.jpg',
  linked_challenge_id: 'challenge-1',
  metadata: { challenge_slug: 'booze-in-june' },
  published_at: '2026-06-01T18:00:00Z',
  created_at: '2026-06-01T18:00:00Z',
});

assert.equal(announcement.imageUrl, 'https://example.com/june.jpg');
assert.equal(announcement.linkedChallengeId, 'challenge-1');
assert.equal(announcement.challengeSlug, 'booze-in-june');
assert.equal(officialFeedPosts.isOfficialWinnerPost(announcement), false);
assert.equal(
  officialFeedPosts.isOfficialWinnerPost(
    officialFeedPosts.mapOfficialFeedPostRow({ kind: 'challenge_winner' })
  ),
  true
);

const emptyOfficialDraft = adminTools.createEmptyOfficialPostDraft();
assert.equal(emptyOfficialDraft.sendInAppNotification, false);
assert.equal(emptyOfficialDraft.sendPushNotification, false);

const juneDraft = adminTools.applyOfficialPostChallengePrefill(
  emptyOfficialDraft,
  { id: 'challenge-1', slug: 'booze-in-june', title: 'Booze-in-June' }
);
assert.equal(juneDraft.title, 'Booze-in-June has begun');
assert.match(juneDraft.body, /liver has been assigned a side quest/);
assert.equal(juneDraft.pushTitle, 'New June challenge');
assert.match(juneDraft.pushBody, /first beer starts counting itself lonely/);
assert.equal(juneDraft.notificationBody, juneDraft.pushBody);

assert.equal(
  adminTools.validateOfficialPostDraft({
    ...juneDraft,
    sendInAppNotification: false,
    sendPushNotification: true,
  }),
  'Enable in-app notifications before sending a push.'
);

assert.equal(
  adminTools.validateOfficialPostDraft({
    ...juneDraft,
    sendInAppNotification: true,
    notificationBody: '',
  }),
  'Notification body is required.'
);

const officialApiSource = read('src/lib/officialFeedPostsApi.ts');
const adminApiSource = read('src/lib/adminApi.ts');
const imageUploadSource = read('src/lib/imageUpload.ts');
assert.match(officialApiSource, /linked_challenge_id/, 'feed API should fetch linked challenge ids');
assert.match(officialApiSource, /image_url/, 'feed API should fetch official post image URLs');
assert.match(adminApiSource, /fetchAdminOfficialPosts/, 'admin API should list official posts');
assert.match(adminApiSource, /publishAdminOfficialPost/, 'admin API should publish official posts');
assert.match(adminApiSource, /post_request_key:\s*input\.requestKey/, 'admin API should send the composer retry key');
assert.match(adminApiSource, /AdminOfficialPostPublishError/, 'admin API should classify uncertain publication failures');
assert.match(adminApiSource, /failed to fetch\|network request failed\|abort/i, 'network failures should remain uncertain after publication');
assert.match(imageUploadSource, /check that the \$\{bucket\} bucket is available/, 'image upload errors should name the requested bucket');
```

- [ ] **Step 2: Run the test to prove helpers are missing**

Run:

```bash
npm run test:official-posts
```

Expected: FAIL because announcement mapping and admin draft helpers do not exist.

- [ ] **Step 3: Extend the official feed-post mapper**

In `src/lib/officialFeedPosts.ts`, add row fields:

```ts
linked_challenge_id?: string | null;
image_url?: string | null;
```

Add mapped fields:

```ts
linkedChallengeId: string | null;
imageUrl: string | null;
```

Set them inside `mapOfficialFeedPostRow()`:

```ts
linkedChallengeId: toStringOrNull(row.linked_challenge_id),
imageUrl: toStringOrNull(row.image_url),
```

Add this helper:

```ts
export const isOfficialWinnerPost = (post: Pick<OfficialFeedPost, 'kind'>) => (
  post.kind === 'challenge_winner'
);
```

- [ ] **Step 4: Fetch announcement columns and linked challenge summaries**

In `src/lib/officialFeedPostsApi.ts`, import:

```ts
import { ChallengeSummary } from './challenges';
import { fetchOfficialChallenges } from './challengesApi';
```

Extend the select:

```ts
.select('id, challenge_id, linked_challenge_id, kind, title, body, image_url, metadata, published_at, created_at')
```

Add:

```ts
export const fetchOfficialPostLinkedChallengeSummaries = async (
  posts: OfficialFeedPost[]
): Promise<Map<string, ChallengeSummary>> => {
  const linkedIds = new Set(
    posts.map((post) => post.linkedChallengeId).filter(Boolean) as string[]
  );

  if (linkedIds.size === 0) return new Map();

  const challenges = await fetchOfficialChallenges();
  return new Map(
    challenges
      .filter((challenge) => linkedIds.has(challenge.id))
      .map((challenge) => [challenge.id, challenge])
  );
};
```

- [ ] **Step 5: Add admin compose helpers**

In `src/lib/adminTools.ts`, add:

```ts
export type AdminOfficialPostDraft = {
  title: string;
  body: string;
  linkedChallengeId: string | null;
  sendInAppNotification: boolean;
  notificationBody: string;
  sendPushNotification: boolean;
  pushTitle: string;
  pushBody: string;
};

type OfficialPostChallengePrefillInput = {
  id: string;
  slug: string;
  title: string;
};

export const createEmptyOfficialPostDraft = (): AdminOfficialPostDraft => ({
  title: '',
  body: '',
  linkedChallengeId: null,
  sendInAppNotification: false,
  notificationBody: '',
  sendPushNotification: false,
  pushTitle: '',
  pushBody: '',
});

const getOfficialPostChallengePrefill = (challenge: OfficialPostChallengePrefillInput) => {
  if (
    challenge.slug.trim().toLowerCase() === 'booze-in-june'
    || challenge.title.trim().toLowerCase() === 'booze-in-june'
  ) {
    const pushBody = 'Booze-in-June is live. Tap to join before your first beer starts counting itself lonely.';
    return {
      title: 'Booze-in-June has begun',
      body: 'June is here, the taps are flowing, and your liver has been assigned a side quest. Join Booze-in-June, log your beers, and prove your pintsmanship before the month runs dry.',
      notificationBody: pushBody,
      pushTitle: 'New June challenge',
      pushBody,
    };
  }

  const pushBody = `${challenge.title} is live. Tap to join the challenge.`;
  return {
    title: `${challenge.title} has begun`,
    body: `${challenge.title} is live. Join the challenge and log your drinks to take part.`,
    notificationBody: pushBody,
    pushTitle: `New challenge: ${challenge.title}`,
    pushBody,
  };
};

export const applyOfficialPostChallengePrefill = (
  draft: AdminOfficialPostDraft,
  challenge: OfficialPostChallengePrefillInput
): AdminOfficialPostDraft => {
  const prefill = getOfficialPostChallengePrefill(challenge);
  return {
    ...draft,
    linkedChallengeId: challenge.id,
    title: draft.title.trim() ? draft.title : prefill.title,
    body: draft.body.trim() ? draft.body : prefill.body,
    notificationBody: draft.notificationBody.trim() ? draft.notificationBody : prefill.notificationBody,
    pushTitle: draft.pushTitle.trim() ? draft.pushTitle : prefill.pushTitle,
    pushBody: draft.pushBody.trim() ? draft.pushBody : prefill.pushBody,
  };
};

export const validateOfficialPostDraft = (draft: AdminOfficialPostDraft) => {
  if (!draft.title.trim()) return 'Official post title is required.';
  if (!draft.body.trim()) return 'Official post body is required.';
  if (draft.sendPushNotification && !draft.sendInAppNotification) {
    return 'Enable in-app notifications before sending a push.';
  }
  if (draft.sendInAppNotification && !draft.notificationBody.trim()) {
    return 'Notification body is required.';
  }
  if (draft.sendPushNotification && !draft.pushTitle.trim()) return 'Push title is required.';
  if (draft.sendPushNotification && !draft.pushBody.trim()) return 'Push body is required.';
  return null;
};
```

- [ ] **Step 6: Add admin list and publish APIs**

In `src/lib/adminApi.ts`, rename and export the existing `createRequestKey` helper:

```ts
export const createAdminRequestKey = () => {
```

Update the existing challenge-save caller to use `createAdminRequestKey()`.

Add:

```ts
import { mapOfficialFeedPostRow, OfficialFeedPost, OfficialFeedPostRow } from './officialFeedPosts';
```

and change the existing timeout import to:

```ts
import { getErrorMessage, TimeoutError, withRetryableTimeout, withTimeout } from './timeouts';
```

Add:

```ts
export type PublishAdminOfficialPostInput = {
  requestKey: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkedChallengeId: string | null;
  sendInAppNotification: boolean;
  notificationBody: string | null;
  sendPushNotification: boolean;
  pushTitle: string | null;
  pushBody: string | null;
};

export class AdminOfficialPostPublishError extends Error {
  uncertain: boolean;

  constructor(message: string, uncertain: boolean) {
    super(message);
    this.name = 'AdminOfficialPostPublishError';
    this.uncertain = uncertain;
  }
}

const isUncertainOfficialPostPublishError = (error: unknown) => {
  const message = typeof (error as { message?: unknown })?.message === 'string'
    ? (error as { message: string }).message
    : '';
  return error instanceof TimeoutError || /failed to fetch|network request failed|abort/i.test(message);
};

export const fetchAdminOfficialPosts = async (): Promise<OfficialFeedPost[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_get_official_posts'),
      ADMIN_TIMEOUT_MS,
      'Official posts are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as OfficialFeedPostRow[]).map(mapOfficialFeedPostRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load official posts.'));
  }
};

export const publishAdminOfficialPost = async (
  input: PublishAdminOfficialPostInput
): Promise<OfficialFeedPost> => {
  try {
    const payload = {
      post_title: input.title,
      post_body: input.body,
      post_image_url: input.imageUrl,
      linked_challenge_id: input.linkedChallengeId,
      send_in_app_notification: input.sendInAppNotification,
      notification_body: input.notificationBody,
      send_push_notification: input.sendPushNotification,
      push_title: input.pushTitle,
      push_body: input.pushBody,
      post_request_key: input.requestKey,
    };
    const { data, error } = await withRetryableTimeout(
      (signal) => supabase.rpc('admin_publish_official_post', payload).abortSignal(signal),
      ADMIN_TIMEOUT_MS,
      'Publishing the official post is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as OfficialFeedPostRow | OfficialFeedPostRow[] | null);
    if (!row) throw new Error('The published official post was not returned.');
    return mapOfficialFeedPostRow(row);
  } catch (error) {
    throw new AdminOfficialPostPublishError(
      getErrorMessage(error, 'Could not publish official post.'),
      isUncertainOfficialPostPublishError(error)
    );
  }
};
```

- [ ] **Step 7: Make shared storage errors bucket-aware**

In `src/lib/imageUpload.ts`, replace:

```ts
throw new Error('Could not reach image storage. Try a smaller JPG/PNG, then check that the session_images bucket is available.');
```

with:

```ts
throw new Error(`Could not reach image storage. Try a smaller JPG/PNG, then check that the ${bucket} bucket is available.`);
```

- [ ] **Step 8: Run helper and regression tests**

Run:

```bash
npm run test:official-posts
npm run test:admin-tools
npm run test:challenges
```

Expected: all PASS.

- [ ] **Step 9: Commit the shared client layer**

```bash
git add scripts/officialBeervaPosts.test.js src/lib/officialFeedPosts.ts src/lib/officialFeedPostsApi.ts src/lib/adminTools.ts src/lib/adminApi.ts src/lib/imageUpload.ts
git commit -m "feat: add official post client helpers"
```

---

### Task 4: Add The Admin Official-Post Composer And Photo Upload

**Files:**
- Modify: `scripts/officialBeervaPosts.test.js`
- Modify: `src/screens/AdminToolsScreen.tsx`

- [ ] **Step 1: Add failing admin composer source checks**

Append before the final log in `scripts/officialBeervaPosts.test.js`:

```js
const adminScreenSource = read('src/screens/AdminToolsScreen.tsx');
assert.match(adminScreenSource, /type AdminSegment = 'challenges' \| 'beers' \| 'official-posts'/, 'admin tools should add official posts segment');
assert.match(adminScreenSource, /fetchAdminOfficialPosts/, 'admin tools should load official posts');
assert.match(adminScreenSource, /publishAdminOfficialPost/, 'admin tools should publish official posts');
assert.match(adminScreenSource, /prepareWebImageFromPickerAsset/, 'web official photos should use shared compression');
assert.match(adminScreenSource, /UPLOAD_IMAGE_MAX_WIDTH/, 'native official photos should reuse the session image width');
assert.match(adminScreenSource, /official_post_images/, 'official photos should use the dedicated bucket');
assert.match(adminScreenSource, /admins\/\$\{user\.id\}\/posts/, 'official photos should upload into the current admin folder');
assert.match(adminScreenSource, /Send in-app notification/, 'composer should expose the in-app toggle');
assert.match(adminScreenSource, /Send push notification/, 'composer should expose the push toggle');
assert.match(adminScreenSource, /Select a challenge/, 'composer should expose optional challenge linking');
assert.match(adminScreenSource, /deletePublicImageUrl/, 'definitive publication failures should clean uploaded photos');
assert.match(adminScreenSource, /officialPostRequestKey/, 'manual publication retries should reuse the composer request key');
assert.match(adminScreenSource, /pendingOfficialPostImageUrl/, 'manual retries should reuse a photo uploaded before an uncertain timeout');
```

- [ ] **Step 2: Run the test to prove the composer is missing**

Run:

```bash
npm run test:official-posts
```

Expected: FAIL on `admin tools should add official posts segment`.

- [ ] **Step 3: Add imports, segment types, and state**

In `src/screens/AdminToolsScreen.tsx`, extend React Native imports with `Image`, add `expo-image-picker`, and add icons:

```ts
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Beer, Camera, Edit3, ImagePlus, Megaphone, Plus, ShieldCheck, Trophy, X } from 'lucide-react-native';
```

Add admin and image imports:

```ts
import {
  AdminBeverage,
  AdminChallenge,
  AdminOfficialPostPublishError,
  createAdminRequestKey,
  fetchAdminBeverages,
  fetchAdminChallenges,
  fetchAdminOfficialPosts,
  publishAdminOfficialPost,
  saveAdminBeverage,
  saveAdminChallenge,
} from '../lib/adminApi';
import {
  AdminBeerDraft,
  AdminChallengeDraft,
  AdminOfficialPostDraft,
  adminBeverageToDraft,
  adminChallengeToDraft,
  applyOfficialPostChallengePrefill,
  createEmptyBeerDraft,
  createEmptyChallengeDraft,
  createEmptyOfficialPostDraft,
  fromLocalDateTimeInput,
  validateBeerDraft,
  validateChallengeDraft,
  validateOfficialPostDraft,
} from '../lib/adminTools';
import { OfficialFeedPost } from '../lib/officialFeedPosts';
import {
  deletePublicImageUrl,
  prepareWebImageFromPickerAsset,
  SelectedImage,
  UPLOAD_IMAGE_MAX_WIDTH,
  uploadImageToBucket,
} from '../lib/imageUpload';
import { supabase } from '../lib/supabase';
```

Extend types:

```ts
type AdminSegment = 'challenges' | 'beers' | 'official-posts';
type ActiveModal = 'challenge' | 'beer' | 'official-post' | null;
```

Add state:

```ts
const [officialPosts, setOfficialPosts] = useState<OfficialFeedPost[]>([]);
const [officialPostDraft, setOfficialPostDraft] = useState<AdminOfficialPostDraft>(createEmptyOfficialPostDraft);
const [selectedOfficialPostImage, setSelectedOfficialPostImage] = useState<SelectedImage | null>(null);
const [officialPostRequestKey, setOfficialPostRequestKey] = useState(createAdminRequestKey);
const [pendingOfficialPostImageUrl, setPendingOfficialPostImageUrl] = useState<string | null>(null);
```

Load all three admin resources:

```ts
const [challengeRows, beverageRows, officialPostRows] = await Promise.all([
  fetchAdminChallenges(),
  fetchAdminBeverages(),
  fetchAdminOfficialPosts(),
]);
setChallenges(challengeRows);
setBeverages(beverageRows);
setOfficialPosts(officialPostRows);
```

- [ ] **Step 4: Add photo preparation and picker handlers**

Add:

```ts
const prepareOfficialPostImage = async (asset: ImagePicker.ImagePickerAsset) => {
  if (Platform.OS === 'web') {
    return prepareWebImageFromPickerAsset(asset);
  }

  const ImageManipulator = await import('expo-image-manipulator');
  const manipResult = await ImageManipulator.manipulateAsync(
    asset.uri,
    [{ resize: { width: UPLOAD_IMAGE_MAX_WIDTH } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
  );

  return {
    uri: manipResult.uri,
    mimeType: 'image/jpeg',
  };
};

const setOfficialPostPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
  if (pendingOfficialPostImageUrl) {
    setFormError('Retry publishing before changing the photo.');
    return;
  }

  try {
    setFormError(null);
    setSelectedOfficialPostImage(await prepareOfficialPostImage(asset));
  } catch (error) {
    setFormError(error instanceof Error ? error.message : 'Could not prepare official post photo.');
  }
};

const removeOfficialPostPhoto = () => {
  if (pendingOfficialPostImageUrl) {
    setFormError('Retry publishing before removing the photo.');
    return;
  }
  setSelectedOfficialPostImage(null);
};

const chooseOfficialPostPhoto = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return;
  await setOfficialPostPhoto(result.assets[0]);
};

const takeOfficialPostPhoto = async () => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    setFormError('Camera permission is required to take a photo.');
    return;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    cameraType: ImagePicker.CameraType.back,
  });
  if (result.canceled || !result.assets[0]) return;
  await setOfficialPostPhoto(result.assets[0]);
};
```

- [ ] **Step 5: Add composer open, challenge selection, and publish handlers**

Add:

```ts
const openNewOfficialPost = () => {
  setOfficialPostDraft(createEmptyOfficialPostDraft());
  setSelectedOfficialPostImage(null);
  setOfficialPostRequestKey(createAdminRequestKey());
  setPendingOfficialPostImageUrl(null);
  setFormError(null);
  setActiveModal('official-post');
};

const selectOfficialPostChallenge = (challenge: AdminChallenge | null) => {
  if (!challenge) {
    setOfficialPostDraft((current) => ({ ...current, linkedChallengeId: null }));
    return;
  }

  setOfficialPostDraft((current) => applyOfficialPostChallengePrefill(current, challenge));
};

const handlePublishOfficialPost = async () => {
  const validationError = validateOfficialPostDraft(officialPostDraft);
  if (validationError) {
    setFormError(validationError);
    return;
  }

  setSaving(true);
  setFormError(null);
  let uploadedUrl = pendingOfficialPostImageUrl;
  let publicationAttempted = false;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in.');

    if (selectedOfficialPostImage && !uploadedUrl) {
      uploadedUrl = await uploadImageToBucket(
        'official_post_images',
        selectedOfficialPostImage,
        `admins/${user.id}/posts`
      );
      setPendingOfficialPostImageUrl(uploadedUrl);
    }

    publicationAttempted = true;
    const published = await publishAdminOfficialPost({
      requestKey: officialPostRequestKey,
      title: officialPostDraft.title.trim(),
      body: officialPostDraft.body.trim(),
      imageUrl: uploadedUrl,
      linkedChallengeId: officialPostDraft.linkedChallengeId,
      sendInAppNotification: officialPostDraft.sendInAppNotification,
      notificationBody: officialPostDraft.sendInAppNotification
        ? officialPostDraft.notificationBody.trim()
        : null,
      sendPushNotification: officialPostDraft.sendPushNotification,
      pushTitle: officialPostDraft.sendPushNotification
        ? officialPostDraft.pushTitle.trim()
        : null,
      pushBody: officialPostDraft.sendPushNotification
        ? officialPostDraft.pushBody.trim()
        : null,
    });

    setOfficialPosts((current) => [published, ...current.filter((post) => post.id !== published.id)]);
    setSelectedOfficialPostImage(null);
    setPendingOfficialPostImageUrl(null);
    setActiveModal(null);
  } catch (error) {
    if (
      publicationAttempted
      && uploadedUrl
      && error instanceof AdminOfficialPostPublishError
      && !error.uncertain
    ) {
      void deletePublicImageUrl('official_post_images', uploadedUrl);
      setPendingOfficialPostImageUrl(null);
    }
    setFormError(error instanceof Error ? error.message : 'Could not publish official post.');
  } finally {
    setSaving(false);
  }
};
```

When `closeModal()` closes the composer, also clear the preview:

```ts
if (activeModal === 'official-post') {
  setSelectedOfficialPostImage(null);
  setPendingOfficialPostImageUrl(null);
}
```

- [ ] **Step 6: Add the third list and composer JSX**

Use `Official posts` as the third segment label:

```tsx
{(['challenges', 'beers', 'official-posts'] as AdminSegment[]).map((segment) => (
  <TouchableOpacity
    key={segment}
    style={[styles.segmentButton, activeSegment === segment ? styles.segmentButtonActive : null]}
    onPress={() => setActiveSegment(segment)}
    accessibilityRole="button"
    accessibilityState={{ selected: activeSegment === segment }}
  >
    <Text style={[styles.segmentText, activeSegment === segment ? styles.segmentTextActive : null]}>
      {segment === 'challenges' ? 'Challenges' : segment === 'beers' ? 'Beers' : 'Official posts'}
    </Text>
  </TouchableOpacity>
))}
```

Add a read-only row renderer:

```tsx
const renderOfficialPost = useCallback(({ item }: { item: OfficialFeedPost }) => (
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
), []);
```

Change the empty state, toolbar, add action, and list conditional to cover all three segments:

```tsx
const emptyCopy = useMemo(() => (
  activeSegment === 'challenges'
    ? 'No challenges yet.'
    : activeSegment === 'beers'
      ? 'No admin-added beers yet.'
      : 'No official posts yet.'
), [activeSegment]);

<Text style={styles.toolbarTitle}>
  {activeSegment === 'challenges' ? 'Challenges' : activeSegment === 'beers' ? 'Admin beers' : 'Official posts'}
</Text>
<Text style={styles.toolbarMeta}>
  {activeSegment === 'challenges' ? challenges.length : activeSegment === 'beers' ? beverages.length : officialPosts.length} total
</Text>

onPress={
  activeSegment === 'challenges'
    ? openNewChallenge
    : activeSegment === 'beers'
      ? openNewBeer
      : openNewOfficialPost
}
accessibilityLabel={
  activeSegment === 'challenges'
    ? 'Create challenge'
    : activeSegment === 'beers'
      ? 'Add beer'
      : 'Create official post'
}
```

Keep the existing challenge and beer `FlatList` branches, then add this final branch:

```tsx
<FlatList
  data={officialPosts}
  keyExtractor={(item) => item.id}
  renderItem={renderOfficialPost}
  contentInsetAdjustmentBehavior="automatic"
  contentContainerStyle={[styles.listContent, officialPosts.length === 0 ? styles.emptyContent : null]}
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll({ refresh: true })} tintColor={colors.primary} />}
  ListEmptyComponent={<Text style={styles.emptyText}>{emptyCopy}</Text>}
/>
```

Change the modal heading expressions to:

```tsx
<Text style={styles.modalTitle}>
  {activeModal === 'beer'
    ? beerDraft.id ? 'Edit beer' : 'Add beer'
    : activeModal === 'challenge'
      ? challengeDraft.id ? 'Edit challenge' : 'Create challenge'
      : 'Create official post'}
</Text>
<Text style={styles.modalSubtitle}>
  {activeModal === 'beer'
    ? 'Ordinary beer catalog entry'
    : activeModal === 'challenge'
      ? 'Official true-pint competition'
      : 'Official Beerva feed announcement'}
</Text>
```

Change the modal form from a two-way beer/challenge conditional to a three-way conditional. Put the existing challenge form under `activeModal === 'challenge'`, and use this `official-post` form as the final branch:

```tsx
<>
  <FormLabel>Title</FormLabel>
  <FormInput
    value={officialPostDraft.title}
    onChangeText={(title) => setOfficialPostDraft((current) => ({ ...current, title }))}
    placeholder="Official Beerva announcement"
  />
  <FormLabel>Feed body</FormLabel>
  <FormInput
    value={officialPostDraft.body}
    onChangeText={(body) => setOfficialPostDraft((current) => ({ ...current, body }))}
    placeholder="Tell the beer crew what is happening"
    multiline
  />

  <FormLabel>Optional photo</FormLabel>
  {selectedOfficialPostImage ? (
    <>
      <Image source={{ uri: selectedOfficialPostImage.uri }} style={styles.officialPostPhotoPreview} />
      <View style={styles.inlineActions}>
        <TouchableOpacity style={styles.smallActionButton} onPress={chooseOfficialPostPhoto}>
          <ImagePlus color={colors.primary} size={16} />
          <Text style={styles.smallActionText}>Replace</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallActionButton} onPress={removeOfficialPostPhoto}>
          <X color={colors.text} size={16} />
          <Text style={styles.smallActionText}>Remove</Text>
        </TouchableOpacity>
      </View>
    </>
  ) : (
    <View style={styles.inlineActions}>
      <TouchableOpacity style={styles.smallActionButton} onPress={chooseOfficialPostPhoto}>
        <ImagePlus color={colors.primary} size={16} />
        <Text style={styles.smallActionText}>Choose photo</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.smallActionButton} onPress={takeOfficialPostPhoto}>
        <Camera color={colors.primary} size={16} />
        <Text style={styles.smallActionText}>Take photo</Text>
      </TouchableOpacity>
    </View>
  )}

  <FormLabel>Select a challenge</FormLabel>
  <TouchableOpacity
    style={[styles.challengeChoice, !officialPostDraft.linkedChallengeId ? styles.challengeChoiceActive : null]}
    onPress={() => selectOfficialPostChallenge(null)}
  >
    <Text style={styles.challengeChoiceText}>No linked challenge</Text>
  </TouchableOpacity>
  {challenges.map((challenge) => (
    <TouchableOpacity
      key={challenge.id}
      style={[styles.challengeChoice, officialPostDraft.linkedChallengeId === challenge.id ? styles.challengeChoiceActive : null]}
      onPress={() => selectOfficialPostChallenge(challenge)}
    >
      <Text style={styles.challengeChoiceText}>{challenge.title}</Text>
    </TouchableOpacity>
  ))}

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
    />
  </View>

  {officialPostDraft.sendInAppNotification ? (
    <>
      <FormLabel>Notification body</FormLabel>
      <FormInput
        value={officialPostDraft.notificationBody}
        onChangeText={(notificationBody) => setOfficialPostDraft((current) => ({ ...current, notificationBody }))}
        placeholder="Short inbox copy"
        multiline
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>Send push notification</Text>
          <Text style={styles.switchDescription}>Notify subscribed devices too.</Text>
        </View>
        <Switch
          value={officialPostDraft.sendPushNotification}
          onValueChange={(sendPushNotification) => setOfficialPostDraft((current) => ({ ...current, sendPushNotification }))}
        />
      </View>
    </>
  ) : null}

  {officialPostDraft.sendPushNotification ? (
    <>
      <FormLabel>Push title</FormLabel>
      <FormInput
        value={officialPostDraft.pushTitle}
        onChangeText={(pushTitle) => setOfficialPostDraft((current) => ({ ...current, pushTitle }))}
        placeholder="New challenge"
      />
      <FormLabel>Push body</FormLabel>
      <FormInput
        value={officialPostDraft.pushBody}
        onChangeText={(pushBody) => setOfficialPostDraft((current) => ({ ...current, pushBody }))}
        placeholder="Short device notification copy"
        multiline
      />
    </>
  ) : null}
</>
```

Wire every modal save button prop:

```tsx
label={
  activeModal === 'beer'
    ? 'Save Beer'
    : activeModal === 'challenge'
      ? 'Save Challenge'
      : 'Publish Official Post'
}
onPress={
  activeModal === 'beer'
    ? handleSaveBeer
    : activeModal === 'challenge'
      ? handleSaveChallenge
      : handlePublishOfficialPost
}
icon={activeModal === 'beer'
  ? <Beer color={colors.background} size={18} />
  : activeModal === 'challenge'
    ? <ShieldCheck color={colors.background} size={18} />
    : <Megaphone color={colors.background} size={18} />}
```

Add styles:

```ts
officialPostPhotoPreview: {
  width: '100%',
  height: 180,
  borderRadius: radius.md,
  backgroundColor: colors.cardMuted,
},
inlineActions: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
},
smallActionButton: {
  minHeight: 38,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.surface,
  paddingHorizontal: 12,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},
smallActionText: {
  ...typography.caption,
  color: colors.text,
  fontWeight: '800',
},
challengeChoice: {
  minHeight: 40,
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.surface,
  paddingHorizontal: 12,
  justifyContent: 'center',
},
challengeChoiceActive: {
  borderColor: colors.primaryBorder,
  backgroundColor: colors.primarySoft,
},
challengeChoiceText: {
  ...typography.caption,
  color: colors.text,
  fontWeight: '800',
},
```

- [ ] **Step 7: Run focused tests and build**

Run:

```bash
npm run test:official-posts
npm run test:admin-tools
npm run build:web
```

Expected: all PASS.

- [ ] **Step 8: Commit the admin composer**

```bash
git add scripts/officialBeervaPosts.test.js src/screens/AdminToolsScreen.tsx
git commit -m "feat: add official post admin composer"
```

---

### Task 5: Render Announcement Cards, Photos, And Immediate Challenge Joining

**Files:**
- Modify: `scripts/officialBeervaPosts.test.js`
- Modify: `src/components/OfficialFeedPostCard.tsx`
- Modify: `src/screens/FeedScreen.tsx`

- [ ] **Step 1: Add failing feed source checks**

Append before the final log in `scripts/officialBeervaPosts.test.js`:

```js
const officialCardSource = read('src/components/OfficialFeedPostCard.tsx');
const feedScreenSource = read('src/screens/FeedScreen.tsx');
assert.match(officialCardSource, /isOfficialWinnerPost/, 'official card should preserve a winner branch');
assert.match(officialCardSource, /Join challenge/, 'announcement card should expose immediate challenge joining');
assert.match(officialCardSource, /View challenge/, 'announcement card should preserve detail navigation');
assert.match(officialCardSource, /post\.imageUrl/, 'announcement card should render optional photos');
assert.match(officialCardSource, /onImagePress/, 'announcement photos should open the shared image viewer');
assert.match(feedScreenSource, /fetchOfficialPostLinkedChallengeSummaries/, 'feed should hydrate linked challenge summaries once per page');
assert.match(feedScreenSource, /handleJoinOfficialPostChallenge/, 'feed should join challenges from announcements');
assert.match(feedScreenSource, /onImagePress=\{setViewingImageUrl\}/, 'feed should route official photos to the existing viewer');
```

- [ ] **Step 2: Run the test to prove announcement cards are missing**

Run:

```bash
npm run test:official-posts
```

Expected: FAIL on `announcement card should expose immediate challenge joining`.

- [ ] **Step 3: Split winner and announcement rendering in the card**

In `src/components/OfficialFeedPostCard.tsx`, import `useState`, `ChallengeSummary`, and `isOfficialWinnerPost`. Extend props:

```ts
type OfficialFeedPostCardProps = {
  post: OfficialFeedPost;
  linkedChallenge?: ChallengeSummary | null;
  onJoinChallenge?: (challenge: ChallengeSummary) => Promise<void>;
  onOpenChallenge?: (challengeSlug: string) => void;
  onOpenProfile: (userId: string) => void;
  onImagePress?: (url: string) => void;
};
```

Keep the current trophy JSX as `WinnerOfficialFeedPostCard`. Add:

```tsx
const AnnouncementOfficialFeedPostCard = ({
  post,
  linkedChallenge,
  onJoinChallenge,
  onOpenChallenge,
  onImagePress,
}: Omit<OfficialFeedPostCardProps, 'onOpenProfile'>) => {
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const challengeSlug = linkedChallenge?.slug || post.challengeSlug;

  const handleJoin = async () => {
    if (!linkedChallenge || !onJoinChallenge || joining || linkedChallenge.joined || !linkedChallenge.joinOpen) return;
    setJoining(true);
    setJoinError(null);
    try {
      await onJoinChallenge(linkedChallenge);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Could not join challenge.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.officialBadge}>
          <CheckCircle2 color={colors.primary} size={15} />
          <Text style={styles.officialText}>Official Beerva</Text>
        </View>
      </View>

      {challengeSlug ? (
        <Pressable onPress={() => onOpenChallenge?.(challengeSlug)} accessibilityRole="button">
          <Text style={styles.title}>{post.title}</Text>
        </Pressable>
      ) : (
        <Text style={styles.title}>{post.title}</Text>
      )}
      <Text style={styles.body}>{post.body}</Text>

      {post.imageUrl ? (
        <Pressable onPress={() => onImagePress?.(post.imageUrl as string)} accessibilityRole="button">
          <CachedImage uri={post.imageUrl} style={styles.announcementImage} recyclingKey={`official-${post.id}-${post.imageUrl}`} />
        </Pressable>
      ) : null}

      {challengeSlug ? (
        <View style={styles.challengeActions}>
          {linkedChallenge?.joined ? (
            <View style={styles.joinedPill}>
              <CheckCircle2 color={colors.primary} size={15} />
              <Text style={styles.joinedPillText}>Joined</Text>
            </View>
          ) : linkedChallenge?.joinOpen ? (
            <Pressable style={styles.joinButton} onPress={handleJoin} disabled={joining}>
              <Text style={styles.joinButtonText}>{joining ? 'Joining...' : 'Join challenge'}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.viewButton} onPress={() => onOpenChallenge?.(challengeSlug)}>
            <Text style={styles.viewButtonText}>View challenge</Text>
          </Pressable>
        </View>
      ) : null}

      {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
    </View>
  );
};

export const OfficialFeedPostCard = (props: OfficialFeedPostCardProps) => (
  isOfficialWinnerPost(props.post)
    ? <WinnerOfficialFeedPostCard post={props.post} onOpenProfile={props.onOpenProfile} />
    : <AnnouncementOfficialFeedPostCard {...props} />
);
```

Add styles:

```ts
announcementImage: {
  width: '100%',
  height: 210,
  borderRadius: radius.md,
  backgroundColor: colors.cardMuted,
},
challengeActions: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
},
joinButton: {
  minHeight: 36,
  borderRadius: radius.pill,
  backgroundColor: colors.primary,
  paddingHorizontal: 13,
  alignItems: 'center',
  justifyContent: 'center',
},
joinButtonText: {
  ...typography.caption,
  color: colors.background,
  fontWeight: '900',
},
viewButton: {
  minHeight: 36,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.surface,
  paddingHorizontal: 13,
  alignItems: 'center',
  justifyContent: 'center',
},
viewButtonText: {
  ...typography.caption,
  color: colors.text,
  fontWeight: '900',
},
joinedPill: {
  minHeight: 36,
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: colors.primaryBorder,
  backgroundColor: colors.primarySoft,
  paddingHorizontal: 11,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
},
joinedPillText: {
  ...typography.caption,
  color: colors.primary,
  fontWeight: '900',
},
errorText: {
  ...typography.caption,
  color: colors.danger,
},
```

- [ ] **Step 4: Hydrate and refresh linked challenge summaries in FeedScreen**

In `src/screens/FeedScreen.tsx`, import:

```ts
import { fetchJoinedActiveChallengeSummary, joinChallenge } from '../lib/challengesApi';
import { fetchOfficialFeedPostsForFeedPage, fetchOfficialPostLinkedChallengeSummaries } from '../lib/officialFeedPostsApi';
```

Add state:

```ts
const [officialPostChallengesById, setOfficialPostChallengesById] = useState<Map<string, ChallengeSummary>>(() => new Map());
```

After slicing `officialPosts` inside `fetchSessions`, load summaries once:

```ts
const officialPostChallengeSummaries = await withTimeout(
  fetchOfficialPostLinkedChallengeSummaries(officialPosts),
  FEED_REQUEST_TIMEOUT_MS,
  'Official challenge actions are taking too long.'
);
if (!isLatestRequest()) return;

setOfficialPostChallengesById((previous) => {
  const next = reset ? new Map<string, ChallengeSummary>() : new Map(previous);
  officialPostChallengeSummaries.forEach((challenge, id) => next.set(id, challenge));
  return next;
});
```

Add:

```ts
const handleJoinOfficialPostChallenge = useCallback(async (challenge: ChallengeSummary) => {
  await joinChallenge(challenge.id);

  const loadedOfficialPosts = sessionsRef.current
    .filter((item): item is Extract<FeedItem, { type: 'official_post' }> => item.type === 'official_post')
    .map((item) => item.post);

  const [summaries, activeSummary] = await Promise.all([
    fetchOfficialPostLinkedChallengeSummaries(loadedOfficialPosts),
    fetchJoinedActiveChallengeSummary(),
  ]);
  setOfficialPostChallengesById(summaries);
  setActiveChallengeSummary(activeSummary);
}, []);
```

Pass announcement props:

```tsx
<OfficialFeedPostCard
  post={item.post}
  linkedChallenge={item.post.linkedChallengeId ? officialPostChallengesById.get(item.post.linkedChallengeId) : null}
  onJoinChallenge={handleJoinOfficialPostChallenge}
  onOpenChallenge={(challengeSlug) => navigation.navigate('ChallengeDetail', { challengeSlug })}
  onOpenProfile={openProfile}
  onImagePress={setViewingImageUrl}
/>
```

Add `handleJoinOfficialPostChallenge`, `navigation`, and `officialPostChallengesById` to the render callback dependency list.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
npm run test:official-posts
npm run test:challenges
npm run build:web
```

Expected: all PASS.

- [ ] **Step 6: Commit feed announcement rendering**

```bash
git add scripts/officialBeervaPosts.test.js src/components/OfficialFeedPostCard.tsx src/screens/FeedScreen.tsx
git commit -m "feat: show official Beerva announcements in feed"
```

---

### Task 6: Add Beerva-Branded In-App Notifications And Challenge Deep Links

**Files:**
- Modify: `scripts/officialBeervaPosts.test.js`
- Modify: `scripts/notifications.test.js`
- Create: `src/lib/challengeLaunchParams.ts`
- Modify: `src/lib/notificationMessages.ts`
- Modify: `src/screens/NotificationsScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Add failing parser, message, and UI checks**

Append before the final log in `scripts/officialBeervaPosts.test.js`:

```js
const challengeLaunchParams = loadTypeScriptModule('src/lib/challengeLaunchParams.ts');
assert.deepEqual(
  challengeLaunchParams.getChallengeLaunchParamsFromSearch('?challenge=booze-in-june&notificationId=notif-1'),
  { challengeSlug: 'booze-in-june', notificationId: 'notif-1' }
);
assert.equal(
  challengeLaunchParams.getChallengeLaunchParamsFromSearch('?notifications=1'),
  null
);

const notificationsScreenSource = read('src/screens/NotificationsScreen.tsx');
const navigatorSource = read('src/navigation/RootNavigator.tsx');
assert.match(notificationsScreenSource, /official_post/, 'notifications screen should render official notifications');
assert.match(notificationsScreenSource, /Official Beerva/, 'official notifications should show Beerva identity');
assert.match(notificationsScreenSource, /View challenge/, 'official notifications should open linked challenges');
assert.match(navigatorSource, /getChallengeLaunchParamsFromSearch/, 'navigator should parse challenge push links');
assert.match(navigatorSource, /navigationRef\.navigate\('ChallengeDetail'/, 'navigator should open challenge detail');
assert.match(navigatorSource, /\.from\('notifications'\)[\s\S]*\.update\(\{ read: true \}\)/, 'navigator should mark push-opened challenge notifications read');
```

In `scripts/notifications.test.js`, destructure:

```js
getOfficialNotificationBody,
getOfficialNotificationTitle,
```

and add:

```js
assert.equal(
  getOfficialNotificationTitle({ type: 'official_post', metadata: { official_title: 'Booze-in-June has begun' } }),
  'Booze-in-June has begun'
);
assert.equal(
  getOfficialNotificationBody({ type: 'official_post', metadata: { notification_body: 'Tap to join.' } }),
  'Tap to join.'
);
```

- [ ] **Step 2: Run tests to prove official notification handling is missing**

Run:

```bash
npm run test:official-posts
npm run test:notifications
```

Expected: FAIL because `src/lib/challengeLaunchParams.ts` and official metadata helpers do not exist.

- [ ] **Step 3: Add a pure challenge launch parser**

Create `src/lib/challengeLaunchParams.ts`:

```ts
export type ChallengeLaunchParams = {
  challengeSlug: string;
  notificationId: string | null;
};

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getChallengeLaunchParamsFromSearch = (
  search: string
): ChallengeLaunchParams | null => {
  const params = new URLSearchParams(search);
  const challengeSlug = toCleanString(params.get('challenge'));
  if (!challengeSlug) return null;

  return {
    challengeSlug,
    notificationId: toCleanString(params.get('notificationId')),
  };
};
```

- [ ] **Step 4: Extend notification metadata helpers**

In `src/lib/notificationMessages.ts`, extend `NotificationMetadata`:

```ts
official_post_id?: string | null;
official_title?: string | null;
notification_body?: string | null;
push_enabled?: boolean | null;
push_title?: string | null;
push_body?: string | null;
challenge_id?: string | null;
challenge_slug?: string | null;
```

Add:

```ts
export const getOfficialNotificationTitle = (item: NotificationMessageInput) => (
  toCleanString(item.metadata?.official_title) || 'Official Beerva'
);

export const getOfficialNotificationBody = (item: NotificationMessageInput) => (
  toCleanString(item.metadata?.notification_body) || 'There is a new official Beerva announcement.'
);
```

- [ ] **Step 5: Render official notification rows without personal actors**

In `src/screens/NotificationsScreen.tsx`, import `Image`, `Megaphone`, and official helpers:

```ts
import { ActivityIndicator, Alert, FlatList, Image, Platform, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Beer, Check, Coffee, MapPin, Megaphone, MessageCircle, PartyPopper, Timer, UserPlus, XCircle } from 'lucide-react-native';
import {
  getNotificationMessage,
  getOfficialNotificationBody,
  getOfficialNotificationTitle,
  NotificationMetadata,
} from '../lib/notificationMessages';
```

Add:

```ts
const beervaLogo = require('../../assets/beerva-header-logo.png');
```

Extend types:

```ts
type NotificationType =
  | 'cheer'
  | 'invite'
  | 'session_started'
  | 'comment'
  | 'invite_response'
  | 'pub_crawl_started'
  | 'hangover_check'
  | 'follow'
  | 'chug_verification'
  | 'drinking_buddy_added'
  | 'official_post';
```

Change only `NotificationRow.actor_id` from `string` to:

```ts
actor_id: string | null;
```

Only attach profiles for non-null actors:

```ts
const actorIds = Array.from(new Set(
  baseRows.map((notification) => notification.actor_id).filter(Boolean) as string[]
));
```

and:

```ts
profiles: notification.actor_id ? profilesById.get(notification.actor_id) || null : null,
```

Add:

```ts
const openOfficialChallenge = useCallback((item: NotificationRow) => {
  const challengeSlug = item.metadata?.challenge_slug?.trim();
  if (!challengeSlug) return;
  navigation.navigate('ChallengeDetail', { challengeSlug });
}, [navigation]);
```

At the top of `renderItem`, return an official row:

```tsx
if (item.type === 'official_post') {
  const challengeSlug = item.metadata?.challenge_slug?.trim();
  return (
    <View style={[styles.card, !item.read && styles.unreadCard]}>
      <View style={styles.avatarContainer}>
        <View style={styles.officialAvatar}>
          <Image source={beervaLogo} style={styles.officialLogo} />
        </View>
      </View>
      <View style={styles.content}>
        <Text style={styles.username}>Official Beerva</Text>
        <Text style={styles.message}>{getOfficialNotificationTitle(item)}</Text>
        <Text style={styles.officialNotificationBody}>{getOfficialNotificationBody(item)}</Text>
        <Text style={styles.time}>{getTimeAgo(item.created_at)}</Text>
        {challengeSlug ? (
          <TouchableOpacity style={styles.hangoverActionButton} onPress={() => openOfficialChallenge(item)}>
            <Text style={styles.hangoverActionText}>View challenge</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.iconContainer}>
        <Megaphone color={colors.primary} size={22} />
      </View>
    </View>
  );
}
```

Guard the ordinary profile action:

```tsx
{item.actor_id ? (
  <TouchableOpacity onPress={() => openProfile(item.actor_id as string)} style={styles.avatarContainer}>
    <CachedImage
      uri={item.profiles?.avatar_url}
      fallbackUri={`https://i.pravatar.cc/150?u=${item.actor_id}`}
      style={styles.avatar}
      recyclingKey={`notification-${item.actor_id}-${item.profiles?.avatar_url || 'fallback'}`}
      accessibilityLabel={`${item.profiles?.username || 'Someone'}'s avatar`}
    />
  </TouchableOpacity>
) : null}
```

Add styles:

```ts
officialAvatar: {
  width: 46,
  height: 46,
  borderRadius: 23,
  borderWidth: 2,
  borderColor: colors.primary,
  backgroundColor: colors.primarySoft,
  alignItems: 'center',
  justifyContent: 'center',
},
officialLogo: {
  width: 30,
  height: 30,
  resizeMode: 'contain',
},
officialNotificationBody: {
  ...typography.caption,
  color: colors.text,
  marginTop: 4,
  lineHeight: 18,
},
```

Add `openOfficialChallenge` to the `renderItem` dependencies.

- [ ] **Step 6: Add startup challenge deep-link routing**

In `src/navigation/RootNavigator.tsx`, import:

```ts
import { ChallengeLaunchParams, getChallengeLaunchParamsFromSearch } from '../lib/challengeLaunchParams';
```

Add:

```ts
const getChallengeLaunchParamsFromUrl = (): ChallengeLaunchParams | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return getChallengeLaunchParamsFromSearch(window.location.search);
};

const clearChallengeLaunchParams = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('challenge');
  url.searchParams.delete('notificationId');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
};

const markNotificationRead = (notificationId?: string | null) => {
  if (!notificationId) return;
  supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .then(({ error }) => {
      if (error) console.warn('Could not mark push-opened notification read', error);
    });
};
```

Add a ref:

```ts
const pendingChallengeOpenRef = useRef<ChallengeLaunchParams | null>(getChallengeLaunchParamsFromUrl());
```

Before the generic notifications branch in the startup routing effect, add:

```ts
const pendingChallengeOpen = pendingChallengeOpenRef.current;
if (pendingChallengeOpen) {
  pendingChallengeOpenRef.current = null;
  navigationRef.navigate('ChallengeDetail', { challengeSlug: pendingChallengeOpen.challengeSlug });
  markNotificationRead(pendingChallengeOpen.notificationId);
  clearChallengeLaunchParams();
  return;
}
```

- [ ] **Step 7: Run focused tests and build**

Run:

```bash
npm run test:official-posts
npm run test:notifications
npm run build:web
```

Expected: all PASS.

- [ ] **Step 8: Commit in-app notifications and deep links**

```bash
git add scripts/officialBeervaPosts.test.js scripts/notifications.test.js src/lib/challengeLaunchParams.ts src/lib/notificationMessages.ts src/screens/NotificationsScreen.tsx src/navigation/RootNavigator.tsx
git commit -m "feat: add official post notification routing"
```

---

### Task 7: Add Official Web Push Suppression, Copy, And Routing

**Files:**
- Modify: `scripts/pushDelivery.test.js`
- Modify: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Add failing push source checks**

Append before the final log in `scripts/pushDelivery.test.js`:

```js
assert.match(sendPushSource, /official_post/, 'push delivery should support official posts');
assert.match(sendPushSource, /push_enabled\s*!==\s*true/, 'official pushes should stop when the admin toggle is off');
assert.match(sendPushSource, /push_title/, 'official pushes should use snapshotted titles');
assert.match(sendPushSource, /push_body/, 'official pushes should use snapshotted bodies');
assert.match(sendPushSource, /challenge=/, 'official challenge pushes should deep-link to challenge detail');
assert.match(sendPushSource, /record\.actor_id\s*\?/, 'system-authored notifications should skip actor profile lookup');
```

- [ ] **Step 2: Run the test to prove official push support is missing**

Run:

```bash
npm run test:push-delivery
```

Expected: FAIL on `push delivery should support official posts`.

- [ ] **Step 3: Extend Edge Function types and suppress disabled pushes**

In `supabase/functions/send-push/index.ts`, change:

```ts
actor_id: string;
```

to:

```ts
actor_id: string | null;
```

Add `'official_post'` to the notification type union.

Add metadata:

```ts
push_enabled?: boolean | null;
push_title?: string | null;
push_body?: string | null;
challenge_slug?: string | null;
```

After assigning `record = storedNotification as NotificationRow;`, add:

```ts
if (record.type === 'official_post' && record.metadata?.push_enabled !== true) {
  return new Response(JSON.stringify({ sent: 0, reason: 'push disabled' }), { status: 200 });
}
```

Change the actor promise inside `Promise.all`:

```ts
record.actor_id
  ? supabase.from('profiles').select('username').eq('id', record.actor_id).maybeSingle()
  : Promise.resolve({ data: null }),
```

- [ ] **Step 4: Add official copy and challenge routing**

Add this copy branch before person-to-person branches:

```ts
if (record.type === 'official_post') {
  title = record.metadata?.push_title?.trim() || 'Official Beerva';
  bodyText = record.metadata?.push_body?.trim() || 'There is a new official Beerva announcement.';
} else if (record.type === 'cheer') {
```

Add this URL branch first:

```ts
if (record.type === 'official_post' && record.metadata?.challenge_slug) {
  url = `/?challenge=${encodeURIComponent(record.metadata.challenge_slug)}&notificationId=${encodeURIComponent(record.id)}`;
} else if (record.type === 'official_post') {
  url = `/?notifications=1&notificationId=${encodeURIComponent(record.id)}`;
} else if (record.type === 'chug_verification' && record.reference_id) {
```

- [ ] **Step 5: Run push and notification tests**

Run:

```bash
npm run test:push-delivery
npm run test:notifications
npm run test:official-posts
```

Expected: all PASS.

- [ ] **Step 6: Commit push support**

```bash
git add scripts/pushDelivery.test.js supabase/functions/send-push/index.ts
git commit -m "feat: deliver official Beerva push notifications"
```

---

### Task 8: Run Full Verification

**Files:**
- Read only unless a verification failure points to a scoped fix.

- [ ] **Step 1: Run focused feature tests**

Run:

```bash
npm run test:official-posts
npm run test:admin-tools
npm run test:challenges
npm run test:notifications
npm run test:push-delivery
```

Expected: all PASS.

- [ ] **Step 2: Run adjacent regression tests**

Run:

```bash
npm run test:pwa-startup
npm run test:drinking-buddies
npm run test:chug-notifications
npm run test:feed-redesign
```

Expected: all PASS.

- [ ] **Step 3: Build the web app**

Run:

```bash
npm run build:web
```

Expected: Expo web export completes successfully.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git status --short
git diff --check
git log --oneline -8
```

Expected: no whitespace errors and no unintended files. `dist/` may change because of the build; only commit deployment artifacts if the repository's current release practice requires them.

---

### Task 9: Deploy And Publish Booze-in-June

**Files:**
- No source changes unless deployment exposes a scoped issue.

- [ ] **Step 1: Apply the linked Supabase migration**

Run:

```bash
npx supabase@2.98.2 db push --linked
```

Expected: `20260601160000_add_official_beerva_posts.sql` is applied successfully.

- [ ] **Step 2: Deploy the updated push function**

Run:

```bash
npx supabase@2.98.2 functions deploy send-push --project-ref yzrfihijpusvjypypnip
```

Expected: Supabase reports a successful `send-push` deployment.

- [ ] **Step 3: Push the verified web code**

Run:

```bash
git push origin master
```

Expected: the Git push succeeds and the connected Vercel deployment rebuilds `https://beerva.vercel.app`.

- [ ] **Step 4: Verify the production shell**

Run:

```bash
curl.exe -I https://beerva.vercel.app
curl.exe -I https://beerva.vercel.app/sw.js
```

Expected: both return successful HTTP responses. `/sw.js` includes cache-busting headers from `vercel.json`.

- [ ] **Step 5: Publish the first official June campaign from Admin tools**

Sign into the production app with the configured admin profile and open:

```text
Profile -> Admin tools -> Official posts -> +
```

Choose the existing `Booze-in-June` challenge. Confirm the editable prefilled copy:

```text
Title:
Booze-in-June has begun

Feed body:
June is here, the taps are flowing, and your liver has been assigned a side quest. Join Booze-in-June, log your beers, and prove your pintsmanship before the month runs dry.

Notification body:
Booze-in-June is live. Tap to join before your first beer starts counting itself lonely.

Push title:
New June challenge

Push body:
Booze-in-June is live. Tap to join before your first beer starts counting itself lonely.
```

Leave the optional photo empty unless the user supplies a campaign image. Enable:

```text
Send in-app notification: ON
Send push notification: ON
```

Press `Publish official post` once.

- [ ] **Step 6: Verify the live campaign**

Check with a non-admin account:

```text
1. Feed shows the Official Beerva announcement.
2. The Join challenge button enrolls the user immediately and changes to Joined.
3. View challenge opens Booze-in-June detail.
4. Notifications shows the Beerva-branded announcement.
5. On a subscribed device, the push title is New June challenge.
6. Tapping the push opens Booze-in-June detail.
```

If a campaign photo was supplied, also verify:

```text
7. The compressed photo appears in the feed card.
8. Pressing the photo opens the existing expanded image viewer.
```
