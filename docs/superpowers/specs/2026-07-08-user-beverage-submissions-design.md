# User Beverage Submissions Design

## Goal

Let users record beers, wines, and drinks that are not already in the Beerva catalog without choosing a random substitute. The typed drink appears on their active session and final post immediately. Admins then approve or reject the submitted catalog entry.

Approved submissions become normal catalog beverages for future users. Rejected submissions keep the original drink name visible on the post, but the recorded ABV falls back to a category default so stats and challenge math no longer depend on an unapproved ABV.

## Requirements

- Detect when a user is adding a drink name that does not match the built-in catalog or approved admin beverages.
- Let the user submit a new beverage with name, category, ABV, serving size, and quantity from the record/edit flow.
- Save the drink to `public.session_beers` immediately so the session/post is accurate from the user's perspective.
- Create a pending admin-review row linked to the submitted session drink.
- Notify admins when a new beverage submission is created.
- Add an admin approval queue inside the existing Admin Tools area.
- On approval, insert the beverage into `public.admin_beverages` and refresh the catalog.
- On rejection, keep the session drink name visible but reset that session drink ABV to the category default:
  - beer: `5`
  - drink: `5`
  - wine: `12`
- Keep rejected submissions out of the approved catalog.
- Avoid deleting user post history as part of rejection.

## Existing Context

Beerva already has:

- a built-in `BEER_CATALOG` in `src/lib/sessionBeers.ts`
- database-backed approved beverages in `public.admin_beverages`
- `BeverageCatalogProvider`, which merges approved admin beverages into the runtime catalog
- `BeerDraftForm`, used by record and edit flows
- `public.session_beers`, which stores the exact name, serving, quantity, ABV, and category captured for a session
- admin-only RPC patterns guarded by `public.is_current_user_admin()`
- an Admin Tools screen with `Beverages` and `Moderation` segments
- a `notifications` table that can carry metadata and update the unread count in realtime

The design should extend these surfaces instead of creating a parallel catalog or separate moderation app.

## Data Model

Add a new table:

```sql
create table public.beverage_submissions (
  id uuid primary key default gen_random_uuid(),
  session_beer_id uuid references public.session_beers(id) on delete set null,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  abv numeric not null,
  category text not null,
  status text not null default 'pending',
  resolved_admin_beverage_id uuid references public.admin_beverages(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
```

Constraints:

- `name` must trim to non-empty.
- `abv` must be between `0` and `100`.
- `category` must be one of `beer`, `wine`, or `drink`.
- `status` must be one of `pending`, `approved`, or `rejected`.
- Create a partial unique index on `(lower(btrim(name)), category)` where `status = 'pending'` to prevent duplicate pending queue spam for the same beverage/category pair.

Add submission linkage to `public.session_beers`:

```sql
alter table public.session_beers
  add column if not exists beverage_submission_id uuid references public.beverage_submissions(id) on delete set null,
  add column if not exists beverage_submission_status text;
```

`beverage_submission_status` is a denormalized display/status snapshot for the session drink. It should use the same status values as `beverage_submissions.status` and remain nullable for ordinary catalog drinks.

## Permissions

Users can create submissions only for their own session drinks.

Users should be able to read their own submissions so the app can explain pending/rejected status on their own active session or post edit screen. Regular users do not need to read the global submission queue.

Admins can list, approve, and reject all submissions through security-definer RPCs. Direct table writes from the client should stay limited.

## User Recording Flow

The existing autocomplete should keep working for known catalog beverages.

When the typed drink name does not match the merged catalog:

1. Show an inline "Add as new drink" path in `BeerDraftForm`.
2. Require the user to choose category: `Beer`, `Wine`, or `Drink`.
3. Require ABV before submit.
4. Keep the existing serving-size and quantity controls.
5. Save the drink row with the submitted name, selected category, submitted ABV, serving size, and quantity.
6. Create or attach a pending beverage submission.
7. Show short success copy that the drink was added and is waiting for admin approval.

The post should show the drink name normally. Show a subtle status chip only in owner/admin contexts: the active session drink list, the edit-post drink list, and the admin queue. Public feed cards should not show a warning banner. Public history must remain readable as the drink the user logged.

## Backend RPCs

Create user-facing RPC:

```text
submit_session_beverage(
  target_session_id uuid,
  beverage_name text,
  beverage_abv numeric,
  beverage_category text,
  beverage_volume text,
  beverage_quantity integer,
  consumed_at timestamp with time zone default now()
)
```

The RPC should:

1. Require an authenticated user.
2. Verify the target session belongs to the user and is editable.
3. Validate name, ABV, category, volume, and quantity.
4. Insert a `session_beers` row.
5. Insert a `beverage_submissions` row or reuse an existing pending row with the same normalized name/category.
6. Link the session drink to the submission.
7. Notify admins.
8. Return the inserted session drink row including submission fields.

Admin RPCs:

```text
admin_get_beverage_submissions(status_filter text default 'pending', result_limit integer default 100)
admin_approve_beverage_submission(target_submission_id uuid)
admin_reject_beverage_submission(target_submission_id uuid, rejection_reason text default null)
```

All admin RPCs require `public.is_current_user_admin()`.

`admin_approve_beverage_submission` should:

1. Lock the submission row.
2. Reject non-pending rows with a clear message.
3. Insert into `public.admin_beverages` with submission name, ABV, and category, or reuse an existing approved beverage with the same normalized name.
4. Mark the submission `approved`.
5. Set `resolved_admin_beverage_id`, `reviewed_by`, `reviewed_at`, and `updated_at`.
6. Update linked `session_beers.beverage_submission_status` to `approved`.
7. Return the updated submission.

`admin_reject_beverage_submission` should:

1. Lock the submission row.
2. Reject non-pending rows with a clear message.
3. Compute fallback ABV from the submission category:
   - beer -> `5`
   - drink -> `5`
   - wine -> `12`
4. Update linked `session_beers` rows so `beer_name` stays unchanged, `abv` becomes the fallback, and `beverage_submission_status` becomes `rejected`.
5. Mark the submission `rejected`.
6. Set `reviewed_by`, `reviewed_at`, optional `rejection_reason`, and `updated_at`.
7. Return the updated submission.

## Admin Notifications

When a user creates a pending submission, create an in-app notification for every admin profile:

- `type`: `beverage_submission`
- `actor_id`: submitting user
- `reference_id`: submission id
- `metadata`: name, category, ABV, session id, session beer id

Extend `notifications_type_check` to include `beverage_submission`.

The notification should route admins to Admin Tools with the submissions queue selected by passing an `initialSegment: 'submissions'` navigation param.

No notification is needed for normal users when a submission is approved or rejected. The resulting post/session state is the source of truth.

## Admin UI

Add a new Admin Tools segment named `Submissions`, separate from the approved `Beverages` catalog segment:

```text
Challenges | Beverages | Submissions | Official posts | Moderation
```

The submissions segment shows pending rows first, with:

- submitted name
- ABV and category
- submitting username
- session/pub context if available
- submitted timestamp
- approve action
- reject action

Approve should be a normal primary/admin action. Reject should use calm destructive styling and confirm before applying the fallback ABV.

The queue should be refreshable and should update after each action. Approved beverages should refresh the shared beverage catalog so the admin can immediately see/use the new catalog row.

## Client API And Helpers

Add submission API helpers in or near `src/lib/adminApi.ts` and `src/lib/sessionBeers.ts`:

- map submission rows defensively
- call `submit_session_beverage(...)`
- call admin list/approve/reject RPCs
- expose fallback ABV helper for tests and client copy
- detect whether a draft name is unknown against the current merged catalog

Extend `SessionBeer` with:

- `beverage_submission_id?: string | null`
- `beverage_submission_status?: 'pending' | 'approved' | 'rejected' | string | null`

All existing display code should tolerate missing submission fields.

## Display Behavior

Normal post display:

- show the drink name the user logged
- show serving/quantity as usual
- do not delete or rename rejected drinks

Owner/admin context can show subtle status chips:

- `Pending approval`
- `Approved`
- `ABV reset`

The rejected state should not accuse the user. It simply means Beerva did not add the submitted beverage to the catalog and has reset the ABV to the category default.

Stats and challenge calculations already use the captured `session_beers.abv`, so rejection naturally affects future calculations after the row ABV is reset.

## Error Handling

- Missing name: `Beverage name is required.`
- Invalid category: `Choose a beverage category.`
- Invalid ABV: `ABV must be between 0 and 100.`
- Missing/invalid session: `Session not found.`
- Non-owner submit: `Session not found.`
- Non-admin review: `Admin access required.`
- Already reviewed: `Submission has already been reviewed.`
- Duplicate approved beverage on approve should reuse or clearly report the existing beverage instead of crashing with a raw unique violation.

If the submission creation fails after the session drink insert, the RPC transaction should roll back so the user does not get an unreviewable custom drink.

## Testing

Use test-first implementation.

Add or update focused tests for:

- migration creates `beverage_submissions` with status/category/ABV constraints
- migration extends `session_beers` with submission fields
- migration extends notification type check with `beverage_submission`
- user RPC inserts both `session_beers` and `beverage_submissions`
- user RPC verifies session ownership
- admin list RPC requires admin access
- approve RPC inserts or reuses `admin_beverages`
- approve RPC marks submission and session drink as approved
- reject RPC keeps drink name but resets ABV to `5` for beer
- reject RPC keeps drink name but resets ABV to `5` for drink
- reject RPC keeps drink name but resets ABV to `12` for wine
- rejected submissions do not appear in `get_admin_beverages`
- notification message/rendering supports `beverage_submission`
- record/edit form exposes unknown-drink submission controls
- known catalog drinks still use the existing fast path
- TypeScript accepts the extended `SessionBeer` and admin API types

Focused verification:

```text
npm run test:session-beers
npm run test:record-session-drinks
npm run test:admin-tools
npm run test:notifications
npx tsc --noEmit
```

Run `npm run build:web` after focused tests pass.

## Non-Goals

- No public crowd-sourced catalog without admin approval.
- No automatic external beer database lookup.
- No image/photo proof requirement for submissions.
- No aliases for user submissions in the first version.
- No deletion of the user's original post drink when rejected.
- No user-facing punishment or warning notification.
- No historical rewrite of unrelated sessions that used the same typed name.
