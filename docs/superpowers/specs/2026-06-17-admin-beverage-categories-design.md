# Admin Beverage Categories Design

## Summary

Expand the admin beverage tool from beer-only entries to database-backed beverage categories. Admins can add beers, wines, and drinks from the existing Admin tools page. All entries keep the simple name plus ABV form. Wine entries automatically default to a 15cl serving when users select them later. Drink entries behave like beer entries in the recording form, but their stored category keeps them out of beer-specific trophy calculations.

This is a scoped extension of the existing admin beverage feature. It does not add a general trophy builder, aliases, custom serving-size controls, deletion, or a full catalog taxonomy.

## Requirements

- Rename the admin `Beers` surface to a broader `Beverages` surface.
- Let admins create and edit three categories: `Beer`, `Wine`, and `Drink`.
- Keep one simple form for all categories: category, name, and ABV percent.
- Persist the category in `public.admin_beverages`.
- Backfill existing admin beverage rows as `beer`.
- Return category from the admin beverage RPCs.
- Merge admin beverages into the existing runtime beverage catalog.
- Snapshot beverage category on newly recorded drink rows.
- Make admin wine entries default to `15cl` in the drink recording form.
- Make admin drink entries behave like normal selectable drinks in the recording form, with no locked serving size.
- Keep admin drink and wine entries out of beer-only strongest ABV trophy calculations.
- Keep built-in catalog entries authoritative on name collisions.
- Do not rewrite historical session rows after an admin beverage is edited.

## Existing Context

The current admin beverage path stores only:

- `name`
- `abv`

The client maps those rows into `BeerCatalogItem` objects and merges them with `BEER_CATALOG`. The built-in catalog already supports richer metadata:

- `kind`
- `defaultVolume`
- `countedVolume`
- `aliases`

Built-in `White Wine` and `Red Wine` use `kind: 'wine'` and `defaultVolume: '15cl'`. Built-in cocktails and shots use special metadata and name-based profile-stat exclusions. Recorded session rows currently store name, volume, quantity, and ABV, but not category. Because admin categories affect trophies, new session rows should snapshot the category at recording time instead of depending only on the current admin catalog row.

## Data Model

Add a follow-up Supabase migration that changes `public.admin_beverages`:

```sql
alter table public.admin_beverages
  add column if not exists category text not null default 'beer';
```

Add a check constraint allowing:

```text
beer
wine
drink
```

Existing rows stay valid because the default is `beer`.

Keep the existing case-insensitive unique name index. Names remain globally unique across admin-added beverages regardless of category. This avoids two visible catalog entries with the same display name but different semantics.

Update the table comment from beer-only wording to beverage-category wording.

Also add a captured category to `public.session_beers`:

```sql
alter table public.session_beers
  add column if not exists beverage_category text not null default 'beer';
```

Use the same category values:

```text
beer
wine
drink
```

Do not rewrite old `session_beers` rows as part of this feature. Existing built-in wine, RTD, and mixed-drink exclusions continue to work through the current name-based stats logic. New rows record their category so future admin catalog edits do not retroactively change whether that old drink was treated as beer, wine, or drink.

## Admin Beverage RPCs

Update `public.get_admin_beverages()` to return:

- `id`
- `name`
- `abv`
- `category`
- `created_at`
- `updated_at`

Replace `public.admin_save_beverage` with a compatible category-aware version:

```text
admin_save_beverage(
  target_beverage_id uuid default null,
  beverage_name text default null,
  beverage_abv numeric default null,
  beverage_category text default 'beer'
)
```

The save RPC should:

1. Require `public.is_current_user_admin()`.
2. Trim and validate the name.
3. Validate ABV between `0` and `100`.
4. Normalize blank or null category to `beer`.
5. Reject categories outside `beer`, `wine`, and `drink`.
6. Insert or update `name`, `abv`, and `category`.
7. Return the saved row.
8. Convert duplicate-name conflicts into a clear beverage-level error.

Because the old RPC signature had three inputs, the migration should drop the old function signature before creating the new one, then revoke and grant execute on the new signature. The category parameter has a default so older payload shapes remain conceptually compatible, but the app will send the category explicitly after this change.

## Client API And Drafts

Rename admin helper types from beer-only language where practical:

- `AdminBeerDraft` becomes `AdminBeverageDraft`.
- `createEmptyBeerDraft` becomes `createEmptyBeverageDraft`.
- `validateBeerDraft` becomes `validateBeverageDraft`.

If a full rename creates unnecessary churn in screen-local variable names, implementation can keep a few internal names temporarily, but user-visible copy and exported helper names should move to beverage wording.

Add:

```ts
export type AdminBeverageCategory = 'beer' | 'wine' | 'drink';
```

`AdminBeverage` and `SaveAdminBeverageInput` should carry `category`. Row mapping should default missing or unknown server values to `beer` defensively.

Validation should return category-aware messages:

- `Beverage name is required.`
- `ABV must be between 0 and 100.`
- `Choose a beverage category.`

## Admin UI

The Admin tools top segmented control should read:

```text
Challenges | Beverages | Official posts
```

The beverages tab should show all admin-added beverages in one list. Each row displays:

- beverage name
- ABV percent
- category label

The create/edit modal should be titled `Add beverage` or `Edit beverage`.

The form fields are:

- category segmented control: `Beer | Wine | Drink`
- name
- ABV %

The save button should read `Save Beverage`.

Empty, error, timeout, and duplicate-name messages should stop saying beer when the code is handling all beverage categories.

## Catalog Mapping

`BeverageCatalogProvider` should map admin rows into catalog items:

```ts
beer  -> { name, abv, kind: 'beer' }
wine  -> { name, abv, kind: 'wine', defaultVolume: '15cl' }
drink -> { name, abv, kind: 'drink' }
```

Add `drink` to the client `BeverageKind` type. Custom drinks should not use `countedVolume`, so they do not auto-add or lock the serving-size controls. This honors the requirement that drinks are like admin beers except for database category and trophies.

Wine selection should behave like the existing `Red Wine` and `White Wine` catalog entries: selecting a custom wine sets the draft volume to `15cl`, but quantity controls remain available.

Admin beers and drinks use the normal size and quantity controls.

Built-in catalog entries continue to take precedence when an admin row collides with a built-in name. The admin form should also reject built-in collisions before saving.

Update `beerDraftToPayload` so newly inserted `session_beers` rows include `beverage_category`:

- built-in and admin beer entries write `beer`
- built-in and admin wine entries write `wine`
- admin drinks write `drink`
- built-in RTD and mixed-drink entries can write `drink`, while their existing name-based trophy counters continue to distinguish RTD, Jagerbomb, Sambuca, and special mixed-drink trophies

`SessionBeer` and feed/detail mappers should tolerate missing category values from older rows by defaulting to `beer` in client logic.

## Trophy And Stats Behavior

Beer-only strongest ABV trophies must stay beer-only.

Today, profile stats classify non-beer built-ins by normalized name lists. Admin-added categories are dynamic, so the stats path needs to read captured row category instead of adding another hard-coded name list.

Update the latest `public.get_profile_stats(uuid)` RPC so each `session_beers` row uses `session_beers.beverage_category`:

- `session_beers.beverage_category = 'wine'` counts as wine.
- `session_beers.beverage_category = 'drink'` counts as drink.
- `session_beers.beverage_category = 'beer'` counts as beer.

The strongest ABV calculation should exclude:

- existing RTDs
- existing Jagerbomb/Sambuca/special mixed drink names
- existing built-in wine names
- session rows with category `wine`
- session rows with category `drink`

Do not add new trophy definitions in this feature. Drink category support only prevents custom drinks from unlocking beer-only ABV trophies. Existing RTD, Jagerbomb, Sambuca, and challenge trophies remain unchanged and continue using their current name-based counters.

The client fallback stats path should also understand captured row categories. If the RPC fails and the app falls back to local `calculateStats`, the fallback query should select `beverage_category` and pass it through to the local calculator.

Historical session rows are not rewritten. They keep the name, volume, quantity, ABV, and any captured category from recording time. Admin beverage edits affect future selection behavior without changing old recorded drinks.

## Error Handling

- Non-admin RPC writes still fail with `Admin access required.`
- Invalid category writes fail with a clear category message.
- Duplicate admin beverage names fail with a clear beverage-level duplicate message.
- Built-in name collisions are rejected client-side before save.
- Admin beverage loading failures fall back to the built-in catalog.
- Unknown or missing category values map to `beer` on the client to avoid breaking old data.
- Older session rows without an explicit category continue to behave through the existing name-based built-in exclusions and otherwise default to beer.

## Testing

Use test-first implementation.

Add or update focused tests for:

- migration adds `admin_beverages.category`.
- migration adds `session_beers.beverage_category`.
- category constraint allows only `beer`, `wine`, and `drink`.
- existing admin beverage and session drink rows default to `beer`.
- `get_admin_beverages()` returns category.
- `admin_save_beverage(...)` accepts and stores category.
- invalid categories are rejected.
- grants/revokes target the new save function signature.
- admin API maps category and defaults unknown values to `beer`.
- beverage draft validation requires name, valid ABV, and valid category.
- admin screen labels use `Beverages`, `Add beverage`, and `Save Beverage`.
- admin form includes the `Beer | Wine | Drink` category selector.
- catalog merge maps wine to `kind: 'wine'` and `defaultVolume: '15cl'`.
- catalog merge maps drink to `kind: 'drink'` without `countedVolume`.
- `beerDraftToPayload` writes `beverage_category`.
- selecting a custom wine defaults the record draft volume to `15cl`.
- selecting a custom drink keeps normal size controls and does not auto-add.
- custom wine and custom drink do not count toward strongest beer ABV stats.
- custom beer still counts toward strongest beer ABV stats.
- profile stats RPC reads captured session beverage category.
- client fallback stats classification can use captured session beverage category.

Run focused verification:

```text
npm run test:admin-tools
npm run test:session-beers
npm run test:record-session-drinks
npm run test:stats
npx tsc --noEmit
```

Run `npm run build:web` if the TypeScript and focused tests pass.

## Non-Goals

- No custom serving-size field for admin beverages.
- No custom aliases for admin beverages.
- No beverage deletion.
- No historical session rewriting.
- No new trophy definitions.
- No general trophy builder.
- No category-specific admin pages.
- No migration of built-in catalog items into the database.
