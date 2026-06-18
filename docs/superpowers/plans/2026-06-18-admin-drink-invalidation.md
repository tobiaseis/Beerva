# Admin Drink Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a quiet moderation tool for marking individual drinks as ignored when a user logs suspicious amounts, while keeping the drink visible in the user's feed/session and excluding it from stats, trophies, and challenge progress.
**Architecture:** Add moderation fields to `public.session_beers`, expose admin-only RPCs for listing and toggling ignored drinks, update all stats and challenge calculation SQL to filter ignored rows, and carry the ignored flag through React Native session/feed views with a small detective badge.
**Tech Stack:** Supabase Postgres migrations and RPCs, Expo React Native, TypeScript, Node assertion test scripts.

---

## File Structure

Create:

- `supabase/migrations/20260618160000_add_drink_invalidation.sql`
- `src/components/IgnoredDrinkBadge.tsx`

Modify:

- `scripts/adminTools.test.js`
- `scripts/challenges.test.js`
- `scripts/profileStats.test.js`
- `scripts/sessionFeedDetails.test.js`
- `scripts/liveMateSessions.test.js`
- `src/lib/adminApi.ts`
- `src/lib/adminTools.ts`
- `src/lib/challenges.ts`
- `src/screens/AdminToolsScreen.tsx`
- `src/screens/FeedScreen.tsx`
- `src/screens/PostDetailScreen.tsx`
- `src/screens/EditSessionScreen.tsx`

---

## Task 1: Add Source Tests For Admin Drink Invalidation

- [ ] Extend `scripts/adminTools.test.js` with assertions for the new migration, RPCs, API helpers, and admin UI.

Expected checks:

```js
const drinkInvalidationMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260618160000_add_drink_invalidation.sql'
);
const drinkInvalidationSql = fs.readFileSync(drinkInvalidationMigrationPath, 'utf8');

assertIncludes(
  drinkInvalidationSql,
  'excluded_from_stats boolean not null default false',
  'session_beers gets a durable ignored-in-stats flag'
);
assertIncludes(
  drinkInvalidationSql,
  'excluded_from_stats_at timestamp with time zone',
  'session_beers records when a drink was ignored'
);
assertIncludes(
  drinkInvalidationSql,
  'excluded_from_stats_by uuid',
  'session_beers records the admin who ignored a drink'
);
assertIncludes(
  drinkInvalidationSql,
  'create or replace function public.admin_get_moderation_drinks',
  'admin drink list RPC exists'
);
assertIncludes(
  drinkInvalidationSql,
  'create or replace function public.admin_set_session_beer_excluded',
  'admin toggle RPC exists'
);
assertIncludes(
  drinkInvalidationSql,
  'public.is_current_user_admin()',
  'moderation RPCs enforce admin access'
);
assertIncludes(
  drinkInvalidationSql,
  'revoke execute on function public.admin_get_moderation_drinks',
  'moderation list RPC is not public'
);
assertIncludes(
  drinkInvalidationSql,
  'grant execute on function public.admin_get_moderation_drinks',
  'moderation list RPC is granted to authenticated users'
);
```

Also assert `src/lib/adminApi.ts` exports:

- `AdminModerationDrink`
- `fetchAdminModerationDrinks`
- `setAdminDrinkExcluded`

Also assert `src/screens/AdminToolsScreen.tsx` contains:

- `moderation`
- `Ignore in stats`
- `Restore to stats`
- `fetchAdminModerationDrinks`
- `setAdminDrinkExcluded`

Run:

```powershell
npm run test:admin-tools
```

Expected result before implementation: the command fails because the migration and UI/API code do not exist yet.

---

## Task 2: Add Source Tests For Ignored-Drink Calculation Filters

- [ ] Extend `scripts/profileStats.test.js` to assert that `get_profile_stats` filters ignored drinks:

```js
assertIncludes(
  sql,
  'coalesce(session_beers.excluded_from_stats, false) = false',
  'profile stats ignore admin-invalidated drinks'
);
```

- [ ] Extend `scripts/challenges.test.js` to assert the latest challenge migration filters ignored drinks in `beer_events`, while the legacy fallback remains scoped to sessions that have no `session_beers` rows at all:

```js
assertIncludes(
  forceTargetUnitsSql,
  'and coalesce(session_beers.excluded_from_stats, false) = false',
  'challenge progress ignores admin-invalidated session beers'
);
assertIncludes(
  forceTargetUnitsSql,
  'where session_beers.session_id = sessions.id',
  'legacy challenge fallback only applies to sessions without session_beers rows'
);
```

- [ ] Extend `scripts/sessionFeedDetails.test.js` to assert feed detail totals ignore invalidated drinks but JSON rows expose moderation metadata:

```js
assertIncludes(
  sessionFeedDetailsSql,
  'excluded_from_stats',
  'session feed beer rows expose ignored-in-stats metadata'
);
assertIncludes(
  sessionFeedDetailsSql,
  'coalesce(session_beers.excluded_from_stats, false) = false',
  'session feed numeric totals ignore admin-invalidated drinks'
);
```

- [ ] Extend `scripts/liveMateSessions.test.js` if the live-mate SQL still calculates true-pint or unit totals from `session_beers`:

```js
assertIncludes(
  liveMateSql,
  'coalesce(session_beers.excluded_from_stats, false) = false',
  'live mate totals ignore admin-invalidated drinks'
);
```

Run:

```powershell
npm run test:challenges
npm run test:stats
npm run test:session-feed-details
npm run test:live-mates
```

Expected result before implementation: the commands fail on the new ignored-drink assertions.

---

## Task 3: Add The Moderation Schema And Admin RPCs

- [ ] Create `supabase/migrations/20260618160000_add_drink_invalidation.sql`.

Core schema:

```sql
alter table public.session_beers
  add column if not exists excluded_from_stats boolean not null default false,
  add column if not exists excluded_from_stats_at timestamp with time zone,
  add column if not exists excluded_from_stats_by uuid references auth.users(id) on delete set null,
  add column if not exists excluded_from_stats_reason text;

create index if not exists session_beers_excluded_from_stats_idx
  on public.session_beers (session_id, excluded_from_stats)
  where excluded_from_stats = true;
```

- [ ] Add `public.admin_get_moderation_drinks(search_query text default null, target_user_id uuid default null, result_limit integer default 100)`.

Return table columns:

- `session_beer_id uuid`
- `session_id uuid`
- `user_id uuid`
- `username text`
- `avatar_url text`
- `beer_name text`
- `volume text`
- `quantity integer`
- `abv double precision`
- `beverage_category text`
- `pub_name text`
- `consumed_at timestamp with time zone`
- `session_started_at timestamp with time zone`
- `session_created_at timestamp with time zone`
- `excluded_from_stats boolean`
- `excluded_from_stats_at timestamp with time zone`
- `excluded_from_stats_by uuid`
- `excluded_from_stats_reason text`

RPC behavior:

- Require `public.is_current_user_admin()`.
- Join `session_beers` to `sessions`.
- Left join `profiles` on `sessions.user_id`.
- Allow exact user filtering through `target_user_id`.
- Allow search across username, beer name, and pub name with `search_query`.
- Order newest drink first using `coalesce(session_beers.consumed_at, sessions.started_at, sessions.created_at) desc`.
- Clamp `result_limit` with `least(greatest(coalesce(result_limit, 100), 1), 250)`.

- [ ] Add `public.admin_set_session_beer_excluded(target_session_beer_id uuid, should_exclude boolean, exclusion_reason text default null)` returning `public.session_beers`.

RPC behavior:

- Require `public.is_current_user_admin()`.
- Raise `Drink not found.` if the target row does not exist.
- When `should_exclude = true`, set:
  - `excluded_from_stats = true`
  - `excluded_from_stats_at = now()`
  - `excluded_from_stats_by = auth.uid()`
  - `excluded_from_stats_reason = nullif(btrim(coalesce(exclusion_reason, '')), '')`
- When `should_exclude = false`, set:
  - `excluded_from_stats = false`
  - `excluded_from_stats_at = null`
  - `excluded_from_stats_by = null`
  - `excluded_from_stats_reason = null`
- Do not notify the user.

- [ ] Lock down both RPCs:

```sql
revoke execute on function public.admin_get_moderation_drinks(text, uuid, integer) from public, anon;
revoke execute on function public.admin_set_session_beer_excluded(uuid, boolean, text) from public, anon;
grant execute on function public.admin_get_moderation_drinks(text, uuid, integer) to authenticated;
grant execute on function public.admin_set_session_beer_excluded(uuid, boolean, text) to authenticated;
```

- [ ] End the migration with:

```sql
notify pgrst, 'reload schema';
```

Run:

```powershell
npm run test:admin-tools
```

Expected result after this task: admin SQL assertions pass; UI/API assertions still fail until Task 5.

---

## Task 4: Filter Ignored Drinks Out Of Stats, Trophies, And Challenges

- [ ] In `20260618160000_add_drink_invalidation.sql`, replace the latest `public.get_profile_stats(target_user_id uuid)` definition copied from `supabase/migrations/20260617120000_add_admin_beverage_categories.sql`, adding this predicate to the `base` CTE after the `session_beers` join:

```sql
and coalesce(session_beers.excluded_from_stats, false) = false
```

This keeps ignored drinks out of profile totals and client-side trophy eligibility generated from profile stats.

- [ ] Replace `public.get_challenge_leaderboard(target_challenge_id uuid)`, `public.get_official_challenges()`, and `public.get_challenge_detail(target_challenge_slug text)` using the current definitions from `supabase/migrations/20260618140000_force_target_challenges_to_units.sql`, adding the same ignored-drink predicate to each `beer_events` query.

Important legacy fallback rule:

```sql
and not exists (
  select 1
  from public.session_beers
  where session_beers.session_id = sessions.id
)
```

Keep this as a check for any `session_beers` rows, not a check for only non-ignored rows. Otherwise a session with one ignored row could fall back to legacy `sessions.volume`, `sessions.quantity`, and `sessions.abv` and still count.

- [ ] Replace `public.get_session_feed_details(...)` using the current definition from `supabase/migrations/20260606120000_add_session_feed_units.sql`.

Feed detail behavior:

- Beer JSON arrays still include ignored drinks.
- Each beer JSON object includes:
  - `excluded_from_stats`
  - `excluded_from_stats_at`
  - `excluded_from_stats_reason`
- Numeric totals such as units and true pints only sum rows where `coalesce(session_beers.excluded_from_stats, false) = false`.

- [ ] Replace live-mate SQL helpers from `supabase/migrations/20260604130000_add_live_mate_sessions.sql` if they calculate cached totals from `session_beers`.

Expected live-mate behavior:

- Live session cards remain visible.
- Ignored drinks do not add to live true-pint or unit totals.

- [ ] Update any active challenge finalizer functions that directly read `session_beers`, including KarnevalsDruk and recovery finalizers, to add the ignored-drink predicate.

Persistent award rule:

- Do not silently delete existing rows from `public.challenge_awards`.
- New and rerun finalizers should ignore excluded drinks.
- If historical trophies need repair, handle that with an explicit admin repair migration after confirming which awards should be revoked.

Run:

```powershell
npm run test:challenges
npm run test:stats
npm run test:session-feed-details
npm run test:live-mates
npm run test:session-units
```

Expected result after this task: all SQL calculation tests pass.

Commit:

```powershell
git status --short
git add scripts/adminTools.test.js scripts/challenges.test.js scripts/profileStats.test.js scripts/sessionFeedDetails.test.js scripts/liveMateSessions.test.js supabase/migrations/20260618160000_add_drink_invalidation.sql
git commit -m "feat: add ignored drink backend"
```

---

## Task 5: Add Admin API And Admin Tools UI

- [ ] In `src/lib/adminApi.ts`, add the RPC row and app model:

```ts
export type AdminModerationDrinkRow = {
  session_beer_id: string;
  session_id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  beer_name: string | null;
  volume: string | null;
  quantity: number | null;
  abv: number | null;
  beverage_category: string | null;
  pub_name: string | null;
  consumed_at: string | null;
  session_started_at: string | null;
  session_created_at: string | null;
  excluded_from_stats: boolean | null;
  excluded_from_stats_at: string | null;
  excluded_from_stats_by: string | null;
  excluded_from_stats_reason: string | null;
};
```

```ts
export type AdminModerationDrink = {
  sessionBeerId: string;
  sessionId: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  beerName: string;
  volume: string | null;
  quantity: number;
  abv: number | null;
  beverageCategory: string | null;
  pubName: string | null;
  consumedAt: string | null;
  sessionStartedAt: string | null;
  sessionCreatedAt: string | null;
  excludedFromStats: boolean;
  excludedFromStatsAt: string | null;
  excludedFromStatsBy: string | null;
  excludedFromStatsReason: string | null;
};
```

- [ ] Add:

```ts
export async function fetchAdminModerationDrinks(options?: {
  searchQuery?: string;
  targetUserId?: string;
  limit?: number;
}): Promise<AdminModerationDrink[]>
```

RPC call:

```ts
supabase.rpc('admin_get_moderation_drinks', {
  search_query: options?.searchQuery ?? null,
  target_user_id: options?.targetUserId ?? null,
  result_limit: options?.limit ?? 100,
})
```

- [ ] Add:

```ts
export async function setAdminDrinkExcluded(
  sessionBeerId: string,
  excluded: boolean,
  reason?: string | null
): Promise<void>
```

RPC call:

```ts
supabase.rpc('admin_set_session_beer_excluded', {
  target_session_beer_id: sessionBeerId,
  should_exclude: excluded,
  exclusion_reason: reason ?? null,
})
```

- [ ] In `src/lib/adminTools.ts`, add small formatting helpers for the moderation row:

```ts
export function getAdminModerationDrinkTitle(drink: AdminModerationDrink): string
export function getAdminModerationDrinkMeta(drink: AdminModerationDrink): string
```

Meta should include username, quantity, volume, ABV, and pub/session date when available.

- [ ] In `src/screens/AdminToolsScreen.tsx`, add a fourth segment named `moderation`.

UI behavior:

- Search input filters by username, beer name, or pub name through the RPC.
- List shows newest drinks first.
- Ignored rows are visually quieter and show "Ignored in stats".
- Active rows show an `Ignore in stats` button.
- Ignored rows show a `Restore to stats` button.
- Tapping either button calls `setAdminDrinkExcluded`, then refreshes the list.
- Do not show or send any user-facing warning.

Run:

```powershell
npm run test:admin-tools
npx tsc --noEmit
```

Expected result after this task: admin tests and TypeScript pass.

Commit:

```powershell
git status --short
git add src/lib/adminApi.ts src/lib/adminTools.ts src/screens/AdminToolsScreen.tsx scripts/adminTools.test.js
git commit -m "feat: add admin drink moderation tools"
```

---

## Task 6: Show Ignored Drinks With A Small Detective Badge

- [ ] Create `src/components/IgnoredDrinkBadge.tsx`.

Component behavior:

- Render nothing when `excludedFromStats` is false.
- Render a compact inline badge when true.
- Use the iOS detective emoji as the visible mark: `🕵️`
- Use existing theme colors from the app.
- Keep the badge small enough to sit beside a drink line without changing the card hierarchy.
- Add `accessibilityLabel="Ignored in stats"` so screen readers do not only announce the emoji.

- [ ] Update all session beer TypeScript shapes used by feed/session screens to include:

```ts
excluded_from_stats?: boolean | null;
excluded_from_stats_at?: string | null;
excluded_from_stats_reason?: string | null;
```

Mapped app objects should use:

```ts
excludedFromStats: Boolean(row.excluded_from_stats)
```

- [ ] Update Supabase selections for `session_beers` in:

- `src/screens/FeedScreen.tsx`
- `src/screens/PostDetailScreen.tsx`
- `src/screens/EditSessionScreen.tsx`

Add these fields to every nested `session_beers(...)` selection:

```text
excluded_from_stats,
excluded_from_stats_at,
excluded_from_stats_reason
```

- [ ] Update `FeedScreen.tsx` drink rendering:

Expected display:

```text
3 x 0.5L Beer 5.0% 🕵️
```

The badge should be beside only the ignored drink, not beside the whole session.

- [ ] Update `PostDetailScreen.tsx` drink rendering with the same badge.

- [ ] Update `EditSessionScreen.tsx` to preserve ignored metadata while editing and show the same subtle badge beside an ignored existing drink. Editing a drink does not automatically restore it.

Run:

```powershell
npm run test:session-feed-details
npx tsc --noEmit
npm run build:web
```

Expected result after this task: TypeScript and web build pass, and source tests confirm metadata is present.

Commit:

```powershell
git status --short
git add src/components/IgnoredDrinkBadge.tsx src/screens/FeedScreen.tsx src/screens/PostDetailScreen.tsx src/screens/EditSessionScreen.tsx scripts/sessionFeedDetails.test.js
git commit -m "feat: show ignored drink badge"
```

---

## Task 7: Full Verification

- [ ] Run the full focused verification suite:

```powershell
npm run test:admin-tools
npm run test:challenges
npm run test:stats
npm run test:session-feed-details
npm run test:live-mates
npm run test:session-units
npx tsc --noEmit
npm run build:web
```

Expected result:

- Every command exits with code `0`.
- No TypeScript errors.
- `npm run build:web` completes successfully.

- [ ] Inspect the final diff:

```powershell
git status --short
git diff --stat
```

- [ ] Confirm these acceptance checks:

- Admins can search drink rows in Admin Tools.
- Admins can mark a single drink as ignored.
- Admins can restore a single drink.
- Ignored drinks remain visible in feed/session views.
- Ignored drinks display the small detective badge.
- Ignored drinks are excluded from profile stats.
- Ignored drinks are excluded from challenge progress and leaderboards.
- Ignored drinks are excluded from trophy eligibility that depends on profile stats or challenge calculations.
- No user warning or notification is created.

Final commit if verification required small fixes:

```powershell
git status --short
git add supabase/migrations/20260618160000_add_drink_invalidation.sql scripts/adminTools.test.js scripts/challenges.test.js scripts/profileStats.test.js scripts/sessionFeedDetails.test.js scripts/liveMateSessions.test.js src/components/IgnoredDrinkBadge.tsx src/lib/adminApi.ts src/lib/adminTools.ts src/lib/challenges.ts src/screens/AdminToolsScreen.tsx src/screens/FeedScreen.tsx src/screens/PostDetailScreen.tsx src/screens/EditSessionScreen.tsx
git commit -m "fix: complete ignored drink verification"
```

---

## Self-Review Checklist

- [ ] New SQL functions use `security definer` only where admin-only access is required.
- [ ] Admin RPCs call `public.is_current_user_admin()` before returning or mutating data.
- [ ] Ignored drinks are filtered in calculation queries, not hidden from display queries.
- [ ] Legacy session challenge fallback cannot count a session whose only `session_beers` rows were ignored.
- [ ] Existing `challenge_awards` rows are not silently removed.
- [ ] The UI badge is small, readable, and attached to the drink row.
- [ ] TypeScript models use camelCase in app code and snake_case only at Supabase boundaries.
- [ ] Verification commands are run after implementation.
