# Stale Session Auto-Close Design

## Goal

Automatically end forgotten active drinking sessions so the live mate feed icon cannot stay visible forever.

If a user has not added a drink to an active session for 12 hours, the system should treat the session as forgotten. Sessions with at least one drink are automatically published to the feed. Sessions with zero drinks are cancelled quietly.

## Scope

Included:

- Normal active sessions.
- Active pub crawls and their active crawl stops.
- The live mate signal, through existing `live_mate_sessions` triggers.
- Database-owned cleanup that runs without the user opening the app.

Not included:

- New client UI or warning banners.
- Push notifications when a stale session is auto-closed.
- A user-facing setting for the timeout length.
- Changing manual end-session behavior.

## Stale Activity Rule

Use a 12-hour inactivity window.

For normal sessions, last activity is:

1. The latest `session_beers.consumed_at`.
2. The latest `session_beers.created_at` if `consumed_at` is missing.
3. The session `started_at` or `created_at` when there are no drinks.

For pub crawls, last activity is the latest drink activity across all crawl stop sessions, falling back to the crawl `started_at` or `created_at`.

A row is stale when:

```text
last_activity_at <= now() - interval '12 hours'
```

## Behavior

Normal active sessions:

- If the stale session has zero total drink quantity, update it to `status = 'cancelled'` and set `ended_at`.
- If the stale session has one or more drinks, update it to `status = 'published'`, set `ended_at`, and set `published_at`.
- Preserve existing comments, photos, timezone, pub, and drink rows.
- Do not create mention notifications or push notifications from the automatic publish path.

Active pub crawls:

- If the whole active crawl has zero total drink quantity across all stops, cancel the parent crawl and all child sessions.
- If the crawl has one or more drinks, publish the active stop if needed, mark crawl child sessions hidden from standalone feed, and publish the parent `pub_crawls` row.
- Preserve stop comments, photos, timezone, pub, and drink rows.
- Keep the published crawl visible through the existing pub crawl feed path.

Live mate cleanup:

- Existing triggers on `sessions` and `pub_crawls` remove or refresh `live_mate_sessions`.
- The cleanup function should not write directly to `live_mate_sessions` except by relying on those triggers.

## Database Design

Add a migration that creates a security-definer cleanup function:

```text
public.close_stale_active_sessions(max_rows integer default 100)
```

The function should:

- Lock eligible stale active sessions/crawls with `for update skip locked`.
- Process in batches to avoid long transactions.
- Use the existing live activity helper functions where possible:
  - `public.get_live_session_last_activity(uuid)`
  - `public.get_live_pub_crawl_last_activity(uuid)`
- Count drink quantity with `sum(greatest(coalesce(quantity, 1), 0))`.
- Return counts for observability:
  - `published_sessions`
  - `cancelled_sessions`
  - `published_crawls`
  - `cancelled_crawls`

Add a small cron target:

```text
public.invoke_stale_session_closer()
```

Schedule it with `pg_cron`, for example every 15 minutes:

```text
*/15 * * * *
```

Permissions:

- Revoke execution from `public`, `anon`, and `authenticated`.
- Grant the cleanup function to `service_role` only if direct maintenance calls are useful.
- Keep the cron target locked down from clients.

Indexes:

- Add or reuse an index that supports finding active sessions by status and start time.
- Existing `sessions_one_active_per_user_idx` supports uniqueness but is not enough for stale scanning.
- A partial index on active sessions by `started_at` is acceptable because the batch is only looking at active rows.

## Data Flow

1. User starts a session. Existing triggers create or update the live mate row.
2. User adds drinks. Existing drink triggers update live activity.
3. User forgets to end the session.
4. Cron invokes `public.invoke_stale_session_closer()`.
5. The cleanup function finds sessions or crawls inactive for at least 12 hours.
6. Zero-drink records are cancelled; drink records are published.
7. Existing lifecycle triggers remove the live mate row.
8. Published records appear in the normal feed or pub crawl feed on the next refresh.

## Error Handling

- If one batch run fails, the next cron run should retry because source rows remain active.
- `skip locked` allows overlapping invocations to avoid blocking each other.
- If an active session changes while the function is running, row locks prevent double processing.
- If a stale row has malformed or missing drink data, missing quantity counts as `1` for an existing drink row, matching app behavior.

## Testing

Use test-first implementation.

Add a focused script test for the migration that checks:

- The cleanup function exists.
- The 12-hour threshold is present.
- Normal zero-drink stale sessions are cancelled.
- Normal stale sessions with drinks are published.
- Active pub crawls with zero drinks are cancelled.
- Active pub crawls with drinks are published.
- The implementation uses `for update skip locked`.
- The implementation schedules `pg_cron`.
- Client execution is revoked.
- The live activity helper functions are reused or equivalent last-activity SQL is present.

Run the new test plus relevant existing tests:

- `npm run test:live-mates`
- `npm run test:pub-crawl`
- The new stale-session test script.

## Acceptance Criteria

- Active sessions without any drink activity for 12 hours no longer keep the live icon visible.
- Stale sessions with drinks become published feed posts.
- Stale sessions with zero drinks are cancelled and never appear in the feed.
- Active pub crawls follow the same rule across all crawl stops.
- Existing live mate, feed, hangover prompt, stats, and pub crawl behavior continue to work through existing triggers and feed paths.
