# Admin Challenges And Beers Design

## Summary

Add a secure admin area for Beerva. The first admin account belongs to `xdrengx@gmail.com`. Admin users can create and edit official challenges, optionally configure a winner trophy for leaderboard challenges, and add or edit ordinary beers directly in the app.

The feature intentionally excludes a general trophy builder, deletion, and archival. Existing built-in beverages remain in client code. Admin-added beers are stored in Supabase and merged into the existing picker at runtime.

## Requirements

- Add a database-backed admin permission.
- Promote the profile associated with `xdrengx@gmail.com` through a migration.
- Never grant admin permission from a client-side email check.
- Add a Profile-screen entry visible only to admins.
- Add a dedicated admin stack screen with `Challenges` and `Beers` tabs.
- Allow admins to create and edit official target and leaderboard challenges.
- Keep challenge scoring limited to existing `true_pints`.
- Publish one official winner feed post after an admin-created leaderboard challenge ends.
- Allow admins to configure an optional persistent winner trophy for leaderboard challenges.
- Preserve existing KarnevalsDruk trophies and finalization behavior.
- Allow admins to create and edit ordinary beers with a name and ABV percentage.
- Merge admin-added beers into the existing recording autocomplete picker.
- Do not rewrite historical session rows when a beer is edited.
- Do not add deletion or archival actions in this version.
- Do not add a general-purpose trophy builder.

## Admin Access

Add `is_admin boolean not null default false` to `public.profiles`.

A migration should update the profile whose authenticated account email is `xdrengx@gmail.com`:

```sql
update public.profiles
set is_admin = true
where id in (
  select id
  from auth.users
  where lower(email) = 'xdrengx@gmail.com'
);
```

The migration grants the initial permission. The app reads `profiles.is_admin` to decide whether to show the admin entry. Every admin write RPC independently checks the authenticated user's profile permission before changing data.

Use a shared database helper such as:

```sql
public.is_current_user_admin()
```

It returns true only when `auth.uid()` belongs to a profile with `is_admin = true`.

Do not expose an in-app flow for granting or revoking admin permission.

## Navigation And UI

### Profile Entry

The current user's Profile screen reads `is_admin` with the profile query. When true, render a compact `Admin tools` row near the profile actions. Regular users do not see this row.

Selecting the row opens a new stack screen:

```text
AdminTools
```

### Admin Screen

The admin screen uses the existing dark Beerva visual language:

- dark background
- raised compact rows
- soft slate borders
- amber primary actions
- muted metadata
- existing typography and spacing tokens

At the top, add a compact segmented control:

```text
Challenges | Beers
```

Each tab renders a compact list and a create action. Selecting an existing row opens the same form populated for editing. Create and edit forms can be modal sheets or focused in-screen forms, following the app's existing compact modal patterns.

The screen must handle:

- initial loading
- empty lists
- inline validation errors
- API errors
- disabled save controls while submitting
- refreshing the relevant list after successful saves

There are no delete buttons and no archive controls.

## Admin-Added Beers

### Data Model

Add `public.admin_beverages`:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `abv numeric not null`
- `created_by uuid not null references auth.users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- case-insensitive unique index on `lower(btrim(name))`
- check constraint: `length(btrim(name)) > 0`
- check constraint: `abv >= 0 and abv <= 100`

These rows represent ordinary beers only. They do not add aliases, locked serving sizes, beverage kinds, or default volumes.

Enable RLS:

- authenticated users can select admin-added beers so all signed-in clients can populate the picker
- direct inserts and updates are not granted to normal clients

### Admin Beer RPCs

Add RPCs:

- `public.get_admin_beverages()`
- `public.admin_save_beverage(target_beverage_id uuid default null, beverage_name text, beverage_abv numeric)`

`admin_save_beverage` is a security-definer function that:

1. Requires `public.is_current_user_admin()`.
2. Trims and validates the name.
3. Validates ABV between `0` and `100`.
4. Inserts when `target_beverage_id` is null.
5. Updates an existing admin-added beer when an id is provided.
6. Returns the saved row.
7. Converts duplicate-name conflicts into a clear error.

Admins cannot edit built-in client-defined beverages from this screen.

### Picker Integration

Keep `BEER_CATALOG` as the built-in catalog. Add a small beverage-catalog API/context layer that loads `get_admin_beverages()` for authenticated users and maps rows into `BeerCatalogItem` objects:

```ts
{
  name,
  abv
}
```

Merge the remote rows with `BEER_CATALOG` for autocomplete options and lookup helpers. Built-in rows take precedence on a case-insensitive name collision as a defensive fallback, although the admin form should reject collisions against built-in names before save.

The recording and editing forms use the merged catalog:

- admin beers appear in autocomplete
- admin beers use normal selectable sizes
- quantity controls work normally
- submitted session rows use the admin-defined ABV

Editing a catalog row affects future selection behavior only. Existing `sessions` and `session_beers` history remains unchanged.

If admin-beverage loading fails, built-in drinks still work and the picker remains usable.

## Admin-Created Challenges

### Existing Model

Reuse `public.challenges`, `public.challenge_entries`, existing leaderboard calculations, the challenge list, and challenge detail screens.

All admin-created challenges use:

```text
metric_type = true_pints
```

Supported challenge types remain:

- `target`
- `leaderboard`

### Admin Challenge Form

The form includes:

- title
- description
- type: `Target` or `Leaderboard`
- start date and time
- end date and time
- joining closes date and time
- target true pints, visible only for target challenges
- enable winner trophy toggle, visible only for leaderboard challenges
- winner trophy title, visible and required only when the toggle is enabled
- winner trophy description, visible and required only when the toggle is enabled

Dates and times should be entered in the device's local timezone and converted to ISO timestamps before saving. The UI should make the chosen local values visible while editing.

Slug creation is automatic. New challenges receive a stable slug derived from the title plus a short unique suffix. Editing a challenge does not change its slug.

### Admin Challenge RPCs

Add RPCs:

- `public.admin_get_challenges()`
- `public.admin_save_challenge(...)`

`admin_save_challenge` is a security-definer function that:

1. Requires `public.is_current_user_admin()`.
2. Trims and validates title and description.
3. Allows only `target` or `leaderboard`.
4. Always writes `metric_type = 'true_pints'`.
5. Requires `starts_at < ends_at`.
6. Requires `starts_at <= join_closes_at <= ends_at`.
7. Requires `target_value > 0` for target challenges.
8. Writes `target_value = null` for leaderboard challenges.
9. Inserts a generated slug for new rows.
10. Keeps the existing slug when editing.
11. Accepts optional leaderboard winner trophy configuration.
12. Rejects winner trophy configuration for target challenges.
13. Requires non-empty winner trophy title and description when a leaderboard winner trophy is enabled.
14. Clears winner trophy title and description when a leaderboard winner trophy is disabled.
15. Returns the saved row.

Do not permit changing a finalized challenge. To keep joined competitions predictable, do not permit changing type, time windows, or winner trophy configuration after a challenge has entrants. Challenge title and description may still be corrected.

### Configurable Winner Trophy

Add nullable winner trophy configuration to `public.challenges`:

- `winner_trophy_enabled boolean not null default false`
- `winner_trophy_title text`
- `winner_trophy_description text`

Use constraints so:

- target challenges always have `winner_trophy_enabled = false`
- enabled leaderboard trophies require non-empty trimmed title and description
- disabled trophies store null title and description

Leaderboard trophy configuration is optional. A leaderboard challenge without a configured trophy still publishes its winner announcement. A configured trophy uses the existing standard challenge trophy icon automatically; there is no image upload or icon picker.

### List And Detail Behavior

Existing challenge list and detail behavior continues to work:

- target challenges show progress toward the configured true-pint target
- leaderboard challenges show rank and total true pints
- users join through the existing join RPC
- progress remains retroactive within the configured time window
- hidden pub crawl child sessions continue to count

## Leaderboard Finalization

Admin-created leaderboard challenges publish an official winner announcement after ending. They award one persistent challenge trophy only when the admin enabled and configured that optional reward before entrants joined.

The existing KarnevalsDruk flow has special dual-trophy behavior and must remain intact. Extend finalization with a separate generic path for leaderboard challenges whose slug is not `karnevalsdruk-2026`.

For each ended, unfinalized generic leaderboard challenge:

1. Load the existing challenge leaderboard.
2. Select rank one.
3. If no entrant has progress greater than `0`, mark the challenge finalized without a post.
4. Compute the winning summary using the existing challenge window:
   - true pints
   - drink count
   - average ABV
   - session count
5. Insert one `official_feed_posts` row with conflict protection.
6. If the challenge has an enabled winner trophy, insert one `challenge_awards` row for the winner with conflict protection.
7. Store `finalized_at`, `winner_user_id`, and `winner_progress_value`.

The post should use:

- `kind = 'challenge_winner'`
- title based on the challenge title, such as `Winner of Summer Sprint`
- body naming the winner and true-pint result
- metadata compatible with the existing `OfficialFeedPostCard`
- metadata including `challenge_slug`

Finalization must be idempotent. Repeated scheduled runs cannot duplicate posts. Existing scheduled finalization should invoke both the KarnevalsDruk-specific path and the generic path.

For a configured generic trophy:

- derive a stable `award_slug` from the challenge slug, such as `{challenge_slug}-winner`
- use the configured winner trophy title and description
- set `rank = 1`
- set `progress_value` to the winning true-pint total
- include `challenge_slug` in metadata
- render it through the existing `challenge_awards` fetch and Trophy Cabinet merge

KarnevalsDruk remains on its existing special finalization path and retains its dual trophies.

## Client Modules

Add focused client modules:

- `src/lib/adminApi.ts`
- `src/lib/adminBeveragesApi.ts` or a combined admin API if it stays small
- `src/lib/beverageCatalogContext.tsx`
- `src/screens/AdminToolsScreen.tsx`

Update:

- `src/navigation/RootNavigator.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/components/BeerDraftForm.tsx`
- `src/lib/sessionBeers.ts`

Keep the catalog lookup utilities testable as pure functions by accepting an optional remote beverage list or merged catalog rather than coupling all behavior directly to React state.

## Error Handling

- Non-admin RPC calls fail with a clear permission error.
- Duplicate admin beer names fail with a concise validation message.
- Admin beers cannot collide with built-in catalog names.
- Invalid challenge windows fail before insertion.
- Leaderboard challenges ignore target input and store null.
- Target challenges require a positive target.
- Finalized challenges reject edits.
- Challenges with entrants reject type, time-window, and trophy-configuration edits.
- Remote beverage loading failure falls back to built-in drinks.
- Generic finalization with no positive-progress winner stores a finalized no-winner state without posting.

## Testing

Add focused source-level and helper tests for:

- migration adds `profiles.is_admin`
- migration promotes `xdrengx@gmail.com`
- shared admin helper checks `auth.uid()` and `profiles.is_admin`
- admin beer table has validation and case-insensitive uniqueness
- non-admin beer and challenge writes are rejected
- beer create and edit RPCs validate name and ABV
- built-in and admin-added beers merge into one picker catalog
- admin beer lookup returns the stored ABV
- built-in picker fallback still works when remote loading fails
- challenge create and edit RPCs support target and leaderboard types
- target challenges require positive targets
- leaderboard challenges store a null target
- challenge windows are validated
- finalized challenges reject edits
- competitions with entrants reject type and window changes
- target challenges reject winner trophy configuration
- optional leaderboard trophy configuration requires non-empty title and description
- competitions with entrants reject trophy-configuration changes
- generic leaderboard finalization publishes one official post idempotently
- no-positive-progress generic leaderboard finalization creates no post
- generic finalization inserts one configured winner trophy idempotently
- generic finalization creates no trophy when the optional reward is disabled
- generic challenge trophies render through the existing Trophy Cabinet merge
- KarnevalsDruk trophy behavior remains unchanged
- Profile conditionally exposes `Admin tools`
- navigator registers `AdminTools`
- admin screen contains `Challenges | Beers`
- `npm run build:web` succeeds

Run existing focused tests, especially:

- `npm run test:session-beers`
- `npm run test:challenges`
- `npm run test:stats`
- `npm run test:record-session-drinks`
- `npm run test:app-theme-screens`
- `npm run build:web`

## Non-Goals

- No general-purpose trophy builder.
- No automatic trophy rule builder.
- No target-challenge completion trophies.
- No custom trophy icons or trophy image uploads.
- No beer deletion.
- No challenge deletion.
- No archival controls.
- No alias management.
- No custom serving-size defaults.
- No RTD, wine, or cocktail creation from the admin form.
- No additional challenge metrics.
- No in-app admin promotion or demotion.
- No historical session rewriting after beer edits.
