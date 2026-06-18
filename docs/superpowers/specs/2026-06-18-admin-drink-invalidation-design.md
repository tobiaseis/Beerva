# Admin Drink Invalidation Design

## Goal

Allow admins to quietly mark suspicious individual drink entries as invalid when a user logs unrealistic amounts, oversized drinks, or otherwise cheating-looking data.

Invalidated drinks stay visible in the app, but they stop contributing to stats, trophies, and challenge progress. Admins can restore the drink later if the user edits it back to a believable amount.

## User Experience

### Normal Users

Invalidated drinks remain visible in feed and session views. Beside the suspicious drink, show a tiny inline `🕵️` badge or `🕵️ Ignored` label, styled as a subtle secondary chip that sits with the drink metadata.

The badge should feel clean and integrated:

- Small text size, muted color, no warning colors.
- Inline with the drink row metadata, not a large banner.
- No notification or explicit warning is sent to the user.
- No public accusation copy such as "cheating" or "fraud".

### Admins

Add an admin moderation surface in the existing Admin Tools area. Admins can:

- Search or select a user.
- Review that user's recent drink rows, including beer name, volume, quantity, ABV, session/pub, and logged time.
- Mark one drink as ignored.
- Restore an ignored drink.
- Optionally leave a private admin reason/note.

The action labels should be calm and operational:

- `Ignore in stats`
- `Restore to stats`

Avoid user-facing warning language.

## Data Model

Add moderation metadata to `public.session_beers`:

- `excluded_from_stats boolean not null default false`
- `excluded_from_stats_at timestamp with time zone`
- `excluded_from_stats_by uuid references auth.users(id) on delete set null`
- `excluded_from_stats_reason text`

The user can still edit the drink after it is marked. Editing does not automatically restore the drink. An admin must explicitly restore it after reviewing the edited values.

## Backend Behavior

Create admin RPCs:

- `admin_get_user_drinks(...)`: returns recent drinks with user/profile/session context and exclusion metadata.
- `admin_set_session_beer_excluded(target_session_beer_id uuid, excluded boolean, reason text default null)`: toggles the exclusion fields. Only admins can execute it.

All existing public/client queries that display drink rows should continue returning excluded rows so the drink remains visible.

All stats and competition calculations must ignore excluded rows by adding:

```sql
coalesce(session_beers.excluded_from_stats, false) = false
```

to rollups that calculate profile stats, trophies, challenge progress, and leaderboard progress.

## Calculations To Update

The exclusion must apply to these calculation families:

- Profile stat RPCs, especially `get_profile_stats`.
- Client-side trophy eligibility fed by profile stats.
- Challenge leaderboard/progress RPCs.
- Challenge finalizers that award persistent challenge trophies.
- Session/unit feed rollups where values are used as stats rather than display-only drink rows.
- Live mate true-pint totals if those totals are treated as stats.

Display-only session/feed queries should still include excluded drinks so users can see what they logged.

## Trophy And Award Handling

Computed profile trophies naturally change when profile stats ignore excluded drinks.

Persistent challenge awards are different because they are stored rows. For this first implementation:

- Challenge leaderboards and future finalizers ignore excluded drinks.
- If an already-finalized challenge result is affected, admins should rerun or repair the affected challenge finalization through a dedicated admin repair action or SQL migration.
- The implementation should not silently delete existing `challenge_awards` rows without an explicit admin action.

## UI Details

The badge should use the Unicode detective emoji `🕵️`; on iOS this will render as the iOS detective emoji. It should sit next to the suspicious drink row, for example:

```text
10 x 1L Beer - 5.0% ABV  🕵️
```

Admin-only views may show more detail:

```text
Ignored in stats by admin
```

Normal user views should stay minimal.

## Error Handling And Permissions

- Only admins can mark or restore drink exclusions.
- If the target drink does not exist, return `Drink not found.`
- If the current user is not admin, return `Admin access required.`
- Restoring a drink clears `excluded_from_stats_at`, `excluded_from_stats_by`, and `excluded_from_stats_reason`.

## Testing

Add regression coverage for:

- Migration adds session beer exclusion columns and admin RPCs.
- Admin RPCs require admin access.
- Profile stats ignore excluded drinks.
- Challenge progress ignores excluded drinks.
- Display queries still include excluded drinks.
- Client mappers carry exclusion metadata.
- Feed/session drink rows render the small `🕵️` indicator.
- Admin tools can toggle ignored/restored state.

## Non-Goals

- No automatic cheating detection in the first version.
- No user warning or push notification.
- No account suspension.
- No automatic challenge-award deletion without explicit admin repair.
