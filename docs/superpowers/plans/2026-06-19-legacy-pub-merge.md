# Legacy Pub Duplicate Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge unambiguous legacy pub records into their canonical OpenStreetMap records so Pub Legends counts every post for the same physical pub.

**Architecture:** Add one idempotent database migration that derives exact legacy-to-OSM pub pairs, repoints session foreign keys, retires legacy rows, and resynchronizes real-pub use counts. Extend the existing Pub Legends regression script to guard the migration's exact-match and unique-candidate rules. Deploy this one SQL file directly to the linked production project because the remote migration-history table is incomplete and must not be bulk-pushed.

**Tech Stack:** Supabase PostgreSQL migrations, PostgreSQL PL/pgSQL, Node.js `assert`, Supabase CLI.

---

## File Structure

- `scripts/pubLegends.test.js`: structural regression coverage for the duplicate-merge migration.
- `supabase/migrations/20260619180000_merge_legacy_pub_duplicates.sql`: idempotent production data repair.

### Task 1: Define Regression Coverage

**Files:**
- Modify: `scripts/pubLegends.test.js`
- Create: `supabase/migrations/20260619180000_merge_legacy_pub_duplicates.sql`
- Test: `scripts/pubLegends.test.js`

- [ ] **Step 1: Write the failing test**

Add the new migration path beside `liveCountRepairMigrationPath` and add these assertions after the live-count assertions:

```js
const legacyPubMergeMigrationPath = 'supabase/migrations/20260619180000_merge_legacy_pub_duplicates.sql';

assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', legacyPubMergeMigrationPath)),
  'A follow-up migration should merge unambiguous legacy and OSM pub duplicates'
);

const legacyPubMergeMigrationSql = fs.readFileSync(
  path.resolve(__dirname, '..', legacyPubMergeMigrationPath),
  'utf8'
);

assert.match(
  legacyPubMergeMigrationSql,
  /legacy\.source\s*=\s*'legacy'/i,
  'duplicate repair should only retire legacy source rows'
);
assert.match(
  legacyPubMergeMigrationSql,
  /canonical\.source\s*=\s*'osm'/i,
  'duplicate repair should only move sessions to canonical OSM rows'
);
assert.match(
  legacyPubMergeMigrationSql,
  /lower\(btrim\(legacy\.name\)\)\s*=\s*lower\(btrim\(canonical\.name\s*\|\|\s*', '\s*\|\|\s*canonical\.city\)\)/i,
  'duplicate repair should require an exact normalized name-and-city match'
);
assert.match(
  legacyPubMergeMigrationSql,
  /canonical_match_count\s*=\s*1/i,
  'duplicate repair should leave ambiguous canonical matches untouched'
);
assert.match(
  legacyPubMergeMigrationSql,
  /update public\.sessions[\s\S]*set pub_id = pair\.canonical_pub_id/i,
  'duplicate repair should relink every session to the canonical pub'
);
assert.match(
  legacyPubMergeMigrationSql,
  /status\s*=\s*'merged'/i,
  'duplicate repair should retire the old legacy pub row'
);
assert.match(
  legacyPubMergeMigrationSql,
  /merged_into\s*=\s*pair\.canonical_pub_id/i,
  'duplicate repair should retain the canonical replacement link'
);
assert.match(
  legacyPubMergeMigrationSql,
  /use_count\s*=\s*pub_session_counts\.session_count/i,
  'duplicate repair should resync active real-pub use counts'
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node scripts/pubLegends.test.js`

Expected: failure stating that `20260619180000_merge_legacy_pub_duplicates.sql` does not exist.

### Task 2: Add the Idempotent Database Repair

**Files:**
- Create: `supabase/migrations/20260619180000_merge_legacy_pub_duplicates.sql`
- Test: `scripts/pubLegends.test.js`

- [ ] **Step 1: Write the migration**

Create the migration with this SQL:

```sql
do $$
declare
  pair record;
begin
  for pair in
    with candidate_pairs as (
      select
        legacy.id as legacy_pub_id,
        canonical.id as canonical_pub_id,
        count(*) over (partition by legacy.id) as canonical_match_count
      from public.pubs as legacy
      join public.pubs as canonical
        on lower(btrim(legacy.name)) = lower(btrim(canonical.name || ', ' || canonical.city))
      where legacy.source = 'legacy'
        and legacy.status = 'active'
        and coalesce(legacy.place_category, 'pub') = 'pub'
        and canonical.source = 'osm'
        and canonical.status = 'active'
        and coalesce(canonical.place_category, 'pub') = 'pub'
        and canonical.city is not null
    )
    select legacy_pub_id, canonical_pub_id
    from candidate_pairs
    where canonical_match_count = 1
  loop
    update public.sessions
    set pub_id = pair.canonical_pub_id
    where pub_id = pair.legacy_pub_id;

    update public.pubs
    set status = 'merged',
        merged_into = pair.canonical_pub_id,
        use_count = 0,
        updated_at = now()
    where id = pair.legacy_pub_id
      and status = 'active';
  end loop;
end;
$$;

with pub_session_counts as (
  select
    pubs.id as pub_id,
    count(distinct sessions.id)::integer as session_count
  from public.pubs
  left join public.sessions
    on sessions.pub_id = pubs.id
   and sessions.status = 'published'
  where pubs.status = 'active'
    and coalesce(pubs.place_category, 'pub') = 'pub'
  group by pubs.id
)
update public.pubs
set use_count = pub_session_counts.session_count,
    updated_at = now()
from pub_session_counts
where pubs.id = pub_session_counts.pub_id
  and pubs.use_count is distinct from pub_session_counts.session_count;

comment on table public.pubs is
  'Cached pub directory seeded from OpenStreetMap and Beerva users. Exact legacy name-and-city duplicates are retained as merged rows.';
```

- [ ] **Step 2: Run the focused regression test**

Run: `node scripts/pubLegends.test.js`

Expected: `Pub Legends tests passed`.

- [ ] **Step 3: Run static verification**

Run: `npx tsc --noEmit`

Expected: exit code 0 with no TypeScript diagnostics.

### Task 3: Deploy and Verify the Production Repair

**Files:**
- Execute: `supabase/migrations/20260619180000_merge_legacy_pub_duplicates.sql`

- [ ] **Step 1: Inspect the exact candidate scope immediately before deployment**

Run:

```powershell
npx supabase db query --linked --output json "with candidate_pairs as (select legacy.id as legacy_pub_id, canonical.id as canonical_pub_id, count(*) over (partition by legacy.id) as canonical_match_count from public.pubs as legacy join public.pubs as canonical on lower(btrim(legacy.name)) = lower(btrim(canonical.name || ', ' || canonical.city)) where legacy.source = 'legacy' and legacy.status = 'active' and coalesce(legacy.place_category, 'pub') = 'pub' and canonical.source = 'osm' and canonical.status = 'active' and coalesce(canonical.place_category, 'pub') = 'pub' and canonical.city is not null) select count(*)::integer as legacy_records_to_merge from candidate_pairs where canonical_match_count = 1;"
```

Expected: one record, the confirmed Smedekroen legacy-to-OSM duplicate.

- [ ] **Step 2: Execute only the new migration against the linked project**

Run:

```powershell
npx supabase db query --linked --file supabase/migrations/20260619180000_merge_legacy_pub_duplicates.sql
```

Expected: exit code 0. Do not run `supabase db push`, because the linked project has incomplete migration-history metadata and a push could apply unrelated historical migrations.

- [ ] **Step 3: Verify the visible Pub Legends result**

Run:

```powershell
npx supabase db query --linked --output json "select pub_name, session_count, unique_drinker_count from public.get_pub_legends(25) where lower(pub_name) = 'smedekroen';"
```

Expected: exactly one `Smedekroen` entry with `session_count` equal to 8.

- [ ] **Step 4: Verify retired source records and clean repository state**

Run:

```powershell
npx supabase db query --linked --output json "select count(*)::integer as merged_legacy_pub_count from public.pubs where source = 'legacy' and status = 'merged';"
```

Expected: one merged legacy record.

Run: `git status --short --branch`

Expected: only the planned migration and test changes, plus the pre-existing Supabase CLI temp-file modification if it remains.
