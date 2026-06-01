# Drinking Buddies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users tag mutual mates as drinking buddies on session posts, notify those buddies, and let them opt out with "Not with me".

**Architecture:** Add `session_buddies` as the database source of truth, with security-definer RPCs for owner reconciliation, feed/detail summaries, and buddy decline. Add a small `src/lib/sessionBuddies.ts` API and a reusable `DrinkingBuddiesPicker` used by both recording and edit flows. Feed/detail screens hydrate active buddy summaries through the RPC, while notification and push flows route `drinking_buddy_added` according to whether the session is active or published.

**Tech Stack:** Expo React Native, Supabase Postgres/RLS/RPC, Supabase Edge Function push delivery, Node source-check tests.

---

## File Structure

- Create `supabase/migrations/20260601150000_add_session_buddies.sql`: database table, indexes, RLS, RPCs, notification type update, and notification metadata trigger update.
- Create `src/lib/sessionBuddies.ts`: shared types, row mapping, buddy-name formatting, mutual mate loading, buddy summary loading, save RPC wrapper, and decline RPC wrapper.
- Create `src/components/DrinkingBuddiesPicker.tsx`: reusable UI for selected buddy chips, mutual mate search, and autosave.
- Modify `src/screens/RecordScreen.tsx`: mount the picker for active sessions near Post Details.
- Modify `src/screens/EditSessionScreen.tsx`: mount the picker for published-session editing.
- Modify `src/screens/FeedScreen.tsx`: add buddy data to `FeedSession`, fetch summaries, render the More stats line.
- Modify `src/screens/PostDetailScreen.tsx`: fetch buddy summaries for detail posts.
- Modify `src/lib/notificationMessages.ts`: add `drinking_buddy_added` copy.
- Modify `src/lib/postTargets.ts`: let notification post targets use `metadata.session_id` when present.
- Modify `src/screens/NotificationsScreen.tsx`: fetch buddy rows for buddy notifications, show "Not with me", call decline RPC, and open published session posts.
- Modify `supabase/functions/send-push/index.ts`: add push copy and URL routing for `drinking_buddy_added`.
- Modify `package.json`: add `test:drinking-buddies`.
- Create `scripts/drinkingBuddies.test.js`: focused source checks for database, client helpers, picker wiring, and feed/detail rendering.
- Modify `scripts/notifications.test.js`: message helper and post-target behavior for buddy notifications.
- Modify `scripts/pushDelivery.test.js`: push delivery source checks for buddy notifications.

---

### Task 1: Database Contract And Migration

**Files:**
- Create: `scripts/drinkingBuddies.test.js`
- Modify: `package.json`
- Create: `supabase/migrations/20260601150000_add_session_buddies.sql`

- [ ] **Step 1: Write the failing migration test**

Create `scripts/drinkingBuddies.test.js` with this initial content:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260601150000_add_session_buddies.sql');
const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';

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

assert.match(migrationSql, /create table if not exists public\.session_buddies/, 'migration should create session_buddies');
assert.match(migrationSql, /status in \('active', 'removed', 'declined'\)/, 'session buddies should constrain status values');
assert.match(migrationSql, /unique\s*\(session_id,\s*buddy_user_id\)/i, 'one buddy row should exist per user per session');
assert.match(migrationSql, /buddy_user_id <> added_by_user_id/, 'session owners should not tag themselves');
assert.match(migrationSql, /session_buddies_session_status_idx/, 'migration should index session/status lookups');
assert.match(migrationSql, /session_buddies_buddy_status_created_at_idx/, 'migration should index buddy notification lookups');
assert.match(migrationSql, /session_buddies_added_by_created_at_idx/, 'migration should index owner edit lookups');
assert.match(migrationSql, /alter table public\.session_buddies enable row level security/, 'session buddies should enable RLS');
assert.match(migrationSql, /create or replace function public\.set_session_buddies/, 'owner reconciliation RPC should exist');
assert.match(migrationSql, /create or replace function public\.decline_session_buddy/, 'buddy decline RPC should exist');
assert.match(migrationSql, /create or replace function public\.get_session_buddy_summaries/, 'feed summary RPC should exist');
assert.match(migrationSql, /public\.is_mutual_follower\(requesting_user_id,\s*requested_buddy_id\)/, 'adding buddies should require mutual mates');
assert.match(migrationSql, /status = 'declined'[\s\S]*cannot be re-added/i, 'declined buddies should not be reactivated');
assert.match(migrationSql, /'drinking_buddy_added'/, 'notification type should include drinking_buddy_added');
assert.match(migrationSql, /jsonb_build_object\([\s\S]*'target_type', 'session'[\s\S]*'session_id'/, 'buddy notifications should snapshot session metadata');
assert.match(migrationSql, /grant execute on function public\.set_session_buddies\(uuid, uuid\[\]\) to authenticated/, 'authenticated users should execute set_session_buddies');
assert.match(migrationSql, /grant execute on function public\.decline_session_buddy\(uuid\) to authenticated/, 'authenticated users should execute decline_session_buddy');
assert.match(migrationSql, /grant execute on function public\.get_session_buddy_summaries\(uuid\[\]\) to authenticated/, 'authenticated users should execute get_session_buddy_summaries');

console.log('drinking buddies checks passed');
```

- [ ] **Step 2: Add the package script and run the test to verify it fails**

Add this line to `package.json` inside `scripts`:

```json
"test:drinking-buddies": "node scripts/drinkingBuddies.test.js"
```

Run:

```bash
npm run test:drinking-buddies
```

Expected: FAIL with `migration should create session_buddies`.

- [ ] **Step 3: Implement the migration**

Create `supabase/migrations/20260601150000_add_session_buddies.sql` with these SQL blocks:

```sql
create table if not exists public.session_buddies (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  buddy_user_id uuid not null references auth.users(id) on delete cascade,
  added_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamp with time zone not null default now(),
  responded_at timestamp with time zone,
  constraint session_buddies_status_check check (status in ('active', 'removed', 'declined')),
  constraint session_buddies_no_self_tag check (buddy_user_id <> added_by_user_id),
  constraint session_buddies_unique_session_buddy unique (session_id, buddy_user_id)
);

alter table public.session_buddies enable row level security;

create index if not exists session_buddies_session_status_idx
  on public.session_buddies(session_id, status);

create index if not exists session_buddies_buddy_status_created_at_idx
  on public.session_buddies(buddy_user_id, status, created_at desc);

create index if not exists session_buddies_added_by_created_at_idx
  on public.session_buddies(added_by_user_id, created_at desc);

drop policy if exists "Session buddies are visible to post viewers and participants" on public.session_buddies;
create policy "Session buddies are visible to post viewers and participants"
  on public.session_buddies
  for select
  to authenticated
  using (
    added_by_user_id = (select auth.uid())
    or buddy_user_id = (select auth.uid())
    or (
      status = 'active'
      and exists (
        select 1
        from public.sessions
        where sessions.id = session_buddies.session_id
          and sessions.status = 'published'
      )
    )
  );
```

Then add notification type and metadata support:

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
      'drinking_buddy_added'
    ));
end $$;
```

Update `public.set_notification_metadata()` by replacing the existing function with a version that preserves current behavior and adds:

```sql
  elsif new.type = 'drinking_buddy_added' and new.reference_id is not null then
    select
      nullif(btrim(sessions.pub_name), ''),
      sessions.id::text
    into resolved_pub_name, resolved_session_id
    from public.session_buddies
    join public.sessions
      on sessions.id = session_buddies.session_id
    where session_buddies.id = new.reference_id
      and session_buddies.buddy_user_id = new.user_id
      and session_buddies.added_by_user_id = new.actor_id;
  end if;
```

Make sure the function has declarations:

```sql
  resolved_pub_name text;
  resolved_target_type text;
  resolved_session_id text;
```

and before `return new;`:

```sql
  if resolved_session_id is not null then
    new.metadata := new.metadata || jsonb_build_object('session_id', resolved_session_id, 'target_type', 'session');
  end if;
```

Add the RPCs:

```sql
create or replace function public.set_session_buddies(target_session_id uuid, buddy_user_ids uuid[])
returns setof public.session_buddies
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  target_session public.sessions;
  requested_buddy_id uuid;
  cleaned_buddy_ids uuid[];
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into target_session
  from public.sessions
  where id = target_session_id
    and user_id = requesting_user_id
    and pub_crawl_id is null
    and status in ('active', 'published');

  if target_session.id is null then
    raise exception 'Session not found.';
  end if;

  if requesting_user_id = any(coalesce(buddy_user_ids, array[]::uuid[])) then
    raise exception 'You cannot add yourself as a drinking buddy.';
  end if;

  select coalesce(array_agg(distinct requested.buddy_id), array[]::uuid[])
  into cleaned_buddy_ids
  from unnest(coalesce(buddy_user_ids, array[]::uuid[])) as requested(buddy_id)
  where requested.buddy_id is not null;

  foreach requested_buddy_id in array cleaned_buddy_ids loop
    if not public.is_mutual_follower(requesting_user_id, requested_buddy_id) then
      raise exception 'Drinking buddies must be mutual mates.';
    end if;
  end loop;

  if exists (
    select 1
    from public.session_buddies
    where session_id = target_session_id
      and buddy_user_id = any(cleaned_buddy_ids)
      and status = 'declined'
  ) then
    raise exception 'A buddy who used Not with me cannot be re-added to this session.';
  end if;

  update public.session_buddies
  set status = 'removed',
      responded_at = null
  where session_id = target_session_id
    and added_by_user_id = requesting_user_id
    and status = 'active'
    and not (buddy_user_id = any(cleaned_buddy_ids));

  with requested as (
    select unnest(cleaned_buddy_ids) as buddy_user_id
  ),
  changed as (
    insert into public.session_buddies (session_id, buddy_user_id, added_by_user_id, status, responded_at)
    select target_session_id, requested.buddy_user_id, requesting_user_id, 'active', null
    from requested
    on conflict (session_id, buddy_user_id)
    do update
      set status = 'active',
          responded_at = null
      where public.session_buddies.status = 'removed'
    returning public.session_buddies.*
  )
  insert into public.notifications (user_id, actor_id, type, reference_id, metadata)
  select
    changed.buddy_user_id,
    requesting_user_id,
    'drinking_buddy_added',
    changed.id,
    jsonb_build_object(
      'target_type', 'session',
      'session_id', target_session_id,
      'pub_name', target_session.pub_name,
      'session_status', target_session.status
    )
  from changed
  where changed.status = 'active';

  return query
  select *
  from public.session_buddies
  where session_id = target_session_id
    and added_by_user_id = requesting_user_id
    and status = 'active'
  order by created_at asc;
end;
$$;

create or replace function public.decline_session_buddy(target_session_buddy_id uuid)
returns public.session_buddies
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  buddy_row public.session_buddies;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.session_buddies
  set status = 'declined',
      responded_at = now()
  where id = target_session_buddy_id
    and buddy_user_id = requesting_user_id
    and status = 'active'
  returning * into buddy_row;

  if buddy_row.id is null then
    raise exception 'This drinking buddy tag is no longer active.';
  end if;

  return buddy_row;
end;
$$;

create or replace function public.get_session_buddy_summaries(session_ids uuid[])
returns table (
  id uuid,
  session_id uuid,
  buddy_user_id uuid,
  username text,
  avatar_url text,
  created_at timestamp with time zone
)
language sql
stable
security definer
set search_path = public
as $$
  select
    buddies.id,
    buddies.session_id,
    buddies.buddy_user_id,
    profiles.username,
    profiles.avatar_url,
    buddies.created_at
  from public.session_buddies buddies
  join public.sessions
    on sessions.id = buddies.session_id
  left join public.profiles
    on profiles.id = buddies.buddy_user_id
  where buddies.session_id = any(session_ids)
    and buddies.status = 'active'
    and (
      sessions.status = 'published'
      or sessions.user_id = (select auth.uid())
      or buddies.buddy_user_id = (select auth.uid())
    )
  order by buddies.created_at asc;
$$;

revoke execute on function public.set_session_buddies(uuid, uuid[]) from public, anon;
revoke execute on function public.decline_session_buddy(uuid) from public, anon;
revoke execute on function public.get_session_buddy_summaries(uuid[]) from public, anon;
grant execute on function public.set_session_buddies(uuid, uuid[]) to authenticated;
grant execute on function public.decline_session_buddy(uuid) to authenticated;
grant execute on function public.get_session_buddy_summaries(uuid[]) to authenticated;

comment on table public.session_buddies is 'Mutual mates tagged as drinking buddies on session posts.';
comment on function public.set_session_buddies(uuid, uuid[]) is 'Reconciles drinking buddies for sessions owned by the current user and notifies newly active buddies.';
comment on function public.decline_session_buddy(uuid) is 'Lets a tagged buddy remove themselves from a session.';
comment on function public.get_session_buddy_summaries(uuid[]) is 'Returns active drinking buddy profile summaries for session feed and detail posts.';

notify pgrst, 'reload schema';
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test:drinking-buddies
```

Expected: PASS with `drinking buddies checks passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/drinkingBuddies.test.js supabase/migrations/20260601150000_add_session_buddies.sql
git commit -m "Add drinking buddies database contract"
```

---

### Task 2: Shared Session Buddy Client API

**Files:**
- Modify: `scripts/drinkingBuddies.test.js`
- Create: `src/lib/sessionBuddies.ts`

- [ ] **Step 1: Extend the failing test for helper behavior**

Append these assertions to `scripts/drinkingBuddies.test.js` before the final `console.log`:

```js
const sessionBuddies = loadTypeScriptModule('src/lib/sessionBuddies.ts');

assert.equal(
  sessionBuddies.formatDrinkingBuddyNames([
    { username: 'Beist' },
    { username: 'Tubpac' },
  ]),
  'Beist and Tubpac',
  'two buddy names should use and'
);

assert.equal(
  sessionBuddies.formatDrinkingBuddyNames([
    { username: 'Beist' },
    { username: 'Tubpac' },
    { username: 'Someone Else' },
    { username: 'Fourth' },
  ]),
  'Beist, Tubpac +2',
  'long buddy lists should show two names and a remaining count'
);

assert.equal(
  sessionBuddies.formatDrinkingBuddyNames([]),
  null,
  'empty buddy lists should not render a stats line'
);

assert.deepEqual(
  sessionBuddies.mapSessionBuddyRow({
    id: 'buddy-row-1',
    session_id: 'session-1',
    buddy_user_id: 'user-2',
    username: 'Beist',
    avatar_url: 'avatar.png',
    created_at: '2026-06-01T12:00:00Z',
  }),
  {
    id: 'buddy-row-1',
    sessionId: 'session-1',
    buddyUserId: 'user-2',
    username: 'Beist',
    avatarUrl: 'avatar.png',
    createdAt: '2026-06-01T12:00:00Z',
  },
  'buddy RPC rows should map to app shape'
);

const buddyLibSource = fs.readFileSync(path.join(root, 'src/lib/sessionBuddies.ts'), 'utf8');
assert.match(buddyLibSource, /rpc\('get_session_buddy_summaries'/, 'client API should fetch buddy summaries through RPC');
assert.match(buddyLibSource, /rpc\('set_session_buddies'/, 'client API should save buddy selections through RPC');
assert.match(buddyLibSource, /rpc\('decline_session_buddy'/, 'client API should decline buddy tags through RPC');
assert.match(buddyLibSource, /\.from\('follows'\)/, 'client API should load mutual mates from follows');
```

Move the final `console.log('drinking buddies checks passed');` to the end of the file if needed.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:drinking-buddies
```

Expected: FAIL because `src/lib/sessionBuddies.ts` does not exist.

- [ ] **Step 3: Implement the shared API**

Create `src/lib/sessionBuddies.ts`:

```ts
import { supabase } from './supabase';

export type SessionBuddy = {
  id: string;
  sessionId: string;
  buddyUserId: string;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
};

export type MutualMateOption = {
  id: string;
  username: string | null;
  avatarUrl: string | null;
};

type SessionBuddyRow = {
  id?: string | null;
  session_id?: string | null;
  buddy_user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
};

type FollowOutRow = { following_id: string };
type FollowInRow = { follower_id: string };

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const mapSessionBuddyRow = (row: SessionBuddyRow): SessionBuddy => ({
  id: toCleanString(row.id) || '',
  sessionId: toCleanString(row.session_id) || '',
  buddyUserId: toCleanString(row.buddy_user_id) || '',
  username: toCleanString(row.username),
  avatarUrl: toCleanString(row.avatar_url),
  createdAt: toCleanString(row.created_at),
});

export const formatDrinkingBuddyNames = (
  buddies: Array<Pick<SessionBuddy, 'username'> | { username?: string | null }> = []
) => {
  const names = buddies
    .map((buddy) => toCleanString(buddy.username) || 'Someone')
    .filter(Boolean);

  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
};

export const fetchSessionBuddySummaries = async (sessionIds: string[]) => {
  const cleanSessionIds = Array.from(new Set(sessionIds.map(toCleanString).filter(Boolean))) as string[];
  const bySession = new Map<string, SessionBuddy[]>();
  if (cleanSessionIds.length === 0) return bySession;

  const { data, error } = await supabase.rpc('get_session_buddy_summaries', {
    session_ids: cleanSessionIds,
  });

  if (error) throw error;

  ((data || []) as SessionBuddyRow[]).forEach((row) => {
    const buddy = mapSessionBuddyRow(row);
    if (!buddy.sessionId) return;
    const existing = bySession.get(buddy.sessionId) || [];
    existing.push(buddy);
    bySession.set(buddy.sessionId, existing);
  });

  return bySession;
};

export const fetchSessionBuddies = async (sessionId: string) => {
  const summaries = await fetchSessionBuddySummaries([sessionId]);
  return summaries.get(sessionId) || [];
};

export const fetchMutualMateOptions = async (currentUserId: string): Promise<MutualMateOption[]> => {
  const [followingResult, followersResult] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', currentUserId),
    supabase.from('follows').select('follower_id').eq('following_id', currentUserId),
  ]);

  if (followingResult.error) throw followingResult.error;
  if (followersResult.error) throw followersResult.error;

  const followers = new Set(((followersResult.data || []) as FollowInRow[]).map((row) => row.follower_id));
  const mutualIds = ((followingResult.data || []) as FollowOutRow[])
    .map((row) => row.following_id)
    .filter((id) => followers.has(id));

  if (mutualIds.length === 0) return [];

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', mutualIds)
    .order('username', { ascending: true });

  if (error) throw error;

  return ((profiles || []) as any[]).map((profile) => ({
    id: profile.id,
    username: profile.username || null,
    avatarUrl: profile.avatar_url || null,
  }));
};

export const setSessionBuddies = async (sessionId: string, buddyUserIds: string[]) => {
  const { error } = await supabase.rpc('set_session_buddies', {
    target_session_id: sessionId,
    buddy_user_ids: Array.from(new Set(buddyUserIds)),
  });

  if (error) throw error;
  return fetchSessionBuddies(sessionId);
};

export const declineSessionBuddy = async (sessionBuddyId: string) => {
  const { data, error } = await supabase.rpc('decline_session_buddy', {
    target_session_buddy_id: sessionBuddyId,
  });

  if (error) throw error;
  return data ? mapSessionBuddyRow(data as SessionBuddyRow) : null;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test:drinking-buddies
```

Expected: PASS with `drinking buddies checks passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/drinkingBuddies.test.js src/lib/sessionBuddies.ts
git commit -m "Add drinking buddies client helpers"
```

---

### Task 3: Shared Picker And Record/Edit Integration

**Files:**
- Modify: `scripts/drinkingBuddies.test.js`
- Create: `src/components/DrinkingBuddiesPicker.tsx`
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `src/screens/EditSessionScreen.tsx`

- [ ] **Step 1: Extend the failing test for picker wiring**

Append these source assertions to `scripts/drinkingBuddies.test.js` before the final log:

```js
const pickerSource = fs.existsSync(path.join(root, 'src/components/DrinkingBuddiesPicker.tsx'))
  ? fs.readFileSync(path.join(root, 'src/components/DrinkingBuddiesPicker.tsx'), 'utf8')
  : '';
const recordScreenSource = fs.readFileSync(path.join(root, 'src/screens/RecordScreen.tsx'), 'utf8');
const editScreenSource = fs.readFileSync(path.join(root, 'src/screens/EditSessionScreen.tsx'), 'utf8');

assert.match(pickerSource, /export const DrinkingBuddiesPicker/, 'shared picker should export DrinkingBuddiesPicker');
assert.match(pickerSource, /Add your drinking buddies/, 'picker button should use the approved label');
assert.match(pickerSource, /fetchMutualMateOptions/, 'picker should load mutual mates');
assert.match(pickerSource, /setSessionBuddies/, 'picker should autosave selections through the RPC wrapper');
assert.match(pickerSource, /selectedBuddyIds/, 'picker should track selected buddy ids');
assert.match(recordScreenSource, /DrinkingBuddiesPicker/, 'record screen should render the shared drinking buddies picker');
assert.match(recordScreenSource, /sessionId=\{activeSession\.id\}/, 'record screen should pass active session id to the picker');
assert.match(editScreenSource, /DrinkingBuddiesPicker/, 'edit screen should render the shared drinking buddies picker');
assert.match(editScreenSource, /sessionId=\{sessionId\}/, 'edit screen should pass edited session id to the picker');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:drinking-buddies
```

Expected: FAIL with `shared picker should export DrinkingBuddiesPicker`.

- [ ] **Step 3: Implement the picker component**

Create `src/components/DrinkingBuddiesPicker.tsx` with this structure:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Check, Search, UserRound, X } from 'lucide-react-native';

import { CachedImage } from './CachedImage';
import { Surface } from './Surface';
import { showAlert } from '../lib/dialogs';
import { hapticLight, hapticSuccess } from '../lib/haptics';
import {
  fetchMutualMateOptions,
  fetchSessionBuddies,
  MutualMateOption,
  SessionBuddy,
  setSessionBuddies,
} from '../lib/sessionBuddies';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';

type DrinkingBuddiesPickerProps = {
  sessionId: string;
  disabled?: boolean;
};

export const DrinkingBuddiesPicker = ({ sessionId, disabled = false }: DrinkingBuddiesPickerProps) => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedBuddies, setSelectedBuddies] = useState<SessionBuddy[]>([]);
  const [mutualMates, setMutualMates] = useState<MutualMateOption[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedBuddyIds = useMemo(
    () => new Set(selectedBuddies.map((buddy) => buddy.buddyUserId)),
    [selectedBuddies]
  );

  const loadBuddies = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const [{ data: { user } }, buddies] = await Promise.all([
        supabase.auth.getUser(),
        fetchSessionBuddies(sessionId),
      ]);
      setCurrentUserId(user?.id || null);
      setSelectedBuddies(buddies);
      if (user?.id) {
        setMutualMates(await fetchMutualMateOptions(user.id));
      }
    } catch (error: any) {
      console.error('Drinking buddies load error:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadBuddies();
  }, [loadBuddies]);

  const filteredMates = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return mutualMates;
    return mutualMates.filter((mate) => (mate.username || 'Someone').toLowerCase().includes(cleanQuery));
  }, [mutualMates, query]);

  const saveSelection = useCallback(async (nextIds: string[]) => {
    if (!currentUserId || saving) return;
    setSaving(true);
    try {
      const nextBuddies = await setSessionBuddies(sessionId, nextIds);
      setSelectedBuddies(nextBuddies);
      hapticSuccess();
    } catch (error: any) {
      showAlert('Could not update buddies', error?.message || 'Please try again.');
      await loadBuddies();
    } finally {
      setSaving(false);
    }
  }, [currentUserId, loadBuddies, saving, sessionId]);

  const toggleMate = (mate: MutualMateOption) => {
    hapticLight();
    const nextIds = selectedBuddyIds.has(mate.id)
      ? selectedBuddies.map((buddy) => buddy.buddyUserId).filter((id) => id !== mate.id)
      : [...selectedBuddies.map((buddy) => buddy.buddyUserId), mate.id];
    saveSelection(nextIds);
  };

  return (
    <Surface style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Drinking buddies</Text>
          <Text style={styles.subtitle}>{selectedBuddies.length ? `${selectedBuddies.length} added` : 'Mutual mates only'}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
      </View>

      {selectedBuddies.length > 0 ? (
        <View style={styles.chipList}>
          {selectedBuddies.map((buddy) => (
            <View key={buddy.id} style={styles.chip}>
              <CachedImage
                uri={buddy.avatarUrl}
                fallbackUri={`https://i.pravatar.cc/150?u=${buddy.buddyUserId}`}
                style={styles.chipAvatar}
                recyclingKey={`buddy-${buddy.buddyUserId}-${buddy.avatarUrl || 'fallback'}`}
                accessibilityLabel={`${buddy.username || 'Someone'}'s avatar`}
              />
              <Text style={styles.chipText} numberOfLines={1}>{buddy.username || 'Someone'}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.addButton, disabled || saving ? styles.addButtonDisabled : null]}
        onPress={() => setModalVisible(true)}
        disabled={disabled || saving}
        activeOpacity={0.76}
        accessibilityRole="button"
      >
        <UserRound color={colors.primary} size={18} />
        <Text style={styles.addButtonText}>Add your drinking buddies</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Drinking buddies</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
                <X color={colors.text} size={21} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
              <Search color={colors.textMuted} size={18} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search mutual mates"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <ScrollView contentContainerStyle={styles.mateList} keyboardShouldPersistTaps="handled">
              {filteredMates.map((mate) => {
                const selected = selectedBuddyIds.has(mate.id);
                return (
                  <TouchableOpacity
                    key={mate.id}
                    style={styles.mateRow}
                    onPress={() => toggleMate(mate)}
                    disabled={saving}
                    activeOpacity={0.75}
                  >
                    <CachedImage
                      uri={mate.avatarUrl}
                      fallbackUri={`https://i.pravatar.cc/150?u=${mate.id}`}
                      style={styles.mateAvatar}
                      recyclingKey={`mate-${mate.id}-${mate.avatarUrl || 'fallback'}`}
                      accessibilityLabel={`${mate.username || 'Someone'}'s avatar`}
                    />
                    <Text style={styles.mateName}>{mate.username || 'Someone'}</Text>
                    {selected ? <Check color={colors.success} size={19} /> : null}
                  </TouchableOpacity>
                );
              })}
              {!filteredMates.length ? <Text style={styles.emptyText}>No mutual mates found.</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  title: { ...typography.h3 },
  subtitle: { ...typography.caption, marginTop: 2 },
  chipList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 34, maxWidth: '100%', borderRadius: radius.pill, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft },
  chipAvatar: { width: 22, height: 22, borderRadius: 11 },
  chipText: { ...typography.caption, color: colors.text, fontWeight: '800' },
  addButton: { minHeight: 46, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addButtonDisabled: { opacity: 0.65 },
  addButtonText: { ...typography.body, color: colors.primary, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', padding: 16 },
  sheet: { maxHeight: '82%', backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderSoft, padding: 16, gap: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...typography.h3 },
  closeButton: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  searchBox: { minHeight: 44, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { ...typography.body, color: colors.text, flex: 1, padding: 0 },
  mateList: { gap: 8, paddingBottom: 8 },
  mateRow: { minHeight: 54, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  mateAvatar: { width: 34, height: 34, borderRadius: 17 },
  mateName: { ...typography.body, flex: 1, minWidth: 0, fontWeight: '800' },
  emptyText: { ...typography.bodyMuted, textAlign: 'center', paddingVertical: 18 },
});
```

- [ ] **Step 4: Mount the picker in RecordScreen**

In `src/screens/RecordScreen.tsx`, add:

```ts
import { DrinkingBuddiesPicker } from '../components/DrinkingBuddiesPicker';
```

Inside the active-session JSX, place this block between the chug button and the `Post Details` surface:

```tsx
{!activeCrawl ? (
  <DrinkingBuddiesPicker
    sessionId={activeSession.id}
    disabled={ending || cancelling}
  />
) : null}
```

- [ ] **Step 5: Mount the picker in EditSessionScreen**

In `src/screens/EditSessionScreen.tsx`, add:

```ts
import { DrinkingBuddiesPicker } from '../components/DrinkingBuddiesPicker';
```

Place this block after the Drinks surface and before the Details surface:

```tsx
{sessionId ? (
  <DrinkingBuddiesPicker
    sessionId={sessionId}
    disabled={saving}
  />
) : null}
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
npm run test:drinking-buddies
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/drinkingBuddies.test.js src/components/DrinkingBuddiesPicker.tsx src/screens/RecordScreen.tsx src/screens/EditSessionScreen.tsx
git commit -m "Add drinking buddies picker"
```

---

### Task 4: Feed And Post Detail Rendering

**Files:**
- Modify: `scripts/drinkingBuddies.test.js`
- Modify: `src/screens/FeedScreen.tsx`
- Modify: `src/screens/PostDetailScreen.tsx`

- [ ] **Step 1: Extend the failing test for feed/detail hydration**

Append these assertions before the final log in `scripts/drinkingBuddies.test.js`:

```js
const feedSource = fs.readFileSync(path.join(root, 'src/screens/FeedScreen.tsx'), 'utf8');
const postDetailSource = fs.readFileSync(path.join(root, 'src/screens/PostDetailScreen.tsx'), 'utf8');

assert.match(feedSource, /drinking_buddies:\s*SessionBuddy\[\]/, 'FeedSession should include drinking buddies');
assert.match(feedSource, /fetchSessionBuddySummaries/, 'feed should fetch drinking buddy summaries');
assert.match(feedSource, /formatDrinkingBuddyNames/, 'feed should format drinking buddy names');
assert.match(feedSource, /Drinking buddies:/, 'feed More stats should render drinking buddies');
assert.match(postDetailSource, /fetchSessionBuddySummaries/, 'post detail should fetch drinking buddy summaries');
assert.match(postDetailSource, /drinking_buddies:/, 'post detail assembled sessions should include drinking buddies');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:drinking-buddies
```

Expected: FAIL on `FeedSession should include drinking buddies`.

- [ ] **Step 3: Update FeedScreen types and rendering**

In `src/screens/FeedScreen.tsx`, add imports:

```ts
import {
  fetchSessionBuddySummaries,
  formatDrinkingBuddyNames,
  SessionBuddy,
} from '../lib/sessionBuddies';
```

Add this property to `FeedSession`:

```ts
drinking_buddies: SessionBuddy[];
```

Inside `FeedSessionCard`, after `visibleChugStat`, add:

```ts
const drinkingBuddyNames = formatDrinkingBuddyNames(item.drinking_buddies || []);
```

Inside the expanded stats panel after the drink breakdown block, add:

```tsx
{drinkingBuddyNames ? (
  <Text style={styles.buddyStatsText}>
    Drinking buddies: {drinkingBuddyNames}
  </Text>
) : null}
```

Add a style:

```ts
buddyStatsText: {
  ...typography.caption,
  color: colors.text,
  fontWeight: '800',
  lineHeight: 18,
},
```

In `fetchSessions`, include `buddiesResult` in the same detail `Promise.all` that fetches cheers, beers, comments, and chugs:

```ts
sessionIds.length > 0
  ? fetchSessionBuddySummaries(sessionIds)
  : Promise.resolve(new Map<string, SessionBuddy[]>()),
```

Destructure it:

```ts
const [cheersResult, beersResult, commentsResult, chugsResult, buddiesBySession] = await withTimeout(
```

When assembling each session, set:

```ts
drinking_buddies: buddiesBySession.get(session.id) || [],
```

- [ ] **Step 4: Update PostDetailScreen hydration**

In `src/screens/PostDetailScreen.tsx`, add:

```ts
import { fetchSessionBuddySummaries } from '../lib/sessionBuddies';
```

In the session detail `Promise.all`, add:

```ts
fetchSessionBuddySummaries([sessionId]),
```

Destructure:

```ts
const [beersResult, cheersResult, commentsResult, chugsResult, buddiesBySession] = await Promise.all([
```

In `assembled`, add:

```ts
drinking_buddies: buddiesBySession.get(sessionId) || [],
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test:drinking-buddies
npm run test:chug-feed
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/drinkingBuddies.test.js src/screens/FeedScreen.tsx src/screens/PostDetailScreen.tsx
git commit -m "Show drinking buddies on posts"
```

---

### Task 5: In-App Notification Copy, Targets, And Decline Action

**Files:**
- Modify: `scripts/notifications.test.js`
- Modify: `src/lib/notificationMessages.ts`
- Modify: `src/lib/postTargets.ts`
- Modify: `src/screens/NotificationsScreen.tsx`

- [ ] **Step 1: Write failing notification tests**

In `scripts/notifications.test.js`, add this after the existing pub crawl started message assertions:

```js
assert.equal(
  getNotificationMessage({
    type: 'drinking_buddy_added',
    metadata: { session_id: 'session-1', target_type: 'session' },
    session: null,
  }),
  ' added you as a drinking buddy.'
);
```

Add this after the older session-only target assertion:

```js
assert.deepEqual(
  getNotificationPostTarget({
    reference_id: 'session-buddy-row-1',
    metadata: { target_type: 'session', session_id: 'session-1' },
  }),
  { targetType: 'session', targetId: 'session-1' },
  'drinking buddy notifications should open the session from metadata instead of the buddy row'
);
```

Add these source checks near the `notificationsScreenSource` assertions:

```js
assert.match(
  notificationsScreenSource,
  /drinking_buddy_added/,
  'notifications screen should know drinking buddy notifications'
);
assert.match(
  notificationsScreenSource,
  /declineSessionBuddy/,
  'notifications screen should decline drinking buddy tags through shared API'
);
assert.match(
  notificationsScreenSource,
  /Not with me/,
  'drinking buddy notifications should expose the opt-out copy'
);
assert.match(
  notificationsScreenSource,
  /Removed from this session/,
  'declined buddy notifications should show removal status'
);
assert.match(
  notificationsScreenSource,
  /item\.session\?\.status === 'published'/,
  'drinking buddy notifications should only open posts after the session is published'
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:notifications
```

Expected: FAIL on `drinking_buddy_added` copy.

- [ ] **Step 3: Update notification message and post target helpers**

In `src/lib/notificationMessages.ts`, extend `NotificationMetadata`:

```ts
session_id?: string | null;
```

Add this branch in `getNotificationMessage` before the final invite fallback:

```ts
if (item.type === 'drinking_buddy_added') return ' added you as a drinking buddy.';
```

In `src/lib/postTargets.ts`, extend metadata input:

```ts
session_id?: unknown;
```

Change `getNotificationPostTarget` to prefer `metadata.session_id`:

```ts
export const getNotificationPostTarget = (item: NotificationTargetInput): PostTarget | null => {
  const metadataSessionId = toCleanString(item.metadata?.session_id);
  const targetId = metadataSessionId || toCleanString(item.reference_id);
  if (!targetId) return null;

  return {
    targetType: normalizePostTargetType(item.metadata?.target_type),
    targetId,
  };
};
```

- [ ] **Step 4: Update NotificationsScreen types and fetches**

In `src/screens/NotificationsScreen.tsx`, add `drinking_buddy_added` to `NotificationType`.

Import:

```ts
import { declineSessionBuddy } from '../lib/sessionBuddies';
```

Add a type:

```ts
type SessionBuddyNotification = {
  id: string;
  session_id: string;
  buddy_user_id: string;
  status: 'active' | 'removed' | 'declined';
};
```

Update `SessionPreview`:

```ts
type SessionPreview = {
  pub_name: string | null;
  status?: string | null;
};
```

Add `buddy: SessionBuddyNotification | null;` to `NotificationRow`.

Build `buddyIds` from base rows:

```ts
const buddyIds = Array.from(new Set(
  baseRows
    .filter((n) => n.type === 'drinking_buddy_added' && n.reference_id)
    .map((n) => n.reference_id as string)
));
```

Update `sessionIds` so buddy notifications hydrate their real session id from metadata:

```ts
const sessionIds = Array.from(new Set(
  baseRows
    .filter((n) => (
      n.type === 'session_started'
      || (n.type === 'hangover_check' && n.metadata?.target_type !== 'pub_crawl')
      || n.type === 'drinking_buddy_added'
    ))
    .map((n) => n.type === 'drinking_buddy_added' ? n.metadata?.session_id : n.reference_id)
    .filter(Boolean) as string[]
));
```

Update the sessions fetch inside the notification `Promise.all`:

```ts
sessionIds.length > 0
  ? supabase.from('sessions').select('id, pub_name, status').in('id', sessionIds)
  : Promise.resolve({ data: [], error: null }),
```

Fetch buddy rows in the notification `Promise.all`:

```ts
buddyIds.length > 0
  ? supabase.from('session_buddies').select('id, session_id, buddy_user_id, status').in('id', buddyIds)
  : Promise.resolve({ data: [], error: null }),
```

When building `sessionsById`, include the fetched status:

```ts
(sessionsResult.data || []).forEach((session: any) => {
  sessionsById.set(session.id, { pub_name: session.pub_name, status: session.status });
});
```

Create a `buddiesById` map and attach buddy/session data:

```ts
const notificationSessionId = notification.type === 'drinking_buddy_added'
  ? notification.metadata?.session_id
  : notification.reference_id;

return {
  ...notification,
  profiles: profilesById.get(notification.actor_id) || null,
  session: notificationSessionId ? sessionsById.get(notificationSessionId) || null : null,
  invite: notification.reference_id ? invitesById.get(notification.reference_id) || null : null,
  buddy: notification.reference_id ? buddiesById.get(notification.reference_id) || null : null,
};
```

- [ ] **Step 5: Add decline action behavior**

In `NotificationsScreen`, add state:

```ts
const [decliningBuddyIds, setDecliningBuddyIds] = useState<Set<string>>(() => new Set());
```

Add the handler:

```ts
const declineBuddy = useCallback(async (item: NotificationRow) => {
  const buddyId = item.buddy?.id || item.reference_id;
  if (!currentUserId || !buddyId || item.buddy?.status !== 'active') return;

  setDecliningBuddyIds((previous) => new Set(previous).add(buddyId));
  try {
    await declineSessionBuddy(buddyId);
    setNotifications((previous) => previous.map((notification) => (
      notification.reference_id === buddyId
        ? {
            ...notification,
            buddy: notification.buddy
              ? { ...notification.buddy, status: 'declined' }
              : notification.buddy,
          }
        : notification
    )));
  } catch (error: any) {
    Alert.alert('Could not update buddy tag', error?.message || 'Please try again.');
  } finally {
    setDecliningBuddyIds((previous) => {
      const next = new Set(previous);
      next.delete(buddyId);
      return next;
    });
  }
}, [currentUserId]);
```

In `renderItem`, add:

```ts
const canDeclineBuddy = item.type === 'drinking_buddy_added'
  && item.buddy?.status === 'active'
  && item.buddy.buddy_user_id === currentUserId;
const decliningBuddy = Boolean(item.buddy?.id && decliningBuddyIds.has(item.buddy.id));
```

Include `drinking_buddy_added` in the post-opening logic only when the referenced buddy session is published:

```ts
const opensBuddyPost = item.type === 'drinking_buddy_added'
  && item.session?.status === 'published';
const postTarget = (item.type === 'cheer' || item.type === 'comment' || opensBuddyPost)
  ? getNotificationPostTarget(item)
  : null;
```

Render the action below invite blocks:

```tsx
{canDeclineBuddy ? (
  <TouchableOpacity
    style={[styles.declineBuddyButton, decliningBuddy ? styles.inviteActionButtonDisabled : null]}
    onPress={() => declineBuddy(item)}
    disabled={decliningBuddy}
    activeOpacity={0.75}
    accessibilityRole="button"
  >
    {decliningBuddy ? <ActivityIndicator color={colors.text} size="small" /> : <XCircle color={colors.text} size={16} />}
    <Text style={styles.declineBuddyText}>Not with me</Text>
  </TouchableOpacity>
) : null}

{item.type === 'drinking_buddy_added' && item.buddy?.status === 'declined' ? (
  <Text style={styles.inviteStatusText}>Removed from this session</Text>
) : null}
```

Add styles:

```ts
declineBuddyButton: {
  alignSelf: 'flex-start',
  minHeight: 38,
  borderRadius: radius.pill,
  paddingHorizontal: 12,
  marginTop: 12,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.borderSoft,
},
declineBuddyText: {
  color: colors.text,
  fontSize: 13,
  fontWeight: '900',
},
inviteActionButtonDisabled: {
  opacity: 0.62,
},
```

Update the `renderItem` dependency list to include `declineBuddy` and `decliningBuddyIds`.

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test:notifications
npm run test:drinking-buddies
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/notifications.test.js src/lib/notificationMessages.ts src/lib/postTargets.ts src/screens/NotificationsScreen.tsx
git commit -m "Add drinking buddy notification actions"
```

---

### Task 6: Push Delivery Routing

**Files:**
- Modify: `scripts/pushDelivery.test.js`
- Modify: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Write failing push source checks**

Append these assertions before the final log in `scripts/pushDelivery.test.js`:

```js
assert.match(
  sendPushSource,
  /drinking_buddy_added/,
  'push delivery should support drinking buddy notifications'
);

assert.match(
  sendPushSource,
  /added you as a drinking buddy/,
  'drinking buddy push body should use the approved copy'
);

assert.match(
  sendPushSource,
  /session_status/,
  'drinking buddy push routing should inspect session status metadata'
);

assert.match(
  sendPushSource,
  /notifications=1/,
  'active-session buddy pushes should open notifications'
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:push-delivery
```

Expected: FAIL on `push delivery should support drinking buddy notifications`.

- [ ] **Step 3: Update push function types and lookup**

In `supabase/functions/send-push/index.ts`, add `drinking_buddy_added` to `NotificationRow['type']`.

Add `session_status?: string | null;` to `metadata`.

In the referenced data `Promise.all`, add a buddy session lookup:

```ts
{ data: referencedBuddySession },
```

and promise:

```ts
record.type === 'drinking_buddy_added' && record.reference_id
  ? supabase
      .from('session_buddies')
      .select('session_id, sessions!inner(pub_name, status)')
      .eq('id', record.reference_id)
      .maybeSingle()
  : Promise.resolve({ data: null }),
```

After `notificationPubName`, compute:

```ts
const buddySessionId = typeof record.metadata?.session_id === 'string'
  ? record.metadata.session_id.trim()
  : (referencedBuddySession as any)?.session_id || '';
const buddySessionStatus = typeof record.metadata?.session_status === 'string'
  ? record.metadata.session_status
  : (referencedBuddySession as any)?.sessions?.status || '';
```

- [ ] **Step 4: Add copy and URL routing**

In the copy branch, add before invite:

```ts
} else if (record.type === 'drinking_buddy_added') {
  title = 'Drinking buddy';
  bodyText = `${actorName} added you as a drinking buddy`;
```

In URL routing, add before cheer/comment:

```ts
} else if (record.type === 'drinking_buddy_added' && buddySessionId && buddySessionStatus === 'published') {
  url = `/?post=${encodeURIComponent(buddySessionId)}&post_type=session&notificationId=${encodeURIComponent(record.id)}`;
} else if (record.type === 'drinking_buddy_added') {
  url = `/?notifications=1&notificationId=${encodeURIComponent(record.id)}`;
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test:push-delivery
npm run test:notifications
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/pushDelivery.test.js supabase/functions/send-push/index.ts
git commit -m "Route drinking buddy push notifications"
```

---

### Task 7: Final Verification

**Files:**
- Read only unless a verification failure points to a specific fix.

- [ ] **Step 1: Run focused feature tests**

Run:

```bash
npm run test:drinking-buddies
npm run test:notifications
npm run test:push-delivery
npm run test:chug-feed
npm run test:record-session-drinks
```

Expected: all commands PASS.

- [ ] **Step 2: Run web build**

Run:

```bash
npm run build:web
```

Expected: Expo export completes without TypeScript or bundling errors.

- [ ] **Step 3: Inspect git status**

Run:

```bash
git status --short
```

Expected: no uncommitted files except intentional generated output that the repo normally ignores. If `dist/` or export artifacts appear and are not meant to be committed, leave them untracked and mention them in the handoff.

- [ ] **Step 4: Final handoff**

Summarize:

- The migration and RPCs added.
- Where the picker appears.
- How "Not with me" works.
- Which tests passed.
- Any verification command that could not run.
