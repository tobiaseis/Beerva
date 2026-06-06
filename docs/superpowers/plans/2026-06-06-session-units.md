# Session Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Danish alcohol units to normal session and pub crawl More stats without changing leaderboards, challenges, trophies, profile stats, or rankings.

**Architecture:** Add one shared TypeScript helper for the alcohol-unit formula and keep normal session unit totals server-owned through a follow-up `get_session_feed_details` RPC migration. Normal session cards read the RPC value and fall back to local calculation; pub crawl cards calculate from already-hydrated stop beer rows through `calculatePubCrawlSummary`.

**Tech Stack:** Expo React Native, TypeScript, Supabase SQL migrations, Node assertion test scripts.

---

## File Structure

- Create `src/lib/alcoholUnits.ts`: shared volume parser and Danish alcohol unit calculator.
- Create `scripts/alcoholUnits.test.js`: focused tests for the units formula and volume parsing.
- Modify `package.json`: add `test:session-units`.
- Create `supabase/migrations/20260606120000_add_session_feed_units.sql`: redefine the latest feed-details RPC, preserving `author_current_streak`, and add `units`.
- Modify `src/lib/sessionFeedDetails.ts`: map `units` from RPC rows into `SessionFeedDetail`.
- Modify `src/screens/FeedScreen.tsx`: add `units` to `FeedSession`, use RPC value when present, fall back to local calculation, render the Units pill, and tighten stat pill sizing.
- Modify `src/lib/pubCrawls.ts`: add `units` to `PubCrawlSummary`.
- Modify `src/components/PubCrawlFeedCard.tsx`: render the Units pill and tighten stat pill sizing.
- Modify `scripts/sessionFeedDetails.test.js`: assert the units migration, mapper, and feed-card wiring.
- Modify `scripts/pubCrawl.test.js`: assert pub crawl units summary and card rendering.

---

### Task 1: Shared Alcohol Units Helper

**Files:**
- Create: `src/lib/alcoholUnits.ts`
- Create: `scripts/alcoholUnits.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing helper test**

Create `scripts/alcoholUnits.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const {
  calculateAlcoholUnits,
  getServingVolumeMl,
} = loadTypeScriptModule('src/lib/alcoholUnits.ts');

assert.equal(getServingVolumeMl('33cl'), 330, '33cl should parse as 330ml');
assert.equal(getServingVolumeMl('500 ml'), 500, 'ml values should parse with spaces');
assert.equal(getServingVolumeMl('0.5l'), 500, 'litre values should parse as ml');
assert.equal(getServingVolumeMl('Schooner'), 379, 'schooner should keep the existing app volume');
assert.equal(getServingVolumeMl(null), 568, 'missing volume should fall back to a true pint');

assert.equal(
  calculateAlcoholUnits([{ volume: '33cl', quantity: 1, abv: 4.6 }]),
  1,
  '33cl at 4.6% ABV should be exactly 1.0 Danish unit after display rounding'
);

assert.equal(
  calculateAlcoholUnits([
    { volume: '33cl', quantity: 2, abv: 4.6 },
    { volume: '50cl', quantity: 1, abv: 5 },
  ]),
  3.6,
  'multiple quantities and serving sizes should sum before rounding'
);

assert.equal(
  calculateAlcoholUnits([
    { volume: '33cl', quantity: 1, abv: null },
    { volume: '33cl', quantity: 1, abv: 'not-a-number' },
  ]),
  0,
  'missing or invalid ABV should contribute 0 units'
);

assert.equal(
  calculateAlcoholUnits([{ volume: '33cl', quantity: -2, abv: 4.6 }]),
  0,
  'negative quantities should not create negative units'
);

console.log('alcohol unit checks passed');
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
node scripts/alcoholUnits.test.js
```

Expected: FAIL with `ENOENT` for `src/lib/alcoholUnits.ts`, because the helper has not been created yet.

- [ ] **Step 3: Implement the helper**

Create `src/lib/alcoholUnits.ts`:

```ts
const ALCOHOL_GRAMS_PER_ML = 0.789;
const DANISH_ALCOHOL_UNIT_GRAMS = 12;
const DEFAULT_SERVING_VOLUME_ML = 568;

export type AlcoholUnitDrink = {
  volume?: string | null;
  quantity?: number | string | null;
  abv?: number | string | null;
};

const toFiniteNumber = (value: number | string | null | undefined) => {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const parsed = typeof normalized === 'number' ? normalized : Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const getQuantity = (value: number | string | null | undefined) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return 1;
  return Math.max(0, parsed);
};

const getAbv = (value: number | string | null | undefined) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return 0;
  return Math.max(0, parsed);
};

const roundStat = (value: number) => Math.round(value * 10) / 10;

export const getServingVolumeMl = (volume?: string | null) => {
  const normalizedVolume = volume?.trim().toLowerCase().replace(',', '.') || 'pint';
  const compactVolume = normalizedVolume.replace(/\s+/g, '');
  const numericValue = Number(compactVolume.replace(/(ml|cl|l)$/, ''));

  if (compactVolume === 'schooner') return 379;

  if (Number.isFinite(numericValue)) {
    if (compactVolume.endsWith('ml')) return numericValue;
    if (compactVolume.endsWith('cl')) return numericValue * 10;
    if (compactVolume.endsWith('l')) return numericValue * 1000;
  }

  return DEFAULT_SERVING_VOLUME_ML;
};

export const calculateAlcoholUnits = (drinks: AlcoholUnitDrink[] = []) => {
  const units = drinks.reduce((sum, drink) => {
    const volumeMl = getServingVolumeMl(drink.volume);
    const quantity = getQuantity(drink.quantity);
    const abv = getAbv(drink.abv);
    const pureAlcoholMl = volumeMl * quantity * (abv / 100);
    const pureAlcoholGrams = pureAlcoholMl * ALCOHOL_GRAMS_PER_ML;
    return sum + (pureAlcoholGrams / DANISH_ALCOHOL_UNIT_GRAMS);
  }, 0);

  return roundStat(units);
};
```

- [ ] **Step 4: Add the npm script**

Modify `package.json` inside `scripts`:

```json
"test:session-units": "node scripts/alcoholUnits.test.js",
```

Place it near `test:session-beers` so related tests stay grouped.

- [ ] **Step 5: Run the helper test to verify it passes**

Run:

```bash
npm run test:session-units
```

Expected: PASS with `alcohol unit checks passed`.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json scripts/alcoholUnits.test.js src/lib/alcoholUnits.ts
git commit -m "feat: add alcohol unit calculation helper"
```

---

### Task 2: Normal Session RPC, Mapper, and Card

**Files:**
- Create: `supabase/migrations/20260606120000_add_session_feed_units.sql`
- Modify: `scripts/sessionFeedDetails.test.js`
- Modify: `src/lib/sessionFeedDetails.ts`
- Modify: `src/screens/FeedScreen.tsx`

- [ ] **Step 1: Write failing session feed details tests**

In `scripts/sessionFeedDetails.test.js`, add these lines after the existing `migrationPath` and `sql` constants:

```js
const unitsMigrationPath = path.join(root, 'supabase/migrations/20260606120000_add_session_feed_units.sql');

assert.equal(fs.existsSync(unitsMigrationPath), true, 'session feed units migration should exist');
const unitsSql = fs.readFileSync(unitsMigrationPath, 'utf8');
```

Add these assertions after the existing RPC grant/schema assertions:

```js
assert.match(unitsSql, /drop function if exists public\.get_session_feed_details\(uuid\[\]\)/i, 'units migration should drop the old feed details signature before changing return columns');
assert.match(unitsSql, /units double precision/i, 'feed details RPC should return units');
assert.match(unitsSql, /author_current_streak integer/i, 'units migration should preserve current streak output');
assert.match(unitsSql, /public\.beerva_serving_volume_ml\(sb\.volume\)/i, 'units calculation should use the shared SQL serving volume parser');
assert.match(unitsSql, /0\.789/i, 'units calculation should use ethanol grams per ml');
assert.match(unitsSql, /12\.0/i, 'units calculation should divide by 12 grams per Danish unit');
assert.match(unitsSql, /notify pgrst, 'reload schema'/i, 'units migration should reload the PostgREST schema cache');
```

In the `mapped = feedDetails.mapSessionFeedDetailRow({ ... })` fixture, add:

```js
  units: 1,
```

After `assert.equal(mapped.beers[0].beer_name, 'Tuborg', 'mapper passes beers through in app shape');`, add:

```js
assert.equal(mapped.units, 1, 'mapper carries session units from the RPC');
```

In the `emptyMapped = feedDetails.mapSessionFeedDetailRow({ ... })` fixture, add:

```js
  units: null,
```

After `assert.deepEqual(emptyMapped.photos, [], 'mapper tolerates null photo arrays');`, add:

```js
assert.equal(emptyMapped.units, 0, 'mapper defaults missing units to 0');
```

After the existing feed wiring assertions, add:

```js
assert.match(feedScreenSource, /getSessionUnits/, 'feed should calculate session units for the More stats card');
assert.match(feedScreenSource, /detail\?\.units/, 'feed should hydrate session units from the feed details RPC');
assert.match(feedScreenSource, />Units<\/Text>/, 'feed More stats should render a Units pill');
```

- [ ] **Step 2: Run session feed details tests to verify they fail**

Run:

```bash
npm run test:session-feed-details
```

Expected: FAIL with `session feed units migration should exist`.

- [ ] **Step 3: Add the Supabase migration**

Create `supabase/migrations/20260606120000_add_session_feed_units.sql`:

```sql
-- Adds Danish alcohol units to the feed-details RPC while preserving the
-- current streak output added in 20260604150000_add_current_streaks.sql.

drop function if exists public.get_session_feed_details(uuid[]);

create or replace function public.get_session_feed_details(session_ids uuid[])
returns table (
  session_id uuid,
  author_username text,
  author_avatar_url text,
  cheers_count integer,
  cheers jsonb,
  beers jsonb,
  comments jsonb,
  photos jsonb,
  units double precision,
  author_current_streak integer
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_sessions as (
    select s.id, s.user_id
    from public.sessions s
    where s.id = any(coalesce(session_ids, array[]::uuid[]))
      and s.status = 'published'
      and (
        s.user_id = (select auth.uid())
        or exists (
          select 1
          from public.follows
          where follows.follower_id = (select auth.uid())
            and follows.following_id = s.user_id
        )
      )
  ),
  author_streaks as (
    select cs.user_id, cs.current_streak
    from public.get_current_streaks(
      (select array_agg(distinct vs.user_id) from visible_sessions vs)
    ) cs
  )
  select
    vs.id as session_id,
    author.username as author_username,
    author.avatar_url as author_avatar_url,
    coalesce(cheer_agg.cheers_count, 0) as cheers_count,
    coalesce(cheer_agg.cheers, '[]'::jsonb) as cheers,
    coalesce(beer_agg.beers, '[]'::jsonb) as beers,
    coalesce(comment_agg.comments, '[]'::jsonb) as comments,
    coalesce(photo_agg.photos, '[]'::jsonb) as photos,
    coalesce(beer_agg.units, 0) as units,
    coalesce(author_streaks.current_streak, 0) as author_current_streak
  from visible_sessions vs
  left join public.profiles author
    on author.id = vs.user_id
  left join author_streaks on author_streaks.user_id = vs.user_id
  left join lateral (
    select
      count(*)::int as cheers_count,
      jsonb_agg(
        jsonb_build_object(
          'user_id', ch.user_id,
          'username', pr.username,
          'avatar_url', pr.avatar_url,
          'created_at', ch.created_at
        )
        order by ch.created_at asc nulls last
      ) as cheers
    from public.session_cheers ch
    left join public.profiles pr on pr.id = ch.user_id
    where ch.session_id = vs.id
  ) cheer_agg on true
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', sb.id,
          'session_id', sb.session_id,
          'beer_name', sb.beer_name,
          'volume', sb.volume,
          'quantity', sb.quantity,
          'abv', sb.abv,
          'note', sb.note,
          'consumed_at', sb.consumed_at,
          'created_at', sb.created_at
        )
        order by sb.consumed_at asc nulls last
      ) as beers,
      coalesce(round(sum(
        public.beerva_serving_volume_ml(sb.volume)
        * greatest(coalesce(sb.quantity, 1)::double precision, 0)
        * (greatest(coalesce(sb.abv, 0)::double precision, 0) / 100.0)
        * 0.789
        / 12.0
      )::numeric, 1)::double precision, 0) as units
    from public.session_beers sb
    where sb.session_id = vs.id
  ) beer_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', co.id,
        'session_id', co.session_id,
        'user_id', co.user_id,
        'body', co.body,
        'created_at', co.created_at,
        'updated_at', co.updated_at,
        'username', pr.username,
        'avatar_url', pr.avatar_url
      )
      order by co.created_at asc nulls last
    ) as comments
    from public.session_comments co
    left join public.profiles pr on pr.id = co.user_id
    where co.session_id = vs.id
  ) comment_agg on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', ph.id,
        'session_id', ph.session_id,
        'image_url', ph.image_url,
        'is_keeper', ph.is_keeper,
        'expires_at', ph.expires_at,
        'created_at', ph.created_at
      )
      order by ph.is_keeper desc, ph.created_at asc nulls last
    ) as photos
    from public.session_photos ph
    where ph.session_id = vs.id
  ) photo_agg on true;
$$;

revoke execute on function public.get_session_feed_details(uuid[]) from public, anon;
grant execute on function public.get_session_feed_details(uuid[]) to authenticated;

comment on function public.get_session_feed_details(uuid[]) is
  'Returns author profile, current streak, alcohol units, and jsonb cheers/beers/comments/photos for visible published sessions in one feed round-trip.';

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Map units in the client feed-details library**

Modify `src/lib/sessionFeedDetails.ts`.

Add `units` to `SessionFeedDetail`:

```ts
  units: number;
```

Add `units` to `SessionFeedDetailRow`:

```ts
  units?: number | string | null;
```

Add this helper near `asArray`:

```ts
const numberOrZero = (value: number | string | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
```

Add the mapped field in `mapSessionFeedDetailRow`:

```ts
    units: numberOrZero(row.units),
```

- [ ] **Step 5: Render Units on normal session cards**

Modify `src/screens/FeedScreen.tsx`.

Add this import:

```ts
import { calculateAlcoholUnits } from '../lib/alcoholUnits';
```

Add `units` to `FeedSession`:

```ts
  units?: number | null;
```

Add this helper after `getSessionTruePints`:

```ts
const getSessionUnits = (item: FeedSession) => {
  if (typeof item.units === 'number' && Number.isFinite(item.units)) {
    return item.units;
  }

  const beers = item.session_beers.length > 0
    ? item.session_beers
    : [{ volume: item.volume, quantity: item.quantity, abv: item.abv ?? null }];

  return calculateAlcoholUnits(beers);
};
```

Inside `FeedSessionCard`, after `const truePints = getSessionTruePints(item);`, add:

```ts
  const units = getSessionUnits(item);
```

Inside the More stats `detailGrid`, directly after the True Pints pill, add:

```tsx
              <View style={styles.detailPill}>
                <Text style={styles.detailLabel}>Units</Text>
                <Text style={styles.detailValue}>{formatStatNumber(units)}</Text>
              </View>
```

Inside feed hydration, after `session_beers: sessionBeers,`, add:

```ts
            units: detail?.units ?? null,
```

Tighten the normal-card stat pill sizing in the `styles.detailPill`, `styles.detailLabel`, and `styles.detailValue` entries:

```ts
  detailPill: {
    flex: 1,
    flexBasis: 68,
    minHeight: 46,
    minWidth: 0,
    borderRadius: radius.md,
    backgroundColor: feedCardColors.statBackground,
    borderWidth: 1,
    borderColor: feedCardColors.metadataDivider,
    paddingHorizontal: 8,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0,
    fontWeight: '800',
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
```

- [ ] **Step 6: Run session feed details tests to verify they pass**

Run:

```bash
npm run test:session-feed-details
```

Expected: PASS with the existing session feed details messages and the new units assertions passing.

- [ ] **Step 7: Commit**

Run:

```bash
git add scripts/sessionFeedDetails.test.js src/lib/sessionFeedDetails.ts src/screens/FeedScreen.tsx supabase/migrations/20260606120000_add_session_feed_units.sql
git commit -m "feat: add session units to feed details"
```

---

### Task 3: Pub Crawl Units Summary and Card

**Files:**
- Modify: `scripts/pubCrawl.test.js`
- Modify: `src/lib/pubCrawls.ts`
- Modify: `src/components/PubCrawlFeedCard.tsx`

- [ ] **Step 1: Write failing pub crawl tests**

In `scripts/pubCrawl.test.js`, after `assert.equal(summary.truePints, 6.2);`, add:

```js
assert.equal(summary.units, 10.4);
```

After the `summaryWithMissingAbv.averageAbv` assertion, add:

```js
assert.equal(
  summaryWithMissingAbv.units,
  1.9,
  'pub crawl units should ignore drinks without ABV instead of treating them as unknown'
);
```

After `assert.match(feedCardSource, /getStopDrinkCount/, 'expanded pub crawl stop rows should count drink quantities, not beer rows');`, add:

```js
assert.match(feedCardSource, />Units<\/Text>/, 'pub crawl More stats should render a Units pill');
assert.match(feedCardSource, /formatStatNumber\(summary\.units\)/, 'pub crawl Units pill should render the summary units value');
```

- [ ] **Step 2: Run pub crawl tests to verify they fail**

Run:

```bash
npm run test:pub-crawl
```

Expected: FAIL because `summary.units` is `undefined`.

- [ ] **Step 3: Add units to pub crawl summaries**

Modify `src/lib/pubCrawls.ts`.

Add this import at the top:

```ts
import { calculateAlcoholUnits, getServingVolumeMl } from './alcoholUnits';
```

Remove the local `getServingVolumeMl` function from `src/lib/pubCrawls.ts`; the imported helper has the same behavior.

Add `units` to `PubCrawlSummary`:

```ts
  units: number;
```

Update `calculatePubCrawlSummary`:

```ts
export const calculatePubCrawlSummary = (stops: PubCrawlStop[] = []): PubCrawlSummary => {
  let drinkCount = 0;
  let totalMl = 0;
  let weightedAbv = 0;
  let abvVolumeMl = 0;
  const unitDrinks: Array<{ volume: string | null; quantity: number; abv: number | null }> = [];

  stops.forEach((stop) => {
    stop.beers.forEach((beer) => {
      const quantity = Math.max(1, beer.quantity || 1);
      const volumeMl = getServingVolumeMl(beer.volume);
      const drinkMl = volumeMl * quantity;
      drinkCount += quantity;
      totalMl += drinkMl;
      unitDrinks.push({ volume: beer.volume, quantity, abv: beer.abv });
      if (typeof beer.abv === 'number') {
        weightedAbv += drinkMl * beer.abv;
        abvVolumeMl += drinkMl;
      }
    });
  });

  return {
    barCount: stops.length,
    drinkCount,
    truePints: roundStat(totalMl / 568),
    units: calculateAlcoholUnits(unitDrinks),
    averageAbv: abvVolumeMl > 0 ? roundStat(weightedAbv / abvVolumeMl) : null,
    routeLabel: stops.map((stop) => stop.pubName).join(' -> '),
  };
};
```

- [ ] **Step 4: Render Units on pub crawl cards**

Modify `src/components/PubCrawlFeedCard.tsx`.

Inside the More stats `detailGrid`, directly after the True Pints pill, add:

```tsx
              <View style={styles.detailPill}>
                <Text style={styles.detailLabel}>Units</Text>
                <Text style={styles.detailValue}>{formatStatNumber(summary.units)}</Text>
              </View>
```

Tighten the pub-crawl stat pill sizing in the `styles.detailPill`, `styles.detailLabel`, and `styles.detailValue` entries:

```ts
  detailPill: {
    flex: 1,
    flexBasis: 68,
    minHeight: 46,
    minWidth: 0,
    borderRadius: radius.md,
    backgroundColor: feedCardColors.statBackground,
    borderWidth: 1,
    borderColor: feedCardColors.metadataDivider,
    paddingHorizontal: 8,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0,
    fontWeight: '800',
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
```

- [ ] **Step 5: Run pub crawl tests to verify they pass**

Run:

```bash
npm run test:pub-crawl
```

Expected: PASS with `pub crawl tests passed`.

- [ ] **Step 6: Commit**

Run:

```bash
git add scripts/pubCrawl.test.js src/lib/pubCrawls.ts src/components/PubCrawlFeedCard.tsx
git commit -m "feat: show units on pub crawl posts"
```

---

### Task 4: Verification and Scope Guard

**Files:**
- Verify: `package.json`
- Verify: `src/lib/challenges.ts`
- Verify: `src/lib/challengesApi.ts`
- Verify: `src/lib/pubLegends.ts`
- Verify: `src/lib/pubLegendsApi.ts`
- Verify: `src/components/ProfileStatsPanel.tsx`

- [ ] **Step 1: Run focused unit and feed tests**

Run:

```bash
npm run test:session-units
npm run test:session-feed-details
npm run test:pub-crawl
npm run test:session-beers
npm run test:feed-redesign
```

Expected:

```text
alcohol unit checks passed
session feed details checks passed
author current streak mapping passed
pub crawl tests passed
session beer formatting checks passed
feed card redesign checks passed
```

- [ ] **Step 2: Run TypeScript verification**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Confirm leaderboards, challenges, and profile stats were not converted to units**

Run:

```bash
rg -n "calculateAlcoholUnits|\\bunits\\b" src/lib/challenges.ts src/lib/challengesApi.ts src/lib/pubLegends.ts src/lib/pubLegendsApi.ts src/components/ProfileStatsPanel.tsx
```

Expected: no output.

- [ ] **Step 4: Review git diff**

Run:

```bash
git diff --stat HEAD
git diff -- package.json scripts/alcoholUnits.test.js scripts/sessionFeedDetails.test.js scripts/pubCrawl.test.js src/lib/alcoholUnits.ts src/lib/sessionFeedDetails.ts src/screens/FeedScreen.tsx src/lib/pubCrawls.ts src/components/PubCrawlFeedCard.tsx supabase/migrations/20260606120000_add_session_feed_units.sql
```

Expected: diff only contains the alcohol units helper, feed-details units migration/mapper, normal card Units pill, pub crawl Units pill, tests, and the new npm script.

- [ ] **Step 5: Final commit if verification changed files**

If verification led to any small fixes, commit them:

```bash
git add package.json scripts/alcoholUnits.test.js scripts/sessionFeedDetails.test.js scripts/pubCrawl.test.js src/lib/alcoholUnits.ts src/lib/sessionFeedDetails.ts src/screens/FeedScreen.tsx src/lib/pubCrawls.ts src/components/PubCrawlFeedCard.tsx supabase/migrations/20260606120000_add_session_feed_units.sql
git commit -m "fix: finalize session units"
```

If `git status --short` is empty after Step 4, do not create another commit.
