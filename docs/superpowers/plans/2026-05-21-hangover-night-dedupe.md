# Hangover Night Dedupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one 11am hangover notification per user per drinking night, and apply the submitted score to every eligible post from that night.

**Architecture:** Keep hangover grouping in Supabase because prompt rows already drive scheduled notification delivery. Add a grouped `drinking_day` key to `hangover_prompts`, enforce one prompt per user/night, and update `rate_hangover` so it resolves the target's drinking-night window and scores every matching visible session and pub crawl. Leave the Edge Function unchanged because one prompt row will now mean one notification.

**Tech Stack:** Supabase Postgres SQL/RPC/triggers, Supabase Edge Functions, Expo React Native Web, Node source-level contract tests.

---

## File Structure

- Modify `scripts/hangover.test.js`
  - Adds source-level guards for the new migration, grouped prompt creation, grouped completion, and bulk rating behavior.
- Create `supabase/migrations/20260521130000_group_hangover_prompts_by_drinking_night.sql`
  - Adds `hangover_prompts.drinking_day`, backfills existing prompts, dedupes backfilled groups, adds a unique grouped index, updates prompt helpers/triggers, and replaces `rate_hangover`.

---

### Task 1: Grouped Hangover Contract Test

**Files:**
- Modify: `scripts/hangover.test.js`
- Test command: `node scripts/hangover.test.js`

- [ ] **Step 1: Write the failing test**

In `scripts/hangover.test.js`, add this helper after the existing `read` helper:

```js
const exists = (relativePath) => fs.existsSync(path.resolve(__dirname, '..', relativePath));
```

Add this path constant after `const migrationSql = read('supabase/migrations/20260512170000_add_hangover_prompts.sql');`:

```js
const nightDedupeMigrationPath = 'supabase/migrations/20260521130000_group_hangover_prompts_by_drinking_night.sql';
```

Add these assertions after the existing migration assertions that check `rate_hangover`, `claim_due_hangover_prompts`, and `hangover_check`:

```js
assert.ok(exists(nightDedupeMigrationPath), 'hangover night dedupe migration should exist');
const nightDedupeMigrationSql = read(nightDedupeMigrationPath);

assert.match(nightDedupeMigrationSql, /add column if not exists drinking_day date/i, 'hangover prompts should store the grouped drinking night');
assert.match(nightDedupeMigrationSql, /calculate_hangover_prompt_details/i, 'migration should expose prompt details with prompt time and drinking day');
assert.match(nightDedupeMigrationSql, /returns table \(\s*prompt_at timestamp with time zone,\s*drinking_day date\s*\)/i, 'prompt details should return prompt_at and drinking_day');
assert.match(nightDedupeMigrationSql, /row_number\(\) over \(\s*partition by hangover_prompts\.user_id,\s*hangover_prompts\.drinking_day/i, 'migration should dedupe already-created prompts before adding the unique index');
assert.match(nightDedupeMigrationSql, /hangover_prompts_user_drinking_day_unique_idx/i, 'database should enforce one prompt per user per drinking night');
assert.match(nightDedupeMigrationSql, /on conflict \(user_id, drinking_day\) where drinking_day is not null do nothing/i, 'prompt creation should dedupe by user and drinking night');
assert.match(nightDedupeMigrationSql, /coalesce\(sessions\.published_at, sessions\.ended_at, sessions\.created_at\) >= night_start/i, 'rating should find sessions inside the resolved drinking-night window');
assert.match(nightDedupeMigrationSql, /coalesce\(sessions\.published_at, sessions\.ended_at, sessions\.created_at\) < night_end/i, 'rating should stop the session group at the 6am boundary');
assert.match(nightDedupeMigrationSql, /coalesce\(pub_crawls\.published_at, pub_crawls\.ended_at, pub_crawls\.created_at\) >= night_start/i, 'rating should include pub crawls inside the same drinking-night window');
assert.match(nightDedupeMigrationSql, /session_id = any\(session_ids\)/i, 'rating should complete legacy session prompt rows in the group');
assert.match(nightDedupeMigrationSql, /pub_crawl_id = any\(pub_crawl_ids\)/i, 'rating should complete legacy pub crawl prompt rows in the group');
assert.match(nightDedupeMigrationSql, /drinking_day = resolved_drinking_day/i, 'rating should complete grouped prompt rows for the resolved night');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node scripts/hangover.test.js
```

Expected: FAIL with `hangover night dedupe migration should exist`.

---

### Task 2: Database Grouping Migration

**Files:**
- Create: `supabase/migrations/20260521130000_group_hangover_prompts_by_drinking_night.sql`
- Test command: `node scripts/hangover.test.js`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260521130000_group_hangover_prompts_by_drinking_night.sql` with this SQL:

```sql
alter table public.hangover_prompts
  add column if not exists drinking_day date;

create or replace function public.calculate_hangover_prompt_details(
  target_published_at timestamp with time zone,
  target_timezone text
)
returns table (
  prompt_at timestamp with time zone,
  drinking_day date
)
language plpgsql
stable
set search_path = public
as $$
declare
  local_published_at timestamp without time zone;
  resolved_drinking_day date;
begin
  if target_published_at is null then
    return;
  end if;

  local_published_at := timezone(target_timezone, target_published_at);

  if not (
    extract(hour from local_published_at) >= 21
    or extract(hour from local_published_at) < 6
  ) then
    return;
  end if;

  resolved_drinking_day := (local_published_at - interval '6 hours')::date;
  prompt_at := ((resolved_drinking_day + 1)::timestamp + time '11:00') at time zone target_timezone;
  drinking_day := resolved_drinking_day;
  return next;
end;
$$;

create or replace function public.calculate_hangover_prompt_at(
  target_published_at timestamp with time zone,
  target_timezone text
)
returns timestamp with time zone
language plpgsql
stable
set search_path = public
as $$
declare
  resolved_prompt_at timestamp with time zone;
begin
  select details.prompt_at
  into resolved_prompt_at
  from public.calculate_hangover_prompt_details(target_published_at, target_timezone) details
  limit 1;

  return resolved_prompt_at;
end;
$$;

update public.hangover_prompts as hangover_prompts
set drinking_day = details.drinking_day
from public.sessions as sessions
cross join lateral public.calculate_hangover_prompt_details(
  coalesce(sessions.published_at, sessions.ended_at, sessions.created_at),
  public.resolve_hangover_timezone(sessions.timezone, sessions.user_id)
) details
where hangover_prompts.session_id = sessions.id
  and hangover_prompts.drinking_day is null;

update public.hangover_prompts as hangover_prompts
set drinking_day = details.drinking_day
from public.pub_crawls as pub_crawls
cross join lateral public.calculate_hangover_prompt_details(
  coalesce(pub_crawls.published_at, pub_crawls.ended_at, pub_crawls.created_at),
  public.resolve_hangover_timezone(pub_crawls.timezone, pub_crawls.user_id)
) details
where hangover_prompts.pub_crawl_id = pub_crawls.id
  and hangover_prompts.drinking_day is null;

with ranked_prompts as (
  select
    hangover_prompts.id,
    row_number() over (
      partition by hangover_prompts.user_id, hangover_prompts.drinking_day
      order by
        case when hangover_prompts.sent_at is not null then 0 else 1 end,
        hangover_prompts.prompt_at asc,
        hangover_prompts.created_at asc,
        hangover_prompts.id asc
    ) as duplicate_rank
  from public.hangover_prompts
  where hangover_prompts.drinking_day is not null
)
update public.hangover_prompts as hangover_prompts
set drinking_day = null,
    completed_at = coalesce(hangover_prompts.completed_at, now()),
    last_error = coalesce(
      hangover_prompts.last_error,
      'Superseded by grouped drinking-night hangover prompt.'
    )
from ranked_prompts
where hangover_prompts.id = ranked_prompts.id
  and ranked_prompts.duplicate_rank > 1;

create unique index if not exists hangover_prompts_user_drinking_day_unique_idx
  on public.hangover_prompts(user_id, drinking_day)
  where drinking_day is not null;

create or replace function public.create_hangover_prompt_for_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_timezone text;
  resolved_prompt_at timestamp with time zone;
  resolved_drinking_day date;
begin
  if new.status <> 'published' or coalesce(new.hide_from_feed, false) then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  resolved_timezone := public.resolve_hangover_timezone(new.timezone, new.user_id);

  select details.prompt_at, details.drinking_day
  into resolved_prompt_at, resolved_drinking_day
  from public.calculate_hangover_prompt_details(
    coalesce(new.published_at, new.ended_at, new.created_at),
    resolved_timezone
  ) details
  limit 1;

  if resolved_prompt_at is null or resolved_drinking_day is null then
    return new;
  end if;

  insert into public.hangover_prompts (user_id, session_id, prompt_at, drinking_day)
  values (new.user_id, new.id, resolved_prompt_at, resolved_drinking_day)
  on conflict (user_id, drinking_day) where drinking_day is not null do nothing;

  return new;
end;
$$;

create or replace function public.create_hangover_prompt_for_pub_crawl()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_timezone text;
  resolved_prompt_at timestamp with time zone;
  resolved_drinking_day date;
begin
  if new.status <> 'published' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  resolved_timezone := public.resolve_hangover_timezone(new.timezone, new.user_id);

  select details.prompt_at, details.drinking_day
  into resolved_prompt_at, resolved_drinking_day
  from public.calculate_hangover_prompt_details(
    coalesce(new.published_at, new.ended_at, new.created_at),
    resolved_timezone
  ) details
  limit 1;

  if resolved_prompt_at is null or resolved_drinking_day is null then
    return new;
  end if;

  insert into public.hangover_prompts (user_id, pub_crawl_id, prompt_at, drinking_day)
  values (new.user_id, new.id, resolved_prompt_at, resolved_drinking_day)
  on conflict (user_id, drinking_day) where drinking_day is not null do nothing;

  return new;
end;
$$;

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
  session_ids uuid[] := array[]::uuid[];
  pub_crawl_ids uuid[] := array[]::uuid[];
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_score < 1 or target_score > 10 then
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

  select details.drinking_day
  into resolved_drinking_day
  from public.calculate_hangover_prompt_details(target_published_at, resolved_timezone) details
  limit 1;

  if resolved_drinking_day is null then
    raise exception 'This post is not eligible for a hangover rating.';
  end if;

  night_start := (resolved_drinking_day::timestamp + time '21:00') at time zone resolved_timezone;
  night_end := ((resolved_drinking_day + 1)::timestamp + time '06:00') at time zone resolved_timezone;

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

comment on column public.hangover_prompts.drinking_day is 'Local drinking-night date used to dedupe one hangover prompt per user per night.';
comment on function public.calculate_hangover_prompt_details(timestamp with time zone, text) is 'Returns the 11am prompt timestamp and local drinking-night date for eligible late-night posts.';
comment on index public.hangover_prompts_user_drinking_day_unique_idx is 'Ensures one hangover prompt per user per local drinking night.';
```

- [ ] **Step 2: Run the hangover contract test**

Run:

```bash
node scripts/hangover.test.js
```

Expected: PASS with `hangover feature contract checks passed`.

- [ ] **Step 3: Commit the test and migration**

Run:

```bash
git add scripts/hangover.test.js supabase/migrations/20260521130000_group_hangover_prompts_by_drinking_night.sql
git commit -m "fix: dedupe hangover prompts by drinking night"
```

---

### Task 3: Regression Verification

**Files:**
- No code edits unless a verification command exposes a failure.
- Commands:
  - `npm run test:hangover`
  - `npm run test:notifications`
  - `npm run build:web`

- [ ] **Step 1: Run the hangover test script through npm**

Run:

```bash
npm run test:hangover
```

Expected: PASS with `hangover feature contract checks passed`.

- [ ] **Step 2: Run notification regression checks**

Run:

```bash
npm run test:notifications
```

Expected: PASS with `notification checks passed`.

- [ ] **Step 3: Build the web app**

Run:

```bash
npm run build:web
```

Expected: PASS and Expo export completes without TypeScript or bundling errors.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: no uncommitted files from this change. If unrelated user edits appear, leave them untouched and mention them in the completion summary.

---

## Self-Review Notes

- Spec coverage:
  - One prompt per user per drinking night: Task 2 adds `drinking_day` and a unique grouped index.
  - Existing 6am drinking-night boundary: Task 2 calculates `drinking_day` as local published time minus 6 hours.
  - One 11am notification: the existing worker still sends one notification per due prompt, and Task 2 makes prompt rows unique per night.
  - One rating applies to all eligible posts: Task 2 replaces `rate_hangover` with window-based updates for sessions and pub crawls.
  - Separate nights stay separate: the unique key includes `drinking_day`, and the rating window is bounded by 21:00 to 06:00.
- Placeholder scan: no unresolved markers or vague implementation notes.
- Type consistency:
  - SQL uses `drinking_day date` in the prompt table and helper return type.
  - Existing RPC signature `rate_hangover(text, uuid, integer)` is preserved for the current app screen.
  - Existing Edge Function payload shape remains unchanged because notifications still reference one representative target.
