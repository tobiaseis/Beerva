# User Beverage Submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users submit unknown beers, wines, and drinks while recording sessions, keep those drinks visible on posts, and let admins approve them into the shared catalog or reject them with category-default ABV fallback.

**Architecture:** Add `beverage_submissions` as the review table linked to `session_beers`, expose one user RPC for atomic drink-plus-submission creation, and add admin RPCs for listing, approval, and rejection. Extend the existing catalog, record/edit form, notification, and Admin Tools flows rather than creating a separate moderation surface.

**Tech Stack:** Expo React Native, TypeScript, Supabase Postgres migrations/RPCs, React Navigation, Node assertion scripts.

---

## File Structure

Create:

- `supabase/migrations/20260708170000_add_user_beverage_submissions.sql`: submission table, session drink submission fields, notification type extension, user/admin RPCs, grants, comments, schema reload.
- `src/lib/beverageSubmissions.ts`: pure client helpers for unknown catalog detection, category fallback ABV, submission status mapping, and user-facing RPC call.
- `docs/superpowers/plans/2026-07-08-user-beverage-submissions.md`: this implementation plan.

Modify:

- `scripts/sessionBeers.test.js`: pure helper checks for fallback ABV and unknown-name detection.
- `scripts/recordSessionDrinks.test.js`: source checks for unknown-drink submission controls and RPC usage in record/edit flows.
- `scripts/adminTools.test.js`: migration/admin API/Admin Tools checks for submissions queue and approval/rejection RPCs.
- `scripts/notifications.test.js`: notification type, message, routing, and screen rendering checks for admin submission notifications.
- `src/lib/sessionBeers.ts`: extend `SessionBeer` with submission fields and keep regular payload behavior intact.
- `src/lib/adminApi.ts`: add submission row types, mappers, list/approve/reject RPC helpers.
- `src/lib/adminTools.ts`: add submission display helpers.
- `src/lib/notificationMessages.ts`: add metadata fields and notification message for beverage submissions.
- `src/lib/nativeNotificationRouting.ts`: parse admin submission push URLs if present.
- `src/navigation/RootNavigator.tsx`: allow `AdminTools` initial segment params and notification routing to the submissions segment.
- `src/screens/NotificationsScreen.tsx`: render and route `beverage_submission` rows for admins.
- `src/components/BeerDraftForm.tsx`: expose the unknown-drink submission UI, category picker, and ABV input.
- `src/screens/RecordScreen.tsx`: call the new submission flow for unknown drinks and select submission fields.
- `src/screens/EditSessionScreen.tsx`: call the new submission flow for new unknown drinks on existing posts and select submission fields.
- `src/screens/AdminToolsScreen.tsx`: add `Submissions` segment, list, approve, reject, and initial segment support.

---

### Task 1: Pure Helper and Type Tests

**Files:**
- Modify: `scripts/sessionBeers.test.js`
- Create: `src/lib/beverageSubmissions.ts`
- Modify: `src/lib/sessionBeers.ts`

- [ ] **Step 1: Write failing pure helper tests**

Add this module load near the existing `sessionBeers` module load in `scripts/sessionBeers.test.js`:

```js
const {
  getBeverageSubmissionFallbackAbv,
  getBeverageSubmissionStatusLabel,
  isUnknownBeverageName,
  mapBeverageSubmissionStatus,
} = loadTypeScriptModule('src/lib/beverageSubmissions.ts');
```

Add these checks before the final failure block:

```js
check('unknown beverage detection respects names and aliases', () => {
  const catalog = mergeBeverageCatalog([
    { name: 'Codex Lager', abv: 6.4, aliases: ['Codex House Lager'] },
  ]);

  assert.equal(isUnknownBeverageName('', catalog), false);
  assert.equal(isUnknownBeverageName('   ', catalog), false);
  assert.equal(isUnknownBeverageName('Tuborg Classic', catalog), false);
  assert.equal(isUnknownBeverageName('Codex House Lager', catalog), false);
  assert.equal(isUnknownBeverageName('Missing Pub Ale', catalog), true);
});

check('submission fallback ABV uses category defaults', () => {
  assert.equal(getBeverageSubmissionFallbackAbv('beer'), 5);
  assert.equal(getBeverageSubmissionFallbackAbv('drink'), 5);
  assert.equal(getBeverageSubmissionFallbackAbv('wine'), 12);
  assert.equal(getBeverageSubmissionFallbackAbv('other'), 5);
  assert.equal(getBeverageSubmissionFallbackAbv(null), 5);
});

check('submission status mapper is defensive', () => {
  assert.equal(mapBeverageSubmissionStatus('pending'), 'pending');
  assert.equal(mapBeverageSubmissionStatus('approved'), 'approved');
  assert.equal(mapBeverageSubmissionStatus('rejected'), 'rejected');
  assert.equal(mapBeverageSubmissionStatus('strange'), null);
});

check('submission status labels are calm and user-facing', () => {
  assert.equal(getBeverageSubmissionStatusLabel('pending'), 'Pending approval');
  assert.equal(getBeverageSubmissionStatusLabel('approved'), 'Approved');
  assert.equal(getBeverageSubmissionStatusLabel('rejected'), 'ABV reset');
  assert.equal(getBeverageSubmissionStatusLabel(null), null);
});
```

- [ ] **Step 2: Run the session beer test to verify it fails**

Run:

```powershell
npm run test:session-beers
```

Expected: FAIL because `src/lib/beverageSubmissions.ts` does not exist.

- [ ] **Step 3: Add the submission helper module**

Create `src/lib/beverageSubmissions.ts`:

```ts
import { supabase } from './supabase';
import {
  BeerCatalogItem,
  BeerDraft,
  getBeverageCatalogItem,
  getBeveragePayloadCategory,
  SessionBeer,
} from './sessionBeers';
import { getErrorMessage, withTimeout } from './timeouts';

const SUBMISSION_TIMEOUT_MS = 15000;

export type BeverageSubmissionCategory = 'beer' | 'wine' | 'drink';
export type BeverageSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type SubmitSessionBeverageInput = {
  sessionId: string;
  draft: BeerDraft;
  category: BeverageSubmissionCategory;
  abv: number;
  consumedAt?: string | null;
};

export const mapBeverageSubmissionCategory = (value: unknown): BeverageSubmissionCategory => (
  value === 'wine' || value === 'drink' ? value : 'beer'
);

export const mapBeverageSubmissionStatus = (value: unknown): BeverageSubmissionStatus | null => (
  value === 'pending' || value === 'approved' || value === 'rejected' ? value : null
);

export const getBeverageSubmissionFallbackAbv = (category: unknown) => (
  mapBeverageSubmissionCategory(category) === 'wine' ? 12 : 5
);

export const getBeverageSubmissionStatusLabel = (status: unknown) => {
  const mapped = mapBeverageSubmissionStatus(status);
  if (mapped === 'pending') return 'Pending approval';
  if (mapped === 'approved') return 'Approved';
  if (mapped === 'rejected') return 'ABV reset';
  return null;
};

export const isUnknownBeverageName = (
  beverageName: string,
  catalog: BeerCatalogItem[]
) => {
  const cleanName = beverageName.trim();
  if (!cleanName) return false;
  return !getBeverageCatalogItem(cleanName, catalog);
};

export const parseBeverageSubmissionAbv = (value: string) => {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const validateBeverageSubmissionDraft = (input: {
  name: string;
  abv: string;
  category: BeverageSubmissionCategory;
}) => {
  if (!input.name.trim()) return 'Beverage name is required.';
  if (!['beer', 'wine', 'drink'].includes(input.category)) return 'Choose a beverage category.';
  const abv = parseBeverageSubmissionAbv(input.abv);
  if (abv === null || abv < 0 || abv > 100) return 'ABV must be between 0 and 100.';
  return null;
};

export const submitSessionBeverage = async ({
  sessionId,
  draft,
  category,
  abv,
  consumedAt,
}: SubmitSessionBeverageInput): Promise<SessionBeer> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('submit_session_beverage', {
        target_session_id: sessionId,
        beverage_name: draft.beerName.trim(),
        beverage_abv: abv,
        beverage_category: category,
        beverage_volume: draft.volume,
        beverage_quantity: draft.quantity,
        consumed_at: consumedAt || new Date().toISOString(),
      }),
      SUBMISSION_TIMEOUT_MS,
      'Submitting this beverage is taking too long.'
    );

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('The submitted drink was not returned.');
    return row as SessionBeer;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not submit beverage.'));
  }
};

export const getDraftCategoryFromCatalog = (
  beverageName: string,
  catalog: BeerCatalogItem[]
): BeverageSubmissionCategory => (
  getBeveragePayloadCategory(getBeverageCatalogItem(beverageName, catalog))
);
```

- [ ] **Step 4: Extend `SessionBeer` submission fields**

In `src/lib/sessionBeers.ts`, add these fields to `SessionBeer`:

```ts
  beverage_submission_id?: string | null;
  beverage_submission_status?: 'pending' | 'approved' | 'rejected' | string | null;
```

- [ ] **Step 5: Run pure helper tests**

Run:

```powershell
npm run test:session-beers
```

Expected: PASS with `session beer formatting checks passed`.

- [ ] **Step 6: Commit helper work**

Run:

```powershell
git add scripts/sessionBeers.test.js src/lib/beverageSubmissions.ts src/lib/sessionBeers.ts
git commit -m "feat: add beverage submission helpers"
```

---

### Task 2: Database Contract Tests

**Files:**
- Modify: `scripts/adminTools.test.js`
- Modify: `scripts/notifications.test.js`

- [ ] **Step 1: Add database contract assertions to `scripts/adminTools.test.js`**

Add the migration path near the other migration paths:

```js
const beverageSubmissionsMigrationPath = 'supabase/migrations/20260708170000_add_user_beverage_submissions.sql';
assert.ok(exists(beverageSubmissionsMigrationPath), 'user beverage submissions migration should exist');
```

After the other migration SQL reads, add:

```js
const beverageSubmissionsMigrationSql = read(beverageSubmissionsMigrationPath);
```

Add these assertions after the drink invalidation migration assertions:

```js
assert.match(beverageSubmissionsMigrationSql, /create table if not exists public\.beverage_submissions/i);
assert.match(beverageSubmissionsMigrationSql, /session_beer_id uuid references public\.session_beers\(id\) on delete set null/i);
assert.match(beverageSubmissionsMigrationSql, /status text not null default 'pending'/i);
assert.match(beverageSubmissionsMigrationSql, /category text not null/i);
assert.match(beverageSubmissionsMigrationSql, /abv numeric not null/i);
assert.match(beverageSubmissionsMigrationSql, /beverage_submissions_status_check/i);
assert.match(beverageSubmissionsMigrationSql, /status in \('pending', 'approved', 'rejected'\)/i);
assert.match(beverageSubmissionsMigrationSql, /beverage_submissions_category_check/i);
assert.match(beverageSubmissionsMigrationSql, /category in \('beer', 'wine', 'drink'\)/i);
assert.match(beverageSubmissionsMigrationSql, /beverage_submissions_pending_name_category_idx/i);
assert.match(beverageSubmissionsMigrationSql, /where status = 'pending'/i);
assert.match(beverageSubmissionsMigrationSql, /add column if not exists beverage_submission_id uuid references public\.beverage_submissions\(id\) on delete set null/i);
assert.match(beverageSubmissionsMigrationSql, /add column if not exists beverage_submission_status text/i);
assert.match(beverageSubmissionsMigrationSql, /create or replace function public\.submit_session_beverage/i);
assert.match(beverageSubmissionsMigrationSql, /create or replace function public\.admin_get_beverage_submissions/i);
assert.match(beverageSubmissionsMigrationSql, /create or replace function public\.admin_approve_beverage_submission/i);
assert.match(beverageSubmissionsMigrationSql, /create or replace function public\.admin_reject_beverage_submission/i);
assert.match(beverageSubmissionsMigrationSql, /public\.is_current_user_admin\(\)/i);
assert.match(beverageSubmissionsMigrationSql, /insert into public\.notifications/i);
assert.match(beverageSubmissionsMigrationSql, /'beverage_submission'/i);
assert.match(beverageSubmissionsMigrationSql, /case[\s\S]*when submission_row\.category = 'wine' then 12[\s\S]*else 5[\s\S]*end/i);
assert.match(beverageSubmissionsMigrationSql, /set[\s\S]*beer_name = session_beers\.beer_name[\s\S]*abv = fallback_abv/i);
assert.match(beverageSubmissionsMigrationSql, /grant execute on function public\.submit_session_beverage/i);
assert.match(beverageSubmissionsMigrationSql, /grant execute on function public\.admin_get_beverage_submissions/i);
assert.match(beverageSubmissionsMigrationSql, /notify pgrst, 'reload schema'/i);
```

Add admin API/Admin Tools source assertions near the existing admin API/Admin Screen checks:

```js
assert.match(adminApiSource, /AdminBeverageSubmission/, 'admin API should expose beverage submission type');
assert.match(adminApiSource, /fetchAdminBeverageSubmissions/, 'admin API should fetch beverage submissions');
assert.match(adminApiSource, /approveAdminBeverageSubmission/, 'admin API should approve beverage submissions');
assert.match(adminApiSource, /rejectAdminBeverageSubmission/, 'admin API should reject beverage submissions');
assert.match(adminToolsSource, /getAdminBeverageSubmissionTitle/, 'admin tools helpers should format submission titles');
assert.match(adminToolsSource, /getAdminBeverageSubmissionMeta/, 'admin tools helpers should format submission metadata');
assert.match(adminScreenSource, /submissions/, 'admin tools should include a submissions segment');
assert.match(adminScreenSource, /Submissions/, 'admin tools should label the submissions segment');
assert.match(adminScreenSource, /Approve/, 'submission rows should expose approve action copy');
assert.match(adminScreenSource, /Reject/, 'submission rows should expose reject action copy');
assert.match(adminScreenSource, /fetchAdminBeverageSubmissions/, 'admin tools should load beverage submissions');
assert.match(adminScreenSource, /approveAdminBeverageSubmission/, 'admin tools should approve beverage submissions');
assert.match(adminScreenSource, /rejectAdminBeverageSubmission/, 'admin tools should reject beverage submissions');
assert.match(adminScreenSource, /initialSegment/, 'admin tools should accept an initial segment route param');
```

- [ ] **Step 2: Add notification assertions to `scripts/notifications.test.js`**

Add this message assertion near the existing `getNotificationMessage` assertions:

```js
assert.equal(
  getNotificationMessage({ type: 'beverage_submission', metadata: { beverage_name: 'Missing Pub Ale' } }),
  ' submitted Missing Pub Ale for Beerva approval.'
);
```

Add this migration read immediately after the existing `const migrationSql = ...` block:

```js
const beverageSubmissionsMigrationSql = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase/migrations/20260708170000_add_user_beverage_submissions.sql'),
  'utf8'
);
```

Add these source assertions near the other notification screen/native routing assertions:

```js
assert.match(notificationsScreenSource, /\| 'beverage_submission'/, 'notifications screen should include beverage submission type');
assert.match(notificationsScreenSource, /item\.type === 'beverage_submission'/, 'notifications screen should route beverage submission rows');
assert.match(notificationsScreenSource, /initialSegment: 'submissions'/, 'beverage submission notifications should open admin submissions');
assert.match(sendPushSource, /beverage_submission/, 'push delivery should support beverage submission notifications');
```

Add migration assertion near the other notification type assertions:

```js
assert.match(
  beverageSubmissionsMigrationSql,
  /notifications_type_check[\s\S]*'beverage_submission'/i,
  'notifications should support beverage submission rows'
);
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
npm run test:admin-tools
npm run test:notifications
```

Expected: FAIL because the migration, admin helpers, UI, and notification handling do not exist.

---

### Task 3: Supabase Migration and RPCs

**Files:**
- Create: `supabase/migrations/20260708170000_add_user_beverage_submissions.sql`

- [ ] **Step 1: Create table, constraints, indexes, and session fields**

Create `supabase/migrations/20260708170000_add_user_beverage_submissions.sql` with:

```sql
create table if not exists public.beverage_submissions (
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

alter table public.session_beers
  add column if not exists beverage_submission_id uuid references public.beverage_submissions(id) on delete set null,
  add column if not exists beverage_submission_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'beverage_submissions_name_check'
      and conrelid = 'public.beverage_submissions'::regclass
  ) then
    alter table public.beverage_submissions
      add constraint beverage_submissions_name_check
      check (length(btrim(name)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'beverage_submissions_abv_check'
      and conrelid = 'public.beverage_submissions'::regclass
  ) then
    alter table public.beverage_submissions
      add constraint beverage_submissions_abv_check
      check (abv >= 0 and abv <= 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'beverage_submissions_category_check'
      and conrelid = 'public.beverage_submissions'::regclass
  ) then
    alter table public.beverage_submissions
      add constraint beverage_submissions_category_check
      check (category in ('beer', 'wine', 'drink'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'beverage_submissions_status_check'
      and conrelid = 'public.beverage_submissions'::regclass
  ) then
    alter table public.beverage_submissions
      add constraint beverage_submissions_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_beers_beverage_submission_status_check'
      and conrelid = 'public.session_beers'::regclass
  ) then
    alter table public.session_beers
      add constraint session_beers_beverage_submission_status_check
      check (beverage_submission_status is null or beverage_submission_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

create unique index if not exists beverage_submissions_pending_name_category_idx
  on public.beverage_submissions (lower(btrim(name)), category)
  where status = 'pending';

create index if not exists beverage_submissions_status_created_at_idx
  on public.beverage_submissions (status, created_at desc);

create index if not exists beverage_submissions_submitted_by_idx
  on public.beverage_submissions (submitted_by, created_at desc);
```

- [ ] **Step 2: Enable RLS and policies**

Append:

```sql
alter table public.beverage_submissions enable row level security;

drop policy if exists "Users can view their own beverage submissions" on public.beverage_submissions;
create policy "Users can view their own beverage submissions"
  on public.beverage_submissions
  for select
  to authenticated
  using (submitted_by = auth.uid() or public.is_current_user_admin());

revoke insert, update, delete on table public.beverage_submissions from anon, authenticated;
grant select on table public.beverage_submissions to authenticated;
```

- [ ] **Step 3: Extend notifications type check**

Append:

```sql
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
      'official_post',
      'mention',
      'beverage_submission'
    ));
end;
$$;
```

- [ ] **Step 4: Add `submit_session_beverage` RPC**

Append:

```sql
create or replace function public.submit_session_beverage(
  target_session_id uuid,
  beverage_name text,
  beverage_abv numeric,
  beverage_category text,
  beverage_volume text,
  beverage_quantity integer,
  consumed_at timestamp with time zone default now()
)
returns public.session_beers
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(coalesce(beverage_name, ''));
  clean_category text := coalesce(nullif(btrim(coalesce(beverage_category, '')), ''), 'beer');
  clean_volume text := coalesce(nullif(btrim(coalesce(beverage_volume, '')), ''), 'Pint');
  clean_quantity integer := greatest(coalesce(beverage_quantity, 1), 1);
  session_row public.sessions;
  submission_row public.beverage_submissions;
  drink_row public.session_beers;
  admin_profile record;
begin
  if auth.uid() is null then
    raise exception 'Not logged in.';
  end if;

  if clean_name = '' then
    raise exception 'Beverage name is required.';
  end if;

  if clean_category not in ('beer', 'wine', 'drink') then
    raise exception 'Choose a beverage category.';
  end if;

  if beverage_abv is null or beverage_abv < 0 or beverage_abv > 100 then
    raise exception 'ABV must be between 0 and 100.';
  end if;

  select sessions.*
  into session_row
  from public.sessions
  where sessions.id = target_session_id
    and sessions.user_id = auth.uid()
    and sessions.status in ('active', 'published')
  for update;

  if session_row.id is null then
    raise exception 'Session not found.';
  end if;

  insert into public.session_beers (
    session_id,
    beer_name,
    volume,
    quantity,
    abv,
    beverage_category,
    consumed_at
  ) values (
    target_session_id,
    clean_name,
    clean_volume,
    clean_quantity,
    beverage_abv,
    clean_category,
    coalesce(consumed_at, now())
  )
  returning * into drink_row;

  insert into public.beverage_submissions (
    session_beer_id,
    submitted_by,
    name,
    abv,
    category,
    status
  ) values (
    drink_row.id,
    auth.uid(),
    clean_name,
    beverage_abv,
    clean_category,
    'pending'
  )
  on conflict (lower(btrim(name)), category) where status = 'pending'
  do update set
    updated_at = now()
  returning * into submission_row;

  update public.session_beers
  set
    beverage_submission_id = submission_row.id,
    beverage_submission_status = submission_row.status
  where session_beers.id = drink_row.id
  returning * into drink_row;

  for admin_profile in
    select profiles.id
    from public.profiles
    where profiles.is_admin = true
      and profiles.id is not null
  loop
    insert into public.notifications (
      user_id,
      actor_id,
      type,
      reference_id,
      metadata
    ) values (
      admin_profile.id,
      auth.uid(),
      'beverage_submission',
      submission_row.id,
      jsonb_build_object(
        'beverage_name', clean_name,
        'beverage_category', clean_category,
        'beverage_abv', beverage_abv,
        'session_id', target_session_id,
        'session_beer_id', drink_row.id,
        'target_type', 'admin_beverage_submission'
      )
    )
    on conflict do nothing;
  end loop;

  return drink_row;
end;
$$;
```

- [ ] **Step 5: Add admin list/approve/reject RPCs**

Append:

```sql
create or replace function public.admin_get_beverage_submissions(
  status_filter text default 'pending',
  result_limit integer default 100
)
returns table (
  id uuid,
  session_beer_id uuid,
  session_id uuid,
  submitted_by uuid,
  username text,
  avatar_url text,
  name text,
  abv numeric,
  category text,
  status text,
  resolved_admin_beverage_id uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  pub_name text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean_status text := nullif(btrim(coalesce(status_filter, '')), '');
  clean_limit integer := least(greatest(coalesce(result_limit, 100), 1), 250);
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if clean_status is not null and clean_status not in ('pending', 'approved', 'rejected', 'all') then
    raise exception 'Choose a valid submission status.';
  end if;

  return query
  select
    submissions.id,
    submissions.session_beer_id,
    session_beers.session_id,
    submissions.submitted_by,
    profiles.username,
    profiles.avatar_url,
    submissions.name,
    submissions.abv,
    submissions.category,
    submissions.status,
    submissions.resolved_admin_beverage_id,
    submissions.reviewed_by,
    submissions.reviewed_at,
    submissions.rejection_reason,
    sessions.pub_name,
    submissions.created_at,
    submissions.updated_at
  from public.beverage_submissions submissions
  left join public.session_beers
    on session_beers.id = submissions.session_beer_id
  left join public.sessions
    on sessions.id = session_beers.session_id
  left join public.profiles
    on profiles.id = submissions.submitted_by
  where clean_status is null
    or clean_status = 'all'
    or submissions.status = clean_status
  order by
    case submissions.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    submissions.created_at desc
  limit clean_limit;
end;
$$;

create or replace function public.admin_approve_beverage_submission(
  target_submission_id uuid
)
returns public.beverage_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_row public.beverage_submissions;
  beverage_row public.admin_beverages;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into submission_row
  from public.beverage_submissions
  where id = target_submission_id
  for update;

  if submission_row.id is null then
    raise exception 'Submission not found.';
  end if;

  if submission_row.status <> 'pending' then
    raise exception 'Submission has already been reviewed.';
  end if;

  select *
  into beverage_row
  from public.admin_beverages
  where lower(btrim(name)) = lower(btrim(submission_row.name))
  limit 1;

  if beverage_row.id is null then
    insert into public.admin_beverages (
      name,
      abv,
      category,
      created_by
    ) values (
      submission_row.name,
      submission_row.abv,
      submission_row.category,
      auth.uid()
    )
    returning * into beverage_row;
  end if;

  update public.beverage_submissions
  set
    status = 'approved',
    resolved_admin_beverage_id = beverage_row.id,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = submission_row.id
  returning * into submission_row;

  update public.session_beers
  set beverage_submission_status = 'approved'
  where beverage_submission_id = submission_row.id;

  return submission_row;
end;
$$;

create or replace function public.admin_reject_beverage_submission(
  target_submission_id uuid,
  rejection_reason text default null
)
returns public.beverage_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  submission_row public.beverage_submissions;
  fallback_abv numeric;
  clean_reason text := nullif(btrim(coalesce(rejection_reason, '')), '');
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into submission_row
  from public.beverage_submissions
  where id = target_submission_id
  for update;

  if submission_row.id is null then
    raise exception 'Submission not found.';
  end if;

  if submission_row.status <> 'pending' then
    raise exception 'Submission has already been reviewed.';
  end if;

  fallback_abv := case
    when submission_row.category = 'wine' then 12
    else 5
  end;

  update public.session_beers
  set
    beer_name = session_beers.beer_name,
    abv = fallback_abv,
    beverage_submission_status = 'rejected'
  where beverage_submission_id = submission_row.id;

  update public.beverage_submissions
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = clean_reason,
    updated_at = now()
  where id = submission_row.id
  returning * into submission_row;

  return submission_row;
end;
$$;
```

- [ ] **Step 6: Add grants, revokes, comments, and reload**

Append:

```sql
revoke execute on function public.submit_session_beverage(uuid, text, numeric, text, text, integer, timestamp with time zone)
  from public, anon;
revoke execute on function public.admin_get_beverage_submissions(text, integer)
  from public, anon;
revoke execute on function public.admin_approve_beverage_submission(uuid)
  from public, anon;
revoke execute on function public.admin_reject_beverage_submission(uuid, text)
  from public, anon;

grant execute on function public.submit_session_beverage(uuid, text, numeric, text, text, integer, timestamp with time zone)
  to authenticated;
grant execute on function public.admin_get_beverage_submissions(text, integer)
  to authenticated;
grant execute on function public.admin_approve_beverage_submission(uuid)
  to authenticated;
grant execute on function public.admin_reject_beverage_submission(uuid, text)
  to authenticated;

comment on table public.beverage_submissions
  is 'User-submitted beverage catalog candidates created while recording session drinks.';
comment on column public.session_beers.beverage_submission_id
  is 'Linked user beverage submission when this drink came from an unknown catalog item.';
comment on column public.session_beers.beverage_submission_status
  is 'Display snapshot for pending, approved, or rejected user beverage submissions.';

notify pgrst, 'reload schema';
```

- [ ] **Step 7: Run database contract tests**

Run:

```powershell
npm run test:admin-tools
npm run test:notifications
```

Expected: FAIL moves from missing migration to missing app/API/UI support.

- [ ] **Step 8: Commit database contract**

Run:

```powershell
git add supabase/migrations/20260708170000_add_user_beverage_submissions.sql scripts/adminTools.test.js scripts/notifications.test.js
git commit -m "feat: add beverage submission backend"
```

---

### Task 4: Admin API and Formatting Helpers

**Files:**
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminTools.ts`

- [ ] **Step 1: Add submission row and app types to `adminApi.ts`**

In `src/lib/adminApi.ts`, add after `AdminModerationDrink`:

```ts
export type AdminBeverageSubmissionRow = {
  id?: string | null;
  session_beer_id?: string | null;
  session_id?: string | null;
  submitted_by?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  name?: string | null;
  abv?: number | string | null;
  category?: string | null;
  status?: string | null;
  resolved_admin_beverage_id?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  pub_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AdminBeverageSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type AdminBeverageSubmission = {
  id: string;
  sessionBeerId: string | null;
  sessionId: string | null;
  submittedBy: string;
  username: string | null;
  avatarUrl: string | null;
  name: string;
  abv: number;
  category: AdminBeverageCategory;
  status: AdminBeverageSubmissionStatus;
  resolvedAdminBeverageId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  pubName: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Add mappers and RPC helpers to `adminApi.ts`**

Add this mapper after `mapAdminModerationDrinkRow`:

```ts
const mapAdminBeverageSubmissionStatus = (value: unknown): AdminBeverageSubmissionStatus => (
  value === 'approved' || value === 'rejected' ? value : 'pending'
);

export const mapAdminBeverageSubmissionRow = (
  row: AdminBeverageSubmissionRow
): AdminBeverageSubmission => ({
  id: toString(row.id),
  sessionBeerId: toStringOrNull(row.session_beer_id),
  sessionId: toStringOrNull(row.session_id),
  submittedBy: toString(row.submitted_by),
  username: toStringOrNull(row.username),
  avatarUrl: toStringOrNull(row.avatar_url),
  name: toString(row.name) || 'Unknown beverage',
  abv: toNumber(row.abv),
  category: mapAdminBeverageCategory(row.category),
  status: mapAdminBeverageSubmissionStatus(row.status),
  resolvedAdminBeverageId: toStringOrNull(row.resolved_admin_beverage_id),
  reviewedBy: toStringOrNull(row.reviewed_by),
  reviewedAt: toStringOrNull(row.reviewed_at),
  rejectionReason: toStringOrNull(row.rejection_reason),
  pubName: toStringOrNull(row.pub_name),
  createdAt: toString(row.created_at),
  updatedAt: toString(row.updated_at),
});
```

Add these API functions after `setAdminDrinkExcluded`:

```ts
export const fetchAdminBeverageSubmissions = async (options?: {
  status?: AdminBeverageSubmissionStatus | 'all';
  limit?: number;
}): Promise<AdminBeverageSubmission[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_get_beverage_submissions', {
        status_filter: options?.status || 'pending',
        result_limit: options?.limit ?? 100,
      }),
      ADMIN_TIMEOUT_MS,
      'Beverage submissions are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as AdminBeverageSubmissionRow[]).map(mapAdminBeverageSubmissionRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load beverage submissions.'));
  }
};

export const approveAdminBeverageSubmission = async (
  submissionId: string
): Promise<AdminBeverageSubmission> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_approve_beverage_submission', {
        target_submission_id: submissionId,
      }),
      ADMIN_TIMEOUT_MS,
      'Approving the beverage is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminBeverageSubmissionRow | AdminBeverageSubmissionRow[] | null);
    if (!row) throw new Error('The reviewed submission was not returned.');
    return mapAdminBeverageSubmissionRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not approve beverage submission.'));
  }
};

export const rejectAdminBeverageSubmission = async (
  submissionId: string,
  reason?: string | null
): Promise<AdminBeverageSubmission> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_reject_beverage_submission', {
        target_submission_id: submissionId,
        rejection_reason: reason ?? null,
      }),
      ADMIN_TIMEOUT_MS,
      'Rejecting the beverage is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminBeverageSubmissionRow | AdminBeverageSubmissionRow[] | null);
    if (!row) throw new Error('The reviewed submission was not returned.');
    return mapAdminBeverageSubmissionRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not reject beverage submission.'));
  }
};
```

- [ ] **Step 3: Add admin formatting helpers**

In `src/lib/adminTools.ts`, extend the import:

```ts
import type {
  AdminBeverage,
  AdminBeverageCategory,
  AdminBeverageSubmission,
  AdminChallenge,
  AdminChallengeType,
  AdminModerationDrink,
} from './adminApi';
```

Add after `getAdminModerationDrinkMeta`:

```ts
export function getAdminBeverageSubmissionTitle(submission: AdminBeverageSubmission): string {
  return submission.name;
}

export function getAdminBeverageSubmissionMeta(submission: AdminBeverageSubmission): string {
  const category = submission.category === 'wine'
    ? 'Wine'
    : submission.category === 'drink'
      ? 'Drink'
      : 'Beer';
  const parts = [
    submission.username || 'Unknown user',
    `${submission.abv}% ABV`,
    category,
    submission.pubName,
    formatModerationDate(submission.createdAt),
  ].filter(Boolean);

  return parts.join(' - ');
}
```

- [ ] **Step 4: Run admin tools tests**

Run:

```powershell
npm run test:admin-tools
npx tsc --noEmit
```

Expected: FAIL remains in Admin Tools UI assertions, TypeScript may fail until the screen imports these helpers in Task 7.

- [ ] **Step 5: Commit admin API helpers**

Run:

```powershell
git add src/lib/adminApi.ts src/lib/adminTools.ts
git commit -m "feat: add beverage submission admin api"
```

---

### Task 5: Recording Form Source Tests

**Files:**
- Modify: `scripts/recordSessionDrinks.test.js`

- [ ] **Step 1: Add source assertions for unknown-drink UI and RPC use**

In `scripts/recordSessionDrinks.test.js`, add these file reads near the existing `source` and `beerDraftFormSource` reads:

```js
const editSessionSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/EditSessionScreen.tsx'),
  'utf8'
);
const submissionHelperSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/lib/beverageSubmissions.ts'),
  'utf8'
);
```

Add assertions near the existing BeerDraftForm assertions:

```js
assert.match(
  submissionHelperSource,
  /submitSessionBeverage/,
  'submission helper should expose the user-facing beverage submission RPC'
);

assert.match(
  beerDraftFormSource,
  /isUnknownBeverageName/,
  'beer draft form should detect unknown catalog beverage names'
);

assert.match(
  beerDraftFormSource,
  /Add as new drink/,
  'beer draft form should expose an explicit new-drink path'
);

assert.match(
  beerDraftFormSource,
  /Beer[\s\S]*Wine[\s\S]*Drink/,
  'beer draft form should let users choose the submitted beverage category'
);

assert.match(
  beerDraftFormSource,
  /ABV/,
  'beer draft form should ask for ABV on unknown beverage submissions'
);

assert.match(
  source,
  /submitSessionBeverage/,
  'record screen should submit unknown beverages through the RPC helper'
);

assert.match(
  editSessionSource,
  /submitSessionBeverage/,
  'edit session screen should submit new unknown beverages through the RPC helper'
);

assert.match(
  source,
  /beverage_submission_id/,
  'record screen should select beverage submission linkage fields'
);

assert.match(
  editSessionSource,
  /beverage_submission_status/,
  'edit session screen should preserve beverage submission status fields'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm run test:record-session-drinks
```

Expected: FAIL because the form and screens do not yet use the submission helper/UI.

---

### Task 6: BeerDraftForm Unknown-Drink UI

**Files:**
- Modify: `src/components/BeerDraftForm.tsx`

- [ ] **Step 1: Extend props and imports**

Update imports:

```ts
import { AlertCircle, Beer, CheckCircle2, ChevronDown, Minus, Plus, X } from 'lucide-react-native';
import {
  BeverageSubmissionCategory,
  getBeverageSubmissionFallbackAbv,
  isUnknownBeverageName,
  parseBeverageSubmissionAbv,
  validateBeverageSubmissionDraft,
} from '../lib/beverageSubmissions';
```

Extend `BeerDraftFormProps`:

```ts
  onSubmitUnknown?: (input: {
    draft: BeerDraft;
    category: BeverageSubmissionCategory;
    abv: number;
  }) => void;
```

- [ ] **Step 2: Add local state and derived unknown state**

Inside `BeerDraftForm`, add:

```ts
  const [unknownFormVisible, setUnknownFormVisible] = useState(false);
  const [unknownCategory, setUnknownCategory] = useState<BeverageSubmissionCategory>('beer');
  const [unknownAbv, setUnknownAbv] = useState('');
  const [unknownError, setUnknownError] = useState<string | null>(null);
```

Add derived values after `hideDrinkControls`:

```ts
  const unknownName = isUnknownBeverageName(draft.beerName, catalog);
  const canSubmitUnknown = Boolean(onSubmitUnknown && unknownName);
```

Update `updateBeverageName` to reset the unknown form when the name changes:

```ts
  const updateBeverageName = (beerName: string) => {
    const defaultVolume = getBeverageDefaultVolume(beerName, catalog);
    setUnknownError(null);
    if (!isUnknownBeverageName(beerName, catalog)) {
      setUnknownFormVisible(false);
    }
    updateDraft(defaultVolume ? { beerName, volume: defaultVolume } : { beerName });
  };
```

- [ ] **Step 3: Add unknown submit handler**

Add before `renderVolumeOption`:

```ts
  const submitUnknown = () => {
    const validationError = validateBeverageSubmissionDraft({
      name: draft.beerName,
      category: unknownCategory,
      abv: unknownAbv,
    });

    if (validationError) {
      setUnknownError(validationError);
      return;
    }

    const abv = parseBeverageSubmissionAbv(unknownAbv);
    if (abv === null) {
      setUnknownError('ABV must be between 0 and 100.');
      return;
    }

    setUnknownError(null);
    onSubmitUnknown?.({
      draft,
      category: unknownCategory,
      abv,
    });
  };
```

- [ ] **Step 4: Render unknown-drink controls**

After the `AutocompleteInput`, render:

```tsx
      {canSubmitUnknown && !unknownFormVisible ? (
        <TouchableOpacity
          style={styles.unknownCta}
          onPress={() => setUnknownFormVisible(true)}
          activeOpacity={0.76}
          accessibilityRole="button"
          accessibilityLabel="Add this as a new drink"
        >
          <AlertCircle color={colors.primary} size={18} />
          <Text style={styles.unknownCtaText}>Add as new drink</Text>
        </TouchableOpacity>
      ) : null}
```

After the normal quantity/add button block, render:

```tsx
          {canSubmitUnknown && unknownFormVisible ? (
            <View style={styles.unknownPanel}>
              <Text style={styles.unknownTitle}>New drink details</Text>
              <View style={styles.typeControl}>
                {(['beer', 'wine', 'drink'] as const).map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.typeButton, unknownCategory === category ? styles.typeButtonActive : null]}
                    onPress={() => {
                      setUnknownCategory(category);
                      setUnknownError(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: unknownCategory === category }}
                  >
                    <Text style={[styles.typeText, unknownCategory === category ? styles.typeTextActive : null]}>
                      {category === 'beer' ? 'Beer' : category === 'wine' ? 'Wine' : 'Drink'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.sizeLabel}>ABV</Text>
              <View style={styles.abvInputRow}>
                <TextInput
                  style={styles.abvInput}
                  value={unknownAbv}
                  onChangeText={(value) => {
                    setUnknownAbv(value);
                    setUnknownError(null);
                  }}
                  placeholder={`${getBeverageSubmissionFallbackAbv(unknownCategory)}`}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.abvSuffix}>%</Text>
              </View>
              {unknownError ? <Text style={styles.unknownError}>{unknownError}</Text> : null}
              <AppButton label="Submit New Drink" onPress={submitUnknown} loading={loading} />
            </View>
          ) : null}
```

Add `TextInput` to the React Native import list.

- [ ] **Step 5: Add styles**

Add these styles:

```ts
  unknownCta: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unknownCtaText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '900',
  },
  unknownPanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    padding: 12,
    gap: 10,
  },
  unknownTitle: {
    ...typography.body,
    color: colors.text,
    fontWeight: '900',
  },
  typeControl: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    padding: 3,
    flexDirection: 'row',
  },
  typeButton: {
    flex: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.primary,
  },
  typeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  typeTextActive: {
    color: colors.background,
  },
  abvInputRow: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  abvInput: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    paddingVertical: 0,
  },
  abvSuffix: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '800',
  },
  unknownError: {
    ...typography.caption,
    color: colors.danger,
  },
```

- [ ] **Step 6: Run form tests**

Run:

```powershell
npm run test:record-session-drinks
npx tsc --noEmit
```

Expected: FAIL remains in Record/Edit screen source assertions until Task 7.

---

### Task 7: Record and Edit Submission Flow

**Files:**
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `src/screens/EditSessionScreen.tsx`

- [ ] **Step 1: Update imports**

In both screens, import:

```ts
import { BeverageSubmissionCategory, submitSessionBeverage } from '../lib/beverageSubmissions';
```

- [ ] **Step 2: Select submission fields in `RecordScreen.tsx`**

Replace each `session_beers` select projection with:

```ts
.select('id, session_id, beer_name, volume, quantity, abv, beverage_category, beverage_submission_id, beverage_submission_status, note, consumed_at, created_at')
```

Update all three active-session paths:

- `fetchSessionBeers`
- `addBeerToSession` insert select
- `incrementBeerInSession` update select

- [ ] **Step 3: Add unknown submit handler in `RecordScreen.tsx`**

Add after `addBeerToSession`:

```ts
  const submitUnknownBeerToSession = async ({
    draft,
    category,
    abv,
  }: {
    draft: typeof beerDraft;
    category: BeverageSubmissionCategory;
    abv: number;
  }) => {
    if (!activeSession) {
      showAlert('Start a session first', 'Choose where you are drinking before adding a new drink.');
      return;
    }

    setAddingBeer(true);
    try {
      const createdBeer = await submitSessionBeverage({
        sessionId: activeSession.id,
        draft,
        category,
        abv,
      });
      const nextBeers = [...sessionBeers, createdBeer];
      setSessionBeers(nextBeers);
      setBeerDraft(createEmptyBeerDraft());
      await syncLegacyFields(activeSession.id, nextBeers);
      hapticSuccess();
      showAlert('Drink added', 'This drink is on your session and waiting for Beerva approval.');
    } catch (error: any) {
      console.error('Submit beverage error:', error);
      hapticError();
      showAlert('Could not submit drink', error?.message || 'Please try again.');
    } finally {
      setAddingBeer(false);
    }
  };
```

Update the `BeerDraftForm` props:

```tsx
                onSubmitUnknown={submitUnknownBeerToSession}
```

- [ ] **Step 4: Select and preserve submission fields in `EditSessionScreen.tsx`**

Replace each `session_beers` select projection with:

```ts
.select('id, session_id, beer_name, volume, quantity, abv, beverage_category, beverage_submission_id, beverage_submission_status, note, consumed_at, created_at, excluded_from_stats, excluded_from_stats_at, excluded_from_stats_reason')
```

In existing beer update payload, do not write submission fields. They are moderation/review state, not editable draft fields.

- [ ] **Step 5: Add unknown submit handler in `EditSessionScreen.tsx`**

Add after `addDraftBeer`:

```ts
  const submitUnknownDraftBeer = async ({
    draft,
    category,
    abv,
  }: {
    draft: typeof beerDraft;
    category: BeverageSubmissionCategory;
    abv: number;
  }) => {
    if (!sessionId || saving) return;

    setSaving(true);
    try {
      const createdBeer = await submitSessionBeverage({
        sessionId,
        draft,
        category,
        abv,
      });
      setBeers((previous) => [...previous, createdBeer]);
      if (createdBeer.id) {
        setInitialBeerIds((previous) => (
          previous.includes(createdBeer.id as string) ? previous : [...previous, createdBeer.id as string]
        ));
      }
      setBeerDraft(createEmptyBeerDraft());
      hapticSuccess();
      showAlert('Drink added', 'This drink is on your post and waiting for Beerva approval.');
    } catch (error: any) {
      console.error('Submit edited beverage error:', error);
      hapticError();
      showAlert('Could not submit drink', error?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };
```

Update the `BeerDraftForm` props:

```tsx
          onSubmitUnknown={submitUnknownDraftBeer}
```

- [ ] **Step 6: Run recording tests**

Run:

```powershell
npm run test:record-session-drinks
npx tsc --noEmit
```

Expected: PASS for `record session drink checks passed` and TypeScript exits with no errors.

- [ ] **Step 7: Commit recording flow**

Run:

```powershell
git add scripts/recordSessionDrinks.test.js src/components/BeerDraftForm.tsx src/screens/RecordScreen.tsx src/screens/EditSessionScreen.tsx
git commit -m "feat: submit unknown drinks from session forms"
```

---

### Task 8: Admin Submissions Queue UI

**Files:**
- Modify: `src/screens/AdminToolsScreen.tsx`

- [ ] **Step 1: Update imports and segment types**

Add imports from `adminApi`:

```ts
  AdminBeverageSubmission,
  approveAdminBeverageSubmission,
  fetchAdminBeverageSubmissions,
  rejectAdminBeverageSubmission,
```

Add imports from `adminTools`:

```ts
  getAdminBeverageSubmissionMeta,
  getAdminBeverageSubmissionTitle,
```

Update segment type and list:

```ts
type AdminSegment = 'challenges' | 'beverages' | 'submissions' | 'official-posts' | 'moderation';
const ADMIN_SEGMENTS: AdminSegment[] = ['challenges', 'beverages', 'submissions', 'official-posts', 'moderation'];
```

Update `getSegmentLabel`:

```ts
  if (segment === 'submissions') return 'Submissions';
```

Update screen props:

```ts
export const AdminToolsScreen = ({ navigation, route }: any) => {
```

Initialize segment from route:

```ts
  const initialSegment = route?.params?.initialSegment as AdminSegment | undefined;
  const [activeSegment, setActiveSegment] = useState<AdminSegment>(
    ADMIN_SEGMENTS.includes(initialSegment as AdminSegment) ? initialSegment as AdminSegment : 'challenges'
  );
```

- [ ] **Step 2: Add state and loading**

Add state near `moderationDrinks`:

```ts
  const [beverageSubmissions, setBeverageSubmissions] = useState<AdminBeverageSubmission[]>([]);
  const [submissionBusyId, setSubmissionBusyId] = useState<string | null>(null);
```

Update `loadAll` Promise list:

```ts
      const [challengeRows, beverageRows, submissionRows, officialPostRows, moderationRows] = await Promise.all([
        fetchAdminChallenges(),
        fetchAdminBeverages(),
        fetchAdminBeverageSubmissions({ status: 'pending', limit: 100 }),
        fetchAdminOfficialPosts(),
        fetchAdminModerationDrinks({ limit: 100 }),
      ]);
      setChallenges(challengeRows);
      setBeverages(beverageRows);
      setBeverageSubmissions(submissionRows);
      setOfficialPosts(officialPostRows);
      setModerationDrinks(moderationRows);
```

- [ ] **Step 3: Add approve/reject handlers**

Add after `handleSetDrinkExcluded`:

```ts
  const refreshBeverageSubmissions = useCallback(async () => {
    setErrorMessage(null);
    setBeverageSubmissions(await fetchAdminBeverageSubmissions({ status: 'pending', limit: 100 }));
  }, []);

  const handleApproveSubmission = useCallback(async (submission: AdminBeverageSubmission) => {
    setSubmissionBusyId(submission.id);
    setErrorMessage(null);
    try {
      await approveAdminBeverageSubmission(submission.id);
      await Promise.all([
        refreshBeverageSubmissions(),
        fetchAdminBeverages().then(setBeverages),
        refreshCatalog(),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not approve beverage submission.');
    } finally {
      setSubmissionBusyId(null);
    }
  }, [refreshBeverageSubmissions, refreshCatalog]);

  const handleRejectSubmission = useCallback((submission: AdminBeverageSubmission) => {
    confirmDestructive(
      'Reject beverage',
      `Keep "${submission.name}" on the post but reset its ABV to the category default?`,
      'Reject',
      async () => {
        setSubmissionBusyId(submission.id);
        setErrorMessage(null);
        try {
          await rejectAdminBeverageSubmission(submission.id);
          await refreshBeverageSubmissions();
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not reject beverage submission.');
        } finally {
          setSubmissionBusyId(null);
        }
      }
    );
  }, [refreshBeverageSubmissions]);
```

- [ ] **Step 4: Render submission rows**

Add render function near `renderBeverage`:

```tsx
  const renderSubmission = useCallback(({ item }: { item: AdminBeverageSubmission }) => {
    const busy = submissionBusyId === item.id;
    return (
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <Beer color={colors.primary} size={18} />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>{getAdminBeverageSubmissionTitle(item)}</Text>
          <Text style={styles.rowMeta} numberOfLines={2}>{getAdminBeverageSubmissionMeta(item)}</Text>
        </View>
        <View style={styles.submissionActions}>
          <TouchableOpacity
            style={[styles.moderationActionButton, busy ? styles.rowMuted : null]}
            onPress={() => handleApproveSubmission(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Approve ${item.name}`}
          >
            {busy ? <ActivityIndicator color={colors.background} size="small" /> : <Text style={styles.moderationActionText}>Approve</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.moderationActionButton, styles.moderationRestoreButton, busy ? styles.rowMuted : null]}
            onPress={() => handleRejectSubmission(item)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Reject ${item.name}`}
          >
            <Text style={[styles.moderationActionText, styles.moderationRestoreText]}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [handleApproveSubmission, handleRejectSubmission, submissionBusyId]);
```

Add style:

```ts
  submissionActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
```

- [ ] **Step 5: Wire list data and add button behavior**

Update `emptyCopy`:

```ts
      : activeSegment === 'submissions'
        ? 'No beverage submissions pending.'
```

Update toolbar add button rendering so submissions and moderation have no plus button:

```tsx
          {activeSegment === 'submissions' || activeSegment === 'moderation' ? (
            <View style={styles.addButtonPlaceholder} />
          ) : (
            <TouchableOpacity
              style={styles.addButton}
              onPress={activeSegment === 'challenges' ? openNewChallenge : activeSegment === 'beverages' ? openNewBeverage : openNewOfficialPost}
              accessibilityRole="button"
              accessibilityLabel={activeSegment === 'challenges' ? 'Create challenge' : activeSegment === 'beverages' ? 'Add beverage' : 'Create official post'}
            >
              <Plus color={colors.background} size={22} />
            </TouchableOpacity>
          )}
```

Update `FlatList` props:

```tsx
          data={
            activeSegment === 'challenges'
              ? challenges
              : activeSegment === 'beverages'
                ? beverages
                : activeSegment === 'submissions'
                  ? beverageSubmissions
                  : activeSegment === 'official-posts'
                    ? officialPosts
                    : moderationDrinks
          }
          renderItem={
            activeSegment === 'challenges'
              ? renderChallenge as any
              : activeSegment === 'beverages'
                ? renderBeverage as any
                : activeSegment === 'submissions'
                  ? renderSubmission as any
                  : activeSegment === 'official-posts'
                    ? renderOfficialPost as any
                    : renderModerationDrink as any
          }
```

- [ ] **Step 6: Run admin tests**

Run:

```powershell
npm run test:admin-tools
npx tsc --noEmit
```

Expected: PASS for `admin tools checks passed` and TypeScript exits with no errors.

- [ ] **Step 7: Commit admin queue**

Run:

```powershell
git add src/screens/AdminToolsScreen.tsx scripts/adminTools.test.js
git commit -m "feat: add beverage submission admin queue"
```

---

### Task 9: Notification Message and Routing

**Files:**
- Modify: `src/lib/notificationMessages.ts`
- Modify: `src/lib/nativeNotificationRouting.ts`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/NotificationsScreen.tsx`
- Modify: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Extend notification metadata and message helper**

In `src/lib/notificationMessages.ts`, add metadata fields:

```ts
  beverage_name?: string | null;
  beverage_category?: string | null;
  beverage_abv?: number | string | null;
```

Add before the fallback invite message:

```ts
  if (item.type === 'beverage_submission') {
    const beverageName = toCleanString(item.metadata?.beverage_name);
    return beverageName
      ? ` submitted ${beverageName} for Beerva approval.`
      : ' submitted a beverage for Beerva approval.';
  }
```

- [ ] **Step 2: Extend native notification routing**

In `src/lib/nativeNotificationRouting.ts`, add parsing support where query params are read:

```ts
  if (params.get('beverage_submission') === '1') {
    return { type: 'admin_tools', initialSegment: 'submissions', notificationId };
  }
```

If the existing route target union does not include admin tools, extend it with:

```ts
  | { type: 'admin_tools'; initialSegment: 'submissions'; notificationId?: string | null }
```

- [ ] **Step 3: Route Admin Tools params in `RootNavigator.tsx`**

Update `RootStackParamList`:

```ts
  AdminTools: { initialSegment?: 'submissions' } | undefined;
```

Add this branch to the notification-target handling that already handles post/challenge/chug targets:

```ts
    if (target.type === 'admin_tools') {
      navigationRef.current?.navigate('AdminTools', {
        initialSegment: target.initialSegment,
      });
      markNotificationRead(target.notificationId);
      return;
    }
```

Keep `markNotificationRead(target.notificationId)` behavior for notification opens.

- [ ] **Step 4: Render and route notification screen rows**

In `src/screens/NotificationsScreen.tsx`, extend `NotificationType`:

```ts
  | 'beverage_submission'
```

Add icon rendering:

```tsx
    if (item.type === 'beverage_submission') return <Beer color={colors.primary} size={24} />;
```

Add open handler:

```ts
  const openAdminSubmissions = useCallback(() => {
    navigation.navigate('AdminTools', { initialSegment: 'submissions' });
  }, [navigation]);
```

Add content wrapper behavior near `opensChugVerification`:

```ts
    const opensAdminSubmissions = item.type === 'beverage_submission';
    const ContentWrapper: any = opensPost || opensChugVerification || opensAdminSubmissions ? TouchableOpacity : View;
```

Add `contentWrapperProps` branch:

```ts
      ? {
          onPress: () => openAdminSubmissions(),
          activeOpacity: 0.75,
          accessibilityRole: 'button',
          accessibilityLabel: 'Open beverage submissions',
        }
```

Put the branch before the post branch so beverage submissions do not fall through.

- [ ] **Step 5: Add push delivery support**

In `supabase/functions/send-push/index.ts`, add beverage submission notification title/body/url handling near other types:

```ts
if (notification.type === 'beverage_submission') {
  title = 'New beverage submission';
  body = metadata.beverage_name
    ? `${actorName} submitted ${metadata.beverage_name}.`
    : `${actorName} submitted a beverage.`;
  url.searchParams.set('notifications', '1');
  url.searchParams.set('beverage_submission', '1');
}
```

Use the local variable names that already exist in the function for `notification`, `metadata`, `actorName`, and `url`.

- [ ] **Step 6: Run notification tests**

Run:

```powershell
npm run test:notifications
npm run test:native-notification-routing
npx tsc --noEmit
```

Expected: PASS for notification tests and TypeScript exits with no errors.

- [ ] **Step 7: Commit notification routing**

Run:

```powershell
git add src/lib/notificationMessages.ts src/lib/nativeNotificationRouting.ts src/navigation/RootNavigator.tsx src/screens/NotificationsScreen.tsx supabase/functions/send-push/index.ts scripts/notifications.test.js
git commit -m "feat: route beverage submission notifications"
```

---

### Task 10: Submission Status Display

**Files:**
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `src/screens/EditSessionScreen.tsx`

- [ ] **Step 1: Import status label helper**

In both screens, extend the beverage submissions import:

```ts
import {
  BeverageSubmissionCategory,
  getBeverageSubmissionStatusLabel,
  submitSessionBeverage,
} from '../lib/beverageSubmissions';
```

- [ ] **Step 2: Add status chip helper in `RecordScreen.tsx`**

Add near `uniquePhotoUrls`:

```tsx
const SubmissionStatusChip = ({ status }: { status?: SessionBeer['beverage_submission_status'] }) => {
  const label = getBeverageSubmissionStatusLabel(status);
  if (!label) return null;

  return (
    <View style={styles.submissionStatusChip}>
      <Text style={styles.submissionStatusText}>{label}</Text>
    </View>
  );
};
```

In the active session beer row metadata, add:

```tsx
                        <SubmissionStatusChip status={beer.beverage_submission_status} />
```

Place it beside `beerRowMeta`, not as a full-width banner.

- [ ] **Step 3: Add status chip helper in `EditSessionScreen.tsx`**

Add the same `SubmissionStatusChip` helper after type declarations.

In `beerRowMetaLine`, add:

```tsx
                  <SubmissionStatusChip status={beer.beverage_submission_status} />
```

- [ ] **Step 4: Add shared screen-local styles**

In both screens, add:

```ts
  submissionStatusChip: {
    minHeight: 22,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  submissionStatusText: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '900',
  },
```

If `RecordScreen` does not currently have a metadata row wrapper, add:

```ts
  beerRowMetaLine: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
```

Then wrap the existing metadata text:

```tsx
                        <View style={styles.beerRowMetaLine}>
                          <Text style={styles.beerRowMeta}>{getBeerLine(beer)}</Text>
                          <SubmissionStatusChip status={beer.beverage_submission_status} />
                        </View>
```

- [ ] **Step 5: Run TypeScript**

Run:

```powershell
npx tsc --noEmit
```

Expected: TypeScript exits with no errors.

- [ ] **Step 6: Commit status display**

Run:

```powershell
git add src/screens/RecordScreen.tsx src/screens/EditSessionScreen.tsx
git commit -m "feat: show beverage submission status on owner views"
```

---

### Task 11: Focused Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm run test:session-beers
npm run test:record-session-drinks
npm run test:admin-tools
npm run test:notifications
npm run test:native-notification-routing
npx tsc --noEmit
```

Expected:

```text
session beer formatting checks passed
record session drink checks passed
admin tools checks passed
notification message checks passed
native notification routing checks passed
```

and TypeScript exits with no errors.

- [ ] **Step 2: Build the web app**

Run:

```powershell
npm run build:web
```

Expected: Expo export completes and `scripts/versionServiceWorker.js` runs without errors.

- [ ] **Step 3: Review final diff**

Run:

```powershell
git status --short
git diff --stat HEAD
```

Expected: either no uncommitted files, or only small verification fixes in files named by this plan.

- [ ] **Step 4: Commit verification fixes when present**

If Step 1 or Step 2 required fixes, commit only the touched plan files:

```powershell
git add supabase/migrations/20260708170000_add_user_beverage_submissions.sql src/lib/beverageSubmissions.ts src/lib/sessionBeers.ts src/lib/adminApi.ts src/lib/adminTools.ts src/lib/notificationMessages.ts src/lib/nativeNotificationRouting.ts src/navigation/RootNavigator.tsx src/components/BeerDraftForm.tsx src/screens/RecordScreen.tsx src/screens/EditSessionScreen.tsx src/screens/AdminToolsScreen.tsx src/screens/NotificationsScreen.tsx supabase/functions/send-push/index.ts scripts/sessionBeers.test.js scripts/recordSessionDrinks.test.js scripts/adminTools.test.js scripts/notifications.test.js
git commit -m "fix: finalize beverage submission flow"
```

If `git status --short` is empty, do not create a verification commit.

## Self-Review Checklist

- [ ] The migration creates `beverage_submissions`, session drink link fields, notification type support, and all four RPCs.
- [ ] The user RPC inserts the session drink and submission in one transaction.
- [ ] The user RPC verifies session ownership.
- [ ] Admin RPCs call `public.is_current_user_admin()`.
- [ ] Approval adds or reuses `admin_beverages` and refreshes the client catalog.
- [ ] Rejection keeps the drink name, resets ABV to `5` for beer/drink or `12` for wine, and does not delete post history.
- [ ] Public feed display stays calm and does not show submission warning banners.
- [ ] Owner/admin contexts can see pending/approved/rejected status.
- [ ] Admin notifications route to Admin Tools with `initialSegment: 'submissions'`.
- [ ] Focused tests, TypeScript, and web build are run before completion.
