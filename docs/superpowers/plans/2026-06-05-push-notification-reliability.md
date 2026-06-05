# Push Notification Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Beerva's installed-PWA Web Push delivery path with explicit delivery options, diagnostic delivery records, stale subscription cleanup, and client-side subscription repair.

**Architecture:** Keep the existing Supabase `notifications` insert trigger and `send-push` Edge Function as the delivery path. Add a diagnostics table, record one delivery attempt per push subscription, and add client/service-worker self-healing so granted browser subscriptions are re-upserted if the backend row disappears.

**Tech Stack:** Expo React Native Web, browser Service Worker + Web Push, Supabase Postgres migrations, Supabase Edge Functions on Deno, `web-push`, source-level Node test scripts.

---

## File Structure

- Create: `supabase/migrations/20260605120000_add_push_delivery_attempts.sql`
  - Owns the diagnostics table, status check, indexes, RLS enablement, and table comment.
- Modify: `scripts/pushDelivery.test.js`
  - Adds source-level checks for the diagnostics migration and Edge Function send instrumentation.
- Modify: `supabase/functions/send-push/index.ts`
  - Fetches subscription ids, sends with `urgency`, `TTL`, and `timeout`, hashes endpoints, records attempts, and keeps deleting 404/410 subscriptions.
- Modify: `scripts/pwaStartup.test.js`
  - Adds source-level checks for subscription sync and service-worker subscription-change handling.
- Modify: `src/lib/pushNotifications.ts`
  - Adds `syncPushSubscription()`, extracts subscription upsert logic, and attaches foreground/message repair listeners.
- Modify: `public/sw.js`
  - Adds `pushsubscriptionchange` handling that asks open clients to sync their current browser subscription.

---

### Task 1: Add Push Delivery Diagnostics Schema

**Files:**
- Create: `supabase/migrations/20260605120000_add_push_delivery_attempts.sql`
- Modify: `scripts/pushDelivery.test.js`

- [ ] **Step 1: Write the failing migration assertions**

Add these assertions to `scripts/pushDelivery.test.js` after the existing Vault/secret assertions and before the `sendPushSource` assertions:

```js
const pushDeliveryAttemptsMigrationPath = path.join(root, 'supabase/migrations/20260605120000_add_push_delivery_attempts.sql');
const pushDeliveryAttemptsMigrationSql = fs.existsSync(pushDeliveryAttemptsMigrationPath)
  ? fs.readFileSync(pushDeliveryAttemptsMigrationPath, 'utf8')
  : '';

assert.match(
  pushDeliveryAttemptsMigrationSql,
  /create table if not exists public\.push_delivery_attempts/i,
  'push delivery diagnostics should store one row per subscription delivery attempt'
);

assert.match(
  pushDeliveryAttemptsMigrationSql,
  /endpoint_hash text not null/i,
  'push delivery diagnostics should store an endpoint hash instead of raw endpoint text'
);

assert.match(
  pushDeliveryAttemptsMigrationSql,
  /push_delivery_attempts_status_check[\s\S]*accepted[\s\S]*expired_subscription[\s\S]*failed/i,
  'push delivery diagnostics should constrain delivery attempt statuses'
);

assert.match(
  pushDeliveryAttemptsMigrationSql,
  /alter table public\.push_delivery_attempts enable row level security/i,
  'push delivery diagnostics should have RLS enabled'
);

assert.doesNotMatch(
  pushDeliveryAttemptsMigrationSql,
  /create policy/i,
  'push delivery diagnostics should not expose normal user read policies'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:push-delivery
```

Expected: FAIL with `push delivery diagnostics should store one row per subscription delivery attempt`.

- [ ] **Step 3: Add the diagnostics migration**

Create `supabase/migrations/20260605120000_add_push_delivery_attempts.sql`:

```sql
create table if not exists public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  push_subscription_id uuid null references public.push_subscriptions(id) on delete set null,
  endpoint_hash text not null,
  status text not null,
  http_status integer null,
  error_message text null,
  created_at timestamp with time zone not null default now(),
  constraint push_delivery_attempts_status_check
    check (status in ('accepted', 'expired_subscription', 'failed'))
);

alter table public.push_delivery_attempts enable row level security;

create index if not exists push_delivery_attempts_notification_id_idx
  on public.push_delivery_attempts(notification_id);

create index if not exists push_delivery_attempts_user_created_at_idx
  on public.push_delivery_attempts(user_id, created_at desc);

create index if not exists push_delivery_attempts_subscription_created_at_idx
  on public.push_delivery_attempts(push_subscription_id, created_at desc);

comment on table public.push_delivery_attempts is 'Service-role diagnostics for Web Push delivery attempts. Stores endpoint hashes, not raw push endpoints.';
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:push-delivery
```

Expected: PASS with `push delivery checks passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/pushDelivery.test.js supabase/migrations/20260605120000_add_push_delivery_attempts.sql
git commit -m "feat: add push delivery diagnostics table"
```

---

### Task 2: Record Backend Push Attempts And Send With High Urgency

**Files:**
- Modify: `scripts/pushDelivery.test.js`
- Modify: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Write the failing Edge Function assertions**

Add these assertions to `scripts/pushDelivery.test.js` near the other `sendPushSource` assertions:

```js
assert.match(
  sendPushSource,
  /const PUSH_SEND_OPTIONS = \{[\s\S]*urgency:\s*'high'[\s\S]*TTL:\s*86400[\s\S]*timeout:\s*8000[\s\S]*\}/,
  'send-push should send user-visible pushes with high urgency, one-day TTL, and a finite timeout'
);

assert.match(
  sendPushSource,
  /\.select\('id, endpoint, p256dh, auth_key'\)/,
  'send-push should fetch subscription ids for diagnostics'
);

assert.match(
  sendPushSource,
  /crypto\.subtle\.digest\('SHA-256'/,
  'send-push should hash endpoints before recording diagnostics'
);

assert.match(
  sendPushSource,
  /\.from\('push_delivery_attempts'\)[\s\S]*\.insert/,
  'send-push should record delivery attempts'
);

assert.match(
  sendPushSource,
  /recordPushDeliveryAttempt\([\s\S]*status:\s*'accepted'/,
  'send-push should record accepted push-service sends'
);

assert.match(
  sendPushSource,
  /recordPushDeliveryAttempt\([\s\S]*status:\s*'expired_subscription'/,
  'send-push should record expired subscriptions'
);

assert.match(
  sendPushSource,
  /recordPushDeliveryAttempt\([\s\S]*status:\s*'failed'/,
  'send-push should record non-expiry push failures'
);

assert.match(
  sendPushSource,
  /webpush\.sendNotification\(pushSub,\s*payload,\s*PUSH_SEND_OPTIONS\)/,
  'send-push should pass delivery options to web-push'
);

assert.doesNotMatch(
  sendPushSource,
  /endpoint:\s*params\./,
  'send-push diagnostics should not store raw push endpoints'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:push-delivery
```

Expected: FAIL with `send-push should send user-visible pushes with high urgency, one-day TTL, and a finite timeout`.

- [ ] **Step 3: Add delivery option and diagnostics helpers**

In `supabase/functions/send-push/index.ts`, add this block after `webpush.setVapidDetails(contact, vapidPublic, vapidPrivate);`:

```ts
const PUSH_SEND_OPTIONS = {
  urgency: 'high' as const,
  TTL: 86400,
  timeout: 8000,
};

type PushDeliveryStatus = 'accepted' | 'expired_subscription' | 'failed';

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

const getEndpointHash = async (endpoint: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const getPushErrorMessage = (err: any) => {
  const message = typeof err?.body === 'string' && err.body.trim()
    ? err.body
    : err?.message;

  return typeof message === 'string' && message.trim()
    ? message.slice(0, 500)
    : null;
};

const recordPushDeliveryAttempt = async (
  supabase: ReturnType<typeof createClient>,
  params: {
    notificationId: string;
    userId: string;
    pushSubscriptionId: string;
    endpointHash: string;
    status: PushDeliveryStatus;
    httpStatus?: number | null;
    errorMessage?: string | null;
  }
) => {
  const { error } = await supabase
    .from('push_delivery_attempts')
    .insert({
      notification_id: params.notificationId,
      user_id: params.userId,
      push_subscription_id: params.pushSubscriptionId,
      endpoint_hash: params.endpointHash,
      status: params.status,
      http_status: params.httpStatus ?? null,
      error_message: params.errorMessage ?? null,
    });

  if (error) {
    console.error('Push delivery diagnostic insert error', error.message);
  }
};
```

- [ ] **Step 4: Fetch subscription ids**

In the subscriptions query inside the `Promise.all`, replace:

```ts
.select('endpoint, p256dh, auth_key')
```

with:

```ts
.select('id, endpoint, p256dh, auth_key')
```

- [ ] **Step 5: Record each send attempt**

Replace the `subscriptions.map(async (sub: any) => { ... })` block with:

```ts
subscriptions.map(async (sub: PushSubscriptionRow) => {
  const pushSub = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth_key },
  };
  const endpointHash = await getEndpointHash(sub.endpoint);

  try {
    await webpush.sendNotification(pushSub, payload, PUSH_SEND_OPTIONS);
    sent += 1;
    await recordPushDeliveryAttempt(supabase, {
      notificationId: record.id,
      userId: record.user_id,
      pushSubscriptionId: sub.id,
      endpointHash,
      status: 'accepted',
    });
  } catch (err: any) {
    const status = err?.statusCode;
    const httpStatus = typeof status === 'number' ? status : null;
    const errorMessage = getPushErrorMessage(err);

    if (status === 404 || status === 410) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await recordPushDeliveryAttempt(supabase, {
        notificationId: record.id,
        userId: record.user_id,
        pushSubscriptionId: sub.id,
        endpointHash,
        status: 'expired_subscription',
        httpStatus,
        errorMessage,
      });
    } else {
      console.error('Push send error', status, err?.body || err?.message);
      await recordPushDeliveryAttempt(supabase, {
        notificationId: record.id,
        userId: record.user_id,
        pushSubscriptionId: sub.id,
        endpointHash,
        status: 'failed',
        httpStatus,
        errorMessage,
      });
    }
  }
})
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
npm run test:push-delivery
```

Expected: PASS with `push delivery checks passed`.

- [ ] **Step 7: Commit**

```bash
git add scripts/pushDelivery.test.js supabase/functions/send-push/index.ts
git commit -m "feat: record push delivery attempts"
```

---

### Task 3: Add Client Push Subscription Repair

**Files:**
- Modify: `scripts/pwaStartup.test.js`
- Modify: `src/lib/pushNotifications.ts`

- [ ] **Step 1: Write the failing client repair assertions**

In `scripts/pwaStartup.test.js`, add a helper body extraction near the existing extracted function bodies:

```js
const syncPushSubscriptionBody = getExportedAsyncFunctionBody(pushSource, 'syncPushSubscription');
```

Add these assertions after the existing push enabled state assertions:

```js
assert.match(
  pushSource,
  /const upsertPushSubscription = async/,
  'push registration should share backend upsert logic between enable and repair flows'
);

assert.match(
  syncPushSubscriptionBody,
  /Notification\.permission !== 'granted'/,
  'push subscription sync should only repair granted browser notification subscriptions'
);

assert.match(
  syncPushSubscriptionBody,
  /registration\.pushManager\.getSubscription\(\)/,
  'push subscription sync should read the current browser push subscription'
);

assert.match(
  syncPushSubscriptionBody,
  /upsertPushSubscription\(subscription,\s*user\.id\)/,
  'push subscription sync should upsert the current browser subscription for the signed-in user'
);

assert.match(
  isCurrentlySubscribedBody,
  /await syncPushSubscription\(\)/,
  'push enabled checks should repair a missing backend row when the browser subscription still exists'
);

assert.match(
  pushSource,
  /window\.addEventListener\('focus', syncCurrentPushSubscription\)/,
  'push registration should repair subscriptions when the installed PWA returns to focus'
);

assert.match(
  pushSource,
  /document\.addEventListener\('visibilitychange'/,
  'push registration should repair subscriptions when the installed PWA becomes visible'
);

assert.match(
  pushSource,
  /event\.data\?\.type === 'SYNC_PUSH_SUBSCRIPTION'/,
  'push registration should respond to service worker subscription sync messages'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:pwa-startup
```

Expected: FAIL with `syncPushSubscription should be exported`.

- [ ] **Step 3: Extract backend subscription upsert helper**

In `src/lib/pushNotifications.ts`, add this helper before `enablePushNotifications()`:

```ts
const upsertPushSubscription = async (
  subscription: PushSubscription,
  userId: string
): Promise<{ ok: boolean; reason?: string }> => {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'Subscription missing required keys.' };
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
    { onConflict: 'user_id,endpoint' }
  );

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
};
```

- [ ] **Step 4: Add exported sync helper**

Add this exported function after `registerServiceWorker()`:

```ts
export const syncPushSubscription = async (): Promise<{ ok: boolean; reason?: string }> => {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (Notification.permission !== 'granted') return { ok: false, reason: 'permission-not-granted' };

  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return { ok: false, reason: 'service-worker-missing' };

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { ok: false, reason: 'subscription-missing' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'not-signed-in' };

  return upsertPushSubscription(subscription, user.id);
};
```

- [ ] **Step 5: Reuse helper in enable flow**

Inside `enablePushNotifications()`, replace the manual `json` validation and `supabase.from('push_subscriptions').upsert(...)` block with:

```ts
const upsertResult = await upsertPushSubscription(subscription, user.id);
if (!upsertResult.ok) {
  await unsubscribeCurrentSubscription();
  return upsertResult;
}
return { ok: true };
```

- [ ] **Step 6: Repair missing backend row from enabled-state checks**

In `isCurrentlySubscribed()`, replace:

```ts
return Boolean(data);
```

with:

```ts
if (data) return true;

const syncResult = await syncPushSubscription();
return syncResult.ok;
```

- [ ] **Step 7: Add foreground and service-worker message repair listeners**

Add this block near `attachServiceWorkerUpdateFlow`:

```ts
let pushSubscriptionRepairFlowAttached = false;

const attachPushSubscriptionRepairFlow = () => {
  if (
    Platform.OS !== 'web'
    || typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof navigator === 'undefined'
    || !('serviceWorker' in navigator)
  ) {
    return;
  }

  if (pushSubscriptionRepairFlowAttached) return;
  pushSubscriptionRepairFlowAttached = true;

  const syncCurrentPushSubscription = () => {
    syncPushSubscription().catch((error) => {
      console.warn('Could not sync push subscription', error);
    });
  };

  window.addEventListener('focus', syncCurrentPushSubscription);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncCurrentPushSubscription();
    }
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_PUSH_SUBSCRIPTION') {
      syncCurrentPushSubscription();
    }
  });

  syncCurrentPushSubscription();
};
```

In both successful paths of `registerServiceWorker()`, call the repair flow immediately before returning:

```ts
attachPushSubscriptionRepairFlow();
```

- [ ] **Step 8: Run test to verify it passes**

Run:

```bash
npm run test:pwa-startup
```

Expected: PASS with `PWA startup checks passed`.

- [ ] **Step 9: Commit**

```bash
git add scripts/pwaStartup.test.js src/lib/pushNotifications.ts
git commit -m "feat: repair web push subscriptions"
```

---

### Task 4: Add Service Worker Subscription Change Messaging

**Files:**
- Modify: `scripts/pwaStartup.test.js`
- Modify: `public/sw.js`

- [ ] **Step 1: Write the failing service-worker assertions**

Add these assertions to `scripts/pwaStartup.test.js` near the other service-worker assertions:

```js
assert.match(
  serviceWorkerSource,
  /self\.addEventListener\('pushsubscriptionchange'/,
  'service worker should handle browser push subscription changes'
);

assert.match(
  serviceWorkerSource,
  /client\.postMessage\(\{\s*type:\s*'SYNC_PUSH_SUBSCRIPTION'\s*\}\)/,
  'service worker should ask open clients to resync push subscriptions'
);

assert.match(
  serviceWorkerSource,
  /self\.clients\.matchAll\(\{\s*type:\s*'window',\s*includeUncontrolled:\s*true\s*\}\)/,
  'service worker should notify all open Beerva windows when push subscriptions change'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:pwa-startup
```

Expected: FAIL with `service worker should handle browser push subscription changes`.

- [ ] **Step 3: Add client notification helper**

In `public/sw.js`, add this helper before the `push` event listener:

```js
const notifyClientsToSyncPushSubscription = () => (
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    clientList.forEach((client) => {
      client.postMessage({ type: 'SYNC_PUSH_SUBSCRIPTION' });
    });
  })
);
```

- [ ] **Step 4: Add pushsubscriptionchange handler**

In `public/sw.js`, add this event listener after the helper:

```js
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(notifyClientsToSyncPushSubscription());
});
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm run test:pwa-startup
```

Expected: PASS with `PWA startup checks passed`.

- [ ] **Step 6: Commit**

```bash
git add scripts/pwaStartup.test.js public/sw.js
git commit -m "feat: handle web push subscription changes"
```

---

### Task 5: Final Verification

**Files:**
- Verify only unless a previous task exposed a defect.

- [ ] **Step 1: Run push delivery tests**

Run:

```bash
npm run test:push-delivery
```

Expected: PASS with `push delivery checks passed`.

- [ ] **Step 2: Run PWA startup tests**

Run:

```bash
npm run test:pwa-startup
```

Expected: PASS with `PWA startup checks passed`.

- [ ] **Step 3: Run push reminder tests**

Run:

```bash
npm run test:push-reminder
```

Expected: PASS with `push reminder checks passed`.

- [ ] **Step 4: Run notification source tests**

Run:

```bash
npm run test:notifications
```

Expected: PASS with `notification tests passed`.

- [ ] **Step 5: Run TypeScript compile check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git diff --stat HEAD
git status --short
```

Expected: only intended push reliability files are modified before the final commit.

- [ ] **Step 7: Final commit if verification required follow-up edits**

If Step 1 through Step 5 forced any small follow-up edits, commit them:

```bash
git add scripts/pushDelivery.test.js scripts/pwaStartup.test.js src/lib/pushNotifications.ts public/sw.js supabase/functions/send-push/index.ts supabase/migrations/20260605120000_add_push_delivery_attempts.sql
git commit -m "fix: stabilize push notification reliability"
```

If there are no follow-up edits, skip this commit because each implementation task already committed its changes.

---

## Manual Verification Notes

After deployment:

1. Install or open the installed Android PWA.
2. Sign in and enable push notifications from Profile.
3. Insert a test `notifications` row for that user.
4. Confirm `public.push_delivery_attempts` contains one row per `public.push_subscriptions` row for the user.
5. Confirm accepted browser-push sends record `status = 'accepted'`.
6. Confirm a 404 or 410 push-service response deletes the matching `push_subscriptions` row and records `status = 'expired_subscription'`.
7. If diagnostics show `accepted` but the phone does not show the notification, treat the remaining failure as Android/Chrome delivery behavior rather than Beerva's backend send pipeline.
