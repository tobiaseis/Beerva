# Admin Challenge Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reversible admin archive/restore flow that removes old challenges from normal app surfaces without deleting their history.

**Architecture:** Store archive state directly on `public.challenges`, expose archive/restore through admin-only RPCs, and filter archived rows from public challenge RPCs. Extend the existing admin API and `AdminToolsScreen` rather than adding a new admin route.

**Tech Stack:** Expo React Native, TypeScript, Supabase Postgres/RPC/RLS, Node source-level regression scripts.

---

## File Structure

### Create

- `supabase/migrations/20260603120000_add_admin_challenge_archive.sql`
  - Adds archive metadata, secure archive/restore RPCs, public challenge filters, finalizer filters, RLS policy updates, grants, comments, and schema reload.

### Modify

- `scripts/adminTools.test.js`
  - Adds source-level checks for archive migration, RPCs, client API wrappers, mapper fields, and admin UI controls.
- `scripts/challenges.test.js`
  - Adds source-level checks that public challenge RPCs and finalizers filter archived rows.
- `src/lib/adminApi.ts`
  - Maps `archived_at`/`archived_by` and exposes `archiveAdminChallenge`/`restoreAdminChallenge`.
- `src/screens/AdminToolsScreen.tsx`
  - Shows archived status and adds archive/restore actions in the challenge modal.

## Task 1: Add Failing Archive Regression Checks

**Files:**
- Modify: `scripts/adminTools.test.js`
- Modify: `scripts/challenges.test.js`

- [ ] **Step 1: Add the archive migration constant and assertions to `scripts/adminTools.test.js`**

Add this constant after `retryMigrationPath`:

```js
const archiveMigrationPath = 'supabase/migrations/20260603120000_add_admin_challenge_archive.sql';
```

Add this existence check after the retry migration existence check:

```js
assert.ok(exists(archiveMigrationPath), 'admin challenge archive migration should exist');
```

Add this block after the retry migration assertions:

```js
const archiveMigrationSql = read(archiveMigrationPath);
assert.match(archiveMigrationSql, /add column if not exists archived_at timestamp with time zone/i);
assert.match(archiveMigrationSql, /add column if not exists archived_by uuid references auth\.users\(id\) on delete set null/i);
assert.match(archiveMigrationSql, /create index if not exists challenges_unarchived_window_idx/i);
assert.match(archiveMigrationSql, /create or replace function public\.admin_archive_challenge\(target_challenge_id uuid\)/i);
assert.match(archiveMigrationSql, /create or replace function public\.admin_restore_challenge\(target_challenge_id uuid\)/i);
assert.match(archiveMigrationSql, /raise exception 'Only ended challenges can be archived\.'/i);
assert.match(archiveMigrationSql, /public\.is_current_user_admin\(\)/i);
assert.match(archiveMigrationSql, /archived_at is null/i);
assert.match(archiveMigrationSql, /revoke execute on function public\.admin_archive_challenge\(uuid\) from public, anon;/i);
assert.match(archiveMigrationSql, /revoke execute on function public\.admin_restore_challenge\(uuid\) from public, anon;/i);
assert.match(archiveMigrationSql, /grant execute on function public\.admin_archive_challenge\(uuid\) to authenticated;/i);
assert.match(archiveMigrationSql, /grant execute on function public\.admin_restore_challenge\(uuid\) to authenticated;/i);
```

Add these admin API/UI assertions near the existing `adminApiSource` and `adminScreenSource` checks:

```js
assert.match(adminApiSource, /archived_at\?: string \| null;/);
assert.match(adminApiSource, /archivedBy: toStringOrNull\(row\.archived_by\)/);
assert.match(adminApiSource, /archiveAdminChallenge/);
assert.match(adminApiSource, /supabase\.rpc\('admin_archive_challenge'/);
assert.match(adminApiSource, /restoreAdminChallenge/);
assert.match(adminApiSource, /supabase\.rpc\('admin_restore_challenge'/);
assert.match(adminScreenSource, /Archive Challenge/);
assert.match(adminScreenSource, /Restore Challenge/);
assert.match(adminScreenSource, /confirmDestructive/);
assert.doesNotMatch(adminScreenSource, /Delete challenge|Delete beer/);
```

Remove the older duplicate `assert.doesNotMatch(adminScreenSource, /Delete challenge|Delete beer/);` if the added block creates the same assertion twice.

- [ ] **Step 2: Add archive migration checks to `scripts/challenges.test.js`**

Add this constant after `adminChallengesMigrationPath`:

```js
const archiveMigrationPath = 'supabase/migrations/20260603120000_add_admin_challenge_archive.sql';
```

Add this existence assertion near the other migration existence checks:

```js
assert.ok(exists(archiveMigrationPath), 'admin challenge archive migration should exist');
```

Add this block after the `adminChallengesMigrationSql` checks:

```js
const archiveMigrationSql = read(archiveMigrationPath);
assert.match(
  archiveMigrationSql,
  /create or replace function public\.get_official_challenges\(\)[\s\S]*where challenges\.archived_at is null/i,
  'official challenge summaries should exclude archived challenges'
);
assert.match(
  archiveMigrationSql,
  /create or replace function public\.get_challenge_detail\(target_challenge_slug text\)[\s\S]*and challenges\.archived_at is null/i,
  'challenge detail should not resolve archived challenges'
);
assert.match(
  archiveMigrationSql,
  /create or replace function public\.join_challenge\(target_challenge_id uuid\)[\s\S]*and challenges\.archived_at is null/i,
  'joining should reject archived challenges'
);
assert.match(
  archiveMigrationSql,
  /create or replace function public\.get_challenge_leaderboard\(target_challenge_id uuid\)[\s\S]*where challenges\.id = target_challenge_id[\s\S]*and challenges\.archived_at is null/i,
  'direct leaderboard calls should not expose archived challenge rows'
);
assert.match(
  archiveMigrationSql,
  /finalize_generic_due_challenges[\s\S]*and challenges\.archived_at is null/i,
  'generic finalization should skip archived challenges'
);
assert.match(
  archiveMigrationSql,
  /finalize_due_challenges[\s\S]*and challenges\.archived_at is null/i,
  'KarnevalsDruk finalization should skip archived challenges'
);
assert.match(
  archiveMigrationSql,
  /create policy "Signed-in users can view official challenges"[\s\S]*using \(archived_at is null\)/i,
  'regular challenge selects should be limited to unarchived rows'
);
```

- [ ] **Step 3: Run the focused tests and verify they fail red**

Run:

```powershell
npm run test:admin-tools
npm run test:challenges
```

Expected:

```text
FAIL admin challenge archive migration should exist
```

or an equivalent assertion failure because `supabase/migrations/20260603120000_add_admin_challenge_archive.sql` does not exist yet.

- [ ] **Step 4: Commit the red tests**

Run:

```powershell
git add scripts/adminTools.test.js scripts/challenges.test.js
git commit -m "test: define admin challenge archive behavior"
```

## Task 2: Add The Supabase Archive Migration

**Files:**
- Create: `supabase/migrations/20260603120000_add_admin_challenge_archive.sql`
- Test: `scripts/adminTools.test.js`
- Test: `scripts/challenges.test.js`

- [ ] **Step 1: Create the migration header, archive columns, index, and RLS policy**

Create `supabase/migrations/20260603120000_add_admin_challenge_archive.sql` with this opening SQL:

```sql
alter table public.challenges
  add column if not exists archived_at timestamp with time zone,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists challenges_unarchived_window_idx
  on public.challenges(starts_at desc, ends_at desc)
  where archived_at is null;

drop policy if exists "Signed-in users can view official challenges" on public.challenges;
create policy "Signed-in users can view official challenges"
  on public.challenges
  for select
  to authenticated
  using (archived_at is null);
```

- [ ] **Step 2: Add `admin_archive_challenge`**

Append this complete function:

```sql
create or replace function public.admin_archive_challenge(target_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select challenges.*
  into challenge_row
  from public.challenges
  where challenges.id = target_challenge_id
  for update;

  if challenge_row.id is null then
    raise exception 'Challenge not found.';
  end if;

  if challenge_row.archived_at is not null then
    return challenge_row;
  end if;

  if challenge_row.ends_at > now() then
    raise exception 'Only ended challenges can be archived.';
  end if;

  update public.challenges
  set
    archived_at = now(),
    archived_by = auth.uid()
  where challenges.id = target_challenge_id
  returning * into challenge_row;

  return challenge_row;
end;
$$;
```

- [ ] **Step 3: Add `admin_restore_challenge`**

Append this complete function:

```sql
create or replace function public.admin_restore_challenge(target_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_row public.challenges;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  select challenges.*
  into challenge_row
  from public.challenges
  where challenges.id = target_challenge_id
  for update;

  if challenge_row.id is null then
    raise exception 'Challenge not found.';
  end if;

  if challenge_row.archived_at is null then
    return challenge_row;
  end if;

  update public.challenges
  set
    archived_at = null,
    archived_by = null
  where challenges.id = target_challenge_id
  returning * into challenge_row;

  return challenge_row;
end;
$$;
```

- [ ] **Step 4: Replace `join_challenge` with an archived filter**

Append this replacement:

```sql
create or replace function public.join_challenge(target_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a challenge.';
  end if;

  if not exists (
    select 1
    from public.challenges
    where challenges.id = target_challenge_id
      and challenges.archived_at is null
      and now() < challenges.join_closes_at
  ) then
    raise exception 'This challenge is closed for joining.';
  end if;

  insert into public.challenge_entries(challenge_id, user_id)
  values (target_challenge_id, auth.uid())
  on conflict (challenge_id, user_id) do nothing;
end;
$$;
```

- [ ] **Step 5: Replace `get_challenge_leaderboard` with an archived target guard**

Copy the current full `public.get_challenge_leaderboard(target_challenge_id uuid)` body from `supabase/migrations/20260521100000_fix_challenge_leaderboard_window.sql` into the new migration and make this exact change in its `target_challenge` CTE:

```sql
  with target_challenge as (
    select *
    from public.challenges
    where challenges.id = target_challenge_id
      and challenges.archived_at is null
  ),
```

Keep the existing beer-row and legacy-session progress logic unchanged so hidden pub-crawl child sessions and legacy sessions continue to count the same way for visible challenges.

- [ ] **Step 6: Replace `get_official_challenges` with archived filters**

Copy the current full `public.get_official_challenges()` body from `supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql` into the new migration and add `challenges.archived_at is null` in every CTE or query that reads from `public.challenges`:

```sql
    join public.challenges as challenges
      on challenges.id = local_entries.challenge_id
     and challenges.archived_at is null
```

```sql
    join public.challenges as challenges
      on challenges.id = local_entries.challenge_id
     and challenges.archived_at is null
```

```sql
    from public.challenges
    where challenges.archived_at is null
```

The final `from public.challenges` query must start like this:

```sql
  from public.challenges
  left join local_challenge_rollups
    on local_challenge_rollups.id = challenges.id
  left join current_user_entries
    on current_user_entries.challenge_id = challenges.id
  left join local_current_user_ranks
    on local_current_user_ranks.challenge_id = challenges.id
  where challenges.archived_at is null
  order by
```

- [ ] **Step 7: Replace `get_challenge_detail` with an archived target guard**

Copy the current full `public.get_challenge_detail(target_challenge_slug text)` body from `supabase/migrations/20260602120000_add_local_challenge_leaderboards.sql` into the new migration and make the `target_challenge` CTE start exactly like this:

```sql
  with target_challenge as (
    select *
    from public.challenges
    where (
        challenges.slug = target_challenge_slug
        or challenges.id::text = target_challenge_slug
      )
      and challenges.archived_at is null
    limit 1
  ),
```

Keep the existing `leaderboards.local` and `leaderboards.global` JSON shape unchanged.

- [ ] **Step 8: Replace `finalize_generic_due_challenges` with an archived filter**

Copy the current full `public.finalize_generic_due_challenges(batch_size integer default 10)` body from `supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql` into the new migration and add this predicate to the loop query:

```sql
      and challenges.archived_at is null
```

The loop query must include this exact sequence:

```sql
    where challenges.challenge_type = 'leaderboard'
      and challenges.slug <> 'karnevalsdruk-2026'
      and challenges.ends_at <= now()
      and challenges.finalized_at is null
      and challenges.archived_at is null
```

- [ ] **Step 9: Replace `finalize_due_challenges` with an archived filter**

Copy the current full `public.finalize_due_challenges(batch_size integer default 10)` body from `supabase/migrations/20260525100000_recover_karnevalsdruk_finalization.sql` into the new migration and add this predicate to the loop query:

```sql
      and challenges.archived_at is null
```

The loop query must include this exact sequence:

```sql
    where challenges.challenge_type = 'leaderboard'
      and challenges.ends_at <= now()
      and challenges.finalized_at is null
      and challenges.archived_at is null
```

Do not change the KarnevalsDruk award slugs or official post conflict constraints.

- [ ] **Step 10: Add grants, comments, and schema reload**

Append this closing SQL:

```sql
revoke execute on function public.admin_archive_challenge(uuid) from public, anon;
revoke execute on function public.admin_restore_challenge(uuid) from public, anon;
grant execute on function public.admin_archive_challenge(uuid) to authenticated;
grant execute on function public.admin_restore_challenge(uuid) to authenticated;

revoke execute on function public.join_challenge(uuid) from public, anon;
revoke execute on function public.get_challenge_leaderboard(uuid) from public, anon;
revoke execute on function public.get_official_challenges() from public, anon;
revoke execute on function public.get_challenge_detail(text) from public, anon;
grant execute on function public.join_challenge(uuid) to authenticated;
grant execute on function public.get_challenge_leaderboard(uuid) to authenticated;
grant execute on function public.get_official_challenges() to authenticated;
grant execute on function public.get_challenge_detail(text) to authenticated;

revoke execute on function public.finalize_due_challenges(integer) from public, anon, authenticated;
revoke execute on function public.finalize_generic_due_challenges(integer) from public, anon, authenticated;
grant execute on function public.finalize_due_challenges(integer) to service_role;
grant execute on function public.finalize_generic_due_challenges(integer) to service_role;

comment on column public.challenges.archived_at
  is 'When set, hides the challenge from normal app challenge surfaces while preserving history for admins.';
comment on column public.challenges.archived_by
  is 'Admin user who archived the challenge most recently.';
comment on function public.admin_archive_challenge(uuid)
  is 'Admin-only RPC that hides an ended challenge without deleting challenge history.';
comment on function public.admin_restore_challenge(uuid)
  is 'Admin-only RPC that restores an archived challenge to normal app challenge surfaces.';

notify pgrst, 'reload schema';
```

- [ ] **Step 11: Run archive migration tests**

Run:

```powershell
npm run test:admin-tools
npm run test:challenges
```

Expected:

```text
admin tools checks passed
official challenge checks passed
```

If `test:admin-tools` still fails on missing client API/UI archive symbols, continue to Task 3. The SQL-related assertions should pass before moving on.

- [ ] **Step 12: Commit the migration**

Run:

```powershell
git add supabase/migrations/20260603120000_add_admin_challenge_archive.sql
git commit -m "feat: add admin challenge archive RPCs"
```

## Task 3: Add Admin API Archive Wrappers

**Files:**
- Modify: `src/lib/adminApi.ts`
- Test: `scripts/adminTools.test.js`

- [ ] **Step 1: Extend admin challenge row and model types**

In `src/lib/adminApi.ts`, update `AdminChallengeRow` with:

```ts
  archived_at?: string | null;
  archived_by?: string | null;
```

Update `AdminChallenge` with:

```ts
  archivedAt: string | null;
  archivedBy: string | null;
```

- [ ] **Step 2: Map archive metadata**

In `mapAdminChallengeRow`, add:

```ts
  archivedAt: toStringOrNull(row.archived_at),
  archivedBy: toStringOrNull(row.archived_by),
```

The full tail of the mapper should look like:

```ts
  winnerTrophyEnabled: row.winner_trophy_enabled === true,
  winnerTrophyTitle: toStringOrNull(row.winner_trophy_title),
  winnerTrophyDescription: toStringOrNull(row.winner_trophy_description),
  finalizedAt: toStringOrNull(row.finalized_at),
  archivedAt: toStringOrNull(row.archived_at),
  archivedBy: toStringOrNull(row.archived_by),
});
```

- [ ] **Step 3: Add a shared challenge mutation helper**

Add this helper after `fetchAdminChallenges`:

```ts
const runAdminChallengeStateMutation = async (
  rpcName: 'admin_archive_challenge' | 'admin_restore_challenge',
  challengeId: string,
  timeoutMessage: string,
  fallbackMessage: string
): Promise<AdminChallenge> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc(rpcName, { target_challenge_id: challengeId }),
      ADMIN_TIMEOUT_MS,
      timeoutMessage
    );

    if (error) throw error;
    const row = firstRow(data as AdminChallengeRow | AdminChallengeRow[] | null);
    if (!row) throw new Error('The updated challenge was not returned.');
    return mapAdminChallengeRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, fallbackMessage));
  }
};
```

- [ ] **Step 4: Add archive and restore exports**

Add these exports after the helper:

```ts
export const archiveAdminChallenge = async (challengeId: string): Promise<AdminChallenge> => (
  runAdminChallengeStateMutation(
    'admin_archive_challenge',
    challengeId,
    'Archiving the challenge is taking too long.',
    'Could not archive challenge.'
  )
);

export const restoreAdminChallenge = async (challengeId: string): Promise<AdminChallenge> => (
  runAdminChallengeStateMutation(
    'admin_restore_challenge',
    challengeId,
    'Restoring the challenge is taking too long.',
    'Could not restore challenge.'
  )
);
```

- [ ] **Step 5: Run the admin test**

Run:

```powershell
npm run test:admin-tools
```

Expected: API assertions pass. UI assertions may still fail until Task 4.

- [ ] **Step 6: Commit the API changes**

Run:

```powershell
git add src/lib/adminApi.ts
git commit -m "feat: add admin challenge archive client API"
```

## Task 4: Add Archive And Restore Controls To Admin Tools

**Files:**
- Modify: `src/screens/AdminToolsScreen.tsx`
- Test: `scripts/adminTools.test.js`
- Test: `scripts/appThemeScreens.test.js`

- [ ] **Step 1: Update imports**

Add `Archive` and `RotateCcw` to the lucide import:

```ts
import { Archive, ArrowLeft, Beer, Camera, Edit3, ImagePlus, Megaphone, Plus, RotateCcw, ShieldCheck, Trophy, X } from 'lucide-react-native';
```

Add `archiveAdminChallenge` and `restoreAdminChallenge` to the admin API import:

```ts
  archiveAdminChallenge,
  restoreAdminChallenge,
```

Add the dialog import below the beverage catalog import:

```ts
import { confirmDestructive } from '../lib/dialogs';
```

- [ ] **Step 2: Track the selected challenge row**

Add this state near the existing draft states:

```ts
  const [selectedChallenge, setSelectedChallenge] = useState<AdminChallenge | null>(null);
```

Update `openNewChallenge`:

```ts
  const openNewChallenge = () => {
    setSelectedChallenge(null);
    setChallengeDraft(createEmptyChallengeDraft());
    setFormError(null);
    setActiveModal('challenge');
  };
```

Update `openChallenge`:

```ts
  const openChallenge = (challenge: AdminChallenge) => {
    setSelectedChallenge(challenge);
    setChallengeDraft(adminChallengeToDraft(challenge));
    setFormError(null);
    setActiveModal('challenge');
  };
```

Update `closeModal` before `setActiveModal(null)`:

```ts
    setSelectedChallenge(null);
```

- [ ] **Step 3: Add archive eligibility helpers**

Add these constants after `handleSaveChallenge`:

```ts
  const selectedChallengeEnded = useMemo(() => {
    if (!selectedChallenge?.endsAt) return false;
    const endsAt = new Date(selectedChallenge.endsAt);
    return !Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= Date.now();
  }, [selectedChallenge]);

  const canArchiveSelectedChallenge = Boolean(
    selectedChallenge
      && !selectedChallenge.archivedAt
      && selectedChallengeEnded
  );

  const canRestoreSelectedChallenge = Boolean(
    selectedChallenge?.archivedAt
  );
```

- [ ] **Step 4: Add a shared refresh-after-state-change helper**

Add this function after the helpers:

```ts
  const refreshChallengesAfterStateChange = async () => {
    setChallenges(await fetchAdminChallenges());
    setSelectedChallenge(null);
    setActiveModal(null);
  };
```

- [ ] **Step 5: Add archive and restore handlers**

Add these handlers after `refreshChallengesAfterStateChange`:

```ts
  const handleArchiveChallenge = () => {
    if (!selectedChallenge || saving) return;

    confirmDestructive(
      'Archive Challenge',
      `Hide "${selectedChallenge.title}" from the app? History, entries, and awards will be kept.`,
      'Archive',
      async () => {
        setSaving(true);
        setFormError(null);
        try {
          await archiveAdminChallenge(selectedChallenge.id);
          await refreshChallengesAfterStateChange();
        } catch (error) {
          setFormError(error instanceof Error ? error.message : 'Could not archive challenge.');
        } finally {
          setSaving(false);
        }
      }
    );
  };

  const handleRestoreChallenge = async () => {
    if (!selectedChallenge || saving) return;

    setSaving(true);
    setFormError(null);
    try {
      await restoreAdminChallenge(selectedChallenge.id);
      await refreshChallengesAfterStateChange();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not restore challenge.');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 6: Show archived state in challenge rows**

In `renderChallenge`, add this block after the winner trophy accent:

```tsx
        {item.archivedAt ? (
          <Text style={styles.rowDanger} numberOfLines={1}>Archived</Text>
        ) : null}
```

Add this style next to `rowAccent`:

```ts
  rowDanger: {
    ...typography.tiny,
    color: colors.danger,
    marginTop: 3,
    fontWeight: '800',
  },
```

- [ ] **Step 7: Hide archived challenges from official-post challenge selection**

Change the official post challenge picker map from:

```tsx
                  {challenges.map((challenge) => (
```

to:

```tsx
                  {challenges.filter((challenge) => !challenge.archivedAt).map((challenge) => (
```

This keeps archived challenges visible for admin management while preventing new announcement links to archived challenges.

- [ ] **Step 8: Render archive/restore actions in the challenge modal**

After the existing save `AppButton`, add:

```tsx
              {activeModal === 'challenge' && canArchiveSelectedChallenge ? (
                <AppButton
                  label="Archive Challenge"
                  onPress={handleArchiveChallenge}
                  loading={saving}
                  variant="danger"
                  icon={<Archive color={colors.danger} size={18} />}
                />
              ) : null}
              {activeModal === 'challenge' && canRestoreSelectedChallenge ? (
                <AppButton
                  label="Restore Challenge"
                  onPress={handleRestoreChallenge}
                  loading={saving}
                  variant="secondary"
                  icon={<RotateCcw color={colors.text} size={18} />}
                />
              ) : null}
```

- [ ] **Step 9: Run admin UI tests**

Run:

```powershell
npm run test:admin-tools
npm run test:app-theme-screens
```

Expected:

```text
admin tools checks passed
app theme screen checks passed
```

- [ ] **Step 10: Commit the UI changes**

Run:

```powershell
git add src/screens/AdminToolsScreen.tsx
git commit -m "feat: add challenge archive controls"
```

## Task 5: Verify The Complete Feature

**Files:**
- Verify only.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
npm run test:admin-tools
npm run test:challenges
npm run test:official-posts
npm run test:app-theme-screens
```

Expected:

```text
admin tools checks passed
official challenge checks passed
official posts checks passed
app theme screen checks passed
```

- [ ] **Step 2: Run the web build**

Run:

```powershell
npm run build:web
```

Expected: Expo web export succeeds and `scripts/versionServiceWorker.js` completes without errors.

- [ ] **Step 3: Inspect the working tree**

Run:

```powershell
git status --short
```

Expected: no uncommitted implementation files.

- [ ] **Step 4: Report deployment note**

Include this note in the implementation completion summary:

```text
Apply supabase/migrations/20260603120000_add_admin_challenge_archive.sql to Supabase before relying on archive/restore in a deployed app.
```

## Self-Review

- Spec coverage: The plan covers archive metadata, admin archive/restore RPCs, public challenge filtering, RLS, client API wrappers, admin UI controls, tests, and deployment notes.
- Deferred-work scan: No deferred-work markers or unnamed implementation steps remain.
- Type consistency: The plan consistently uses `archived_at`/`archived_by` in database rows and `archivedAt`/`archivedBy` in TypeScript models.
