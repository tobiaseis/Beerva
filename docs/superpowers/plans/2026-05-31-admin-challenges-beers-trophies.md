# Admin Challenges, Beers, And Winner Trophies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure in-app admin area where the database-promoted admin account can create and edit ordinary beers and true-pint challenges, with optional persistent winner trophies for leaderboard challenges.

**Architecture:** Add one Supabase migration for the admin permission, beverage overlay table, secure admin RPCs, configurable leaderboard trophy fields, and generic leaderboard finalization. Keep the built-in beverage catalog in client code and merge remote admin beverages through a small provider so recording remains usable if the remote overlay fails. Add a focused admin API and one compact React Native screen opened from Profile.

**Tech Stack:** Expo React Native, TypeScript, React Navigation, Supabase Postgres/RPC/RLS, Node source-level regression scripts.

---

## File Structure

### Create

- `supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql`
  - Adds admin permission, remote beverage storage, admin RPCs, challenge trophy configuration, and generic finalization while preserving KarnevalsDruk handling.
- `src/lib/adminApi.ts`
  - Maps admin beverage/challenge rows and wraps admin RPCs with timeout handling.
- `src/lib/beverageCatalogContext.tsx`
  - Fetches remote ordinary beers, merges them with built-ins, and provides the active catalog with a built-in fallback.
- `src/lib/adminTools.ts`
  - Pure form helpers for local datetime conversion, validation, and edit/create draft mapping.
- `src/screens/AdminToolsScreen.tsx`
  - Compact `Challenges | Beers` admin surface with create/edit modal forms.
- `scripts/adminTools.test.js`
  - Source-level and pure-helper tests for the migration, APIs, provider integration, navigation, profile entry, and admin UI.

### Modify

- `src/lib/sessionBeers.ts`
  - Make lookup, option, default-volume, and payload helpers accept an optional catalog while retaining built-in defaults.
- `src/components/BeerDraftForm.tsx`
  - Consume the merged catalog from context.
- `src/navigation/RootNavigator.tsx`
  - Wrap authenticated screens with `BeverageCatalogProvider` and register `AdminTools`.
- `src/screens/ProfileScreen.tsx`
  - Show a compact admin-only entry when `profile.is_admin === true`.
- `package.json`
  - Add `test:admin-tools`.

## Task 1: Add The Failing Admin Regression Script

**Files:**
- Create: `scripts/adminTools.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing source-level test**

Create `scripts/adminTools.test.js` with Node assertions that require:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

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

const migrationPath = 'supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql';
assert.ok(exists(migrationPath), 'admin migration should exist');
assert.ok(exists('src/lib/adminApi.ts'), 'admin API should exist');
assert.ok(exists('src/lib/beverageCatalogContext.tsx'), 'beverage catalog provider should exist');
assert.ok(exists('src/lib/adminTools.ts'), 'admin form helpers should exist');
assert.ok(exists('src/screens/AdminToolsScreen.tsx'), 'admin tools screen should exist');

const migrationSql = read(migrationPath);
assert.match(migrationSql, /add column if not exists is_admin boolean not null default false/i);
assert.match(migrationSql, /lower\(email\) = 'xdrengx@gmail\.com'/i);
assert.match(migrationSql, /create or replace function public\.is_current_user_admin\(\)/i);
assert.match(migrationSql, /create table if not exists public\.admin_beverages/i);
assert.match(migrationSql, /create or replace function public\.admin_save_beverage/i);
assert.match(migrationSql, /create or replace function public\.admin_save_challenge/i);
assert.match(migrationSql, /winner_trophy_enabled boolean not null default false/i);
assert.match(migrationSql, /insert into public\.challenge_awards/i);
assert.match(migrationSql, /challenge_row\.slug <> 'karnevalsdruk-2026'/i);
assert.match(migrationSql, /raise exception 'Admin access required\.'/i);

const sessionBeers = loadTypeScriptModule('src/lib/sessionBeers.ts');
const mergedCatalog = sessionBeers.mergeBeverageCatalog([
  { name: 'Codex Lager', abv: 6.4 },
  { name: 'Tuborg Classic', abv: 99 },
]);
assert.equal(sessionBeers.getBeverageCatalogItem('Codex Lager', mergedCatalog)?.abv, 6.4);
assert.equal(sessionBeers.getBeverageCatalogItem('Tuborg Classic', mergedCatalog)?.abv, 4.6);
assert.deepEqual(
  sessionBeers.beerDraftToPayload({ beerName: 'Codex Lager', volume: '33cl', quantity: 2 }, mergedCatalog),
  { beer_name: 'Codex Lager', volume: '33cl', quantity: 2, abv: 6.4 }
);

const adminTools = loadTypeScriptModule('src/lib/adminTools.ts');
assert.equal(adminTools.toLocalDateTimeInput('2026-05-31T12:45:00.000Z', 0), '2026-05-31T12:45');
assert.equal(adminTools.fromLocalDateTimeInput('2026-05-31T12:45', 0), '2026-05-31T12:45:00.000Z');
assert.equal(adminTools.validateBeerDraft({ name: '', abv: '5' }), 'Beer name is required.');
assert.equal(
  adminTools.validateChallengeDraft({
    title: 'Summer sprint',
    description: 'Most pints wins.',
    challengeType: 'leaderboard',
    startsAt: '2026-06-01T12:00',
    endsAt: '2026-06-02T12:00',
    joinClosesAt: '2026-06-02T12:00',
    targetValue: '',
    winnerTrophyEnabled: true,
    winnerTrophyTitle: '',
    winnerTrophyDescription: '',
  }),
  'Trophy title is required.'
);

const navigatorSource = read('src/navigation/RootNavigator.tsx');
const profileSource = read('src/screens/ProfileScreen.tsx');
const adminScreenSource = read('src/screens/AdminToolsScreen.tsx');
assert.match(navigatorSource, /BeverageCatalogProvider/);
assert.match(navigatorSource, /<Stack\.Screen name="AdminTools"/);
assert.match(profileSource, /profile\?\.is_admin === true/);
assert.match(profileSource, /Admin tools/);
assert.match(adminScreenSource, /Challenges/);
assert.match(adminScreenSource, /Beers/);
assert.match(adminScreenSource, /Winner trophy/);
assert.doesNotMatch(adminScreenSource, /Delete challenge|Delete beer/);

console.log('admin tools checks passed');
```

- [ ] **Step 2: Add the package script**

Add:

```json
"test:admin-tools": "node scripts/adminTools.test.js"
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```powershell
npm run test:admin-tools
```

Expected: FAIL because the migration and new modules do not exist yet.

- [ ] **Step 4: Commit the red test**

```powershell
git add package.json scripts/adminTools.test.js
git commit -m "test: define admin tools behavior"
```

## Task 2: Add Secure Database Admin Capabilities

**Files:**
- Create: `supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql`
- Test: `scripts/adminTools.test.js`
- Test: `scripts/challenges.test.js`

- [ ] **Step 1: Add the admin permission and beverage overlay**

Create the migration with:

```sql
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

update public.profiles
set is_admin = true
where id in (
  select auth_users.id
  from auth.users as auth_users
  where lower(auth_users.email) = 'xdrengx@gmail.com'
);

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_admin = true
  );
$$;

create table if not exists public.admin_beverages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abv numeric not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint admin_beverages_name_check check (length(btrim(name)) > 0),
  constraint admin_beverages_abv_check check (abv >= 0 and abv <= 100)
);

create unique index if not exists admin_beverages_name_lower_idx
  on public.admin_beverages(lower(btrim(name)));
```

Enable RLS, grant authenticated reads, and add `get_admin_beverages()` plus `admin_save_beverage(...)`. The save RPC must reject non-admin callers with:

```sql
raise exception 'Admin access required.';
```

It must trim names, validate ABV, insert or update, set `created_by = auth.uid()` on insert, update `updated_at`, and return the saved row.

- [ ] **Step 2: Add challenge trophy fields and admin challenge RPCs**

Extend `public.challenges`:

```sql
alter table public.challenges
  add column if not exists winner_trophy_enabled boolean not null default false,
  add column if not exists winner_trophy_title text,
  add column if not exists winner_trophy_description text;
```

Add constraints for leaderboard-only trophies and consistent nullable trophy text. Add `admin_get_challenges()` and `admin_save_challenge(...)`. The save RPC must:

- require admin
- trim title and description
- set `metric_type = 'true_pints'`
- validate `starts_at < ends_at`
- validate `starts_at <= join_closes_at <= ends_at`
- require positive target only for `target`
- clear trophy configuration for target challenges
- require trophy title and description only when the leaderboard trophy toggle is true
- generate a slug for inserts with a normalized title prefix and a short `gen_random_uuid()` suffix
- lock finalized challenges
- lock type, windows, target, and trophy configuration once entries exist

- [ ] **Step 3: Add generic leaderboard finalization**

Replace `public.finalize_due_challenges(integer)` with a combined implementation:

- retain the current KarnevalsDruk dual-award branch unchanged for `slug = 'karnevalsdruk-2026'`
- add a generic branch for:

```sql
where challenges.challenge_type = 'leaderboard'
  and challenges.slug <> 'karnevalsdruk-2026'
  and challenges.ends_at <= now()
  and challenges.finalized_at is null
```

The generic branch must read rank one from `get_challenge_leaderboard`, calculate winner metadata using session-beer rows plus the existing legacy fallback, insert one `official_feed_posts` row idempotently, insert one configured `challenge_awards` row idempotently when enabled, and set `finalized_at`, `winner_user_id`, and `winner_progress_value`.

Use:

```sql
challenge_row.slug || '-winner'
```

as the generic trophy `award_slug`.

- [ ] **Step 4: Reload schema and preserve grants**

Finish the migration with:

```sql
revoke execute on function public.is_current_user_admin() from public, anon;
grant execute on function public.is_current_user_admin() to authenticated;
grant execute on function public.get_admin_beverages() to authenticated;
grant execute on function public.admin_get_challenges() to authenticated;
grant execute on function public.admin_save_beverage(uuid, text, numeric) to authenticated;
grant execute on function public.admin_save_challenge(uuid, text, text, text, numeric, timestamptz, timestamptz, timestamptz, boolean, text, text) to authenticated;
revoke execute on function public.finalize_due_challenges(integer) from public, anon, authenticated;
grant execute on function public.finalize_due_challenges(integer) to service_role;
notify pgrst, 'reload schema';
```

- [ ] **Step 5: Run database-facing source tests**

Run:

```powershell
npm run test:admin-tools
npm run test:challenges
```

Expected: `test:admin-tools` still fails only for missing client modules. Existing challenge checks pass.

- [ ] **Step 6: Commit the migration**

```powershell
git add supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql
git commit -m "feat: add secure admin challenge and beverage RPCs"
```

## Task 3: Add The Runtime Beverage Overlay

**Files:**
- Create: `src/lib/adminApi.ts`
- Create: `src/lib/beverageCatalogContext.tsx`
- Modify: `src/lib/sessionBeers.ts`
- Modify: `src/components/BeerDraftForm.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Test: `scripts/adminTools.test.js`
- Test: `scripts/sessionBeers.test.js`
- Test: `scripts/profileStats.test.js`

- [ ] **Step 1: Make catalog helpers accept an optional catalog**

In `src/lib/sessionBeers.ts`, export:

```ts
export const mergeBeverageCatalog = (remoteBeverages: BeerCatalogItem[] = []) => {
  const builtInKeys = new Set(BEER_CATALOG.map((item) => normalizeBeerName(item.name)));
  return [
    ...BEER_CATALOG,
    ...remoteBeverages.filter((item) => (
      item.name.trim().length > 0
      && !builtInKeys.has(normalizeBeerName(item.name))
    )),
  ];
};
```

Update catalog helpers to accept:

```ts
catalog: BeerCatalogItem[] = BEER_CATALOG
```

Pass the optional catalog through `getBeverageCatalogItem`, `getBeverageOptionSearchText`, `getBeverageDefaultVolume`, `isBeverageVolumeLocked`, `isBeverageAutoAdded`, `getBeerAbv`, and `beerDraftToPayload`.

- [ ] **Step 2: Add admin API mappings**

In `src/lib/adminApi.ts`, add:

```ts
export type AdminBeverage = {
  id: string;
  name: string;
  abv: number;
};

export const fetchAdminBeverages = async (): Promise<AdminBeverage[]> => {
  const { data, error } = await withTimeout(
    supabase.rpc('get_admin_beverages'),
    ADMIN_TIMEOUT_MS,
    'Drinks are taking too long to load.'
  );
  if (error) throw error;
  return (data || []).map(mapAdminBeverageRow);
};
```

Also define mapped admin challenge types and wrappers:

```ts
fetchAdminChallenges()
saveAdminBeverage(input)
saveAdminChallenge(input)
```

Use `getErrorMessage` and `withTimeout` consistently with existing API modules.

- [ ] **Step 3: Add the beverage provider**

Create `src/lib/beverageCatalogContext.tsx`:

```tsx
const BeverageCatalogContext = createContext({
  catalog: BEER_CATALOG,
  options: BEER_OPTIONS,
  refresh: async () => {},
});

export const BeverageCatalogProvider = ({ children }: { children: React.ReactNode }) => {
  const [remoteBeverages, setRemoteBeverages] = useState<BeerCatalogItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchAdminBeverages();
      setRemoteBeverages(rows.map(({ name, abv }) => ({ name, abv })));
    } catch (error) {
      console.warn('Admin beverages unavailable:', error);
      setRemoteBeverages([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const catalog = useMemo(() => mergeBeverageCatalog(remoteBeverages), [remoteBeverages]);
  const value = useMemo(() => ({
    catalog,
    options: catalog.map((item) => item.name),
    refresh,
  }), [catalog, refresh]);

  return <BeverageCatalogContext.Provider value={value}>{children}</BeverageCatalogContext.Provider>;
};
```

Export `useBeverageCatalog()`.

- [ ] **Step 4: Feed the merged catalog into recording**

In `BeerDraftForm`, call:

```ts
const { catalog, options } = useBeverageCatalog();
```

Use `options` for autocomplete data and pass `catalog` into all lookup calls.

Add optional `catalog?: BeerCatalogItem[]` to `BeerDraftFormProps` only if focused helper testing needs dependency injection. Otherwise keep the provider as the single runtime source.

Update record and edit payload creation to pass the provider catalog where session rows are created:

```ts
beerDraftToPayload(draftToAdd, catalog)
```

Use `useBeverageCatalog()` in `RecordScreen` and `EditSessionScreen`.

- [ ] **Step 5: Wrap authenticated app screens**

In `RootNavigator`, nest:

```tsx
<BeverageCatalogProvider>
  <NotificationsProvider>
    ...
  </NotificationsProvider>
</BeverageCatalogProvider>
```

- [ ] **Step 6: Run beverage tests**

Run:

```powershell
npm run test:admin-tools
npm run test:session-beers
npm run test:stats
npm run test:record-session-drinks
```

Expected: helper checks pass; admin source checks still fail only because the admin screen and route do not exist.

- [ ] **Step 7: Commit the overlay**

```powershell
git add src/lib/adminApi.ts src/lib/beverageCatalogContext.tsx src/lib/sessionBeers.ts src/components/BeerDraftForm.tsx src/screens/RecordScreen.tsx src/screens/EditSessionScreen.tsx src/navigation/RootNavigator.tsx
git commit -m "feat: merge admin beers into recording catalog"
```

## Task 4: Add Pure Admin Form Helpers

**Files:**
- Create: `src/lib/adminTools.ts`
- Test: `scripts/adminTools.test.js`

- [ ] **Step 1: Add local datetime conversion helpers**

Create:

```ts
export const toLocalDateTimeInput = (isoValue?: string | null, offsetMinutes = new Date().getTimezoneOffset()) => {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 16);
};

export const fromLocalDateTimeInput = (value: string, offsetMinutes = new Date().getTimezoneOffset()) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return new Date(utcMs + offsetMinutes * 60_000).toISOString();
};
```

- [ ] **Step 2: Add draft types and validation**

Add:

```ts
export type AdminBeerDraft = { id?: string; name: string; abv: string };
export type AdminChallengeDraft = {
  id?: string;
  title: string;
  description: string;
  challengeType: 'target' | 'leaderboard';
  targetValue: string;
  startsAt: string;
  endsAt: string;
  joinClosesAt: string;
  winnerTrophyEnabled: boolean;
  winnerTrophyTitle: string;
  winnerTrophyDescription: string;
};
```

Implement:

```ts
validateBeerDraft(draft)
validateChallengeDraft(draft)
createEmptyBeerDraft()
createEmptyChallengeDraft()
adminChallengeToDraft(challenge)
```

Validation messages must be specific and stable, including:

```ts
'Beer name is required.'
'ABV must be between 0 and 100.'
'Challenge title is required.'
'Challenge description is required.'
'Use YYYY-MM-DDTHH:mm for challenge dates.'
'Challenge end must be after its start.'
'Joining must close between the challenge start and end.'
'Target true pints must be greater than 0.'
'Trophy title is required.'
'Trophy description is required.'
```

- [ ] **Step 3: Run helper tests**

Run:

```powershell
npm run test:admin-tools
```

Expected: helper assertions pass; route and screen checks still fail.

- [ ] **Step 4: Commit helpers**

```powershell
git add src/lib/adminTools.ts
git commit -m "feat: add admin form validation helpers"
```

## Task 5: Build The Admin Screen And Profile Entry

**Files:**
- Create: `src/screens/AdminToolsScreen.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/ProfileScreen.tsx`
- Test: `scripts/adminTools.test.js`
- Test: `scripts/appThemeScreens.test.js`

- [ ] **Step 1: Register the stack route**

Import and register:

```tsx
import { AdminToolsScreen } from '../screens/AdminToolsScreen';
...
<Stack.Screen name="AdminTools" component={AdminToolsScreen} />
```

- [ ] **Step 2: Add a conditional Profile entry**

Import `ShieldCheck` and add above logout:

```tsx
{profile?.is_admin === true ? (
  <TouchableOpacity style={styles.adminButton} onPress={() => navigation.navigate('AdminTools')}>
    <ShieldCheck color={colors.primary} size={20} />
    <Text style={styles.adminButtonText}>Admin tools</Text>
  </TouchableOpacity>
) : null}
```

Match the quiet settings-row styling already used for push controls.

- [ ] **Step 3: Build the compact admin list surface**

Create `AdminToolsScreen.tsx` with:

- top bar with `ArrowLeft`, title `Admin tools`, and a spacer
- segmented control for `Challenges | Beers`
- one compact list row per challenge or admin beverage
- `Plus` icon action with accessible label for the active tab
- edit rows opened by row press
- `ActivityIndicator`, empty-state copy, inline error text, and pull-to-refresh
- no delete controls

Use existing `colors`, `radius`, `spacing`, `typography`, `AppButton`, and lucide icons.

- [ ] **Step 4: Build the beer modal**

The beer form contains:

```tsx
<TextInput placeholder="Beer name" ... />
<TextInput placeholder="ABV %" keyboardType="decimal-pad" ... />
```

On save:

```ts
const error = validateBeerDraft(beerDraft);
if (error) {
  setFormError(error);
  return;
}
await saveAdminBeverage({
  id: beerDraft.id,
  name: beerDraft.name.trim(),
  abv: Number(beerDraft.abv.replace(',', '.')),
});
await Promise.all([loadBeers(), refreshCatalog()]);
```

- [ ] **Step 5: Build the challenge modal**

Use compact controls:

- `TextInput` for title and description
- segmented `Target | Leaderboard` control
- text inputs for local `YYYY-MM-DDTHH:mm`
- numeric target input only for target challenges
- `Switch` labeled `Winner trophy` only for leaderboard challenges
- title and description inputs only while the trophy switch is on

On save, validate then call:

```ts
await saveAdminChallenge({
  id: challengeDraft.id,
  title: challengeDraft.title.trim(),
  description: challengeDraft.description.trim(),
  challengeType: challengeDraft.challengeType,
  targetValue: challengeDraft.challengeType === 'target' ? Number(challengeDraft.targetValue) : null,
  startsAt: fromLocalDateTimeInput(challengeDraft.startsAt)!,
  endsAt: fromLocalDateTimeInput(challengeDraft.endsAt)!,
  joinClosesAt: fromLocalDateTimeInput(challengeDraft.joinClosesAt)!,
  winnerTrophyEnabled: challengeDraft.challengeType === 'leaderboard' && challengeDraft.winnerTrophyEnabled,
  winnerTrophyTitle: challengeDraft.winnerTrophyEnabled ? challengeDraft.winnerTrophyTitle.trim() : null,
  winnerTrophyDescription: challengeDraft.winnerTrophyEnabled ? challengeDraft.winnerTrophyDescription.trim() : null,
});
```

- [ ] **Step 6: Run UI source checks**

Run:

```powershell
npm run test:admin-tools
npm run test:app-theme-screens
```

Expected: PASS.

- [ ] **Step 7: Commit UI**

```powershell
git add src/screens/AdminToolsScreen.tsx src/screens/ProfileScreen.tsx src/navigation/RootNavigator.tsx
git commit -m "feat: add in-app admin tools screen"
```

## Task 6: Verify The Complete Feature

**Files:**
- Verify only.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
npm run test:admin-tools
npm run test:session-beers
npm run test:challenges
npm run test:stats
npm run test:record-session-drinks
npm run test:app-theme-screens
```

Expected: all commands PASS.

- [ ] **Step 2: Run the web build**

Run:

```powershell
npm run build:web
```

Expected: Expo web export succeeds.

- [ ] **Step 3: Inspect working tree**

Run:

```powershell
git status --short
```

Expected: no uncommitted implementation files.

- [ ] **Step 4: Review migration deployment note**

Do not push the migration automatically. Report that:

```text
supabase/migrations/20260531170000_add_admin_challenges_and_beverages.sql
```

must be applied to the linked Supabase project before the deployed app can expose working admin RPCs or remote beers.

