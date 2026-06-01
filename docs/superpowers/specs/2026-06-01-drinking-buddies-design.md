# Drinking Buddies Design

## Summary

Add drinking buddies to Beerva sessions so a user can tag the mutual mates they are drinking with. Tagged mates appear on the finished post under More stats and receive a notification. They do not need to verify the tag; they only act if they were not actually drinking with the poster.

## Goals

- Let a session owner add mutual mates as drinking buddies while recording a session.
- Let a session owner edit drinking buddies later from the session edit screen.
- Show active buddies on feed and post detail cards under More stats.
- Notify each newly added buddy.
- Let a tagged buddy remove themselves with a "Not with me" action.
- Prevent repeated tagging of someone who has already declined that same session.

## Non-Goals

- No buddy approval flow.
- No automatic co-owned sessions or shared drink totals.
- No tagging users outside mutual mate relationships.
- No notification when a session owner removes a buddy.
- No pub crawl buddy support in this first pass.

## Data Model

Create `public.session_buddies`.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `session_id uuid not null references public.sessions(id) on delete cascade`
- `buddy_user_id uuid not null references auth.users(id) on delete cascade`
- `added_by_user_id uuid not null references auth.users(id) on delete cascade`
- `status text not null default 'active'`
- `created_at timestamp with time zone not null default now()`
- `responded_at timestamp with time zone`

Constraints and indexes:

- `status in ('active', 'removed', 'declined')`
- `buddy_user_id <> added_by_user_id`
- Unique `(session_id, buddy_user_id)`
- Index `(session_id, status)`
- Index `(buddy_user_id, status, created_at desc)`
- Index `(added_by_user_id, created_at desc)`

Status meanings:

- `active`: visible on the post.
- `removed`: removed by the session owner and hidden from the post.
- `declined`: rejected by the tagged buddy and hidden from the post.

Declined rows are kept so the same mate cannot be re-added to the same session after using "Not with me".

## Security

Use RLS and RPCs to keep the trust boundary in the database.

Selection rules:

- The current user can only add buddies to sessions they own.
- The buddy must be a mutual mate with the session owner.
- The session owner cannot add themselves.
- A declined buddy row cannot be reactivated.

Visibility rules:

- Authenticated users can read active buddies attached to published sessions they can see.
- Session owners can read all buddy statuses for their own sessions.
- Tagged buddies can read their own rows.

Mutation rules:

- Session owners can add buddies through an RPC.
- Session owners can mark active buddies as `removed`.
- Tagged buddies can mark their own active row as `declined`.

RPCs:

- `set_session_buddies(target_session_id uuid, buddy_user_ids uuid[])`
  - Reconciles the owner's active/removed buddy rows for the session.
  - Adds new active rows only for mutual mates.
  - Reactivates `removed` rows when the owner adds that buddy again.
  - Marks missing active rows as `removed`.
  - Does not reactivate declined rows.
  - Creates `drinking_buddy_added` notifications for newly active buddies.
- `decline_session_buddy(target_session_buddy_id uuid)`
  - Lets the tagged buddy mark their row `declined` and sets `responded_at`.
- `get_session_buddy_summaries(session_ids uuid[])`
  - Returns active buddies plus profile data for feed/detail hydration.

## Recording Flow

In `RecordScreen`, add a Drinking buddies section in the active session flow near Post Details.

The control shows:

- Existing selected buddies as chips with avatars or initials.
- A button labeled `Add your drinking buddies`.
- A searchable sheet/modal containing only mutual mates.

Selection autosaves to the active session through `set_session_buddies`, so leaving and reopening the screen preserves buddy choices.

If a selected person is no longer a mutual mate by save time, the server rejects that buddy, the UI refreshes the mutual mate list, and the user sees a small error alert.

## Edit Flow

In `EditSessionScreen`, show the same Drinking buddies control for the post owner.

Behavior:

- Newly added buddies on an already published post receive `drinking_buddy_added` notifications immediately.
- Removed buddies disappear from the post.
- Removed buddies are not notified.
- Buddies who already declined cannot be re-added to the same session.

The shared control should be extracted out of `RecordScreen` and reused by both screens.

## Feed And Post Detail

Hydrate active buddies for normal session posts in:

- `FeedScreen`
- `PostDetailScreen`

Add buddy data to `FeedSession`.

When buddies exist, the expanded More stats panel shows:

- `Drinking buddies: Beist and Tubpac`
- For longer lists: `Drinking buddies: Beist, Tubpac +2`

Buddy names should come from `profiles.username`, falling back to `Someone`.

## Notifications

Add notification type `drinking_buddy_added`.

Message copy:

- In-app: ` added you as a drinking buddy.`
- Push title: `Drinking buddy`
- Push body: `{actorName} added you as a drinking buddy`

Notification metadata:

- `target_type: 'session'`
- `session_id`
- `pub_name`

Notifications created while a session is still active open the notifications screen, where the `Not with me` action is available. Notifications created for already-published sessions open the referenced post.

In `NotificationsScreen`, show a `Not with me` action for active buddy notifications where the current user is the buddy. Pressing it calls `decline_session_buddy`.

After decline, the notification row can remain, but the UI should show `Removed from this session` instead of the action.

## Error Handling

- If buddy save fails, keep the previous client selection and show an alert.
- If notification creation fails after buddy rows are saved, log the error and keep the buddy rows.
- If a declined buddy still appears in a stale feed item, a refresh removes them.
- If the post is deleted, buddy rows cascade with the session.

## Testing

Follow TDD during implementation.

Add tests for:

- Migration creates `session_buddies`, indexes, constraints, RLS, RPCs, and notification type.
- RPC shape enforces mutual mates, owner-only edits, no self-tagging, no declined reactivation, and buddy self-decline.
- Notification message helper returns drinking buddy copy.
- Push function supports `drinking_buddy_added`, opens active-session notifications in the notifications screen, and opens published-session notifications on the post.
- `RecordScreen` includes the shared buddy picker and the exact button label `Add your drinking buddies`.
- `EditSessionScreen` includes the same buddy editing control.
- Feed and post detail fetch/render buddy summaries and display `Drinking buddies`.

## Open Decisions

None. The approved behavior is mutual mates only, visible-by-default tagging, opt-out decline, editable from both recording and edit screens, and declined buddies cannot be re-added to the same session.
