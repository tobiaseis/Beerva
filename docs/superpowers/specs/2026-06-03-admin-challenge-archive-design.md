# Admin Challenge Archive Design

## Summary

Add an admin-only archive flow for old official challenges. Archiving removes a challenge from the normal app experience without deleting challenge history, entries, awards, winner posts, or linked announcement metadata. Admins can still see archived challenges in Admin Tools and restore them if needed.

This feature intentionally avoids hard deletion. Challenge deletion can cascade into entries and awards or disconnect feed history, so the first admin removal tool should be reversible and history-preserving.

## Requirements

- Allow admins to remove old challenges from the user-facing app.
- Preserve historical challenge data, entries, awards, and official posts.
- Keep archived challenges visible to admins.
- Allow admins to restore archived challenges.
- Prevent non-admin callers from archiving or restoring challenges.
- Hide archived challenges from normal challenge lists, challenge detail loading, joining, and scheduled finalization.
- Use existing admin tooling patterns, RPC security, timeout handling, and confirmation dialogs.
- Add focused regression tests for database behavior, client API wrappers, and the admin UI surface.

## Non-Goals

- No hard-delete challenge action.
- No archive flow for beers or official posts.
- No bulk archive controls.
- No automatic archive job.
- No in-app admin permission management.
- No changes to historical session scoring, awards rendering, or official feed post rendering beyond hiding archived challenges from challenge discovery.

## Current Context

Official challenges live in `public.challenges`. Admin challenge management currently uses `admin_get_challenges()` and `admin_save_challenge(...)`. Existing relations already preserve or detach data in different ways:

- `challenge_entries` references challenges with `on delete cascade`.
- `challenge_awards` references challenges with `on delete cascade`.
- `official_feed_posts.challenge_id` references challenges with `on delete set null`.
- `official_feed_posts.linked_challenge_id` references challenges with `on delete set null`.

Because hard deletion would erase some challenge-related records and detach others, archive is the safer default for admin removal.

## Data Model

Add archive metadata to `public.challenges`:

```sql
alter table public.challenges
  add column if not exists archived_at timestamp with time zone,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;
```

Add an index for the common public challenge queries:

```sql
create index if not exists challenges_unarchived_window_idx
  on public.challenges(starts_at desc, ends_at desc)
  where archived_at is null;
```

`archived_at is null` means visible in the normal app. `archived_at is not null` means hidden from normal app challenge surfaces but retained for admins and history.

## Admin RPCs

Add two security-definer RPCs:

```sql
public.admin_archive_challenge(target_challenge_id uuid)
public.admin_restore_challenge(target_challenge_id uuid)
```

Both functions:

- require `public.is_current_user_admin()`
- lock the target challenge row before changing it
- return the updated `public.challenges` row
- raise `Admin access required.` for non-admin callers
- raise `Challenge not found.` for unknown ids

`admin_archive_challenge`:

- requires the challenge to have ended: `ends_at <= now()`
- sets `archived_at = now()` and `archived_by = auth.uid()`
- is idempotent for already archived rows by returning the existing archived row
- raises `Only ended challenges can be archived.` for active or upcoming challenges

`admin_restore_challenge`:

- clears `archived_at` and `archived_by`
- is idempotent for already visible rows by returning the existing row

## Public Challenge Behavior

Archived challenges are hidden from normal app challenge APIs:

- `get_official_challenges()` only returns rows where `archived_at is null`.
- `get_challenge_detail(text)` only resolves rows where `archived_at is null`.
- `join_challenge(uuid)` only joins rows where `archived_at is null`.
- `get_challenge_leaderboard(uuid)` should not expose archived challenges through direct calls.
- `get_local_challenge_leaderboard(uuid)` inherits the same archived behavior through the global leaderboard function.
- `finalize_generic_due_challenges(integer)` and `finalize_due_challenges(integer)` skip archived challenges.

Admin APIs still see archived rows:

- `admin_get_challenges()` returns both visible and archived challenges.
- Admin rows include `archived_at` and `archived_by` so the client can show status and available actions.

## RLS And Grants

Update the authenticated select policy on `public.challenges` so regular signed-in users can only select unarchived rows:

```sql
using (archived_at is null)
```

Admin read access remains available through `admin_get_challenges()`, which already checks `is_current_user_admin()`.

Revoke public and anon execution from the new RPCs and grant execution to authenticated users. The RPCs themselves enforce admin permission.

## Client API

Extend `src/lib/adminApi.ts`:

- add `archived_at` and `archived_by` to `AdminChallengeRow`
- add `archivedAt` and `archivedBy` to `AdminChallenge`
- add `archiveAdminChallenge(challengeId: string)`
- add `restoreAdminChallenge(challengeId: string)`

Both wrappers use the same admin timeout and error-message pattern as `saveAdminChallenge`.

## Admin UI

Update `AdminToolsScreen` challenge rows:

- show archived challenges with an `Archived` accent line or status copy
- keep the list ordered by start date as it is today unless the implementation needs archived rows grouped last

Update the challenge modal:

- for unarchived ended challenges, show a danger action labeled `Archive Challenge`
- for archived challenges, show a secondary action labeled `Restore Challenge`
- do not show archive for active or upcoming challenges
- do not show any hard-delete action
- use `confirmDestructive('Archive Challenge', ..., 'Archive', ...)` before archiving
- refresh the challenge list after archive or restore
- close the modal after a successful archive or restore

Saving remains separate from archiving. A finalized or joined challenge may still be archived even if it cannot be edited.

## Error Handling

- Non-admin archive/restore attempts show the existing admin API error path.
- Unknown challenge ids show `Challenge not found.`
- Active or upcoming archive attempts show `Only ended challenges can be archived.`
- Network or timeout failures use existing admin timeout copy.
- If archiving succeeds but the refresh fails, the modal closes and the next manual refresh can reconcile the list.

## Testing

Update `scripts/adminTools.test.js` to assert:

- a new archive migration exists
- `challenges.archived_at` and `challenges.archived_by` are added
- `admin_archive_challenge` and `admin_restore_challenge` exist
- archive and restore RPC grants are restricted like other admin RPCs
- public challenge RPCs filter `archived_at is null`
- `join_challenge` rejects archived rows
- finalization skips archived challenges
- `AdminChallenge` maps archive metadata
- `archiveAdminChallenge` and `restoreAdminChallenge` call the expected RPCs
- `AdminToolsScreen` contains `Archive Challenge` and `Restore Challenge`
- `AdminToolsScreen` does not contain `Delete challenge`

Run focused verification:

```powershell
npm run test:admin-tools
npm run test:challenges
npm run build:web
```

## Deployment

The new migration must be applied to Supabase before the deployed app can archive or restore challenges. Existing archived state starts empty because all current challenge rows have `archived_at = null` after the migration.
