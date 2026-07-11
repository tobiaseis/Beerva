# Native Version 1 Notification Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Beerva's Android app reliably register, receive, diagnose, and route native push notifications without changing or weakening PWA Web Push.

**Architecture:** Keep `public.notifications` as the shared event source and fan out independently to Web Push and Expo Push Service. Add a native lifecycle hook for foreground token repair and notification presentation, then add an additive receipt schema plus a scheduled receipt-checking Edge Function. Protect the existing web sender path with tests before deploying the newer `send-push` version.

**Tech Stack:** Expo SDK 54, React Native 0.81, `expo-notifications`, Expo Push Service, Firebase Cloud Messaging V1, Supabase Postgres/Edge Functions/Cron, Node.js assertion tests, TypeScript.

---

## File Structure

- Create `src/lib/useNativePushLifecycle.ts`: TypeScript/web no-op fallback for the platform-resolved hook.
- Create `src/lib/useNativePushLifecycle.native.ts`: Android notification handler, token repair, and foreground lifecycle.
- Modify `src/navigation/RootNavigator.tsx`: invoke the lifecycle hook after auth state is available.
- Create `scripts/nativePushLifecycle.test.js`: source-level contract for native lifecycle behavior and web isolation.
- Create `supabase/migrations/20260711120000_add_native_push_receipts.sql`: additive receipt columns, secure cron invoker, and 15-minute schedule.
- Create `supabase/functions/check-native-push-receipts/index.ts`: fetch Expo receipts, persist outcomes, and remove stale tokens.
- Modify `supabase/config.toml`: configure receipt checker authentication consistently with other scheduled functions.
- Create `scripts/nativePushReceipts.test.js`: schema, function, auth, cron, and stale-token contract.
- Modify `supabase/functions/send-push/index.ts`: explicitly mark accepted Expo tickets as pending receipt checks.
- Modify `scripts/pushDelivery.test.js`: protect independent web/native fan-out and pending receipt state.
- Modify `app.json`: add an explicit incremented Android version code.
- Modify `scripts/androidNativeApkConfig.test.js`: require native release versioning.
- Modify `package.json`: add focused test commands.

### Task 1: Native Notification Lifecycle

**Files:**
- Create: `scripts/nativePushLifecycle.test.js`
- Modify: `package.json`
- Create: `src/lib/useNativePushLifecycle.ts`
- Create: `src/lib/useNativePushLifecycle.native.ts`
- Modify: `src/navigation/RootNavigator.tsx`

- [ ] **Step 1: Write the failing lifecycle contract**

Create `scripts/nativePushLifecycle.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const nativeSource = read('src/lib/useNativePushLifecycle.native.ts');
const fallbackSource = read('src/lib/useNativePushLifecycle.ts');
const navigatorSource = read('src/navigation/RootNavigator.tsx');

assert.equal(
  packageJson.scripts['test:native-push-lifecycle'],
  'node scripts/nativePushLifecycle.test.js'
);
assert.match(nativeSource, /Notifications\.setNotificationHandler/);
assert.match(nativeSource, /shouldShowBanner:\s*true/);
assert.match(nativeSource, /shouldShowList:\s*true/);
assert.match(nativeSource, /shouldPlaySound:\s*true/);
assert.match(nativeSource, /syncPushSubscription\(\)/);
assert.match(nativeSource, /AppState\.addEventListener\('change'/);
assert.match(nativeSource, /nextState === 'active'/);
assert.doesNotMatch(nativeSource, /enablePushNotifications/);
assert.doesNotMatch(fallbackSource, /expo-notifications|AppState/);
assert.match(navigatorSource, /useNativePushLifecycle\(sessionUserId\)/);

console.log('native push lifecycle checks passed');
```

Add to `package.json` beside the other native push scripts:

```json
"test:native-push-lifecycle": "node scripts/nativePushLifecycle.test.js"
```

- [ ] **Step 2: Run the lifecycle test and verify it fails**

Run: `npm run test:native-push-lifecycle`

Expected: FAIL because `src/lib/useNativePushLifecycle.native.ts` does not exist.

- [ ] **Step 3: Add the platform-resolved lifecycle hook**

Create `src/lib/useNativePushLifecycle.ts`:

```ts
export const useNativePushLifecycle = (_userId: string | null) => undefined;
```

Create `src/lib/useNativePushLifecycle.native.ts`:

```ts
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

import { syncPushSubscription } from './pushNotifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const repairNativePushToken = () => {
  syncPushSubscription().then((result) => {
    if (!result.ok && !['permission-not-granted', 'not-signed-in'].includes(result.reason || '')) {
      console.warn('Could not synchronize native push token:', result.reason);
    }
  }).catch((error) => {
    console.warn('Could not synchronize native push token:', error);
  });
};

export const useNativePushLifecycle = (userId: string | null) => {
  useEffect(() => {
    if (!userId) return undefined;

    repairNativePushToken();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') repairNativePushToken();
    });

    return () => subscription.remove();
  }, [userId]);
};
```

In `src/navigation/RootNavigator.tsx`, add:

```ts
import { useNativePushLifecycle } from '../lib/useNativePushLifecycle';
```

Immediately after `sessionUserId` is defined, call the hook unconditionally:

```ts
const sessionUserId = session?.user?.id ?? null;
useNativePushLifecycle(sessionUserId);
```

- [ ] **Step 4: Run focused client tests**

Run:

```powershell
npm run test:native-push-lifecycle
npm run test:native-push-client
npm run test:pwa-startup
npx tsc --noEmit
```

Expected: all commands exit 0; the lifecycle test prints `native push lifecycle checks passed`.

- [ ] **Step 5: Commit the lifecycle change**

```powershell
git add package.json scripts/nativePushLifecycle.test.js src/lib/useNativePushLifecycle.ts src/lib/useNativePushLifecycle.native.ts src/navigation/RootNavigator.tsx
git commit -m "feat: synchronize native push lifecycle"
```

### Task 2: Native Receipt Schema And Schedule

**Files:**
- Create: `scripts/nativePushReceipts.test.js`
- Modify: `package.json`
- Create: `supabase/migrations/20260711120000_add_native_push_receipts.sql`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Write the failing receipt contract**

Create `scripts/nativePushReceipts.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const migration = read('supabase/migrations/20260711120000_add_native_push_receipts.sql');
const config = read('supabase/config.toml');
const fn = read('supabase/functions/check-native-push-receipts/index.ts');

assert.equal(packageJson.scripts['test:native-push-receipts'], 'node scripts/nativePushReceipts.test.js');
for (const column of ['receipt_status', 'receipt_checked_at', 'receipt_error_code', 'receipt_error_message']) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`, 'i'));
}
assert.match(migration, /receipt_status_check[\s\S]*pending[\s\S]*ok[\s\S]*error[\s\S]*missing/i);
assert.match(migration, /create or replace function public\.invoke_native_push_receipt_checker/i);
assert.match(migration, /beerva_push_webhook_secret/i);
assert.match(migration, /cron\.schedule\([\s\S]*beerva-check-native-push-receipts[\s\S]*\*\/15/i);
assert.match(config, /\[functions\.check-native-push-receipts\][\s\S]*verify_jwt\s*=\s*false/);
assert.match(fn, /api\/v2\/push\/getReceipts/);
assert.match(fn, /receipt_status[\s\S]*pending/);
assert.match(fn, /DeviceNotRegistered/);
assert.match(fn, /from\('native_push_tokens'\)[\s\S]*delete\(\)/);
assert.doesNotMatch(fn, /expo_push_token\s*:/, 'receipt diagnostics must not persist raw tokens');

console.log('native push receipt checks passed');
```

Add to `package.json`:

```json
"test:native-push-receipts": "node scripts/nativePushReceipts.test.js"
```

- [ ] **Step 2: Run the receipt test and verify it fails**

Run: `npm run test:native-push-receipts`

Expected: FAIL because the migration and receipt Edge Function do not exist.

- [ ] **Step 3: Create the additive receipt migration**

Create `supabase/migrations/20260711120000_add_native_push_receipts.sql`:

```sql
alter table public.native_push_delivery_attempts
  add column if not exists receipt_status text not null default 'not_requested',
  add column if not exists receipt_checked_at timestamp with time zone null,
  add column if not exists receipt_error_code text null,
  add column if not exists receipt_error_message text null;

update public.native_push_delivery_attempts
set receipt_status = 'pending'
where expo_ticket_id is not null
  and receipt_status = 'not_requested';

alter table public.native_push_delivery_attempts
  drop constraint if exists native_push_delivery_attempts_receipt_status_check;

alter table public.native_push_delivery_attempts
  add constraint native_push_delivery_attempts_receipt_status_check
  check (receipt_status in ('not_requested', 'pending', 'ok', 'error', 'missing'));

create index if not exists native_push_delivery_attempts_pending_receipt_idx
  on public.native_push_delivery_attempts(created_at)
  where receipt_status = 'pending' and expo_ticket_id is not null;

create or replace function public.invoke_native_push_receipt_checker()
returns void
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  webhook_secret text;
  edge_function_jwt text;
  request_headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
begin
  begin
    select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'beerva_push_webhook_secret'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      webhook_secret := null;
  end;

  begin
    select decrypted_secret into edge_function_jwt
    from vault.decrypted_secrets
    where name = 'beerva_edge_function_jwt'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      edge_function_jwt := null;
  end;

  if nullif(btrim(coalesce(edge_function_jwt, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object('Authorization', 'Bearer ' || edge_function_jwt);
  end if;
  if nullif(btrim(coalesce(webhook_secret, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object('x-beerva-webhook-secret', webhook_secret);
  end if;

  perform net.http_post(
    url := 'https://yzrfihijpusvjypypnip.supabase.co/functions/v1/check-native-push-receipts',
    body := '{}'::jsonb,
    headers := request_headers,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function public.invoke_native_push_receipt_checker() from public, anon, authenticated;
grant execute on function public.invoke_native_push_receipt_checker() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-check-native-push-receipts') then
    perform cron.unschedule('beerva-check-native-push-receipts');
  end if;

  perform cron.schedule(
    'beerva-check-native-push-receipts',
    '*/15 * * * *',
    $job$select public.invoke_native_push_receipt_checker();$job$
  );
end;
$$;
```

Add to `supabase/config.toml`:

```toml
[functions.check-native-push-receipts]
verify_jwt = false
```

- [ ] **Step 4: Run the receipt test and confirm only the missing function remains**

Run: `npm run test:native-push-receipts`

Expected: FAIL while reading `supabase/functions/check-native-push-receipts/index.ts`.

- [ ] **Step 5: Commit the schema and schedule**

```powershell
git add package.json scripts/nativePushReceipts.test.js supabase/config.toml supabase/migrations/20260711120000_add_native_push_receipts.sql
git commit -m "feat: schedule native push receipt checks"
```

### Task 3: Expo Receipt Processor

**Files:**
- Create: `supabase/functions/check-native-push-receipts/index.ts`
- Test: `scripts/nativePushReceipts.test.js`

- [ ] **Step 1: Implement the focused receipt processor**

Create `supabase/functions/check-native-push-receipts/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || '';
const receiptUrl = 'https://exp.host/--/api/v2/push/getReceipts';
const fifteenMinutesMs = 15 * 60 * 1000;
const twentyFourHoursMs = 24 * 60 * 60 * 1000;

type Attempt = {
  id: string;
  expo_ticket_id: string;
  native_push_token_id: string | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const errorMessage = (receipt: any) => (
  typeof receipt?.message === 'string' ? receipt.message.slice(0, 500) : null
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (webhookSecret && req.headers.get('x-beerva-webhook-secret') !== webhookSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const now = Date.now();
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from('native_push_delivery_attempts')
    .select('id, expo_ticket_id, native_push_token_id')
    .eq('receipt_status', 'pending')
    .not('expo_ticket_id', 'is', null)
    .lte('created_at', new Date(now - fifteenMinutesMs).toISOString())
    .gte('created_at', new Date(now - twentyFourHoursMs).toISOString())
    .order('created_at', { ascending: true })
    .limit(1000);

  if (error) return json({ error: error.message }, 500);
  const attempts = (data || []) as Attempt[];
  if (!attempts.length) return json({ checked: 0 });

  const response = await fetch(receiptUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: attempts.map((attempt) => attempt.expo_ticket_id) }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok || !responseBody?.data) {
    return json({ error: responseBody?.errors || response.statusText }, response.status || 502);
  }

  let staleTokens = 0;
  await Promise.all(attempts.map(async (attempt) => {
    const receipt = responseBody.data[attempt.expo_ticket_id];
    const providerCode = typeof receipt?.details?.error === 'string' ? receipt.details.error : null;
    const receiptStatus = !receipt ? 'missing' : receipt.status === 'ok' ? 'ok' : 'error';

    await supabase.from('native_push_delivery_attempts').update({
      receipt_status: receiptStatus,
      receipt_checked_at: new Date().toISOString(),
      receipt_error_code: providerCode,
      receipt_error_message: errorMessage(receipt),
    }).eq('id', attempt.id);

    if (providerCode === 'DeviceNotRegistered' && attempt.native_push_token_id) {
      const { error: deleteError } = await supabase
        .from('native_push_tokens')
        .delete()
        .eq('id', attempt.native_push_token_id);
      if (!deleteError) staleTokens += 1;
    }
  }));

  return json({ checked: attempts.length, staleTokens });
});
```

- [ ] **Step 2: Run focused receipt tests**

Run:

```powershell
npm run test:native-push-receipts
npm run test:native-push-db
```

Expected: both pass.

- [ ] **Step 3: Commit the receipt processor**

```powershell
git add supabase/functions/check-native-push-receipts/index.ts
git commit -m "feat: process Expo push receipts"
```

### Task 4: Sender Receipt State And Web Isolation

**Files:**
- Modify: `scripts/pushDelivery.test.js`
- Modify: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Add failing sender assertions**

Append to `scripts/pushDelivery.test.js`:

```js
assert.match(
  sendPushSource,
  /receipt_status:\s*params\.expoTicketId\s*\?\s*'pending'\s*:\s*'not_requested'/,
  'accepted Expo tickets should enter pending receipt state'
);
assert.match(
  sendPushSource,
  /await Promise\.all\([\s\S]*webPushSubscriptions[\s\S]*let nativeSent[\s\S]*nativePushTokens/,
  'web and native destinations should remain separate fan-out phases'
);
```

- [ ] **Step 2: Run the sender test and verify it fails**

Run: `npm run test:push-delivery`

Expected: FAIL on the missing `receipt_status` insert field.

- [ ] **Step 3: Mark accepted tickets for receipt processing**

In `recordNativePushDeliveryAttempt()` inside `supabase/functions/send-push/index.ts`, add this field to the inserted object:

```ts
receipt_status: params.expoTicketId ? 'pending' : 'not_requested',
```

Do not change the existing `push_subscriptions`, Web Push payload, VAPID options, or web diagnostic code.

- [ ] **Step 4: Run all push contracts**

```powershell
npm run test:push-delivery
npm run test:notifications
npm run test:native-push-client
npm run test:native-push-db
npm run test:native-push-receipts
npm run test:native-notification-routing
npm run test:pwa-startup
```

Expected: every command exits 0.

- [ ] **Step 5: Commit sender receipt state**

```powershell
git add scripts/pushDelivery.test.js supabase/functions/send-push/index.ts
git commit -m "feat: track native push receipt state"
```

### Task 5: Android Release Versioning

**Files:**
- Modify: `scripts/androidNativeApkConfig.test.js`
- Modify: `app.json`

- [ ] **Step 1: Require an explicit Android version code**

Add to `scripts/androidNativeApkConfig.test.js`:

```js
assert.ok(
  Number.isInteger(appJson.expo.android.versionCode) && appJson.expo.android.versionCode >= 2,
  'Android builds should use an explicit incrementing versionCode'
);
```

- [ ] **Step 2: Verify the config test fails**

Run: `npm run test:android-apk-config`

Expected: FAIL because `versionCode` is absent.

- [ ] **Step 3: Add version code 2**

In `app.json`, add under `expo.android.package`:

```json
"versionCode": 2,
```

- [ ] **Step 4: Verify configuration and Expo health**

```powershell
npm run test:android-apk-config
npx expo-doctor
npx tsc --noEmit
```

Expected: config test passes, Expo Doctor reports all checks passed, TypeScript exits 0.

- [ ] **Step 5: Commit versioning**

```powershell
git add app.json scripts/androidNativeApkConfig.test.js
git commit -m "chore: version Android notification build"
```

### Task 6: PWA Release Gate Before Deployment

**Files:**
- Verify only; no source edits expected.

- [ ] **Step 1: Run the notification and PWA regression gate**

```powershell
npm run test:push-delivery
npm run test:notifications
npm run test:pwa-startup
npm run test:push-reminder
npm run test:pwa-install
npm run test:native-push-client
npm run test:native-push-lifecycle
npm run test:native-push-db
npm run test:native-push-receipts
npm run test:native-notification-routing
npm run build:web
```

Expected: all tests pass and Expo writes the production PWA to `dist`.

- [ ] **Step 2: Verify the exported PWA server**

Run: `npm run test:serve-dist`

Expected: `serve-dist checks passed`.

- [ ] **Step 3: Confirm only intended files changed**

```powershell
git status --short
git diff --check
```

Expected: clean status after commits and no whitespace errors. If `supabase/.temp/cli-latest` only differs by a CLI version marker, do not include it in any commit.

### Task 7: Production Backend Deployment And Credential Check

**Files:**
- Deploy: `supabase/migrations/20260711120000_add_native_push_receipts.sql`
- Deploy: `supabase/functions/send-push/index.ts`
- Deploy: `supabase/functions/check-native-push-receipts/index.ts`

- [ ] **Step 1: Record current function versions for rollback**

Run: `npx supabase@2.98.2 functions list`

Expected before deployment: `send-push` is active at version 13 with update time `2026-06-01 18:42:52 UTC`; `check-native-push-receipts` is absent.

- [ ] **Step 2: Confirm the remote migration-history mismatch before writing**

Run: `npx supabase@2.98.2 migration list`

Expected: the linked database history currently records only the earliest migrations even though later schema objects are live. Do **not** run an unrestricted `db push`, because it would attempt unrelated historical files.

- [ ] **Step 3: Apply only the reviewed additive migration**

Run:

```powershell
npx supabase@2.98.2 db query --linked --file supabase/migrations/20260711120000_add_native_push_receipts.sql
npx supabase@2.98.2 migration repair 20260711120000 --status applied --linked
```

Expected: the exact receipt SQL applies successfully, and only version `20260711120000` is added to migration history. Query `information_schema.columns` afterward to confirm the four new receipt columns; do not repair unrelated historical versions in this task.

- [ ] **Step 4: Deploy both Edge Functions**

```powershell
npx supabase@2.98.2 functions deploy send-push --project-ref yzrfihijpusvjypypnip
npx supabase@2.98.2 functions deploy check-native-push-receipts --project-ref yzrfihijpusvjypypnip
```

Expected: both deployments succeed and `functions list` shows newer active versions.

- [ ] **Step 5: Verify the EAS FCM V1 credential**

Run: `npx eas-cli credentials -p android`

Select Android production credentials for `com.beerva.app`, then confirm an FCM V1 Google service-account key is assigned to Expo project `ece5f8be-c0c2-4ac2-9d14-a201c26483e4`. Do not commit the private service-account JSON.

Expected: the package, Firebase project in `google-services.json`, EAS project, and FCM V1 credential agree.

- [ ] **Step 6: Run a backend smoke notification**

Create a normal notification through an existing two-account user action. Confirm:

1. the recipient gets the in-app notification row;
2. `native_push_delivery_attempts` gets `status = 'ticket_accepted'` and `receipt_status = 'pending'`;
3. within the scheduled window, `receipt_status` becomes `ok` or an actionable `error`;
4. the existing Web Push recipient still receives its push independently.

Expected: no Web Push regression and an Expo ticket is recorded for the S22 token.

### Task 8: Android Build And Galaxy S22 Verification

**Files:**
- Build artifact only; do not commit generated native directories.

- [ ] **Step 1: Build a fresh preview APK**

Run: `npm run build:android:apk`

Expected: EAS produces an installable APK for `com.beerva.app` with version code 2.

- [ ] **Step 2: Install the update on the Galaxy S22**

Install the APK over the existing app. Confirm Android treats it as an update and retains the signed-in session or permits a normal login.

- [ ] **Step 3: Refresh the native token**

Open Beerva, sign in, background it, and reopen it. On Profile, confirm `Push notifications enabled`. Confirm the matching `native_push_tokens.last_seen_at` advances without another permission prompt.

- [ ] **Step 4: Test foreground, background, and terminated delivery**

For each app state, trigger a notification from the second account and record:

- system banner/list entry and sound;
- in-app notification row;
- Expo ticket and receipt status;
- correct destination after tapping.

Expected: all three states deliver and route correctly. “Terminated” means swiped from recents, not Android Settings > Force stop, which intentionally suppresses delivery until the app is opened again.

- [ ] **Step 5: Test recovery cases**

Repeat delivery after airplane-mode offline/reconnect and after a device reboot. Confirm delayed notifications are not duplicated and receipt diagnostics remain accurate.

- [ ] **Step 6: Final regression check**

Run:

```powershell
npm run test:push-delivery
npm run test:native-push-lifecycle
npm run test:native-push-receipts
npm run test:pwa-startup
npm run build:web
git status --short
```

Expected: all checks pass and the worktree contains no unintended files.
