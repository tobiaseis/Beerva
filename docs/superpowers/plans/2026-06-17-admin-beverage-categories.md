# Admin Beverage Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins add beers, wines, and drinks from Admin tools while preserving category-aware recording defaults and beer-only trophy behavior.

**Architecture:** Add category columns to admin beverage rows and recorded session drink rows. Carry category through the admin RPC, client admin API, catalog merge, drink payload creation, record/edit persistence, feed/detail hydration, and profile stats. Wine becomes a normal catalog item with a `15cl` default volume, while drinks stay selectable like beers but are excluded from beer-only ABV trophies through the captured row category.

**Tech Stack:** Expo React Native, TypeScript, Supabase SQL migrations/RPCs, Node assertion scripts.

---

## File Structure

- Create `supabase/migrations/20260617120000_add_admin_beverage_categories.sql`: database category columns, constraints, admin beverage RPC updates, feed-details beverage JSON update, profile-stats category-aware strongest ABV update.
- Modify `scripts/adminTools.test.js`: database/admin API/UI source checks for beverage categories.
- Modify `scripts/sessionBeers.test.js`: pure catalog and payload behavior checks for wine/drink category mapping.
- Modify `scripts/profileStats.test.js`: local stats checks for captured beverage categories.
- Modify `scripts/sessionFeedDetails.test.js`: feed-details RPC and mapper checks for `beverage_category`.
- Modify `src/lib/adminApi.ts`: `AdminBeverageCategory`, category mapping, save payload, category-aware error text.
- Modify `src/lib/adminTools.ts`: category-aware admin beverage draft helpers and validation.
- Modify `src/lib/beverageCatalogContext.tsx`: pure admin beverage to catalog mapper and runtime mapping.
- Modify `src/lib/sessionBeers.ts`: add `drink` kind, `beverage_category` on session rows and payloads, category normalization helper.
- Modify `src/lib/profileStats.ts`: local stats reads captured row category.
- Modify `src/lib/profileStatsApi.ts`: fallback stats query selects and passes `beverage_category`.
- Modify `src/lib/sessionFeedDetails.ts`: feed detail row beers carry `beverage_category` and default defensively.
- Modify `src/screens/AdminToolsScreen.tsx`: beverage wording, category selector, category save/edit flow.
- Modify `src/screens/RecordScreen.tsx`: select inserted/fetched drink category fields.
- Modify `src/screens/EditSessionScreen.tsx`: select/update/insert drink category fields.

---

### Task 1: Database and Admin Contract Tests

**Files:**
- Modify: `scripts/adminTools.test.js`

- [ ] **Step 1: Write failing database/admin category tests**

In `scripts/adminTools.test.js`, add a new migration path after `archiveMigrationPath`:

```js
const beverageCategoryMigrationPath = 'supabase/migrations/20260617120000_add_admin_beverage_categories.sql';
assert.ok(exists(beverageCategoryMigrationPath), 'admin beverage category migration should exist');
```

After `const archiveMigrationSql = read(archiveMigrationPath);`, add:

```js
const beverageCategoryMigrationSql = read(beverageCategoryMigrationPath);
```

After the existing admin beverage migration assertions, add these assertions:

```js
assert.match(beverageCategoryMigrationSql, /alter table public\.admin_beverages[\s\S]*add column if not exists category text not null default 'beer'/i);
assert.match(beverageCategoryMigrationSql, /admin_beverages_category_check/i);
assert.match(beverageCategoryMigrationSql, /category in \('beer', 'wine', 'drink'\)/i);
assert.match(beverageCategoryMigrationSql, /alter table public\.session_beers[\s\S]*add column if not exists beverage_category text not null default 'beer'/i);
assert.match(beverageCategoryMigrationSql, /session_beers_beverage_category_check/i);
assert.match(beverageCategoryMigrationSql, /beverage_category in \('beer', 'wine', 'drink'\)/i);
assert.match(beverageCategoryMigrationSql, /returns table \([\s\S]*category text/i, 'admin beverages RPC should return category');
assert.match(beverageCategoryMigrationSql, /beverage_category text default 'beer'/i, 'admin save beverage should accept category');
assert.match(beverageCategoryMigrationSql, /clean_category not in \('beer', 'wine', 'drink'\)/i, 'admin save beverage should validate category');
assert.match(beverageCategoryMigrationSql, /insert into public\.admin_beverages \([\s\S]*category/i, 'admin save beverage should insert category');
assert.match(beverageCategoryMigrationSql, /set[\s\S]*category = clean_category/i, 'admin save beverage should update category');
assert.match(beverageCategoryMigrationSql, /drop function if exists public\.admin_save_beverage\(uuid, text, numeric\)/i, 'migration should drop old admin save beverage signature');
assert.match(beverageCategoryMigrationSql, /grant execute on function public\.admin_save_beverage\(uuid, text, numeric, text\) to authenticated/i);
assert.match(beverageCategoryMigrationSql, /'beverage_category', sb\.beverage_category/i, 'feed details beverage JSON should include category');
assert.match(beverageCategoryMigrationSql, /session_beers\.beverage_category/i, 'profile stats should read captured beverage category');
assert.match(beverageCategoryMigrationSql, /not is_captured_wine and not is_captured_drink/i, 'strongest ABV should exclude captured wine and drink categories');
assert.match(beverageCategoryMigrationSql, /notify pgrst, 'reload schema'/i);
```

In the `adminApiSource` assertions near the bottom, add:

```js
assert.match(adminApiSource, /AdminBeverageCategory/, 'admin API should expose beverage category type');
assert.match(adminApiSource, /category: mapAdminBeverageCategory\(row\.category\)/, 'admin API should map beverage category');
assert.match(adminApiSource, /beverage_category: input\.category/, 'admin save payload should send category');
```

In the `adminTools` module assertions after the current `validateBeerDraft` checks, add:

```js
assert.equal(adminTools.validateBeverageDraft({ name: '', abv: '5', category: 'beer' }), 'Beverage name is required.');
assert.equal(adminTools.validateBeverageDraft({ name: 'House Champagne', abv: '12', category: 'wine' }), null);
assert.equal(adminTools.validateBeverageDraft({ name: 'Mystery', abv: '5', category: 'other' }), 'Choose a beverage category.');
assert.equal(adminTools.createEmptyBeverageDraft().category, 'beer');
```

In the `adminScreenSource` assertions, add:

```js
assert.match(adminScreenSource, /Beverages/);
assert.match(adminScreenSource, /Add beverage/);
assert.match(adminScreenSource, /Save Beverage/);
assert.match(adminScreenSource, /Beer[\s\S]*Wine[\s\S]*Drink/, 'admin beverage form should expose category options');
assert.doesNotMatch(adminScreenSource, /Admin beers/);
assert.doesNotMatch(adminScreenSource, /No admin-added beers yet/);
```

- [ ] **Step 2: Run the admin tools test to verify it fails**

Run:

```bash
npm run test:admin-tools
```

Expected: FAIL with `admin beverage category migration should exist`.

---

### Task 2: Catalog and Payload Failing Tests

**Files:**
- Modify: `scripts/sessionBeers.test.js`

- [ ] **Step 1: Write failing catalog and payload tests**

Update the destructuring import near the top of `scripts/sessionBeers.test.js`:

```js
const {
  beerDraftToPayload,
  getBeverageCatalogItem,
  getBeverageDefaultVolume,
  isBeverageAutoAdded,
  isBeverageVolumeLocked,
  getSessionBeerBreakdownLines,
  getSessionBeerSummary,
  mergeBeverageCatalog,
} = loadTypeScriptModule('src/lib/sessionBeers.ts');
```

After the existing `remote ordinary beers merge without overriding built-ins` check, add:

```js
check('remote wine maps to 15cl default without auto-add', () => {
  const catalog = mergeBeverageCatalog([
    { name: 'House Champagne', abv: 12.5, kind: 'wine', defaultVolume: '15cl' },
  ]);

  assert.equal(getBeverageCatalogItem('House Champagne', catalog)?.kind, 'wine');
  assert.equal(getBeverageDefaultVolume('House Champagne', catalog), '15cl');
  assert.equal(isBeverageVolumeLocked('House Champagne', catalog), false);
  assert.equal(isBeverageAutoAdded('House Champagne', catalog), false);
  assert.deepEqual(
    beerDraftToPayload({ beerName: 'House Champagne', volume: 'Pint', quantity: 1 }, catalog),
    { beer_name: 'House Champagne', volume: 'Pint', quantity: 1, abv: 12.5, beverage_category: 'wine' }
  );
});

check('remote drink maps to normal selectable drink category', () => {
  const catalog = mergeBeverageCatalog([
    { name: 'House Vodka Juice', abv: 37.5, kind: 'drink' },
  ]);

  assert.equal(getBeverageCatalogItem('House Vodka Juice', catalog)?.kind, 'drink');
  assert.equal(getBeverageDefaultVolume('House Vodka Juice', catalog), null);
  assert.equal(isBeverageVolumeLocked('House Vodka Juice', catalog), false);
  assert.equal(isBeverageAutoAdded('House Vodka Juice', catalog), false);
  assert.deepEqual(
    beerDraftToPayload({ beerName: 'House Vodka Juice', volume: '4cl', quantity: 2 }, catalog),
    { beer_name: 'House Vodka Juice', volume: '4cl', quantity: 2, abv: 37.5, beverage_category: 'drink' }
  );
});

check('ordinary beer payload records beer category', () => {
  const catalog = mergeBeverageCatalog([{ name: 'Codex Lager', abv: 6.4, kind: 'beer' }]);

  assert.deepEqual(
    beerDraftToPayload({ beerName: 'Codex Lager', volume: '33cl', quantity: 2 }, catalog),
    { beer_name: 'Codex Lager', volume: '33cl', quantity: 2, abv: 6.4, beverage_category: 'beer' }
  );
});
```

- [ ] **Step 2: Run the session beers test to verify it fails**

Run:

```bash
npm run test:session-beers
```

Expected: FAIL because `beerDraftToPayload` does not return `beverage_category` and `BeverageKind` does not support `drink`.

---

### Task 3: Profile Stats Failing Tests

**Files:**
- Modify: `scripts/profileStats.test.js`

- [ ] **Step 1: Write failing local stats tests for captured beverage category**

After the existing `wineStats` strongest ABV assertion, add:

```js
const customWineCategoryStats = calculateStats([
  baseRow({ session_id: 'beer', beer_name: 'Pint Beer', volume: 'Pint', abv: 5, beverage_category: 'beer' }),
  baseRow({ session_id: 'custom-wine', beer_name: 'House Champagne', volume: '15cl', abv: 12.5, beverage_category: 'wine' }),
]);

assert.equal(
  customWineCategoryStats.strongestAbv,
  5,
  'custom wine category should not count toward beer-only strongest ABV trophies'
);

const customDrinkCategoryStats = calculateStats([
  baseRow({ session_id: 'beer', beer_name: 'Pint Beer', volume: 'Pint', abv: 5, beverage_category: 'beer' }),
  baseRow({ session_id: 'custom-drink', beer_name: 'House Vodka Juice', volume: '4cl', abv: 37.5, beverage_category: 'drink' }),
]);

assert.equal(
  customDrinkCategoryStats.strongestAbv,
  5,
  'custom drink category should not count toward beer-only strongest ABV trophies'
);

const customBeerCategoryStats = calculateStats([
  baseRow({ session_id: 'custom-beer', beer_name: 'House Triple IPA', volume: '33cl', abv: 12.1, beverage_category: 'beer' }),
  baseRow({ session_id: 'custom-drink', beer_name: 'House Vodka Juice', volume: '4cl', abv: 37.5, beverage_category: 'drink' }),
]);

assert.equal(
  customBeerCategoryStats.strongestAbv,
  12.1,
  'custom beer category should still count toward beer-only strongest ABV trophies'
);
```

Near the assertions that read `profileStatsApiSource` and `profileStatsSource`, add:

```js
assert.match(profileStatsSource, /beverage_category/, 'local profile stats should read captured beverage category');
assert.match(profileStatsApiSource, /beverage_category/, 'profile stats fallback query should select captured beverage category');
assert.match(profileStatsApiSource, /beverage_category: beer\.beverage_category/, 'profile stats fallback rows should pass captured beverage category');
```

Near the `commonCocktailsMigration` assertions, add:

```js
const beverageCategoryMigrationPath = 'supabase/migrations/20260617120000_add_admin_beverage_categories.sql';
assert.ok(exists(beverageCategoryMigrationPath), 'admin beverage category migration should exist');
const beverageCategoryMigration = readSource(beverageCategoryMigrationPath);
assert.match(
  beverageCategoryMigration,
  /session_beers\.beverage_category = 'wine'/,
  'profile stats migration should classify captured wine rows'
);
assert.match(
  beverageCategoryMigration,
  /session_beers\.beverage_category = 'drink'/,
  'profile stats migration should classify captured drink rows'
);
assert.match(
  beverageCategoryMigration,
  /not is_captured_wine and not is_captured_drink/,
  'profile stats migration should exclude captured wine and drink from strongest beer ABV'
);
```

- [ ] **Step 2: Run the profile stats test to verify it fails**

Run:

```bash
npm run test:stats
```

Expected: FAIL because `ProfileSessionStatsRow` does not have `beverage_category` and the migration does not exist.

---

### Task 4: Feed Details Failing Tests

**Files:**
- Modify: `scripts/sessionFeedDetails.test.js`

- [ ] **Step 1: Write failing feed details tests**

In the fixture passed to `mapSessionFeedDetailRow`, add `beverage_category` to the first beer object:

```js
beers: [{ id: 'beer-1', beer_name: 'Tuborg', volume: '33cl', quantity: 1, abv: 4.6, beverage_category: 'beer' }],
```

After the assertion for `mapped.beers[0].beer_name`, add:

```js
assert.equal(mapped.beers[0].beverage_category, 'beer', 'mapper passes captured beverage category through in app shape');
```

Add these source assertions after the existing session feed details source checks:

```js
const beverageCategoryMigrationPath = path.join(root, 'supabase/migrations/20260617120000_add_admin_beverage_categories.sql');
assert.equal(fs.existsSync(beverageCategoryMigrationPath), true, 'admin beverage category migration should exist');
const beverageCategorySql = fs.readFileSync(beverageCategoryMigrationPath, 'utf8');
assert.match(beverageCategorySql, /'beverage_category', sb\.beverage_category/i, 'feed details RPC should include captured beverage category in beer JSON');
assert.match(feedDetailsSource, /beverage_category/, 'session feed details mapper should be category-aware');
```

- [ ] **Step 2: Run the feed details test to verify it fails**

Run:

```bash
npm run test:session-feed-details
```

Expected: FAIL because the new migration does not exist and the mapper/source does not mention `beverage_category`.

---

### Task 5: Add the Supabase Category Migration

**Files:**
- Create: `supabase/migrations/20260617120000_add_admin_beverage_categories.sql`

- [ ] **Step 1: Create the migration with category columns and constraints**

Create `supabase/migrations/20260617120000_add_admin_beverage_categories.sql` with this opening section:

```sql
alter table public.admin_beverages
  add column if not exists category text not null default 'beer';

alter table public.session_beers
  add column if not exists beverage_category text not null default 'beer';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_beverages_category_check'
      and conrelid = 'public.admin_beverages'::regclass
  ) then
    alter table public.admin_beverages
      add constraint admin_beverages_category_check
      check (category in ('beer', 'wine', 'drink'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_beers_beverage_category_check'
      and conrelid = 'public.session_beers'::regclass
  ) then
    alter table public.session_beers
      add constraint session_beers_beverage_category_check
      check (beverage_category in ('beer', 'wine', 'drink'));
  end if;
end;
$$;
```

- [ ] **Step 2: Add category-aware admin beverage RPCs to the migration**

Append this block:

```sql
create or replace function public.get_admin_beverages()
returns table (
  id uuid,
  name text,
  abv numeric,
  category text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
language sql
stable
set search_path = public
as $$
  select
    admin_beverages.id,
    admin_beverages.name,
    admin_beverages.abv,
    admin_beverages.category,
    admin_beverages.created_at,
    admin_beverages.updated_at
  from public.admin_beverages
  order by lower(admin_beverages.name), admin_beverages.id;
$$;

drop function if exists public.admin_save_beverage(uuid, text, numeric);

create or replace function public.admin_save_beverage(
  target_beverage_id uuid default null,
  beverage_name text default null,
  beverage_abv numeric default null,
  beverage_category text default 'beer'
)
returns public.admin_beverages
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(coalesce(beverage_name, ''));
  clean_category text := coalesce(nullif(btrim(coalesce(beverage_category, '')), ''), 'beer');
  saved_row public.admin_beverages;
begin
  if not public.is_current_user_admin() then
    raise exception 'Admin access required.';
  end if;

  if clean_name = '' then
    raise exception 'Beverage name is required.';
  end if;

  if beverage_abv is null or beverage_abv < 0 or beverage_abv > 100 then
    raise exception 'ABV must be between 0 and 100.';
  end if;

  if clean_category not in ('beer', 'wine', 'drink') then
    raise exception 'Choose a beverage category.';
  end if;

  if target_beverage_id is null then
    insert into public.admin_beverages (
      name,
      abv,
      category,
      created_by
    ) values (
      clean_name,
      beverage_abv,
      clean_category,
      auth.uid()
    )
    returning * into saved_row;
  else
    update public.admin_beverages
    set
      name = clean_name,
      abv = beverage_abv,
      category = clean_category,
      updated_at = now()
    where admin_beverages.id = target_beverage_id
    returning * into saved_row;

    if saved_row.id is null then
      raise exception 'Admin beverage not found.';
    end if;
  end if;

  return saved_row;
exception
  when unique_violation then
    raise exception 'A beverage with that name already exists.';
end;
$$;
```

- [ ] **Step 3: Add feed-details beverage JSON category to the migration**

Copy the current `get_session_feed_details(uuid[])` definition from `supabase/migrations/20260606120000_add_session_feed_units.sql` into this migration, preserving the `units` field and `author_current_streak` field. In the `jsonb_build_object` for `session_beers`, include:

```sql
'beverage_category', sb.beverage_category,
```

The beer JSON object in the new migration must contain this complete block:

```sql
jsonb_build_object(
  'id', sb.id,
  'session_id', sb.session_id,
  'beer_name', sb.beer_name,
  'volume', sb.volume,
  'quantity', sb.quantity,
  'abv', sb.abv,
  'beverage_category', sb.beverage_category,
  'note', sb.note,
  'consumed_at', sb.consumed_at,
  'created_at', sb.created_at
)
```

- [ ] **Step 4: Add profile stats category handling to the migration**

Copy the current `get_profile_stats(uuid)` definition from `supabase/migrations/20260604150000_add_current_streaks.sql` into this migration. In the `base` CTE, add:

```sql
      coalesce(nullif(session_beers.beverage_category, ''), 'beer') as captured_beverage_category,
```

In the `beer_rows` CTE, add these two booleans after `is_wine`:

```sql
      captured_beverage_category = 'wine' as is_captured_wine,
      captured_beverage_category = 'drink' as is_captured_drink,
```

Replace the `strongest_abv` filter with:

```sql
    coalesce(round(max(abv_value) filter (
      where not is_rtd
        and not is_jagerbomb
        and not is_sambuca
        and not is_wine
        and not is_special_mixed
        and not is_captured_wine
        and not is_captured_drink
    )::numeric, 1)::double precision, 0) as strongest_abv,
```

Keep all existing current-streak, RTD, Jagerbomb, Sambuca, wine, special mixed drink, and two-pint-week logic from the current function.

- [ ] **Step 5: Add grants, comments, and schema reload**

Append this closing block:

```sql
revoke execute on function public.get_admin_beverages() from public, anon;
revoke execute on function public.admin_save_beverage(uuid, text, numeric, text) from public, anon;
grant execute on function public.get_admin_beverages() to authenticated;
grant execute on function public.admin_save_beverage(uuid, text, numeric, text) to authenticated;

comment on table public.admin_beverages
  is 'Beverages added through the Beerva admin tools and merged into the built-in client catalog with a category.';
comment on column public.admin_beverages.category
  is 'Admin catalog category: beer, wine, or drink.';
comment on column public.session_beers.beverage_category
  is 'Captured category for the recorded drink row: beer, wine, or drink.';

notify pgrst, 'reload schema';
```

- [ ] **Step 6: Run database contract tests**

Run:

```bash
npm run test:admin-tools
```

Expected: FAIL moves from missing migration to missing TypeScript/UI category support.

---

### Task 6: Admin API and Draft Helpers

**Files:**
- Modify: `src/lib/adminApi.ts`
- Modify: `src/lib/adminTools.ts`

- [ ] **Step 1: Implement category types and mapping in `adminApi.ts`**

Add near the top of `src/lib/adminApi.ts`:

```ts
export type AdminBeverageCategory = 'beer' | 'wine' | 'drink';
```

Add `category` to `AdminBeverageRow`:

```ts
  category?: string | null;
```

Add `category` to `AdminBeverage`:

```ts
  category: AdminBeverageCategory;
```

Add `category` to `SaveAdminBeverageInput`:

```ts
  category: AdminBeverageCategory;
```

Add this mapper near `toNumber`:

```ts
export const mapAdminBeverageCategory = (value: unknown): AdminBeverageCategory => (
  value === 'wine' || value === 'drink' ? value : 'beer'
);
```

Update `mapAdminBeverageRow`:

```ts
export const mapAdminBeverageRow = (row: AdminBeverageRow): AdminBeverage => ({
  id: toString(row.id),
  name: toString(row.name),
  abv: toNumber(row.abv),
  category: mapAdminBeverageCategory(row.category),
  createdAt: toString(row.created_at),
  updatedAt: toString(row.updated_at),
});
```

Update the save RPC payload:

```ts
      supabase.rpc('admin_save_beverage', {
        target_beverage_id: input.id || null,
        beverage_name: input.name,
        beverage_abv: input.abv,
        beverage_category: input.category,
      }),
```

Update timeout/error copy in `fetchAdminBeverages` and `saveAdminBeverage`:

```ts
'Beverages are taking too long to load.'
'Could not load admin-added beverages.'
'Saving the beverage is taking too long.'
'The saved beverage was not returned.'
'Could not save beverage.'
```

- [ ] **Step 2: Implement category-aware drafts in `adminTools.ts`**

Change the import:

```ts
import type { AdminBeverage, AdminBeverageCategory, AdminChallenge, AdminChallengeType } from './adminApi';
```

Replace `AdminBeerDraft` with:

```ts
export type AdminBeverageDraft = {
  id?: string;
  name: string;
  abv: string;
  category: AdminBeverageCategory;
};
```

Replace `createEmptyBeerDraft` with:

```ts
export const createEmptyBeverageDraft = (): AdminBeverageDraft => ({
  name: '',
  abv: '',
  category: 'beer',
});
```

Replace `adminBeverageToDraft`:

```ts
export const adminBeverageToDraft = (beverage: AdminBeverage): AdminBeverageDraft => ({
  id: beverage.id,
  name: beverage.name,
  abv: `${beverage.abv}`,
  category: beverage.category,
});
```

Replace `validateBeerDraft` with:

```ts
export const validateBeverageDraft = (draft: Pick<AdminBeverageDraft, 'name' | 'abv' | 'category'>) => {
  if (!draft.name.trim()) return 'Beverage name is required.';
  if (!['beer', 'wine', 'drink'].includes(draft.category)) return 'Choose a beverage category.';

  const abv = Number(draft.abv.trim().replace(',', '.'));
  if (!Number.isFinite(abv) || abv < 0 || abv > 100) {
    return 'ABV must be between 0 and 100.';
  }

  return null;
};
```

- [ ] **Step 3: Run admin tools tests**

Run:

```bash
npm run test:admin-tools
```

Expected: FAIL moves to Admin tools screen wording/category UI assertions.

---

### Task 7: Catalog and Session Payload Category Support

**Files:**
- Modify: `src/lib/sessionBeers.ts`
- Modify: `src/lib/beverageCatalogContext.tsx`

- [ ] **Step 1: Implement category support in `sessionBeers.ts`**

Change `BeverageKind`:

```ts
export type BeverageKind = 'beer' | 'rtd' | 'mixed' | 'wine' | 'drink';
```

Add to `SessionBeer`:

```ts
  beverage_category?: 'beer' | 'wine' | 'drink' | string | null;
```

Add this helper near `normalizeBeerName`:

```ts
export const getBeveragePayloadCategory = (beverage?: BeerCatalogItem | null): 'beer' | 'wine' | 'drink' => {
  if (beverage?.kind === 'wine') return 'wine';
  if (beverage?.kind === 'drink' || beverage?.kind === 'mixed' || beverage?.kind === 'rtd') return 'drink';
  return 'beer';
};
```

Update `beerDraftToPayload`:

```ts
export const beerDraftToPayload = (
  draft: BeerDraft,
  catalog: BeerCatalogItem[] = BEER_CATALOG
) => {
  const beverage = getBeverageCatalogItem(draft.beerName, catalog);

  return {
    beer_name: beverage?.name ?? draft.beerName.trim(),
    volume: beverage?.countedVolume || draft.volume,
    quantity: draft.quantity,
    abv: beverage?.abv ?? getBeerAbv(draft.beerName, catalog),
    beverage_category: getBeveragePayloadCategory(beverage),
  };
};
```

- [ ] **Step 2: Implement admin beverage to catalog mapping**

In `src/lib/beverageCatalogContext.tsx`, add this exported helper before `BeverageCatalogProvider`:

```ts
export const adminBeverageToCatalogItem = ({ name, abv, category }: Pick<AdminBeverage, 'name' | 'abv' | 'category'>): BeerCatalogItem => {
  if (category === 'wine') {
    return { name, abv, kind: 'wine', defaultVolume: '15cl' };
  }

  if (category === 'drink') {
    return { name, abv, kind: 'drink' };
  }

  return { name, abv, kind: 'beer' };
};
```

Update the imports:

```ts
import { AdminBeverage, fetchAdminBeverages } from './adminApi';
```

Update `refresh`:

```ts
      const rows = await fetchAdminBeverages();
      setRemoteBeverages(rows.map(adminBeverageToCatalogItem));
```

- [ ] **Step 3: Run session beer tests**

Run:

```bash
npm run test:session-beers
```

Expected: PASS with `session beer formatting checks passed`.

- [ ] **Step 4: Commit catalog and payload support**

Run:

```bash
git add src/lib/sessionBeers.ts src/lib/beverageCatalogContext.tsx scripts/sessionBeers.test.js
git commit -m "feat: map admin beverage categories into catalog"
```

---

### Task 8: Captured Category in Profile Stats

**Files:**
- Modify: `src/lib/profileStats.ts`
- Modify: `src/lib/profileStatsApi.ts`

- [ ] **Step 1: Add category to local stats rows**

In `src/lib/profileStats.ts`, add to `ProfileSessionStatsRow`:

```ts
  beverage_category?: 'beer' | 'wine' | 'drink' | string | null;
```

Add this helper after `isSpecialMixedDrink`:

```ts
const getCapturedBeverageCategory = (value?: string | null) => (
  value === 'wine' || value === 'drink' ? value : 'beer'
);
```

Inside `calculateStats`, after `const isSpecialMixed = isSpecialMixedDrink(session.beer_name);`, add:

```ts
    const capturedCategory = getCapturedBeverageCategory(session.beverage_category);
    const isCapturedWine = capturedCategory === 'wine';
    const isCapturedDrink = capturedCategory === 'drink';
```

Replace the strongest ABV condition:

```ts
    if (!isRtd && !isJager && !isSambu && !isWine && !isSpecialMixed && !isCapturedWine && !isCapturedDrink) {
      strongestAbv = Math.max(strongestAbv, abv);
    }
```

- [ ] **Step 2: Pass captured category through fallback profile stats**

In `src/lib/profileStatsApi.ts`, update the `session_beers` select in `fetchStatsFallback`:

```ts
      beverage_category,
```

Update the mapped row:

```ts
      beverage_category: beer.beverage_category,
```

Update the legacy sessions fallback mapped row:

```ts
    beverage_category: 'beer',
```

- [ ] **Step 3: Run profile stats tests**

Run:

```bash
npm run test:stats
```

Expected: PASS with `profileStats trophy tests passed`.

- [ ] **Step 4: Commit profile stats support**

Run:

```bash
git add src/lib/profileStats.ts src/lib/profileStatsApi.ts scripts/profileStats.test.js
git commit -m "feat: exclude captured non-beer categories from ABV trophies"
```

---

### Task 9: Feed Details and Session Persistence

**Files:**
- Modify: `src/lib/sessionFeedDetails.ts`
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `src/screens/EditSessionScreen.tsx`

- [ ] **Step 1: Map feed-detail beverage categories**

In `src/lib/sessionFeedDetails.ts`, add this helper near `numberOrNull`:

```ts
const mapSessionBeer = (beer: SessionBeer): SessionBeer => ({
  ...beer,
  beverage_category: beer.beverage_category === 'wine' || beer.beverage_category === 'drink'
    ? beer.beverage_category
    : 'beer',
});
```

Update the mapper return:

```ts
    beers: asArray<SessionBeer>(row.beers).map(mapSessionBeer),
```

- [ ] **Step 2: Select category in `RecordScreen.tsx`**

Replace each `session_beers` select projection in `src/screens/RecordScreen.tsx`:

```ts
.select('id, session_id, beer_name, volume, quantity, abv, beverage_category, note, consumed_at, created_at')
```

There are three projections to update:

- the `fetchSessionBeers` select
- the insert `.select(...)` in `addBeerToSession`
- the update `.select(...)` in `incrementBeerInSession`

- [ ] **Step 3: Select, update, and insert category in `EditSessionScreen.tsx`**

Replace each `session_beers` select projection in `src/screens/EditSessionScreen.tsx`:

```ts
.select('id, session_id, beer_name, volume, quantity, abv, beverage_category, note, consumed_at, created_at')
```

In the existing beer update payload, add:

```ts
            beverage_category: beer.beverage_category === 'wine' || beer.beverage_category === 'drink'
              ? beer.beverage_category
              : 'beer',
```

In the new beer insert payload, add:

```ts
            beverage_category: beer.beverage_category === 'wine' || beer.beverage_category === 'drink'
              ? beer.beverage_category
              : 'beer',
```

- [ ] **Step 4: Run feed details and TypeScript checks**

Run:

```bash
npm run test:session-feed-details
npx tsc --noEmit
```

Expected:

```text
session feed details checks passed
author current streak mapping passed
```

and TypeScript exits with no errors.

- [ ] **Step 5: Commit feed/session category persistence**

Run:

```bash
git add src/lib/sessionFeedDetails.ts src/screens/RecordScreen.tsx src/screens/EditSessionScreen.tsx scripts/sessionFeedDetails.test.js
git commit -m "feat: persist captured beverage category on session drinks"
```

---

### Task 10: Admin Tools UI

**Files:**
- Modify: `src/screens/AdminToolsScreen.tsx`

- [ ] **Step 1: Rename admin screen beverage state and imports**

Update imports from `adminTools`:

```ts
  AdminBeverageDraft,
  AdminChallengeDraft,
  AdminOfficialPostDraft,
  adminBeverageToDraft,
  adminChallengeToDraft,
  applyOfficialPostChallengePrefill,
  createEmptyBeverageDraft,
  createEmptyChallengeDraft,
  createEmptyOfficialPostDraft,
  fromLocalDateTimeInput,
  validateBeverageDraft,
  validateChallengeDraft,
  validateOfficialPostDraft,
```

Update local modal/segment types:

```ts
type AdminSegment = 'challenges' | 'beverages' | 'official-posts';
type ActiveModal = 'challenge' | 'beverage' | 'official-post' | null;
```

Update draft state:

```ts
const [beverageDraft, setBeverageDraft] = useState<AdminBeverageDraft>(createEmptyBeverageDraft);
```

- [ ] **Step 2: Rename open/save handlers and save category**

Replace `openNewBeer`:

```ts
  const openNewBeverage = () => {
    setBeverageDraft(createEmptyBeverageDraft());
    setFormError(null);
    setActiveModal('beverage');
  };
```

Replace `openBeer`:

```ts
  const openBeverage = (beverage: AdminBeverage) => {
    setBeverageDraft(adminBeverageToDraft(beverage));
    setFormError(null);
    setActiveModal('beverage');
  };
```

Replace `handleSaveBeer`:

```ts
  const handleSaveBeverage = async () => {
    const validationError = validateBeverageDraft(beverageDraft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (getBeverageCatalogItem(beverageDraft.name)) {
      setFormError('That beverage already exists in the built-in catalog.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await saveAdminBeverage({
        id: beverageDraft.id,
        name: beverageDraft.name.trim(),
        abv: Number(beverageDraft.abv.replace(',', '.')),
        category: beverageDraft.category,
      });
      const rows = await fetchAdminBeverages();
      setBeverages(rows);
      await refreshCatalog();
      setActiveModal(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save beverage.');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 3: Update list and toolbar wording**

Replace segment references:

```ts
(['challenges', 'beverages', 'official-posts'] as AdminSegment[])
```

Use this segment text expression:

```tsx
{segment === 'challenges' ? 'Challenges' : segment === 'beverages' ? 'Beverages' : 'Official posts'}
```

Use this toolbar title expression:

```tsx
{activeSegment === 'challenges' ? 'Challenges' : activeSegment === 'beverages' ? 'Beverages' : 'Official posts'}
```

Use this empty copy:

```ts
  const emptyCopy = useMemo(() => (
    activeSegment === 'challenges'
      ? 'No challenges yet.'
      : activeSegment === 'beverages'
        ? 'No admin-added beverages yet.'
        : 'No official posts yet.'
  ), [activeSegment]);
```

Use these add actions:

```ts
  const addAction = activeSegment === 'challenges'
    ? openNewChallenge
    : activeSegment === 'beverages'
      ? openNewBeverage
      : openNewOfficialPost;
  const addActionLabel = activeSegment === 'challenges'
    ? 'Create challenge'
    : activeSegment === 'beverages'
      ? 'Add beverage'
      : 'Create official post';
```

- [ ] **Step 4: Update beverage row rendering**

Replace `renderBeer` with:

```tsx
  const renderBeverage = useCallback(({ item }: { item: AdminBeverage }) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={() => openBeverage(item)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${item.name}`}
    >
      <View style={styles.rowIcon}>
        <Beer color={colors.primary} size={18} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowMeta}>{item.abv}% ABV - {item.category === 'wine' ? 'Wine' : item.category === 'drink' ? 'Drink' : 'Beer'}</Text>
      </View>
      <Edit3 color={colors.textMuted} size={17} />
    </Pressable>
  ), []);
```

Update the beverages `FlatList`:

```tsx
          renderItem={renderBeverage}
```

- [ ] **Step 5: Update modal category form**

Change modal title/subtitle branches to use `activeModal === 'beverage'`:

```tsx
{activeModal === 'beverage'
  ? beverageDraft.id ? 'Edit beverage' : 'Add beverage'
  : activeModal === 'challenge'
    ? challengeDraft.id ? 'Edit challenge' : 'Create challenge'
    : 'Create official post'}
```

```tsx
{activeModal === 'beverage'
  ? 'Admin beverage catalog entry'
  : activeModal === 'challenge'
    ? 'Official true-pint competition'
    : 'Official Beerva feed announcement'}
```

Replace the beer form branch:

```tsx
              {activeModal === 'beverage' ? (
                <>
                  <FormLabel>Category</FormLabel>
                  <View style={styles.typeControl}>
                    {(['beer', 'wine', 'drink'] as const).map((category) => (
                      <TouchableOpacity
                        key={category}
                        style={[styles.typeButton, beverageDraft.category === category ? styles.typeButtonActive : null]}
                        onPress={() => setBeverageDraft((current) => ({ ...current, category }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: beverageDraft.category === category }}
                      >
                        <Text style={[styles.typeText, beverageDraft.category === category ? styles.typeTextActive : null]}>
                          {category === 'beer' ? 'Beer' : category === 'wine' ? 'Wine' : 'Drink'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <FormLabel>Name</FormLabel>
                  <FormInput
                    value={beverageDraft.name}
                    onChangeText={(name) => setBeverageDraft((current) => ({ ...current, name }))}
                    placeholder="Beverage name"
                  />
                  <FormLabel>ABV %</FormLabel>
                  <FormInput
                    value={beverageDraft.abv}
                    onChangeText={(abv) => setBeverageDraft((current) => ({ ...current, abv }))}
                    placeholder="4.6"
                    keyboardType="decimal-pad"
                  />
                </>
```

Update `AppButton`:

```tsx
                  activeModal === 'beverage'
                    ? 'Save Beverage'
```

```tsx
                  activeModal === 'beverage'
                    ? handleSaveBeverage
```

```tsx
                icon={activeModal === 'beverage'
                  ? <Beer color={colors.background} size={18} />
```

- [ ] **Step 6: Run admin tests and TypeScript**

Run:

```bash
npm run test:admin-tools
npx tsc --noEmit
```

Expected:

```text
admin tools checks passed
```

and TypeScript exits with no errors.

- [ ] **Step 7: Commit admin tools, admin API, and migration**

Run:

```bash
git add supabase/migrations/20260617120000_add_admin_beverage_categories.sql src/lib/adminApi.ts src/lib/adminTools.ts src/screens/AdminToolsScreen.tsx scripts/adminTools.test.js
git commit -m "feat: add beverage category selector to admin tools"
```

---

### Task 11: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:admin-tools
npm run test:session-beers
npm run test:record-session-drinks
npm run test:session-feed-details
npm run test:stats
npx tsc --noEmit
```

Expected:

```text
admin tools checks passed
session beer formatting checks passed
record session drink checks passed
session feed details checks passed
author current streak mapping passed
profileStats trophy tests passed
```

and TypeScript exits with no errors.

- [ ] **Step 2: Build the web app**

Run:

```bash
npm run build:web
```

Expected: Expo export completes and `scripts/versionServiceWorker.js` runs without errors.

- [ ] **Step 3: Review the diff**

Run:

```bash
git status --short
git diff --stat HEAD
git diff -- supabase/migrations/20260617120000_add_admin_beverage_categories.sql src/lib/adminApi.ts src/lib/adminTools.ts src/lib/beverageCatalogContext.tsx src/lib/sessionBeers.ts src/lib/profileStats.ts src/lib/profileStatsApi.ts src/lib/sessionFeedDetails.ts src/screens/AdminToolsScreen.tsx src/screens/RecordScreen.tsx src/screens/EditSessionScreen.tsx scripts/adminTools.test.js scripts/sessionBeers.test.js scripts/profileStats.test.js scripts/sessionFeedDetails.test.js
```

Expected: only files listed in this plan are modified since the last task commit.

- [ ] **Step 4: Commit verification fixes if needed**

If Step 1 or Step 2 required small fixes, commit them:

```bash
git add supabase/migrations/20260617120000_add_admin_beverage_categories.sql src/lib/adminApi.ts src/lib/adminTools.ts src/lib/beverageCatalogContext.tsx src/lib/sessionBeers.ts src/lib/profileStats.ts src/lib/profileStatsApi.ts src/lib/sessionFeedDetails.ts src/screens/AdminToolsScreen.tsx src/screens/RecordScreen.tsx src/screens/EditSessionScreen.tsx scripts/adminTools.test.js scripts/sessionBeers.test.js scripts/profileStats.test.js scripts/sessionFeedDetails.test.js
git commit -m "fix: finalize admin beverage category support"
```

If `git status --short` is empty after Step 3, do not create another commit.
