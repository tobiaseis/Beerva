# Friday Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Friday at about 17:30 Copenhagen time, send one push to people who haven't logged a night out yet this week. It mentions their weekly streak if one is at risk, or which mates were out last weekend.

**Architecture:** A `pg_cron` job runs every 15 minutes on Friday evenings and calls `queue_friday_nudges()`. That function only acts inside the 17:30–19:00 local window, so daylight-saving changes don't matter. It picks eligible users and claims a row in a new `engagement_push_log` table, which makes sending idempotent: one nudge per user per week. It then inserts a `friday_nudge` notification. The existing `notifications` insert trigger already calls the `send-push` Edge Function, which gets a new copy branch and a link to the Record screen. Push text and in-app text come from one shared, dependency-free module, `supabase/functions/_shared/engagementCopy.ts`. A per-user opt-out (`profiles.engagement_pushes_enabled`) is exposed as a toggle on the Profile screen.

**Tech Stack:** Supabase Postgres + `pg_cron`, Supabase Edge Functions (Deno), Expo React Native + PWA, TypeScript, Node assertion test scripts.

**Plan order:** Plan 2 of 3. It needs `get_weekly_streaks` and `beerva_drinking_week` from `2026-11-26-weekly-streaks.md`. It also adds the shared pieces the weekly recap plan (`2026-11-26-weekly-recap.md`) builds on: the opt-out column, the push log, both notification types, and the shared copy module.

---

## Decisions Baked Into This Plan

| Decision | Default | Where to change |
| --- | --- | --- |
| When | Friday 17:30–19:00 Copenhagen. The job wakes every 15 minutes, and each person gets at most one nudge that week. | Time window in `queue_friday_nudges`; cron line in Task 2 |
| Who | Push enabled; opted in (default on); posted at least once in the last 8 weeks; no published or active session yet this drinking week. | `where` clause in `queue_friday_nudges` |
| Copy priority | 1) Streak of 2+ weeks at risk: "Keep the streak alive 🔥". 2) Mates who were out last Fri–Sun: "Mads and Sofie were out last weekend. Plans tonight?" 3) Generic: "Heading out tonight?" | `buildFridayNudgeCopy` in Task 3 |
| Tapping the push | Opens the Record screen. | URL branch in Task 4 |
| In-app list | The nudge is stored already read, so it never adds to the bell badge. It shows a "Log a night" button. | `read` value in `queue_friday_nudges`; card in Task 5 |
| Opt-out | One toggle, "Weekend reminders & weekly recap", which also covers the Sunday recap. | Task 6 |

---

## File Structure

- Create `supabase/migrations/20261127130000_add_friday_nudge.sql`
  - `profiles.engagement_pushes_enabled` (default `true`).
  - `engagement_push_log (user_id, kind, week_start)`, which guards against sending twice.
  - Adds `friday_nudge` and `weekly_recap` to `notifications_type_check`.
  - `queue_friday_nudges(force boolean, only_user_id uuid)` and the `beerva-friday-nudge` cron job.
- Create `supabase/functions/_shared/engagementCopy.ts`: pure copy builders shared by `send-push` and the app.
- Modify `supabase/functions/send-push/index.ts`: type, metadata, copy and URL for `friday_nudge`.
- Modify `src/lib/notificationMessages.ts`: metadata fields.
- Modify `src/screens/NotificationsScreen.tsx`: the nudge card.
- Modify `src/screens/ProfileScreen.tsx`: the opt-out toggle.
- Create `scripts/fridayNudge.test.js` and add `test:friday-nudge` to `package.json`.

---

### Task 1: Add The Failing Friday Nudge Test

**Files:**
- Create: `scripts/fridayNudge.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the npm script**

In `package.json`, replace:

```json
    "test:weekly-streaks": "node scripts/weeklyStreaks.test.js"
```

with:

```json
    "test:weekly-streaks": "node scripts/weeklyStreaks.test.js",
    "test:friday-nudge": "node scripts/fridayNudge.test.js"
```

- [ ] **Step 2: Write the failing test**

Create `scripts/fridayNudge.test.js` with this complete content:

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadTypeScriptModule } = require('./loadTypeScriptModule');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => {
  const fullPath = path.join(root, relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
};

// Migration.
const sql = read('supabase/migrations/20261127130000_add_friday_nudge.sql');
assert.ok(sql, 'friday nudge migration should exist');
assert.match(sql, /add column if not exists engagement_pushes_enabled boolean not null default true/i, 'opt-out defaults to on');
assert.match(sql, /create table if not exists public\.engagement_push_log/i);
assert.match(sql, /primary key \(user_id, kind, week_start\)/i, 'one engagement push per user, kind and week');
assert.match(sql, /alter table public\.engagement_push_log enable row level security/i);
assert.match(sql, /'friday_nudge',\s*'weekly_recap'/i, 'both engagement notification types are allowed');
assert.match(sql, /'beverage_submission',/i, 'existing notification types stay allowed');
assert.match(sql, /create or replace function public\.queue_friday_nudges\(\s*force boolean default false,\s*only_user_id uuid default null\s*\)/i);
assert.match(sql, /only_user_id is null or p\.id = only_user_id/i, 'testing can target a single user');
assert.match(sql, /extract\(isodow from local_now\) <> 5/i, 'only on Fridays');
assert.match(sql, /local_now::time < time '17:30'/i);
assert.match(sql, /local_now::time >= time '19:00'/i);
assert.match(sql, /p\.engagement_pushes_enabled/i, 'respects the opt-out');
assert.match(sql, /from public\.push_subscriptions/i, 'web push users');
assert.match(sql, /from public\.native_push_tokens/i, 'android push users');
assert.match(sql, /now\(\) - interval '8 weeks'/i, 'only recently active users');
assert.match(sql, /s\.status in \('published', 'active'\)/i, 'skip anyone who already logged or is out right now');
assert.match(sql, /on conflict \(user_id, kind, week_start\) do nothing\s+returning user_id into claimed_user/i, 'claims the log row before notifying');
assert.match(sql, /public\.get_weekly_streaks\(array\[p\.id\]\)/i, 'uses the weekly streak');
assert.match(sql, /'friday_nudge',\s*null,/i);
assert.match(sql, /revoke execute on function public\.queue_friday_nudges\(boolean, uuid\) from public, anon, authenticated/i, 'only cron can run it');
assert.match(sql, /cron\.schedule\(\s*'beerva-friday-nudge',\s*'\*\/15 15-18 \* \* 5'/i, 'Friday evenings in UTC cover both CET and CEST');

// Shared copy.
const copy = loadTypeScriptModule('supabase/functions/_shared/engagementCopy.ts');
assert.equal(copy.formatMateNames([], 0), '');
assert.equal(copy.formatMateNames(['Mads'], 1), 'Mads');
assert.equal(copy.formatMateNames(['Mads', 'Sofie'], 2), 'Mads and Sofie');
assert.equal(copy.formatMateNames(['Mads', 'Sofie'], 5), 'Mads, Sofie and 3 others');
assert.equal(copy.formatMateNames(['Mads'], 2), 'Mads and 1 other');

assert.deepEqual(copy.buildFridayNudgeCopy({ weekly_streak: 5, mate_names: ['Mads'], mates_out: 1 }), {
  title: 'Keep the streak alive 🔥',
  body: "You're on a 5-week streak. One night out this weekend keeps it going.",
}, 'a streak at risk wins over mates');
assert.deepEqual(copy.buildFridayNudgeCopy({ weekly_streak: 1, mate_names: ['Mads', 'Sofie'], mates_out: 4 }), {
  title: "Weekend's here 🍻",
  body: 'Mads, Sofie and 2 others were out last weekend. Plans tonight?',
});
assert.deepEqual(copy.buildFridayNudgeCopy({ mate_names: ['Mads'], mates_out: '1' }), {
  title: "Weekend's here 🍻",
  body: 'Mads was out last weekend. Plans tonight?',
});
assert.deepEqual(copy.buildFridayNudgeCopy(null), {
  title: "Weekend's here 🍻",
  body: 'Heading out tonight? Log your first round on Beerva.',
});
assert.deepEqual(copy.buildFridayNudgeCopy({ mate_names: [' ', 42, null] }), {
  title: "Weekend's here 🍻",
  body: 'Heading out tonight? Log your first round on Beerva.',
}, 'junk names are ignored');

// Edge function.
const sendPush = read('supabase/functions/send-push/index.ts');
assert.match(sendPush, /import \{ buildFridayNudgeCopy \} from '\.\.\/_shared\/engagementCopy\.ts';/);
assert.match(sendPush, /\| 'friday_nudge'/);
assert.match(sendPush, /record\.type === 'friday_nudge'[\s\S]*buildFridayNudgeCopy\(record\.metadata\)/);
assert.match(sendPush, /url = `\/\?tab=record&notificationId=\$\{encodeURIComponent\(record\.id\)\}`/, 'the push opens the Record screen');

// App.
assert.match(read('src/lib/notificationMessages.ts'), /mate_names\?: string\[\] \| null;/);
const notificationsScreen = read('src/screens/NotificationsScreen.tsx');
assert.match(notificationsScreen, /\| 'friday_nudge'/);
assert.match(notificationsScreen, /buildFridayNudgeCopy\(item\.metadata\)/);
assert.match(notificationsScreen, /Log a night/);
assert.match(notificationsScreen, /navigation\.navigate\('MainTabs', \{ screen: 'Record' \}\)/);

const profileScreen = read('src/screens/ProfileScreen.tsx');
assert.match(profileScreen, /engagement_pushes_enabled: next/);
assert.match(profileScreen, /Weekend reminders & weekly recap/);

console.log('friday nudge checks passed');
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm run test:friday-nudge`
Expected: FAIL with `friday nudge migration should exist`.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/fridayNudge.test.js
git commit -m "test: add failing friday nudge checks"
```

---

### Task 2: Add The Migration

**Files:**
- Create: `supabase/migrations/20261127130000_add_friday_nudge.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20261127130000_add_friday_nudge.sql` with this complete content:

```sql
-- Friday evening nudge for people who have not logged a night out this week,
-- plus the shared pieces the Sunday weekly recap reuses: a per-user opt-out,
-- a send log that makes each engagement push idempotent per week, and both
-- engagement notification types.

alter table public.profiles
  add column if not exists engagement_pushes_enabled boolean not null default true;

comment on column public.profiles.engagement_pushes_enabled is
  'Opt-out for scheduled engagement pushes (Friday nudge, Sunday recap). Social pushes are unaffected.';

create table if not exists public.engagement_push_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('friday_nudge', 'weekly_recap')),
  week_start date not null,
  notification_id uuid references public.notifications(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  primary key (user_id, kind, week_start)
);

-- No policies: only the security definer queue functions read or write it.
alter table public.engagement_push_log enable row level security;

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
      'beverage_submission',
      'friday_nudge',
      'weekly_recap'
    ));
end;
$$;

create or replace function public.queue_friday_nudges(
  force boolean default false,
  only_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp := timezone('Europe/Copenhagen', now());
  this_week date := public.beerva_drinking_week(now());
  this_week_start timestamp with time zone := (this_week::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  last_weekend_start timestamp with time zone := ((this_week - 3)::timestamp + interval '6 hours') at time zone 'Europe/Copenhagen';
  queued integer := 0;
  candidate record;
  claimed_user uuid;
  new_notification_id uuid;
begin
  if not coalesce(force, false) and (
    extract(isodow from local_now) <> 5
    or local_now::time < time '17:30'
    or local_now::time >= time '19:00'
  ) then
    return 0;
  end if;

  for candidate in
    select
      p.id as user_id,
      coalesce(streak.weekly_streak, 0) as weekly_streak,
      coalesce(mates.names, array[]::text[]) as mate_names,
      coalesce(mates.total, 0) as mates_out
    from public.profiles p
    left join lateral public.get_weekly_streaks(array[p.id]) as streak on true
    left join lateral (
      select
        (array_agg(mate.username order by mate.nights desc, mate.username))[1:2] as names,
        count(*)::integer as total
      from (
        select
          pr.username,
          count(distinct public.beerva_drinking_day(coalesce(s.started_at, s.created_at))) as nights
        from public.follows f
        join public.sessions s
          on s.user_id = f.following_id
         and s.status = 'published'
         and coalesce(s.started_at, s.created_at) >= last_weekend_start
         and coalesce(s.started_at, s.created_at) < this_week_start
        join public.profiles pr on pr.id = f.following_id
        where f.follower_id = p.id
          and nullif(btrim(coalesce(pr.username, '')), '') is not null
        group by pr.username
      ) as mate
    ) as mates on true
    where p.engagement_pushes_enabled
      and (only_user_id is null or p.id = only_user_id)
      and (
        exists (select 1 from public.push_subscriptions ps where ps.user_id = p.id)
        or exists (select 1 from public.native_push_tokens nt where nt.user_id = p.id)
      )
      and exists (
        select 1
        from public.sessions s
        where s.user_id = p.id
          and s.status = 'published'
          and coalesce(s.started_at, s.created_at) >= now() - interval '8 weeks'
      )
      and not exists (
        select 1
        from public.sessions s
        where s.user_id = p.id
          and s.status in ('published', 'active')
          and coalesce(s.started_at, s.created_at) >= this_week_start
      )
      and not exists (
        select 1
        from public.engagement_push_log l
        where l.user_id = p.id
          and l.kind = 'friday_nudge'
          and l.week_start = this_week
      )
  loop
    claimed_user := null;

    insert into public.engagement_push_log (user_id, kind, week_start)
    values (candidate.user_id, 'friday_nudge', this_week)
    on conflict (user_id, kind, week_start) do nothing
    returning user_id into claimed_user;

    -- Another run claimed this user first.
    if claimed_user is null then
      continue;
    end if;

    -- Stored as read: a nudge is a push, not something to clear from the bell.
    insert into public.notifications (user_id, actor_id, type, reference_id, metadata, read)
    values (
      candidate.user_id,
      candidate.user_id,
      'friday_nudge',
      null,
      jsonb_build_object(
        'week_start', this_week,
        'weekly_streak', candidate.weekly_streak,
        'mate_names', to_jsonb(candidate.mate_names),
        'mates_out', candidate.mates_out
      ),
      true
    )
    returning id into new_notification_id;

    update public.engagement_push_log
    set notification_id = new_notification_id
    where engagement_push_log.user_id = candidate.user_id
      and engagement_push_log.kind = 'friday_nudge'
      and engagement_push_log.week_start = this_week;

    queued := queued + 1;
  end loop;

  return queued;
end;
$$;

revoke execute on function public.queue_friday_nudges(boolean, uuid) from public, anon, authenticated;

comment on function public.queue_friday_nudges(boolean, uuid) is
  'Queues one friday_nudge notification per eligible user per week between 17:30 and 19:00 Copenhagen time. For testing: force skips the time check, only_user_id limits it to one user.';

-- Every 15 minutes, 15:00-18:59 UTC on Fridays. That covers 17:30-19:00
-- Copenhagen in both winter (UTC+1) and summer (UTC+2). The function decides
-- whether it is time, and the log makes repeat runs harmless.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-friday-nudge') then
    perform cron.unschedule('beerva-friday-nudge');
  end if;

  perform cron.schedule(
    'beerva-friday-nudge',
    '*/15 15-18 * * 5',
    $job$select public.queue_friday_nudges();$job$
  );
end;
$$;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Run the test**

Run: `npm run test:friday-nudge`
Expected: FAIL at the shared copy module (`Cannot find module ... engagementCopy.ts`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261127130000_add_friday_nudge.sql
git commit -m "feat: queue friday nudges from pg_cron"
```

---

### Task 3: Add The Shared Copy Module

**Files:**
- Create: `supabase/functions/_shared/engagementCopy.ts`

- [ ] **Step 1: Write the module**

Create `supabase/functions/_shared/engagementCopy.ts` with this complete content:

```typescript
// Push and in-app copy for scheduled engagement notifications.
//
// Imported by the send-push Edge Function (Deno) and by the app, so push text
// and the notifications list never drift apart. Keep it free of imports so
// both runtimes can load it.

export type EngagementMetadata = {
  week_start?: string | null;
  weekly_streak?: number | string | null;
  mate_names?: unknown;
  mates_out?: number | string | null;
  nights_out?: number | string | null;
  seen_by?: number | string | null;
};

export type EngagementCopy = {
  title: string;
  body: string;
};

const toCount = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const toNames = (value: unknown) => (
  Array.isArray(value)
    ? value
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      .map((name) => name.trim())
    : []
);

export const formatMateNames = (names: string[], total: number) => {
  if (names.length === 0) return '';
  const others = Math.max(0, total - names.length);
  if (others > 0) {
    return `${names.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`;
  }
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

export const buildFridayNudgeCopy = (metadata?: EngagementMetadata | null): EngagementCopy => {
  const weeklyStreak = toCount(metadata?.weekly_streak);
  const names = toNames(metadata?.mate_names);
  const matesOut = Math.max(toCount(metadata?.mates_out), names.length);

  if (weeklyStreak >= 2) {
    return {
      title: 'Keep the streak alive 🔥',
      body: `You're on a ${weeklyStreak}-week streak. One night out this weekend keeps it going.`,
    };
  }

  if (names.length > 0) {
    return {
      title: "Weekend's here 🍻",
      body: `${formatMateNames(names, matesOut)} ${matesOut === 1 ? 'was' : 'were'} out last weekend. Plans tonight?`,
    };
  }

  return {
    title: "Weekend's here 🍻",
    body: 'Heading out tonight? Log your first round on Beerva.',
  };
};
```

- [ ] **Step 2: Run the test**

Run: `npm run test:friday-nudge`
Expected: FAIL at `import { buildFridayNudgeCopy } from '../_shared/engagementCopy.ts';` (Task 4).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/engagementCopy.ts
git commit -m "feat: add shared engagement push copy"
```

---

### Task 4: Teach send-push About Nudges

**Files:**
- Modify: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Import the copy**

In `supabase/functions/send-push/index.ts`, after the line `import { createClient } from 'jsr:@supabase/supabase-js@2';` add:

```typescript
import { buildFridayNudgeCopy } from '../_shared/engagementCopy.ts';
```

- [ ] **Step 2: Type and metadata**

In `supabase/functions/send-push/index.ts`, replace:

```typescript
  type: 'cheer' | 'invite' | 'session_started' | 'comment' | 'mention' | 'invite_response' | 'pub_crawl_started' | 'hangover_check' | 'follow' | 'chug_verification' | 'drinking_buddy_added' | 'official_post' | 'beverage_submission';
```

with:

```typescript
  type: 'cheer' | 'invite' | 'session_started' | 'comment' | 'mention' | 'invite_response' | 'pub_crawl_started' | 'hangover_check' | 'follow' | 'chug_verification' | 'drinking_buddy_added' | 'official_post' | 'beverage_submission'
    | 'friday_nudge';
```

In `supabase/functions/send-push/index.ts`, replace:

```typescript
    mention_id?: string | null;
    source_id?: string | null;
  } | null;
};
```

with:

```typescript
    mention_id?: string | null;
    source_id?: string | null;
    week_start?: string | null;
    weekly_streak?: number | string | null;
    mate_names?: string[] | null;
    mates_out?: number | string | null;
  } | null;
};
```

- [ ] **Step 3: Copy**

In `supabase/functions/send-push/index.ts`, replace:

```typescript
  } else if (record.type === 'hangover_check') {
    title = 'Morning-after damage report';
    bodyText = 'Did last night win? Tap to rate the hangover before your liver files a bug report.';
  }
```

with:

```typescript
  } else if (record.type === 'hangover_check') {
    title = 'Morning-after damage report';
    bodyText = 'Did last night win? Tap to rate the hangover before your liver files a bug report.';
  } else if (record.type === 'friday_nudge') {
    const nudgeCopy = buildFridayNudgeCopy(record.metadata);
    title = nudgeCopy.title;
    bodyText = nudgeCopy.body;
  }
```

- [ ] **Step 4: Link to the Record screen**

In `supabase/functions/send-push/index.ts`, replace:

```typescript
  } else if (record.type === 'beverage_submission') {
    url = `/?notifications=1&beverage_submission=1&notificationId=${encodeURIComponent(record.id)}`;
```

with:

```typescript
  } else if (record.type === 'beverage_submission') {
    url = `/?notifications=1&beverage_submission=1&notificationId=${encodeURIComponent(record.id)}`;
  } else if (record.type === 'friday_nudge') {
    url = `/?tab=record&notificationId=${encodeURIComponent(record.id)}`;
```

`?tab=record` already opens the Record screen on web (`shouldOpenRecordFromUrl`) and Android (`kind: 'record'` in `nativeNotificationRouting.ts`).

- [ ] **Step 5: Run the test and check the function compiles**

Run: `npm run test:friday-nudge`
Expected: FAIL at `mate_names?: string[] | null;` in `notificationMessages.ts` (Task 5).

If the Deno CLI is installed, run: `deno check supabase/functions/send-push/index.ts`
Expected: no errors. Without Deno, `npx supabase functions deploy send-push` in Task 7 type-checks it on deploy.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-push/index.ts
git commit -m "feat: send friday nudge pushes"
```

---

### Task 5: Show Nudges In The Notifications List

**Files:**
- Modify: `src/lib/notificationMessages.ts`
- Modify: `src/screens/NotificationsScreen.tsx`

- [ ] **Step 1: Metadata fields**

In `src/lib/notificationMessages.ts`, replace:

```typescript
  mention_id?: string | null;
  source_id?: string | null;
};
```

with:

```typescript
  mention_id?: string | null;
  source_id?: string | null;
  week_start?: string | null;
  weekly_streak?: number | string | null;
  mate_names?: string[] | null;
  mates_out?: number | string | null;
  nights_out?: number | string | null;
  seen_by?: number | string | null;
};
```

- [ ] **Step 2: Type and import**

In `src/screens/NotificationsScreen.tsx`, after the line `import { useNotifications } from '../lib/notificationsContext';` add:

```typescript
import { buildFridayNudgeCopy } from '../../supabase/functions/_shared/engagementCopy';
```

In `src/screens/NotificationsScreen.tsx`, replace:

```typescript
  | 'official_post'
  | 'beverage_submission';
```

with:

```typescript
  | 'official_post'
  | 'beverage_submission'
  | 'friday_nudge';
```

- [ ] **Step 3: Navigation helper**

In `src/screens/NotificationsScreen.tsx`, replace:

```typescript
  const openOfficialChallenge = useCallback((item: NotificationRow) => {
```

with:

```typescript
  const openRecord = useCallback(() => {
    navigation.navigate('MainTabs', { screen: 'Record' });
  }, [navigation]);

  const openOfficialChallenge = useCallback((item: NotificationRow) => {
```

- [ ] **Step 4: The card**

In `src/screens/NotificationsScreen.tsx`, replace:

```tsx
    const canRespond = item.type === 'invite'
```

with:

```tsx
    if (item.type === 'friday_nudge') {
      const nudgeCopy = buildFridayNudgeCopy(item.metadata);
      return (
        <View style={[styles.card, !item.read && styles.unreadCard]}>
          <View style={styles.avatarContainer}>
            <View style={styles.officialAvatar}>
              <Image source={beervaLogo} style={styles.officialLogo} />
            </View>
          </View>
          <View style={styles.content}>
            <Text style={styles.username}>{nudgeCopy.title}</Text>
            <Text style={styles.officialNotificationBody}>{nudgeCopy.body}</Text>
            <Text style={styles.time}>{getTimeAgo(item.created_at)}</Text>
            <TouchableOpacity
              style={styles.hangoverActionButton}
              onPress={openRecord}
              activeOpacity={0.76}
              accessibilityRole="button"
              accessibilityLabel="Log a night out"
            >
              <Beer color={colors.background} size={16} />
              <Text style={styles.hangoverActionText}>Log a night</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const canRespond = item.type === 'invite'
```

In `src/screens/NotificationsScreen.tsx`, replace:

```typescript
  }, [currentUserId, declineBuddy, decliningBuddyIds, openAdminSubmissions, openChugVerification, openHangoverRating, openOfficialChallenge, openPost, openProfile, respondToInvite, respondingInviteIds]);
```

with:

```typescript
  }, [currentUserId, declineBuddy, decliningBuddyIds, openAdminSubmissions, openChugVerification, openHangoverRating, openOfficialChallenge, openPost, openProfile, openRecord, respondToInvite, respondingInviteIds]);
```

- [ ] **Step 5: Run the test and type-check**

Run: `npm run test:friday-nudge`
Expected: FAIL at `engagement_pushes_enabled: next` (Task 6).

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notificationMessages.ts src/screens/NotificationsScreen.tsx
git commit -m "feat: show friday nudges in notifications"
```

---

### Task 6: Add The Opt-Out Toggle

**Files:**
- Modify: `src/screens/ProfileScreen.tsx`

The profile is loaded with `select('*')`, so `engagement_pushes_enabled` arrives with the rest of the row. Users can already update their own profile row under RLS.

- [ ] **Step 1: State and handler**

In `src/screens/ProfileScreen.tsx`, replace:

```typescript
  const [pushBusy, setPushBusy] = useState(false);
```

with:

```typescript
  const [pushBusy, setPushBusy] = useState(false);
  const [engagementBusy, setEngagementBusy] = useState(false);
```

In `src/screens/ProfileScreen.tsx`, replace:

```tsx
  const joinDate = profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently';
```

with:

```tsx
  const joinDate = profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently';
  const engagementPushesEnabled = profile?.engagement_pushes_enabled !== false;

  const toggleEngagementPushes = async () => {
    if (!profile?.id || engagementBusy) return;
    const next = !engagementPushesEnabled;
    setEngagementBusy(true);
    setProfile((current: any) => (current ? { ...current, engagement_pushes_enabled: next } : current));
    const { error } = await supabase
      .from('profiles')
      .update({ engagement_pushes_enabled: next })
      .eq('id', profile.id);
    if (error) {
      console.error('Engagement push preference error:', error);
      setProfile((current: any) => (current ? { ...current, engagement_pushes_enabled: !next } : current));
      showAlert('Could not save', 'Try again in a moment.');
    }
    setEngagementBusy(false);
  };
```

This handler is a plain function on purpose: it sits after the component's loading `return`, where hooks such as `useCallback` are not allowed.

- [ ] **Step 2: The toggle**

In `src/screens/ProfileScreen.tsx`, replace:

```tsx
      {profile?.is_admin === true ? (
```

with:

```tsx
      <TouchableOpacity
        style={[styles.pushButton, engagementPushesEnabled ? styles.pushButtonOn : styles.pushButtonOff]}
        onPress={toggleEngagementPushes}
        disabled={engagementBusy}
        activeOpacity={0.75}
        accessibilityRole="switch"
        accessibilityState={{ checked: engagementPushesEnabled, disabled: engagementBusy }}
        accessibilityLabel="Weekend reminders & weekly recap"
      >
        {engagementPushesEnabled ? (
          <Bell color={colors.primary} size={20} />
        ) : (
          <BellOff color={colors.textMuted} size={20} />
        )}
        <Text style={[styles.pushButtonText, engagementPushesEnabled ? styles.pushButtonTextOn : null]}>
          {engagementPushesEnabled
            ? 'Weekend reminders & weekly recap on'
            : 'Weekend reminders & weekly recap off'}
        </Text>
      </TouchableOpacity>

      {profile?.is_admin === true ? (
```

- [ ] **Step 3: Run the tests and type-check**

Run: `npm run test:friday-nudge && npm run test:weekly-streaks && npm run test:profile-panel && npm run test:app-theme-screens`
Expected: all print their "passed" line.

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ProfileScreen.tsx
git commit -m "feat: let people turn off weekend reminders"
```

---

### Task 7: Deploy And Verify

- [ ] **Step 1: Run every test script**

Run: `for t in $(node -e "console.log(Object.keys(require('./package.json').scripts).filter(k=>k.startsWith('test:')).join(' '))"); do npm run -s $t >/dev/null 2>&1 || echo "FAIL $t"; done`
Expected: no `FAIL` lines (`test:serve-dist` needs a prior `npm run build:web`).

- [ ] **Step 2: Apply the migration and deploy the function**

Run: `npx supabase db push`
Run: `npx supabase functions deploy send-push`

- [ ] **Step 3: Dry run in the Supabase SQL editor**

This shows who would get a nudge, without sending anything:

```sql
begin;
select public.queue_friday_nudges(true) as queued;
select n.user_id, p.username, n.metadata
from public.notifications n
join public.profiles p on p.id = n.user_id
where n.type = 'friday_nudge' and n.created_at > now() - interval '1 minute';
rollback;
```

Expected: one row per eligible person. Rolling back discards the rows, and `pg_net` only sends its queued HTTP calls after a commit, so no pushes go out.

- [ ] **Step 4: Send one to yourself**

```sql
select public.queue_friday_nudges(true, '<your user id>');
```

Expected: `1`, and the push arrives within a few seconds. Opening it lands on the Record screen. If it returns `0`, you're either opted out, have no push subscription, have no post in the last 8 weeks, or already logged a night this week.

Then clear your log row so the real Friday run still includes you:

```sql
delete from public.engagement_push_log
where user_id = '<your user id>'
  and kind = 'friday_nudge'
  and week_start = public.beerva_drinking_week(now());
```

- [ ] **Step 5: Confirm the schedule**

```sql
select jobname, schedule, active from cron.job where jobname = 'beerva-friday-nudge';
```

Expected: `*/15 15-18 * * 5`, active. After the first real Friday:
`select count(*) from public.engagement_push_log where kind = 'friday_nudge';`

---

## Notes

- **Guardrail:** each person gets at most one Friday nudge a week. The recap plan adds one Sunday push, so automated pushes stay at 2 a week or fewer.
- **Mates:** "mates" means people you follow. The copy never names more than 2, and the rest become "and N others".
- **iPhone Safari users without home-screen install have no push subscription**, so they are skipped automatically.
