# KarnevalsDruk Hangover Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give eligible KarnevalsDruk participants one May 24, 2026 11:00 hangover prompt and make that one rating apply across their full KarnevalsDruk event window.

**Architecture:** Keep the existing hangover queue, delivery worker, push deep link, and rating screen. Add one SQL migration that hooks KarnevalsDruk challenge finalization to grouped prompt creation, expands replacement lookup for event-window daytime representatives, and branches `rate_hangover` to use the official KarnevalsDruk challenge window only for joined users rating event-window targets.

> Review amendment: the final migration adds `hangover_prompts.challenge_id` so KarnevalsDruk prompts dedupe by `(user_id, challenge_id)` while normal prompts keep `(user_id, drinking_day)` dedupe only when `challenge_id is null`. This avoids same-date conflicts for non-Copenhagen time zones and keeps representative reassignment scoped to either the event window or the normal drinking night. Normal ratings/reassignment also exclude joined-user KarnevalsDruk event-window posts when a local normal night overlaps the event. If a post-before-join normal event-window prompt was already sent, finalization treats that notification as handled instead of inserting a second prompt; if it was already completed with a score, finalization propagates that score across the full event window.

**Tech Stack:** Supabase Postgres SQL/functions/triggers, existing Supabase scheduled challenge finalizer and hangover worker, Node source-level contract tests, Expo web verification.

---

## File Structure

- Modify `scripts/hangover.test.js`
  - Guard the one-off KarnevalsDruk finalization prompt path, representative replacement support, and the event-window rating branch.
- Create `supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql`
  - Add KarnevalsDruk finalization prompt creation and trigger, extend grouped representative lookup for the KarnevalsDruk event window, and replace `rate_hangover` with the one-off challenge-aware branch.

---

### Task 1: KarnevalsDruk Prompt Contract Tests

**Files:**
- Modify: `scripts/hangover.test.js`
- Test command: `npm run test:hangover`

- [ ] **Step 1: Write failing prompt and representative guards**

In `scripts/hangover.test.js`, add this path constant after the current `nightDedupeMigrationPath` constant:

```js
const karnevalsdrukHangoverMigrationPath = 'supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql';
```

Add this block after the grouped-night assertions that read `nightDedupeMigrationSql`:

```js
assert.ok(exists(karnevalsdrukHangoverMigrationPath), 'KarnevalsDruk hangover migration should exist');
const karnevalsdrukHangoverMigrationSql = read(karnevalsdrukHangoverMigrationPath);

assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.create_karnevalsdruk_hangover_prompts/i,
  'KarnevalsDruk should have an idempotent prompt creation function'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /slug\s*=\s*'karnevalsdruk-2026'/i,
  'KarnevalsDruk prompt creation should stay scoped to the real one-off challenge'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /join\s+public\.challenge_entries/i,
  'KarnevalsDruk prompts should only be created for joined users'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /sessions\.status\s*=\s*'published'[\s\S]*coalesce\(sessions\.hide_from_feed,\s*false\)\s*=\s*false/i,
  'KarnevalsDruk session prompt targets should be published and visible'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /pub_crawls\.status\s*=\s*'published'/i,
  'KarnevalsDruk pub crawl prompt targets should be published'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /time\s+'11:00'[\s\S]*Europe\/Copenhagen/i,
  'KarnevalsDruk prompts should target May 24 11am Copenhagen time'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /on\s+conflict\s*\(\s*user_id\s*,\s*drinking_day\s*\)\s*where\s+drinking_day\s+is\s+not\s+null\s+do\s+nothing/i,
  'KarnevalsDruk prompts should reuse grouped drinking-day dedupe'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /after\s+update\s+of\s+finalized_at\s+on\s+public\.challenges/i,
  'KarnevalsDruk prompt creation should run from challenge finalization'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /find_hangover_replacement_session[\s\S]*karnevalsdruk[\s\S]*sessions\.status\s*=\s*'published'[\s\S]*starts_at[\s\S]*ends_at/i,
  'session representative replacement should keep daytime KarnevalsDruk event posts eligible'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /find_hangover_replacement_pub_crawl[\s\S]*karnevalsdruk[\s\S]*pub_crawls\.status\s*=\s*'published'[\s\S]*starts_at[\s\S]*ends_at/i,
  'pub crawl representative replacement should keep daytime KarnevalsDruk event posts eligible'
);
```

- [ ] **Step 2: Run the hangover contract test to verify it fails**

Run:

```bash
npm run test:hangover
```

Expected: FAIL with `KarnevalsDruk hangover migration should exist`.

- [ ] **Step 3: Commit the failing prompt contract test**

Run:

```bash
git add scripts/hangover.test.js
git commit -m "test: guard KarnevalsDruk hangover prompts"
```

---

### Task 2: Finalization Prompt Migration

**Files:**
- Create: `supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql`
- Test command: `npm run test:hangover`

- [ ] **Step 1: Create the migration prompt and replacement functions**

Create `supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql` with this SQL:

```sql
create or replace function public.create_karnevalsdruk_hangover_prompts(
  target_challenge_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_prompt_count integer := 0;
begin
  with target_challenge as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at
    from public.challenges as challenges
    where challenges.id = target_challenge_id
      and challenges.slug = 'karnevalsdruk-2026'
    limit 1
  ),
  eligible_targets as (
    select
      challenge_entries.user_id,
      'session'::text as target_kind,
      sessions.id as target_id,
      sessions.id as session_id,
      null::uuid as pub_crawl_id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) as target_published_at,
      sessions.created_at as target_created_at
    from target_challenge
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = target_challenge.id
    join public.sessions as sessions
      on sessions.user_id = challenge_entries.user_id
    where sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= target_challenge.starts_at
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < target_challenge.ends_at

    union all

    select
      challenge_entries.user_id,
      'pub_crawl'::text as target_kind,
      pub_crawls.id as target_id,
      null::uuid as session_id,
      pub_crawls.id as pub_crawl_id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) as target_published_at,
      pub_crawls.created_at as target_created_at
    from target_challenge
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = target_challenge.id
    join public.pub_crawls as pub_crawls
      on pub_crawls.user_id = challenge_entries.user_id
    where pub_crawls.status = 'published'
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= target_challenge.starts_at
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < target_challenge.ends_at
  ),
  representative_targets as (
    select distinct on (eligible_targets.user_id)
      eligible_targets.user_id,
      eligible_targets.session_id,
      eligible_targets.pub_crawl_id
    from eligible_targets
    order by
      eligible_targets.user_id,
      eligible_targets.target_published_at asc,
      eligible_targets.target_created_at asc,
      eligible_targets.target_kind asc,
      eligible_targets.target_id asc
  )
  insert into public.hangover_prompts (
    user_id,
    session_id,
    pub_crawl_id,
    prompt_at,
    drinking_day
  )
  select
    representative_targets.user_id,
    representative_targets.session_id,
    representative_targets.pub_crawl_id,
    (
      timezone('Europe/Copenhagen', target_challenge.ends_at)::date
      + time '11:00'
    ) at time zone 'Europe/Copenhagen',
    timezone('Europe/Copenhagen', target_challenge.starts_at)::date
  from representative_targets
  cross join target_challenge
  on conflict (user_id, drinking_day) where drinking_day is not null do nothing;

  get diagnostics inserted_prompt_count = row_count;
  return inserted_prompt_count;
end;
$$;

create or replace function public.create_karnevalsdruk_hangover_prompts_after_finalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug = 'karnevalsdruk-2026'
    and old.finalized_at is null
    and new.finalized_at is not null then
    perform public.create_karnevalsdruk_hangover_prompts(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists challenges_create_karnevalsdruk_hangover_prompts_after_finalize on public.challenges;
create trigger challenges_create_karnevalsdruk_hangover_prompts_after_finalize
  after update of finalized_at on public.challenges
  for each row
  execute function public.create_karnevalsdruk_hangover_prompts_after_finalize();

select public.create_karnevalsdruk_hangover_prompts(challenges.id)
from public.challenges as challenges
where challenges.slug = 'karnevalsdruk-2026'
  and challenges.finalized_at is not null;

create or replace function public.find_hangover_replacement_session(
  target_user_id uuid,
  target_drinking_day date,
  excluded_session_id uuid default null
)
returns table (
  replacement_session_id uuid
)
language sql
stable
set search_path = public
as $$
  with karnevalsdruk as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at
    from public.challenges as challenges
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = challenges.id
      and challenge_entries.user_id = target_user_id
    where challenges.slug = 'karnevalsdruk-2026'
      and timezone('Europe/Copenhagen', challenges.starts_at)::date = target_drinking_day
    limit 1
  ),
  candidates as (
    select
      sessions.id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) as target_published_at,
      sessions.created_at as target_created_at
    from public.sessions as sessions
    cross join lateral public.calculate_hangover_prompt_details(
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at),
      public.resolve_hangover_timezone(sessions.timezone, sessions.user_id)
    ) details
    where sessions.user_id = target_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and details.drinking_day = target_drinking_day
      and (excluded_session_id is null or sessions.id <> excluded_session_id)

    union

    select
      sessions.id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) as target_published_at,
      sessions.created_at as target_created_at
    from public.sessions as sessions
    join karnevalsdruk on true
    where sessions.user_id = target_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= karnevalsdruk.starts_at
      and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < karnevalsdruk.ends_at
      and (excluded_session_id is null or sessions.id <> excluded_session_id)
  )
  select candidates.id
  from candidates
  order by
    candidates.target_published_at asc,
    candidates.target_created_at asc,
    candidates.id asc
  limit 1;
$$;

create or replace function public.find_hangover_replacement_pub_crawl(
  target_user_id uuid,
  target_drinking_day date,
  excluded_pub_crawl_id uuid default null
)
returns table (
  replacement_pub_crawl_id uuid
)
language sql
stable
set search_path = public
as $$
  with karnevalsdruk as (
    select
      challenges.id,
      challenges.starts_at,
      challenges.ends_at
    from public.challenges as challenges
    join public.challenge_entries as challenge_entries
      on challenge_entries.challenge_id = challenges.id
      and challenge_entries.user_id = target_user_id
    where challenges.slug = 'karnevalsdruk-2026'
      and timezone('Europe/Copenhagen', challenges.starts_at)::date = target_drinking_day
    limit 1
  ),
  candidates as (
    select
      pub_crawls.id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) as target_published_at,
      pub_crawls.created_at as target_created_at
    from public.pub_crawls as pub_crawls
    cross join lateral public.calculate_hangover_prompt_details(
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at),
      public.resolve_hangover_timezone(pub_crawls.timezone, pub_crawls.user_id)
    ) details
    where pub_crawls.user_id = target_user_id
      and pub_crawls.status = 'published'
      and details.drinking_day = target_drinking_day
      and (excluded_pub_crawl_id is null or pub_crawls.id <> excluded_pub_crawl_id)

    union

    select
      pub_crawls.id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) as target_published_at,
      pub_crawls.created_at as target_created_at
    from public.pub_crawls as pub_crawls
    join karnevalsdruk on true
    where pub_crawls.user_id = target_user_id
      and pub_crawls.status = 'published'
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= karnevalsdruk.starts_at
      and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < karnevalsdruk.ends_at
      and (excluded_pub_crawl_id is null or pub_crawls.id <> excluded_pub_crawl_id)
  )
  select candidates.id
  from candidates
  order by
    candidates.target_published_at asc,
    candidates.target_created_at asc,
    candidates.id asc
  limit 1;
$$;

comment on function public.create_karnevalsdruk_hangover_prompts(uuid) is 'Creates one grouped May 24 11am hangover prompt for each joined KarnevalsDruk user with an event-window post.';

revoke execute on function public.create_karnevalsdruk_hangover_prompts(uuid) from public, anon, authenticated;
```

- [ ] **Step 2: Run the hangover contract test**

Run:

```bash
npm run test:hangover
```

Expected: PASS with `hangover feature contract checks passed`.

- [ ] **Step 3: Commit the finalization prompt migration**

Run:

```bash
git add supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql
git commit -m "feat: queue KarnevalsDruk hangover prompts"
```

---

### Task 3: KarnevalsDruk Rating Contract Tests

**Files:**
- Modify: `scripts/hangover.test.js`
- Test command: `npm run test:hangover`

- [ ] **Step 1: Write failing KarnevalsDruk rating guards**

In `scripts/hangover.test.js`, add these assertions after the prompt and representative assertions for `karnevalsdrukHangoverMigrationSql`:

```js
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /create\s+or\s+replace\s+function\s+public\.rate_hangover/i,
  'KarnevalsDruk migration should replace rating with the one-off event window branch'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /join\s+public\.challenge_entries[\s\S]*challenge_entries\.user_id\s*=\s*requesting_user_id/i,
  'KarnevalsDruk rating should require a joined challenge user'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /target_published_at\s*>=\s*challenges\.starts_at[\s\S]*target_published_at\s*<\s*challenges\.ends_at/i,
  'KarnevalsDruk rating should only branch for targets inside the event window'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /night_start\s*:=\s*karnevalsdruk_row\.starts_at[\s\S]*night_end\s*:=\s*karnevalsdruk_row\.ends_at/i,
  'KarnevalsDruk rating should score the full official challenge window'
);
assert.match(
  karnevalsdrukHangoverMigrationSql,
  /else[\s\S]*calculate_hangover_prompt_details[\s\S]*time\s+'21:00'[\s\S]*time\s+'06:00'/i,
  'rating should keep the normal late-night window outside KarnevalsDruk'
);
```

- [ ] **Step 2: Run the hangover contract test to verify it fails**

Run:

```bash
npm run test:hangover
```

Expected: FAIL with `KarnevalsDruk migration should replace rating with the one-off event window branch`.

- [ ] **Step 3: Commit the failing rating contract test**

Run:

```bash
git add scripts/hangover.test.js
git commit -m "test: guard KarnevalsDruk hangover rating"
```

---

### Task 4: Challenge-Aware Rating Migration

**Files:**
- Modify: `supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql`
- Test command: `npm run test:hangover`

- [ ] **Step 1: Append the challenge-aware rating RPC**

Append this SQL after the prompt creation `revoke execute` line in `supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql`:

```sql
create or replace function public.rate_hangover(
  target_kind text,
  target_id uuid,
  target_score integer
)
returns table (
  rated_target_type text,
  rated_target_id uuid,
  hangover_score smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  target_user_id uuid;
  target_published_at timestamp with time zone;
  resolved_timezone text;
  resolved_drinking_day date;
  night_start timestamp with time zone;
  night_end timestamp with time zone;
  karnevalsdruk_row public.challenges;
  session_ids uuid[] := array[]::uuid[];
  pub_crawl_ids uuid[] := array[]::uuid[];
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_score is null or target_score < 1 or target_score > 10 then
    raise exception 'Hangover score must be between 1 and 10.';
  end if;

  if target_kind = 'session' then
    select
      sessions.user_id,
      coalesce(sessions.published_at, sessions.ended_at, sessions.created_at),
      public.resolve_hangover_timezone(sessions.timezone, sessions.user_id)
    into target_user_id, target_published_at, resolved_timezone
    from public.sessions as sessions
    where sessions.id = target_id
      and sessions.user_id = requesting_user_id
      and sessions.status = 'published'
      and coalesce(sessions.hide_from_feed, false) = false;
  elsif target_kind = 'pub_crawl' then
    select
      pub_crawls.user_id,
      coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at),
      public.resolve_hangover_timezone(pub_crawls.timezone, pub_crawls.user_id)
    into target_user_id, target_published_at, resolved_timezone
    from public.pub_crawls as pub_crawls
    where pub_crawls.id = target_id
      and pub_crawls.user_id = requesting_user_id
      and pub_crawls.status = 'published';
  else
    raise exception 'Unknown hangover target type.';
  end if;

  if target_user_id is null then
    raise exception 'Could not find a published post to rate.';
  end if;

  select challenges.*
  into karnevalsdruk_row
  from public.challenges as challenges
  join public.challenge_entries as challenge_entries
    on challenge_entries.challenge_id = challenges.id
    and challenge_entries.user_id = requesting_user_id
  where challenges.slug = 'karnevalsdruk-2026'
    and target_published_at >= challenges.starts_at
    and target_published_at < challenges.ends_at
  limit 1;

  if karnevalsdruk_row.id is not null then
    resolved_drinking_day := timezone('Europe/Copenhagen', karnevalsdruk_row.starts_at)::date;
    night_start := karnevalsdruk_row.starts_at;
    night_end := karnevalsdruk_row.ends_at;
  else
    select details.drinking_day
    into resolved_drinking_day
    from public.calculate_hangover_prompt_details(target_published_at, resolved_timezone) details
    limit 1;

    if resolved_drinking_day is null then
      raise exception 'This post is not eligible for a hangover rating.';
    end if;

    night_start := (resolved_drinking_day + time '21:00') at time zone resolved_timezone;
    night_end := ((resolved_drinking_day + 1) + time '06:00') at time zone resolved_timezone;
  end if;

  select coalesce(array_agg(sessions.id), array[]::uuid[])
  into session_ids
  from public.sessions as sessions
  where sessions.user_id = requesting_user_id
    and sessions.status = 'published'
    and coalesce(sessions.hide_from_feed, false) = false
    and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) >= night_start
    and coalesce(sessions.published_at, sessions.ended_at, sessions.created_at) < night_end;

  select coalesce(array_agg(pub_crawls.id), array[]::uuid[])
  into pub_crawl_ids
  from public.pub_crawls as pub_crawls
  where pub_crawls.user_id = requesting_user_id
    and pub_crawls.status = 'published'
    and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) >= night_start
    and coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at) < night_end;

  if coalesce(array_length(session_ids, 1), 0) + coalesce(array_length(pub_crawl_ids, 1), 0) = 0 then
    raise exception 'Could not find published posts for this drinking night.';
  end if;

  update public.sessions as sessions
  set hangover_score = target_score::smallint,
      hangover_rated_at = now()
  where sessions.id = any(session_ids);

  update public.pub_crawls as pub_crawls
  set hangover_score = target_score::smallint,
      hangover_rated_at = now()
  where pub_crawls.id = any(pub_crawl_ids);

  update public.hangover_prompts as hangover_prompts
  set completed_at = coalesce(hangover_prompts.completed_at, now())
  where hangover_prompts.user_id = requesting_user_id
    and (
      hangover_prompts.drinking_day = resolved_drinking_day
      or hangover_prompts.session_id = any(session_ids)
      or hangover_prompts.pub_crawl_id = any(pub_crawl_ids)
    );

  return query
  select 'session'::text, sessions.id, sessions.hangover_score
  from public.sessions as sessions
  where sessions.id = any(session_ids)
  order by sessions.published_at asc nulls last, sessions.created_at asc;

  return query
  select 'pub_crawl'::text, pub_crawls.id, pub_crawls.hangover_score
  from public.pub_crawls as pub_crawls
  where pub_crawls.id = any(pub_crawl_ids)
  order by pub_crawls.published_at asc nulls last, pub_crawls.created_at asc;
end;
$$;

grant execute on function public.rate_hangover(text, uuid, integer) to authenticated;

comment on function public.rate_hangover(text, uuid, integer) is 'Rates normal local drinking nights and the one-off full KarnevalsDruk challenge window for joined event users.';
```

- [ ] **Step 2: Run the hangover contract test**

Run:

```bash
npm run test:hangover
```

Expected: PASS with `hangover feature contract checks passed`.

- [ ] **Step 3: Commit the rating migration**

Run:

```bash
git add supabase/migrations/20260521140000_add_karnevalsdruk_hangover_prompt.sql
git commit -m "feat: rate KarnevalsDruk hangover windows"
```

---

### Task 5: Regression Verification

**Files:**
- No code edits unless a verification command exposes a failure.
- Commands:
  - `npm run test:hangover`
  - `npm run test:challenges`
  - `npm run test:notifications`
  - `npm run build:web`

- [ ] **Step 1: Run hangover checks**

Run:

```bash
npm run test:hangover
```

Expected: PASS with `hangover feature contract checks passed`.

- [ ] **Step 2: Run challenge checks**

Run:

```bash
npm run test:challenges
```

Expected: PASS with `official challenge checks passed`.

- [ ] **Step 3: Run notification checks**

Run:

```bash
npm run test:notifications
```

Expected: PASS with the notification contract checks completing successfully.

- [ ] **Step 4: Build the web app**

Run:

```bash
npm run build:web
```

Expected: PASS and Expo export completes without TypeScript or bundling errors.

- [ ] **Step 5: Inspect worktree state**

Run:

```bash
git status --short
```

Expected: no uncommitted files from this change. Leave unrelated user edits untouched and mention them in the completion summary if any appear.

---

## Self-Review Notes

- Spec coverage:
  - Joined users with KarnevalsDruk posts receive one May 24 11:00 prompt: Tasks 1-2.
  - Joined users with no event-window target are skipped because prompt creation selects from published sessions and pub crawls only: Task 2.
  - Normal late-night prompt dedupe stays in control through `(user_id, drinking_day)` for normal prompts, while KarnevalsDruk uses `(user_id, challenge_id)`: Tasks 1-2 plus review amendment.
  - Daytime KarnevalsDruk representative targets remain replaceable: Tasks 1-2.
  - One KarnevalsDruk rating updates the full official challenge window while other ratings keep the 21:00 to 06:00 rule: Tasks 3-4.
  - Existing challenge, notification, hangover, and web build regressions are checked: Task 5.
- Placeholder scan: no unresolved markers, deferred steps, or vague error-handling instructions remain.
- Type consistency:
  - The migration preserves the existing `rate_hangover(text, uuid, integer)` RPC signature used by `HangoverRatingScreen`.
  - Prompt delivery still receives one representative `session_id` or `pub_crawl_id` from `hangover_prompts`.
  - KarnevalsDruk uses the existing challenge slug, challenge window timestamps, `challenge_entries`, and `hangover_prompts.challenge_id`.
