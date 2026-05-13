# Pub Place Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users classify newly added places as real pubs or other places, and exclude other places from Pub Legends.

**Architecture:** Store the classification on `public.pubs` as `place_category`, default every existing row to `pub`, and keep both categories searchable. The Record Session add flow asks for the category before creating a manual place, while Pub Legends RPCs filter out linked rows marked `other`.

**Tech Stack:** Expo React Native Web, TypeScript, Supabase Postgres/RPC, Node contract tests.

---

## File Structure

- Create: `scripts/pubDirectory.test.js`
  - Tests `createUserPub` sends `place_category`, returns the category, and `formatPubDetail` labels other places.
- Create: `scripts/recordPlaceCategory.test.js`
  - Source-level guard for the Record Session category-choice sheet.
- Modify: `scripts/pubLegends.test.js`
  - Adds migration assertions for `place_category`, `search_pubs`, and Pub Legends filtering.
- Modify: `package.json`
  - Adds `test:pub-directory` and `test:record-place-category`.
- Create: `supabase/migrations/20260513120000_add_pub_place_category.sql`
  - Adds the column/check constraint, recreates `search_pubs`, and replaces Pub Legends RPCs.
- Modify: `src/lib/pubDirectory.ts`
  - Adds `PlaceCategory`, includes `place_category`, and sends the category on manual pub creation.
- Modify: `src/screens/RecordScreen.tsx`
  - Adds the bottom-sheet category choice before manual place creation.

---

### Task 1: Failing Contract Tests

**Files:**
- Create: `scripts/pubDirectory.test.js`
- Create: `scripts/recordPlaceCategory.test.js`
- Modify: `scripts/pubLegends.test.js`
- Modify: `package.json`

- [ ] **Step 1: Create the pub-directory failing test**

Create `scripts/pubDirectory.test.js`:

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const loadTypeScriptModuleWithMocks = (relativePath, mocks) => {
  const filename = path.resolve(__dirname, '..', relativePath);
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
  compiledModule.require = (request) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }
    return Module.prototype.require.call(compiledModule, request);
  };
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const createSupabaseMock = (expectedCategory) => {
  const calls = {
    insertedPub: null,
    selectColumns: '',
    rpcArgs: null,
  };

  const supabase = {
    rpc: async (name, args) => {
      assert.equal(name, 'search_pubs');
      calls.rpcArgs = args;
      return { data: [], error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: (table) => {
      assert.equal(table, 'pubs');
      const builder = {
        insert: (payload) => {
          calls.insertedPub = payload;
          assert.equal(payload.place_category, expectedCategory);
          return builder;
        },
        select: (columns) => {
          calls.selectColumns = columns;
          return builder;
        },
        single: async () => ({
          data: {
            id: 'pub-1',
            name: calls.insertedPub.name,
            city: null,
            address: null,
            latitude: calls.insertedPub.latitude,
            longitude: calls.insertedPub.longitude,
            source: calls.insertedPub.source,
            source_id: null,
            use_count: 0,
            place_category: calls.insertedPub.place_category,
          },
          error: null,
        }),
      };
      return builder;
    },
  };

  return { supabase, calls };
};

const loadPubDirectory = (supabase) => loadTypeScriptModuleWithMocks('src/lib/pubDirectory.ts', {
  './supabase': { supabase },
});

const run = async () => {
  const otherMock = createSupabaseMock('other');
  const otherDirectory = loadPubDirectory(otherMock.supabase);
  const otherPub = await otherDirectory.createUserPub(
    'Backyard Bar',
    { latitude: 57.04, longitude: 9.92 },
    'other'
  );

  assert.equal(otherPub.place_category, 'other');
  assert.equal(otherMock.calls.insertedPub.name, 'Backyard Bar');
  assert.equal(otherMock.calls.insertedPub.source, 'user');
  assert.equal(otherMock.calls.insertedPub.status, 'active');
  assert.equal(otherMock.calls.insertedPub.created_by, 'user-1');
  assert.match(otherMock.calls.selectColumns, /place_category/);
  assert.equal(
    otherDirectory.formatPubDetail({
      address: null,
      distance_meters: null,
      source: 'user',
      place_category: 'other',
    }),
    'Other place / Added by Beerva'
  );

  const pubMock = createSupabaseMock('pub');
  const pubDirectory = loadPubDirectory(pubMock.supabase);
  const realPub = await pubDirectory.createUserPub('Real Pub', null);

  assert.equal(realPub.place_category, 'pub');
  assert.equal(pubMock.calls.insertedPub.place_category, 'pub');
};

run()
  .then(() => {
    console.log('pub directory tests passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
```

- [ ] **Step 2: Create the Record screen source failing test**

Create `scripts/recordPlaceCategory.test.js`:

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'),
  'utf8'
);

assert.match(
  source,
  /PlaceCategory/,
  'Record screen should use the shared place category type'
);

assert.match(
  source,
  /pubCategoryChoiceVisible/,
  'Record screen should track whether the category choice sheet is visible'
);

assert.match(
  source,
  /setPubCategoryChoiceVisible\(true\)/,
  'pressing the add-new-place footer should open the category sheet'
);

assert.match(
  source,
  /addTypedPub\('pub'\)/,
  'category sheet should create real pubs with the pub category'
);

assert.match(
  source,
  /addTypedPub\('other'\)/,
  'category sheet should create non-pub places with the other category'
);

assert.match(
  source,
  />\s*Choose place type\s*<\/Text>/,
  'category sheet should clearly ask for the place type'
);

assert.match(
  source,
  />\s*Counts toward Pub Legends\s*<\/Text>/,
  'pub option should explain that it counts toward Pub Legends'
);

assert.match(
  source,
  />\s*Excluded from Pub Legends\s*<\/Text>/,
  'other option should explain that it is excluded from Pub Legends'
);

console.log('record place category checks passed');
```

- [ ] **Step 3: Extend the Pub Legends migration test**

Modify `scripts/pubLegends.test.js` by adding this near the existing `migrationPath` constant:

```javascript
const placeCategoryMigrationPath = 'supabase/migrations/20260513120000_add_pub_place_category.sql';
```

Add this after the existing migration existence assertions:

```javascript
assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', placeCategoryMigrationPath)),
  'Place category migration should update pub schema and leaderboard filtering'
);
```

Add this after `const migrationSql = ...`:

```javascript
const placeCategoryMigrationSql = fs.readFileSync(path.resolve(__dirname, '..', placeCategoryMigrationPath), 'utf8');
assert.match(
  placeCategoryMigrationSql,
  /add column if not exists place_category text not null default 'pub'/,
  'pubs should default existing and new rows to real pubs'
);
assert.match(
  placeCategoryMigrationSql,
  /pubs_place_category_check/,
  'pubs should constrain place_category to known values'
);
assert.match(
  placeCategoryMigrationSql,
  /drop function if exists public\.search_pubs\(text, double precision, double precision, integer\)/,
  'search_pubs should be recreated because the return table changes'
);
assert.match(
  placeCategoryMigrationSql,
  /place_category text/,
  'search_pubs should return place_category to the app'
);

const categoryFilters = placeCategoryMigrationSql.match(/coalesce\(pubs\.place_category,\s*'pub'\)\s*=\s*'pub'/g) || [];
assert.ok(
  categoryFilters.length >= 2,
  'Pub Legends list and King of the Pub should both exclude other places'
);
```

- [ ] **Step 4: Add package scripts**

Modify `package.json` scripts:

```json
"test:pub-directory": "node scripts/pubDirectory.test.js",
"test:record-place-category": "node scripts/recordPlaceCategory.test.js"
```

- [ ] **Step 5: Run the failing tests**

Run:

```bash
npm run test:pub-directory
npm run test:record-place-category
npm run test:pub-legends
```

Expected:

- `test:pub-directory` fails because `createUserPub` does not send `place_category`.
- `test:record-place-category` fails because the Record screen has no category sheet yet.
- `test:pub-legends` fails because the new migration does not exist yet.

- [ ] **Step 6: Commit the failing tests**

Run:

```bash
git add package.json scripts/pubDirectory.test.js scripts/recordPlaceCategory.test.js scripts/pubLegends.test.js
git commit -m "test: cover pub place categories"
```

---

### Task 2: Database Migration

**Files:**
- Create: `supabase/migrations/20260513120000_add_pub_place_category.sql`

- [ ] **Step 1: Add the migration**

Create `supabase/migrations/20260513120000_add_pub_place_category.sql` with these operations in this order:

```sql
alter table public.pubs
  add column if not exists place_category text not null default 'pub';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pubs_place_category_check'
      and conrelid = 'public.pubs'::regclass
  ) then
    alter table public.pubs
      add constraint pubs_place_category_check
      check (place_category in ('pub', 'other'));
  end if;
end;
$$;

create index if not exists pubs_status_category_use_count_idx
  on public.pubs(status, place_category, use_count desc);

drop function if exists public.search_pubs(text, double precision, double precision, integer);
```

Then recreate `public.search_pubs` from `supabase/migrations/20260509133000_add_pub_directory.sql` with these exact return-table and select additions:

```sql
returns table (
  id uuid,
  name text,
  city text,
  address text,
  latitude double precision,
  longitude double precision,
  source text,
  source_id text,
  use_count integer,
  place_category text,
  distance_meters double precision
)
```

Inside the `ranked` CTE, include:

```sql
pubs.place_category,
```

In the final select, include:

```sql
ranked.place_category,
```

After the recreated function, restore the grant:

```sql
grant execute on function public.search_pubs(text, double precision, double precision, integer) to authenticated;
```

Replace `public.get_pub_legends` from `supabase/migrations/20260510133000_add_pub_legends_leaderboards.sql` and add this predicate to its `published_sessions` CTE:

```sql
and coalesce(pubs.place_category, 'pub') = 'pub'
```

Replace `public.get_pub_king_of_the_pub` from `supabase/migrations/20260510133000_add_pub_legends_leaderboards.sql`, add the `pubs` join in its `published_sessions` CTE, and add the same category predicate:

```sql
from public.sessions
left join public.pubs on pubs.id = sessions.pub_id,
params
where sessions.status = 'published'
  and coalesce(pubs.place_category, 'pub') = 'pub'
  and coalesce(sessions.pub_id::text, nullif(lower(btrim(sessions.pub_name)), '')) = params.target_key
```

Keep the existing grants and comments:

```sql
grant execute on function public.get_pub_legends(integer) to authenticated;
grant execute on function public.get_pub_king_of_the_pub(text, integer) to authenticated;

comment on column public.pubs.place_category is 'Classifies places as real pubs for leaderboard inclusion or other drinking locations excluded from Pub Legends.';
comment on function public.get_pub_legends(integer) is 'Returns the most visited real pubs from published sessions with each pub champion by true pints.';
comment on function public.get_pub_king_of_the_pub(text, integer) is 'Returns each user''s best published true-pint session at a real pub, ranked King of the Pub style.';
```

- [ ] **Step 2: Run the Pub Legends test**

Run:

```bash
npm run test:pub-legends
```

Expected: PASS.

- [ ] **Step 3: Commit the migration**

Run:

```bash
git add supabase/migrations/20260513120000_add_pub_place_category.sql scripts/pubLegends.test.js
git commit -m "feat: add pub place category migration"
```

---

### Task 3: Pub Directory API

**Files:**
- Modify: `src/lib/pubDirectory.ts`

- [ ] **Step 1: Add the shared category type and field**

Update the top of `src/lib/pubDirectory.ts`:

```typescript
export type PlaceCategory = 'pub' | 'other';

export type UserLocation = {
  latitude: number;
  longitude: number;
};
```

Add the category to `PubRecord`:

```typescript
place_category?: PlaceCategory | null;
```

- [ ] **Step 2: Label other places in details**

Update `formatPubDetail`:

```typescript
export const formatPubDetail = (pub: Pick<PubRecord, 'address' | 'distance_meters' | 'source' | 'place_category'>) => {
  const details: string[] = [];

  if (typeof pub.distance_meters === 'number') {
    if (pub.distance_meters < 1000) {
      details.push(`${Math.max(10, Math.round(pub.distance_meters / 10) * 10)} m`);
    } else {
      details.push(`${(pub.distance_meters / 1000).toFixed(1)} km`);
    }
  }

  if (pub.address) details.push(pub.address);
  if (pub.place_category === 'other') details.push('Other place');
  if (pub.source === 'user') details.push('Added by Beerva');

  return details.join(' / ');
};
```

- [ ] **Step 3: Pass category when creating manual places**

Update `createUserPub`:

```typescript
export const createUserPub = async (
  name: string,
  location?: UserLocation | null,
  placeCategory: PlaceCategory = 'pub'
): Promise<PubRecord> => {
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error('Pub name is too short.');

  const existingPubs = await searchCachedPubs(cleanName, location, 8).catch(() => []);
  const exactMatch = existingPubs.find((pub) => labelsMatchPub(cleanName, pub));
  if (exactMatch) return exactMatch;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in!');

  const { data, error } = await supabase
    .from('pubs')
    .insert({
      name: cleanName,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      source: 'user',
      status: 'active',
      created_by: user.id,
      place_category: placeCategory,
    })
    .select('id, name, city, address, latitude, longitude, source, source_id, use_count, place_category')
    .single();

  if (error) throw error;
  return data as PubRecord;
};
```

- [ ] **Step 4: Run the pub-directory test**

Run:

```bash
npm run test:pub-directory
```

Expected: PASS.

- [ ] **Step 5: Commit the API change**

Run:

```bash
git add src/lib/pubDirectory.ts scripts/pubDirectory.test.js package.json
git commit -m "feat: classify manually added pubs"
```

---

### Task 4: Record Screen Category Sheet

**Files:**
- Modify: `src/screens/RecordScreen.tsx`

- [ ] **Step 1: Import the category type and icons**

Update imports:

```typescript
import { Beer, Camera, CheckCircle2, Clock, Home, Images, LocateFixed, Lock, MapPin, MessageSquare, PlusCircle, Sparkles, Trash2, X } from 'lucide-react-native';
```

Update the pub-directory import:

```typescript
  PlaceCategory,
```

- [ ] **Step 2: Add sheet state**

Add near the other `useState` calls:

```typescript
const [pubCategoryChoiceVisible, setPubCategoryChoiceVisible] = useState(false);
```

- [ ] **Step 3: Open the sheet from the add footer**

Add a small opener near `addTypedPub`:

```typescript
const openPubCategoryChoice = () => {
  if (pub.trim().length < 2 || addingPub) return;
  setPubCategoryChoiceVisible(true);
  hapticMedium();
};
```

Change `addTypedPub` to accept a category and close the sheet after a choice:

```typescript
const addTypedPub = async (placeCategory: PlaceCategory = 'pub') => {
  const cleanPub = pub.trim();
  if (cleanPub.length < 2 || addingPub) return;

  setPubCategoryChoiceVisible(false);
  setAddingPub(true);
  try {
    const pubRecord = await createUserPub(cleanPub, userLocation, placeCategory);
    setPubOptions((previous) => [
      pubRecord,
      ...previous.filter((item) => item.id !== pubRecord.id),
    ]);
    selectPubRecord(pubRecord);
    hapticSuccess();
  } catch (error: any) {
    hapticError();
    showAlert('Could not add pub', error?.message || 'Please try again.');
  } finally {
    setAddingPub(false);
  }
};
```

Change the add footer button:

```typescript
onPress={openPubCategoryChoice}
```

- [ ] **Step 4: Add the category-choice modal**

Add this modal before the existing photo-choice modal:

```tsx
<Modal
  visible={pubCategoryChoiceVisible}
  transparent
  animationType="fade"
  onRequestClose={() => setPubCategoryChoiceVisible(false)}
>
  <View style={styles.photoChoiceBackdrop}>
    <View style={styles.photoChoiceSheet}>
      <View style={styles.photoChoiceHeader}>
        <Text style={styles.photoChoiceTitle}>Choose place type</Text>
        <TouchableOpacity
          style={styles.photoChoiceClose}
          onPress={() => setPubCategoryChoiceVisible(false)}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <X color={colors.text} size={22} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.photoChoiceOption}
        onPress={() => addTypedPub('pub')}
        disabled={addingPub}
        activeOpacity={0.76}
      >
        <View style={styles.photoChoiceIcon}>
          <Beer color={colors.primary} size={22} />
        </View>
        <View style={styles.photoChoiceText}>
          <Text style={styles.photoChoiceLabel}>Pub</Text>
          <Text style={styles.photoChoiceHint}>Counts toward Pub Legends</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.photoChoiceOption}
        onPress={() => addTypedPub('other')}
        disabled={addingPub}
        activeOpacity={0.76}
      >
        <View style={[styles.photoChoiceIcon, { backgroundColor: colors.surface }]}>
          <Home color={colors.textMuted} size={22} />
        </View>
        <View style={styles.photoChoiceText}>
          <Text style={styles.photoChoiceLabel}>Other</Text>
          <Text style={styles.photoChoiceHint}>Excluded from Pub Legends</Text>
        </View>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

- [ ] **Step 5: Run the Record screen test**

Run:

```bash
npm run test:record-place-category
```

Expected: PASS.

- [ ] **Step 6: Commit the UI change**

Run:

```bash
git add src/screens/RecordScreen.tsx scripts/recordPlaceCategory.test.js package.json
git commit -m "feat: ask for place category on add"
```

---

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm run test:pub-directory
npm run test:record-place-category
npm run test:pub-legends
```

Expected: all PASS.

- [ ] **Step 2: Run adjacent regression tests**

Run:

```bash
npm run test:pub-crawl
npm run test:stats
npm run test:profile-panel
```

Expected: all PASS.

- [ ] **Step 3: Build the web app**

Run:

```bash
npm run build:web
```

Expected: Expo export completes successfully and writes the web bundle to `dist`.

- [ ] **Step 4: Inspect final git status**

Run:

```bash
git status --short
```

Expected: no uncommitted changes except files intentionally left by the user.

