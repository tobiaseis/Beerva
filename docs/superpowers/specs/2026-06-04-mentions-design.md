# Beerva Mentions Design

## Goal

Add Instagram-style mentions to Beerva comments and post captions. A signed-in user can type `@`, search people by username, choose a suggestion, and notify the selected people when the comment or post is submitted.

## Current Context

Beerva feed posts are currently session posts and pub crawl posts. Session post captions live in `sessions.comment`; pub crawl visible captions come from each stop session's `comment`. Comments are stored separately in `session_comments` and `pub_crawl_comments`. Existing comment, cheer, buddy, and official-post notifications all flow through `public.notifications`; push delivery already runs from notification inserts and opens typed post targets through `postTargets`.

Usernames are display names, not strict handles. They can include spaces, so the feature cannot safely rely on plain text parsing alone.

## User Experience

In comment composers and post caption fields, typing `@` plus at least one character opens a compact people picker above the input. Results show avatar and username from `profiles`, exclude the current user, and return at most eight matches. Selecting a person inserts `@Username` into the text and records that user's id in the draft mention state.

Only selected autocomplete entries create notifications. Free-typed text that looks like a mention remains normal text. Before submit, the client drops any selected mention whose inserted `@Username` text has been removed from the final text.

Mentions should work in:

- Feed comment modal for session posts and pub crawl posts.
- Post detail comment composer for session posts and pub crawl posts.
- Record screen session caption/comment field, notifying only when the session is published.
- Pub crawl stop captions where those captions are published into the feed.

Mentioned text should be styled as a mention where Beerva has persisted mention metadata. Tapping a styled mention opens that user's profile. Plain unselected `@text` remains plain text.

## Data Model

Add a migration that:

- Adds `mention` to the `notifications_type_check` constraint.
- Creates `public.content_mentions`.
- Adds indexes for mentioned-user inbox lookups and target/source hydration.
- Enables RLS on `content_mentions`; clients read visible mention metadata through normal policies but create mention rows only through a security-definer RPC.

`content_mentions` stores:

- `id uuid primary key`
- `mentioned_user_id uuid not null references auth.users(id) on delete cascade`
- `actor_id uuid not null references auth.users(id) on delete cascade`
- `target_type text not null check (target_type in ('session', 'pub_crawl'))`
- `target_id uuid not null`
- `surface text not null check (surface in ('post', 'comment'))`
- `source_id uuid not null`
- `mention_label text not null`
- `created_at timestamptz not null default now()`

Use a unique constraint on `(mentioned_user_id, surface, source_id)` so retries and duplicated `@Username` text produce one mention notification per person per source.

## Server Flow

Add a security-definer database function that accepts the target type, target id, surface, source id, and selected mention candidates. The function verifies:

- The caller is authenticated.
- The caller owns the source post/comment being mentioned from.
- Mentioned users exist and are not the actor.
- The source text still contains the selected mention label.
- At most 10 mentions are created per source.

For each inserted mention row, insert one `notifications` row with:

- `user_id = mentioned_user_id`
- `actor_id = auth.uid()`
- `type = 'mention'`
- `reference_id = target_id`
- `metadata.target_type = target_type`
- `metadata.surface = surface`
- `metadata.mention_id = content_mentions.id`

When a comment already notifies the post owner through the existing `comment` notification, skip an extra mention notification for that same owner and source. This prevents double notifications while preserving mention notifications for everyone else.

## Client Architecture

Add a small mention module under `src/lib`:

- Find the active mention query around the cursor.
- Insert a selected mention into text.
- Track selected mention candidates by user id and label.
- Dedupe candidates and discard stale candidates before submit.
- Search profiles through Supabase with a debounced query and a result limit.

Add a reusable mention composer component under `src/components` that wraps React Native `TextInput`, renders the suggestion list, and exposes the same controlled `value`/`onChangeText` shape current screens use.

Add a mention notification helper that calls the database function after a successful post/comment write. Existing optimistic UI updates should not wait on mention notifications; failures should be logged and should not make the comment/post appear failed after the content has saved.

## Notification Display And Push

Update notification rendering so `mention` rows show copy like:

- Comment: `<actor> mentioned you in a comment.`
- Post caption: `<actor> mentioned you in a post.`

Mention notifications open the same post detail route used by comment notifications, using `metadata.target_type` and `reference_id`.

Update the `send-push` edge function to support `mention` with a push title such as `New mention` and a body based on the surface.

## Error Handling

Mention search failures should silently collapse the suggestion list or show an empty state inside the picker; they should not block typing.

Mention notification failures after content creation should be logged and otherwise non-blocking.

If a selected user changes their username before submit, the original inserted label is used to validate the text, while the notification still targets the stable user id.

## Testing

Add focused tests for:

- Mention trigger detection, insertion, stale-candidate cleanup, and dedupe.
- Migration shape: `mention` notification type, `content_mentions`, uniqueness, indexes, and RPC security checks.
- Feed and post-detail composers use the mention composer.
- Record screen posts call mention notification only when publishing, not while autosaving an active session caption.
- Notification message, notification screen routing, and push delivery support `mention`.

## Non-Goals

This feature does not introduce strict username handles or require users to rename existing profiles. It does not notify people for free-typed `@text` that was never selected from autocomplete. It does not change existing comment or post storage columns.
