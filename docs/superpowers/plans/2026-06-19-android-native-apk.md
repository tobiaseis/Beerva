# Android Native APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable Android APK for Beerva with native Android push notifications while preserving the existing PWA.

**Architecture:** Keep the current Expo React Native codebase as the single app. Add Android APK/EAS config, add a native push-token table, branch the existing push helper by platform, and extend the existing `send-push` Edge Function to fan out from the same `notifications` row to Web Push and native Expo Push tokens.

**Tech Stack:** Expo SDK 54, React Native 0.81, Supabase Postgres/RLS/Edge Functions, EAS Build, `expo-notifications`, `expo-constants`, `expo-location`, source-level Node tests.

---

## File Structure

- Create: `eas.json` - EAS profiles for installable Android APK builds.
- Modify: `app.json` - Android package id, custom scheme, native plugins, Android permissions, while preserving `expo.web`.
- Modify: `package.json` and `package-lock.json` - native push/location dependencies, build scripts, test scripts.
- Create: `scripts/androidNativeApkConfig.test.js` - source checks for APK/EAS/app config and PWA web config preservation.
- Create: `supabase/migrations/20260619120000_add_native_push_tokens.sql` - native Android token and diagnostics tables with RLS.
- Create: `scripts/nativePushDatabase.test.js` - source checks for native token and diagnostics schema.
- Modify: `src/lib/pushNotifications.ts` - keep web helpers and add Android Expo Push token registration, sync, delete, and subscription checks behind platform branches.
- Create: `scripts/nativePushClient.test.js` - source checks for Android push helper behavior and PWA branch preservation.
- Modify: `supabase/functions/send-push/index.ts` - keep Web Push delivery and add native Expo Push delivery.
- Modify: `scripts/pushDelivery.test.js` - add native push backend checks while preserving existing Web Push checks.
- Create: `src/lib/nativeNotificationRouting.ts` - native notification response listeners and URL-to-navigation target parsing.
- Modify: `src/navigation/RootNavigator.tsx` - enable `beerva://` handling and native notification tap navigation.
- Create: `scripts/nativeNotificationRouting.test.js` - source checks for native notification routing.
- Create: `src/lib/deviceLocation.ts` - shared browser/native location helper.
- Modify: `src/screens/RecordScreen.tsx` - replace browser-only geolocation helpers with shared device location helpers.
- Create: `scripts/nativeLocation.test.js` - source checks for Android location support and web fallback preservation.
- Create: `docs/android-apk.md` - concise build/setup notes for producing and installing the APK.

## External Setup Notes

- Use `npx eas-cli@latest build:configure` after code changes if the project does not already have an EAS project id.
- Use EAS-managed Android signing credentials for APK v1.
- Configure Android FCM credentials in Expo/EAS before expecting remote native pushes on the physical Samsung.
- Do not commit generated APK files or a generated `android/` directory.

### Task 1: Android APK Config And Dependency Guardrails

**Files:**
- Create: `scripts/androidNativeApkConfig.test.js`
- Create: `eas.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`

- [ ] **Step 1: Write the failing config test**

Create `scripts/androidNativeApkConfig.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const easPath = path.join(root, 'eas.json');

assert.ok(fs.existsSync(easPath), 'eas.json should exist for Android APK builds');
const easJson = JSON.parse(fs.readFileSync(easPath, 'utf8'));

assert.equal(
  packageJson.scripts['build:android:apk'],
  'eas build -p android --profile preview',
  'package script should build the installable Android APK profile'
);

assert.equal(
  packageJson.scripts['build:android:apk:local'],
  'eas build -p android --profile preview --local',
  'package script should support local APK builds'
);

for (const dependencyName of ['expo-notifications', 'expo-constants', 'expo-location']) {
  assert.ok(
    packageJson.dependencies[dependencyName],
    `${dependencyName} should be installed for native Android support`
  );
}

assert.equal(appJson.expo.scheme, 'beerva', 'app should declare a beerva:// native scheme');
assert.equal(appJson.expo.android.package, 'com.beerva.app', 'Android package id should be stable');
assert.equal(appJson.expo.android.edgeToEdgeEnabled, true, 'existing Android edge-to-edge config should remain enabled');
assert.equal(appJson.expo.android.adaptiveIcon.foregroundImage, './assets/adaptive-icon.png', 'existing adaptive icon should remain');

assert.ok(Array.isArray(appJson.expo.plugins), 'Expo plugins should be configured');
assert.ok(
  appJson.expo.plugins.some((plugin) => (
    Array.isArray(plugin)
      && plugin[0] === 'expo-notifications'
      && plugin[1].defaultChannel === 'default'
      && plugin[1].color === '#F5C542'
  )),
  'expo-notifications plugin should configure Android notification channel defaults'
);

for (const permission of [
  'CAMERA',
  'ACCESS_COARSE_LOCATION',
  'ACCESS_FINE_LOCATION',
  'POST_NOTIFICATIONS',
  'VIBRATE',
]) {
  assert.ok(
    appJson.expo.android.permissions.includes(permission),
    `Android permission ${permission} should be declared`
  );
}

assert.equal(
  easJson.build.preview.android.buildType,
  'apk',
  'preview build profile should produce an installable APK'
);
assert.equal(
  easJson.build.preview.distribution,
  'internal',
  'preview profile should be marked for internal distribution'
);

assert.equal(appJson.expo.web.output, 'single', 'PWA web output should stay single-file');
assert.equal(appJson.expo.web.display, 'standalone', 'PWA display mode should stay standalone');
assert.equal(appJson.expo.web.scope, '/', 'PWA scope should stay rooted');
assert.equal(appJson.expo.web.favicon, './assets/favicon.png', 'PWA favicon should stay unchanged');

console.log('Android native APK config checks passed');
```

- [ ] **Step 2: Run the config test and verify it fails**

Run: `node scripts/androidNativeApkConfig.test.js`

Expected: FAIL with an assertion that `eas.json` is missing or native dependencies/scripts are missing.

- [ ] **Step 3: Install compatible Expo dependencies**

Run: `npx expo install expo-notifications expo-constants expo-location`

Expected: `package.json` and `package-lock.json` update with Expo-compatible versions.

- [ ] **Step 4: Add package scripts**

Modify the `scripts` object in `package.json` to include:

```json
"build:android:apk": "eas build -p android --profile preview",
"build:android:apk:local": "eas build -p android --profile preview --local",
"test:android-apk-config": "node scripts/androidNativeApkConfig.test.js"
```

- [ ] **Step 5: Add EAS APK profile**

Create `eas.json`:

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "local"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

- [ ] **Step 6: Update Expo app config**

Modify `app.json` so the top-level `expo` object includes these fields while preserving existing `web`, `ios`, splash, icon, and Android adaptive icon fields:

```json
"scheme": "beerva",
"plugins": [
  [
    "expo-notifications",
    {
      "color": "#F5C542",
      "defaultChannel": "default"
    }
  ]
],
"android": {
  "package": "com.beerva.app",
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon.png",
    "backgroundColor": "#0D121A"
  },
  "edgeToEdgeEnabled": true,
  "predictiveBackGestureEnabled": false,
  "permissions": [
    "CAMERA",
    "ACCESS_COARSE_LOCATION",
    "ACCESS_FINE_LOCATION",
    "POST_NOTIFICATIONS",
    "VIBRATE"
  ]
}
```

- [ ] **Step 7: Run the config test and verify it passes**

Run: `node scripts/androidNativeApkConfig.test.js`

Expected: PASS with `Android native APK config checks passed`.

- [ ] **Step 8: Run PWA startup guard**

Run: `node scripts/pwaStartup.test.js`

Expected: PASS with `PWA startup checks passed`.

- [ ] **Step 9: Commit config changes**

Run:

```bash
git add app.json eas.json package.json package-lock.json scripts/androidNativeApkConfig.test.js
git commit -m "chore: configure android apk build"
```

### Task 2: Native Push Token Schema

**Files:**
- Create: `scripts/nativePushDatabase.test.js`
- Create: `supabase/migrations/20260619120000_add_native_push_tokens.sql`
- Modify: `package.json`

- [ ] **Step 1: Write the failing schema test**

Create `scripts/nativePushDatabase.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase/migrations/20260619120000_add_native_push_tokens.sql');
assert.ok(fs.existsSync(migrationPath), 'native push token migration should exist');

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:native-push-db'],
  'node scripts/nativePushDatabase.test.js',
  'package script should run native push database checks'
);

assert.match(
  migrationSql,
  /create table if not exists public\.native_push_tokens/i,
  'migration should create native_push_tokens'
);

for (const column of [
  'user_id uuid not null references auth.users\\(id\\) on delete cascade',
  'expo_push_token text not null',
  "platform text not null default 'android'",
  'device_name text null',
  'app_version text null',
  'last_seen_at timestamp with time zone not null default now\\(\\)',
]) {
  assert.match(migrationSql, new RegExp(column, 'i'), `native_push_tokens should include ${column}`);
}

assert.match(
  migrationSql,
  /unique \(user_id, expo_push_token\)/i,
  'native tokens should be unique per user and token'
);

assert.match(
  migrationSql,
  /native_push_tokens_platform_check[\s\S]*platform in \('android'\)/i,
  'native token platform should be constrained to android for v1'
);

assert.match(
  migrationSql,
  /alter table public\.native_push_tokens enable row level security/i,
  'native token table should enable RLS'
);

for (const policyName of [
  'Users can view their own native push tokens',
  'Users can insert their own native push tokens',
  'Users can update their own native push tokens',
  'Users can delete their own native push tokens',
]) {
  assert.match(migrationSql, new RegExp(policyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${policyName} policy should exist`);
}

assert.match(
  migrationSql,
  /create table if not exists public\.native_push_delivery_attempts/i,
  'migration should create native push diagnostics'
);

assert.match(
  migrationSql,
  /native_push_delivery_attempts_status_check[\s\S]*ticket_accepted[\s\S]*stale_token[\s\S]*failed/i,
  'native diagnostics should constrain statuses'
);

assert.match(
  migrationSql,
  /token_hash text not null/i,
  'native diagnostics should store token hashes instead of raw tokens'
);

assert.match(
  migrationSql,
  /alter table public\.native_push_delivery_attempts enable row level security/i,
  'native diagnostics should enable RLS'
);

const diagnosticsBlock = migrationSql.slice(
  migrationSql.search(/create table if not exists public\.native_push_delivery_attempts/i)
);
assert.doesNotMatch(
  diagnosticsBlock,
  /create policy/i,
  'native diagnostics should not expose normal user policies'
);

console.log('native push database checks passed');
```

- [ ] **Step 2: Add package script for the failing test**

Modify `package.json` scripts:

```json
"test:native-push-db": "node scripts/nativePushDatabase.test.js"
```

- [ ] **Step 3: Run the schema test and verify it fails**

Run: `node scripts/nativePushDatabase.test.js`

Expected: FAIL because `20260619120000_add_native_push_tokens.sql` does not exist.

- [ ] **Step 4: Add the native push migration**

Create `supabase/migrations/20260619120000_add_native_push_tokens.sql`:

```sql
create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'android',
  device_name text null,
  app_version text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  constraint native_push_tokens_platform_check check (platform in ('android')),
  unique (user_id, expo_push_token)
);

create index if not exists native_push_tokens_user_id_idx
  on public.native_push_tokens(user_id);

create index if not exists native_push_tokens_last_seen_at_idx
  on public.native_push_tokens(last_seen_at desc);

create or replace function public.touch_native_push_tokens_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.last_seen_at = now();
  return new;
end;
$$;

drop trigger if exists native_push_tokens_touch_updated_at on public.native_push_tokens;
create trigger native_push_tokens_touch_updated_at
  before update on public.native_push_tokens
  for each row
  execute function public.touch_native_push_tokens_updated_at();

alter table public.native_push_tokens enable row level security;

drop policy if exists "Users can view their own native push tokens" on public.native_push_tokens;
create policy "Users can view their own native push tokens"
  on public.native_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own native push tokens" on public.native_push_tokens;
create policy "Users can insert their own native push tokens"
  on public.native_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own native push tokens" on public.native_push_tokens;
create policy "Users can update their own native push tokens"
  on public.native_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own native push tokens" on public.native_push_tokens;
create policy "Users can delete their own native push tokens"
  on public.native_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.native_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  native_push_token_id uuid null references public.native_push_tokens(id) on delete set null,
  token_hash text not null,
  status text not null,
  http_status integer null,
  error_message text null,
  expo_ticket_id text null,
  created_at timestamp with time zone not null default now(),
  constraint native_push_delivery_attempts_status_check
    check (status in ('ticket_accepted', 'stale_token', 'failed'))
);

create index if not exists native_push_delivery_attempts_notification_id_idx
  on public.native_push_delivery_attempts(notification_id);

create index if not exists native_push_delivery_attempts_user_created_at_idx
  on public.native_push_delivery_attempts(user_id, created_at desc);

create index if not exists native_push_delivery_attempts_token_created_at_idx
  on public.native_push_delivery_attempts(native_push_token_id, created_at desc);

alter table public.native_push_delivery_attempts enable row level security;

comment on table public.native_push_tokens is
  'Native Android Expo push tokens per user/device. Web Push subscriptions stay in public.push_subscriptions.';

comment on table public.native_push_delivery_attempts is
  'Service-role diagnostics for native Expo Push delivery attempts. Stores token hashes, not raw Expo push tokens.';

revoke execute on function public.touch_native_push_tokens_updated_at() from public, anon, authenticated;
```

- [ ] **Step 5: Run the schema test and verify it passes**

Run: `node scripts/nativePushDatabase.test.js`

Expected: PASS with `native push database checks passed`.

- [ ] **Step 6: Commit schema changes**

Run:

```bash
git add package.json scripts/nativePushDatabase.test.js supabase/migrations/20260619120000_add_native_push_tokens.sql
git commit -m "feat: add native push token schema"
```

### Task 3: Android Push Client Branch

**Files:**
- Create: `scripts/nativePushClient.test.js`
- Modify: `src/lib/pushNotifications.ts`
- Modify: `package.json`
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/screens/ProfileSetupScreen.tsx`

- [ ] **Step 1: Write the failing client source test**

Create `scripts/nativePushClient.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/pushNotifications.ts'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:native-push-client'],
  'node scripts/nativePushClient.test.js',
  'package script should run native push client checks'
);

assert.match(source, /const isNativePushPlatform = \(\) => Platform\.OS === 'android'/, 'push helper should identify Android as native push platform');
assert.match(source, /const getNativeNotificationModules = async \(\) =>/, 'native notification modules should be dynamically imported');
assert.match(source, /import\('expo-notifications'\)/, 'native branch should dynamically import expo-notifications');
assert.match(source, /import\('expo-constants'\)/, 'native branch should dynamically import expo-constants');
assert.match(source, /setNotificationChannelAsync\('default'/, 'Android branch should create the default notification channel');
assert.match(source, /requestPermission:\s*true/, 'enable should be the only native helper path that requests notification permission');
assert.match(source, /requestPermission:\s*false/, 'native subscription checks should inspect permission without prompting');
assert.match(source, /getExpoPushTokenAsync\(\{\s*projectId\s*\}\)/, 'Android branch should request an Expo push token with the EAS project id');
assert.match(source, /\.from\('native_push_tokens'\)[\s\S]*\.upsert/, 'Android branch should upsert native push tokens');
assert.match(source, /expo_push_token:\s*token/, 'native token upsert should store expo_push_token');
assert.match(source, /platform:\s*'android'/, 'native token upsert should mark platform android');
assert.match(source, /\.from\('native_push_tokens'\)[\s\S]*\.delete\(\)/, 'disable should delete native push token rows on Android');
assert.match(source, /\.from\('native_push_tokens'\)[\s\S]*\.select\('id'\)/, 'subscription checks should query native token rows on Android');

assert.match(source, /if \(Platform\.OS === 'web'\)/, 'web push branches should remain platform-gated');
assert.match(source, /navigator\.serviceWorker\.register\('\/sw\.js'/, 'service worker registration should remain in the web path');
assert.match(source, /pushManager\.subscribe/, 'Web Push subscription path should remain');
assert.match(source, /\.from\('push_subscriptions'\)/, 'Web Push table should remain in use');
assert.doesNotMatch(
  source,
  /from 'expo-notifications'/,
  'expo-notifications should not be statically imported into the shared push helper'
);

console.log('native push client checks passed');
```

- [ ] **Step 2: Add package script for the failing test**

Modify `package.json` scripts:

```json
"test:native-push-client": "node scripts/nativePushClient.test.js"
```

- [ ] **Step 3: Run the client test and verify it fails**

Run: `node scripts/nativePushClient.test.js`

Expected: FAIL because `src/lib/pushNotifications.ts` has no Android native branch.

- [ ] **Step 4: Add Android native push helpers without replacing Web Push**

Modify `src/lib/pushNotifications.ts` with these additions near the top, after imports and before existing Web Push helpers:

```ts
type PushPermissionStatus = 'unsupported' | 'default' | 'denied' | 'granted';

type NativeNotificationModules = {
  Notifications: typeof import('expo-notifications');
  Constants: typeof import('expo-constants').default;
};

let nativePermissionStatusCache: PushPermissionStatus = 'default';

const isNativePushPlatform = () => Platform.OS === 'android';

const getNativeNotificationModules = async (): Promise<NativeNotificationModules> => {
  const [Notifications, ConstantsModule] = await Promise.all([
    import('expo-notifications'),
    import('expo-constants'),
  ]);
  return {
    Notifications,
    Constants: ConstantsModule.default,
  };
};

const getExpoProjectId = (Constants: NativeNotificationModules['Constants']) => {
  const projectId = Constants.easConfig?.projectId
    || Constants.expoConfig?.extra?.eas?.projectId;

  if (!projectId) {
    throw new Error('Expo project id is missing. Run eas build:configure before building the APK.');
  }

  return projectId;
};

const ensureAndroidNotificationChannel = async (
  Notifications: NativeNotificationModules['Notifications']
) => {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Beerva',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [120, 60, 120],
    lightColor: '#F5C542',
  });
};
```

Add native helpers below the existing `upsertPushSubscription` helper:

```ts
const upsertNativePushToken = async (
  token: string,
  userId: string,
  appVersion?: string | null
): Promise<{ ok: boolean; reason?: string }> => {
  const { error } = await supabase.from('native_push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: 'android',
      app_version: appVersion || null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_push_token' }
  );

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
};

const getNativePermissionStatus = async (): Promise<PushPermissionStatus> => {
  const { Notifications } = await getNativeNotificationModules();
  const permissions = await Notifications.getPermissionsAsync();
  nativePermissionStatusCache = permissions.status as PushPermissionStatus;
  return nativePermissionStatusCache;
};

const getCurrentNativePushToken = async (options: { requestPermission: boolean }): Promise<{
  token: string;
  appVersion?: string | null;
}> => {
  const { Notifications, Constants } = await getNativeNotificationModules();
  await ensureAndroidNotificationChannel(Notifications);

  const permissions = await Notifications.getPermissionsAsync();
  nativePermissionStatusCache = permissions.status as PushPermissionStatus;

  if (permissions.status !== 'granted') {
    if (!options.requestPermission) {
      throw new Error('Notification permission is not granted.');
    }

    const requested = await Notifications.requestPermissionsAsync();
    nativePermissionStatusCache = requested.status as PushPermissionStatus;
    if (requested.status !== 'granted') {
      throw new Error('Notification permission denied.');
    }
  }

  const projectId = getExpoProjectId(Constants);
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return {
    token,
    appVersion: Constants.expoConfig?.version || null,
  };
};

const syncNativePushToken = async (
  options: { requestPermission: boolean } = { requestPermission: false }
): Promise<{ ok: boolean; reason?: string }> => {
  if (!isNativePushPlatform()) return { ok: false, reason: 'unsupported' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'not-signed-in' };

  try {
    const nativeToken = await getCurrentNativePushToken(options);
    return upsertNativePushToken(nativeToken.token, user.id, nativeToken.appVersion);
  } catch (error: any) {
    return { ok: false, reason: error?.message || 'Could not register this device for push notifications.' };
  }
};
```

- [ ] **Step 5: Branch existing public helpers by platform**

Update public helper behavior in `src/lib/pushNotifications.ts`:

```ts
export const getPushSupportInfo = (): PushSupportInfo => {
  if (isNativePushPlatform()) {
    return { supported: true };
  }

  if (Platform.OS !== 'web') {
    return { supported: false, reason: 'Push notifications are only configured for web and Android.' };
  }

  // The current web support checks continue after this Android branch.
};

export const getPushPermissionStatus = (): PushPermissionStatus => {
  if (isNativePushPlatform()) return nativePermissionStatusCache;
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
};

export const syncPushSubscription = async (): Promise<{ ok: boolean; reason?: string }> => {
  if (isNativePushPlatform()) {
    return syncNativePushToken({ requestPermission: false });
  }

  // The current Web Push sync implementation continues after this Android branch.
};

export const enablePushNotifications = async (): Promise<{ ok: boolean; reason?: string }> => {
  if (isNativePushPlatform()) {
    return syncNativePushToken({ requestPermission: true });
  }

  // The current Web Push enable implementation continues after this Android branch.
};

export const disablePushNotifications = async (): Promise<void> => {
  if (isNativePushPlatform()) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const nativeToken = await getCurrentNativePushToken({ requestPermission: false });
      await supabase
        .from('native_push_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('expo_push_token', nativeToken.token);
    } catch (error) {
      console.warn('Could not disable native push notifications', error);
    }
    return;
  }

  // The current Web Push disable implementation continues after this Android branch.
};

export const isCurrentlySubscribed = async (): Promise<boolean> => {
  if (isNativePushPlatform()) {
    const permission = await getNativePermissionStatus();
    if (permission !== 'granted') return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const syncResult = await syncNativePushToken({ requestPermission: false });
    if (!syncResult.ok) return false;

    const nativeToken = await getCurrentNativePushToken({ requestPermission: false });
    const { data, error } = await supabase
      .from('native_push_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('expo_push_token', nativeToken.token)
      .maybeSingle();

    if (error) {
      console.warn('Could not verify stored native push token', error);
      return false;
    }

    return Boolean(data);
  }

  // The current Web Push subscription check continues after this Android branch.
};
```

Keep `registerServiceWorker()` unchanged except for any type changes needed to compile.

- [ ] **Step 6: Update blocked notification copy in profile screens**

In `src/screens/ProfileScreen.tsx` and `src/screens/ProfileSetupScreen.tsx`, change browser-specific denied copy to platform-neutral copy:

```ts
'Notifications are blocked for Beerva. Re-enable them in your device or browser settings, then try again.'
```

- [ ] **Step 7: Run native client and PWA push tests**

Run:

```bash
node scripts/nativePushClient.test.js
node scripts/pwaStartup.test.js
node scripts/pushReminderPrompt.test.js
```

Expected:

- `native push client checks passed`
- `PWA startup checks passed`
- `push reminder checks passed`

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 9: Commit native client push changes**

Run:

```bash
git add package.json scripts/nativePushClient.test.js src/lib/pushNotifications.ts src/screens/ProfileScreen.tsx src/screens/ProfileSetupScreen.tsx
git commit -m "feat: register native android push tokens"
```

### Task 4: Backend Native Push Fan-Out

**Files:**
- Modify: `scripts/pushDelivery.test.js`
- Modify: `supabase/functions/send-push/index.ts`

- [ ] **Step 1: Add failing backend native push assertions**

Append these assertions to `scripts/pushDelivery.test.js` before the final `console.log`:

```js
assert.match(
  sendPushSource,
  /type NativePushTokenRow = \{/,
  'send-push should define native push token rows'
);

assert.match(
  sendPushSource,
  /\.from\('native_push_tokens'\)[\s\S]*\.select\('id, expo_push_token'\)[\s\S]*\.eq\('user_id', record\.user_id\)/,
  'send-push should fetch native Expo push tokens for the notification recipient'
);

assert.match(
  sendPushSource,
  /const EXPO_PUSH_SEND_URL = 'https:\/\/exp\.host\/--\/api\/v2\/push\/send'/,
  'send-push should send native notifications through Expo Push Service'
);

assert.match(
  sendPushSource,
  /fetch\(EXPO_PUSH_SEND_URL/,
  'send-push should call Expo Push Service'
);

assert.match(
  sendPushSource,
  /recordNativePushDeliveryAttempt/,
  'send-push should record native push delivery diagnostics'
);

assert.match(
  sendPushSource,
  /\.from\('native_push_delivery_attempts'\)[\s\S]*\.insert/,
  'native push diagnostics should be inserted into native_push_delivery_attempts'
);

assert.match(
  sendPushSource,
  /crypto\.subtle\.digest\('SHA-256'[\s\S]*expo_push_token/,
  'send-push should hash native tokens before recording diagnostics'
);

assert.match(
  sendPushSource,
  /DeviceNotRegistered/,
  'send-push should detect stale Expo push tokens'
);

assert.match(
  sendPushSource,
  /\.from\('native_push_tokens'\)[\s\S]*\.delete\(\)[\s\S]*\.eq\('expo_push_token'/,
  'send-push should delete stale native tokens'
);

assert.match(
  sendPushSource,
  /data:\s*\{\s*url:\s*nativeUrl,\s*notificationId:\s*record\.id/,
  'native push payload should include route data and notification id'
);
```

- [ ] **Step 2: Run push delivery test and verify it fails**

Run: `node scripts/pushDelivery.test.js`

Expected: FAIL because `send-push` does not fetch or send native tokens yet.

- [ ] **Step 3: Add native push constants and types**

In `supabase/functions/send-push/index.ts`, add after `PUSH_SEND_OPTIONS`:

```ts
const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';

type NativePushDeliveryStatus = 'ticket_accepted' | 'stale_token' | 'failed';

type NativePushTokenRow = {
  id: string;
  expo_push_token: string;
};
```

- [ ] **Step 4: Add native diagnostics helpers**

Add below `recordPushDeliveryAttempt`:

```ts
const getNativeTokenHash = async (expo_push_token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expo_push_token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const recordNativePushDeliveryAttempt = async (
  supabase: ReturnType<typeof createClient>,
  params: {
    notificationId: string;
    userId: string;
    nativePushTokenId: string;
    tokenHash: string;
    status: NativePushDeliveryStatus;
    httpStatus?: number | null;
    errorMessage?: string | null;
    expoTicketId?: string | null;
  }
) => {
  const { error } = await supabase
    .from('native_push_delivery_attempts')
    .insert({
      notification_id: params.notificationId,
      user_id: params.userId,
      native_push_token_id: params.nativePushTokenId,
      token_hash: params.tokenHash,
      status: params.status,
      http_status: params.httpStatus ?? null,
      error_message: params.errorMessage ?? null,
      expo_ticket_id: params.expoTicketId ?? null,
    });

  if (error) {
    console.error('Native push delivery diagnostic insert error', error.message);
  }
};

const getExpoPushErrorMessage = (ticket: any) => {
  const message = ticket?.message;
  return typeof message === 'string' && message.trim()
    ? message.slice(0, 500)
    : null;
};

const isDeviceNotRegistered = (ticket: any) => (
  ticket?.details?.error === 'DeviceNotRegistered'
);
```

- [ ] **Step 5: Fetch native tokens with existing notification data**

Add `{ data: nativeTokens }` to the existing `Promise.all` destructuring and add this promise beside the `push_subscriptions` query:

```ts
supabase
  .from('native_push_tokens')
  .select('id, expo_push_token')
  .eq('user_id', record.user_id),
```

Cast usage as:

```ts
const nativePushTokens = (nativeTokens || []) as NativePushTokenRow[];
```

Keep the existing early return only if both subscription lists are empty:

```ts
if ((!subscriptions || subscriptions.length === 0) && nativePushTokens.length === 0) {
  return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), { status: 200 });
}
```

- [ ] **Step 6: Build native URL and send native pushes**

After the existing Web Push `payload` construction, add:

```ts
const nativeUrl = url.startsWith('/')
  ? `beerva://open${url}`
  : `beerva://open/${url}`;
```

After the block that starts `await Promise.all(` and maps `subscriptions.map(async (sub: PushSubscriptionRow) => {`, add:

```ts
let nativeSent = 0;
await Promise.all(
  nativePushTokens.map(async (nativeToken) => {
    const tokenHash = await getNativeTokenHash(nativeToken.expo_push_token);
    const nativePayload = {
      to: nativeToken.expo_push_token,
      title,
      body: bodyText || 'You have a new notification',
      sound: 'default',
      channelId: 'default',
      priority: 'high',
      data: {
        url: nativeUrl,
        notificationId: record.id,
        type: record.type,
      },
    };

    try {
      const response = await fetch(EXPO_PUSH_SEND_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(nativePayload),
      });

      const responseBody = await response.json().catch(() => null);
      const ticket = Array.isArray(responseBody?.data) ? responseBody.data[0] : responseBody?.data;

      if (!response.ok || ticket?.status === 'error') {
        const errorMessage = getExpoPushErrorMessage(ticket) || response.statusText || 'Expo push send failed.';

        if (isDeviceNotRegistered(ticket)) {
          await supabase
            .from('native_push_tokens')
            .delete()
            .eq('expo_push_token', nativeToken.expo_push_token);
          await recordNativePushDeliveryAttempt(supabase, {
            notificationId: record.id,
            userId: record.user_id,
            nativePushTokenId: nativeToken.id,
            tokenHash,
            status: 'stale_token',
            httpStatus: response.status,
            errorMessage,
          });
          return;
        }

        await recordNativePushDeliveryAttempt(supabase, {
          notificationId: record.id,
          userId: record.user_id,
          nativePushTokenId: nativeToken.id,
          tokenHash,
          status: 'failed',
          httpStatus: response.status,
          errorMessage,
        });
        return;
      }

      nativeSent += 1;
      await recordNativePushDeliveryAttempt(supabase, {
        notificationId: record.id,
        userId: record.user_id,
        nativePushTokenId: nativeToken.id,
        tokenHash,
        status: 'ticket_accepted',
        httpStatus: response.status,
        expoTicketId: typeof ticket?.id === 'string' ? ticket.id : null,
      });
    } catch (error: any) {
      await recordNativePushDeliveryAttempt(supabase, {
        notificationId: record.id,
        userId: record.user_id,
        nativePushTokenId: nativeToken.id,
        tokenHash,
        status: 'failed',
        errorMessage: error?.message || 'Native push send failed.',
      });
    }
  })
);
```

Change the final response to include both counts:

```ts
return new Response(JSON.stringify({
  sent,
  nativeSent,
  total: subscriptions.length,
  nativeTotal: nativePushTokens.length,
}), { status: 200 });
```

- [ ] **Step 7: Run backend delivery tests**

Run:

```bash
node scripts/pushDelivery.test.js
node scripts/nativePushDatabase.test.js
```

Expected:

- `push delivery checks passed`
- `native push database checks passed`

- [ ] **Step 8: Commit backend native push changes**

Run:

```bash
git add scripts/pushDelivery.test.js supabase/functions/send-push/index.ts
git commit -m "feat: fan out push to native android tokens"
```

### Task 5: Native Notification Tap Routing

**Files:**
- Create: `scripts/nativeNotificationRouting.test.js`
- Create: `src/lib/nativeNotificationRouting.ts`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write the failing routing test**

Create `scripts/nativeNotificationRouting.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'src/lib/nativeNotificationRouting.ts');
assert.ok(fs.existsSync(helperPath), 'native notification routing helper should exist');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const navigatorSource = fs.readFileSync(path.join(root, 'src/navigation/RootNavigator.tsx'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:native-notification-routing'],
  'node scripts/nativeNotificationRouting.test.js',
  'package script should run native notification routing checks'
);

assert.match(helperSource, /import\('expo-notifications'\)/, 'routing helper should dynamically import expo-notifications');
assert.match(helperSource, /getLastNotificationResponseAsync/, 'routing helper should read cold-start notification responses');
assert.match(helperSource, /addNotificationResponseReceivedListener/, 'routing helper should subscribe to notification taps');
assert.match(helperSource, /export type NativeNotificationTarget/, 'routing helper should expose typed targets');
assert.match(helperSource, /beerva:\/\/open/, 'routing helper should understand beerva://open URLs');
assert.match(helperSource, /notifications=1/, 'routing helper should parse notifications list launch URLs');
assert.match(helperSource, /post_type/, 'routing helper should parse post detail launch URLs');
assert.match(helperSource, /hangover=1/, 'routing helper should parse hangover launch URLs');
assert.match(helperSource, /chug_verification=1/, 'routing helper should parse chug verification launch URLs');
assert.match(helperSource, /challenge=/, 'routing helper should parse challenge launch URLs');

assert.match(
  navigatorSource,
  /import \{[\s\S]*consumeInitialNativeNotificationTarget[\s\S]*subscribeToNativeNotificationTargets[\s\S]*\} from '\.\.\/lib\/nativeNotificationRouting';/,
  'RootNavigator should import native notification routing helpers'
);

assert.match(
  navigatorSource,
  /prefixes:\s*Platform\.OS === 'web' \? \[\] : \['beerva:\/\/'\]/,
  'React Navigation linking should include the native beerva scheme only on native'
);

assert.match(
  navigatorSource,
  /consumeInitialNativeNotificationTarget\(\)/,
  'RootNavigator should handle cold-start notification taps'
);

assert.match(
  navigatorSource,
  /subscribeToNativeNotificationTargets/,
  'RootNavigator should subscribe to notification taps while running'
);

assert.match(
  navigatorSource,
  /handleNativeNotificationTarget/,
  'RootNavigator should route native notification targets through a single handler'
);

console.log('native notification routing checks passed');
```

- [ ] **Step 2: Add package script and run failing test**

Modify `package.json` scripts:

```json
"test:native-notification-routing": "node scripts/nativeNotificationRouting.test.js"
```

Run: `node scripts/nativeNotificationRouting.test.js`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Create native notification routing helper**

Create `src/lib/nativeNotificationRouting.ts`:

```ts
import { Platform } from 'react-native';

import { getChallengeLaunchParamsFromSearch } from './challengeLaunchParams';
import { getPostLaunchParamsFromSearch } from './postTargets';

export type NativeNotificationTarget =
  | { kind: 'notifications'; notificationId?: string | null }
  | { kind: 'record' }
  | { kind: 'post'; targetType: 'session' | 'pub_crawl'; targetId: string; notificationId?: string | null }
  | { kind: 'hangover'; targetType: 'session' | 'pub_crawl'; targetId: string; notificationId?: string | null }
  | { kind: 'chugVerification'; attemptId: string; notificationId?: string | null }
  | { kind: 'challenge'; challengeSlug: string; notificationId?: string | null };

const getSearchFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.search || '';
  } catch {
    const queryIndex = url.indexOf('?');
    return queryIndex === -1 ? '' : url.slice(queryIndex);
  }
};

const cleanString = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const getNativeNotificationTargetFromUrl = (url?: string | null): NativeNotificationTarget | null => {
  if (!url) return null;
  const search = getSearchFromUrl(url);
  const params = new URLSearchParams(search);

  const challenge = getChallengeLaunchParamsFromSearch(search);
  if (challenge) {
    return { kind: 'challenge', challengeSlug: challenge.challengeSlug, notificationId: challenge.notificationId };
  }

  const post = getPostLaunchParamsFromSearch(search);
  if (post) {
    return {
      kind: 'post',
      targetType: post.targetType,
      targetId: post.targetId,
      notificationId: post.notificationId,
    };
  }

  if (params.get('hangover') === '1') {
    const targetType = params.get('target_type') === 'pub_crawl' ? 'pub_crawl' : 'session';
    const targetId = cleanString(params.get('target_id') || params.get('id'));
    if (targetId) {
      return {
        kind: 'hangover',
        targetType,
        targetId,
        notificationId: cleanString(params.get('notificationId')),
      };
    }
  }

  if (params.get('chug_verification') === '1') {
    const attemptId = cleanString(params.get('attempt_id') || params.get('id'));
    if (attemptId) {
      return {
        kind: 'chugVerification',
        attemptId,
        notificationId: cleanString(params.get('notificationId')),
      };
    }
  }

  if (params.get('tab') === 'record') {
    return { kind: 'record' };
  }

  if (params.get('notifications') === '1') {
    return {
      kind: 'notifications',
      notificationId: cleanString(params.get('notificationId')),
    };
  }

  if (url.startsWith('beerva://open')) {
    return { kind: 'notifications' };
  }

  return null;
};

const getTargetFromNotificationResponse = (response: any) => {
  const url = response?.notification?.request?.content?.data?.url;
  return typeof url === 'string' ? getNativeNotificationTargetFromUrl(url) : null;
};

export const consumeInitialNativeNotificationTarget = async () => {
  if (Platform.OS === 'web') return null;
  const Notifications = await import('expo-notifications');
  const response = await Notifications.getLastNotificationResponseAsync();
  return getTargetFromNotificationResponse(response);
};

export const subscribeToNativeNotificationTargets = (
  listener: (target: NativeNotificationTarget) => void
) => {
  if (Platform.OS === 'web') {
    return { remove: () => {} };
  }

  let active = true;
  let subscription: { remove: () => void } | null = null;

  import('expo-notifications').then((Notifications) => {
    if (!active) return;
    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = getTargetFromNotificationResponse(response);
      if (target) listener(target);
    });
  }).catch((error) => {
    console.warn('Could not subscribe to native notification responses', error);
  });

  return {
    remove: () => {
      active = false;
      subscription?.remove();
    },
  };
};
```

- [ ] **Step 4: Wire native notification routing in RootNavigator**

In `src/navigation/RootNavigator.tsx`, import:

```ts
import {
  consumeInitialNativeNotificationTarget,
  NativeNotificationTarget,
  subscribeToNativeNotificationTargets,
} from '../lib/nativeNotificationRouting';
```

Change linking prefixes:

```ts
prefixes: Platform.OS === 'web' ? [] : ['beerva://'],
```

Inside `RootNavigator`, add a callback after `openPushReminderProfileHint`:

```ts
const handleNativeNotificationTarget = useCallback((target: NativeNotificationTarget) => {
  if (!navigationRef.isReady()) return false;

  if (target.kind === 'hangover') {
    navigationRef.navigate('HangoverRating', {
      targetType: target.targetType,
      targetId: target.targetId,
      notificationId: target.notificationId,
    });
    return true;
  }

  if (target.kind === 'post') {
    navigationRef.navigate('PostDetail', {
      targetType: target.targetType,
      targetId: target.targetId,
      notificationId: target.notificationId,
      sessionId: target.targetType === 'session' ? target.targetId : undefined,
    });
    return true;
  }

  if (target.kind === 'chugVerification') {
    navigationRef.navigate('ChugVerification', {
      attemptId: target.attemptId,
      notificationId: target.notificationId,
    });
    return true;
  }

  if (target.kind === 'challenge') {
    navigationRef.navigate('ChallengeDetail', { challengeSlug: target.challengeSlug });
    markNotificationRead(target.notificationId);
    return true;
  }

  if (target.kind === 'record') {
    navigationRef.navigate('MainTabs', { screen: 'Record' });
    return true;
  }

  navigationRef.navigate('Notifications');
  markNotificationRead(target.notificationId);
  return true;
}, []);
```

Add state/ref for pending native targets:

```ts
const pendingNativeNotificationTargetRef = useRef<NativeNotificationTarget | null>(null);
```

Add an effect after auth/session bootstrap effects:

```ts
useEffect(() => {
  if (Platform.OS === 'web') return undefined;

  let active = true;
  consumeInitialNativeNotificationTarget().then((target) => {
    if (!active || !target) return;
    pendingNativeNotificationTargetRef.current = target;
  }).catch((error) => {
    console.warn('Could not read initial native notification response', error);
  });

  const subscription = subscribeToNativeNotificationTargets((target) => {
    if (!handleNativeNotificationTarget(target)) {
      pendingNativeNotificationTargetRef.current = target;
    }
  });

  return () => {
    active = false;
    subscription.remove();
  };
}, [handleNativeNotificationTarget]);
```

At the start of the existing launch-param handling effect, before web pending refs:

```ts
const pendingNativeTarget = pendingNativeNotificationTargetRef.current;
if (pendingNativeTarget && handleNativeNotificationTarget(pendingNativeTarget)) {
  pendingNativeNotificationTargetRef.current = null;
  return;
}
```

- [ ] **Step 5: Run routing and navigation tests**

Run:

```bash
node scripts/nativeNotificationRouting.test.js
node scripts/navigationBackHistory.test.js
```

Expected:

- `native notification routing checks passed`
- existing navigation back-history test passes

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit routing changes**

Run:

```bash
git add package.json scripts/nativeNotificationRouting.test.js src/lib/nativeNotificationRouting.ts src/navigation/RootNavigator.tsx
git commit -m "feat: route native notification taps"
```

### Task 6: Native Location For Nearby Pub Features

**Files:**
- Create: `scripts/nativeLocation.test.js`
- Create: `src/lib/deviceLocation.ts`
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write the failing native location test**

Create `scripts/nativeLocation.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'src/lib/deviceLocation.ts');
assert.ok(fs.existsSync(helperPath), 'device location helper should exist');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const recordSource = fs.readFileSync(path.join(root, 'src/screens/RecordScreen.tsx'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:native-location'],
  'node scripts/nativeLocation.test.js',
  'package script should run native location checks'
);

assert.match(helperSource, /import \{ Platform \} from 'react-native'/, 'location helper should branch by platform');
assert.match(helperSource, /import\('expo-location'\)/, 'native branch should dynamically import expo-location');
assert.match(helperSource, /requestForegroundPermissionsAsync/, 'native location should request foreground permission');
assert.match(helperSource, /getCurrentPositionAsync/, 'native location should read current GPS position');
assert.match(helperSource, /getForegroundPermissionsAsync/, 'native passive location should check existing permission');
assert.match(helperSource, /navigator\.geolocation/, 'web location fallback should keep browser geolocation');

assert.match(
  recordSource,
  /import \{ getCurrentDeviceLocation, getPreviouslyGrantedDeviceLocation \} from '\.\.\/lib\/deviceLocation';/,
  'RecordScreen should import shared device location helpers'
);

assert.doesNotMatch(
  recordSource,
  /const getCurrentBrowserLocation =/,
  'RecordScreen should no longer define browser-only current location helper'
);

assert.doesNotMatch(
  recordSource,
  /const getPreviouslyGrantedBrowserLocation =/,
  'RecordScreen should no longer define browser-only passive location helper'
);

assert.match(recordSource, /getCurrentDeviceLocation\(\)/, 'RecordScreen should request shared current device location');
assert.match(recordSource, /getPreviouslyGrantedDeviceLocation\(\)/, 'RecordScreen should pre-warm location with shared helper');

console.log('native location checks passed');
```

- [ ] **Step 2: Add package script and run failing test**

Modify `package.json` scripts:

```json
"test:native-location": "node scripts/nativeLocation.test.js"
```

Run: `node scripts/nativeLocation.test.js`

Expected: FAIL because `src/lib/deviceLocation.ts` does not exist.

- [ ] **Step 3: Create shared location helper**

Create `src/lib/deviceLocation.ts`:

```ts
import { Platform } from 'react-native';

import type { UserLocation } from './pubDirectory';

const PUB_LOCATION_TIMEOUT_MS = 9000;

const getCurrentBrowserLocation = () => new Promise<UserLocation>((resolve, reject) => {
  const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null;
  if (!geolocation) {
    reject(new Error('Location is not available on this device.'));
    return;
  }

  geolocation.getCurrentPosition(
    (position) => {
      resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    (error) => {
      reject(new Error(error.message || 'Could not get your location.'));
    },
    {
      enableHighAccuracy: true,
      timeout: PUB_LOCATION_TIMEOUT_MS,
      maximumAge: 1000 * 60 * 8,
    }
  );
});

const getPreviouslyGrantedBrowserLocation = async () => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  const permissions = navigator.permissions;
  if (!permissions?.query) return null;

  try {
    const status = await permissions.query({ name: 'geolocation' as PermissionName });
    if (status.state !== 'granted') return null;
  } catch {
    return null;
  }

  try {
    return await getCurrentBrowserLocation();
  } catch {
    return null;
  }
};

const getCurrentNativeLocation = async (): Promise<UserLocation> => {
  const Location = await import('expo-location');
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location access is needed to find nearby pubs.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
};

const getPreviouslyGrantedNativeLocation = async (): Promise<UserLocation | null> => {
  const Location = await import('expo-location');
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
};

export const getCurrentDeviceLocation = async (): Promise<UserLocation> => {
  if (Platform.OS === 'web') return getCurrentBrowserLocation();
  return getCurrentNativeLocation();
};

export const getPreviouslyGrantedDeviceLocation = async (): Promise<UserLocation | null> => {
  if (Platform.OS === 'web') return getPreviouslyGrantedBrowserLocation();
  return getPreviouslyGrantedNativeLocation();
};
```

- [ ] **Step 4: Replace browser-only helpers in RecordScreen**

In `src/screens/RecordScreen.tsx`, add import:

```ts
import { getCurrentDeviceLocation, getPreviouslyGrantedDeviceLocation } from '../lib/deviceLocation';
```

Remove the local `PUB_LOCATION_TIMEOUT_MS` constant, the local `getCurrentBrowserLocation` function declaration, and the local `getPreviouslyGrantedBrowserLocation` function declaration from `src/screens/RecordScreen.tsx`.

Replace all `getCurrentBrowserLocation()` calls with:

```ts
getCurrentDeviceLocation()
```

Replace all `getPreviouslyGrantedBrowserLocation()` calls with:

```ts
getPreviouslyGrantedDeviceLocation()
```

- [ ] **Step 5: Run location and record tests**

Run:

```bash
node scripts/nativeLocation.test.js
node scripts/recordPlaceCategory.test.js
node scripts/recordSessionDrinks.test.js
```

Expected:

- `native location checks passed`
- existing record tests pass

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit native location changes**

Run:

```bash
git add package.json scripts/nativeLocation.test.js src/lib/deviceLocation.ts src/screens/RecordScreen.tsx
git commit -m "feat: support native nearby pub location"
```

### Task 7: APK Build Notes And Full Regression Pass

**Files:**
- Create: `docs/android-apk.md`

- [ ] **Step 1: Create APK build notes**

Create `docs/android-apk.md`:

```md
# Android APK Build Notes

Beerva keeps one Expo codebase for web/PWA and Android native.

## Build Setup

1. Log in to Expo:

```bash
npx eas-cli@latest login
```

2. Configure the EAS project if `app.json` does not already contain `expo.extra.eas.projectId`:

```bash
npx eas-cli@latest build:configure
```

3. Configure Android FCM credentials in Expo/EAS for native push notifications.

4. Build an installable APK:

```bash
npm run build:android:apk
```

5. Install on a physical Android device from the EAS build URL, or with adb:

```bash
adb install path/to/beerva.apk
```

## Verification

- Log in with the same account used in the PWA.
- Confirm feed posts match the PWA.
- Create an Android post and confirm it appears in the PWA.
- Create a PWA post and confirm it appears in Android.
- Enable push notifications on Android.
- Trigger a notification from another account.
- Confirm the Android notification arrives and opens the correct Beerva screen.
- Confirm the PWA still installs, updates, and receives Web Push independently.
```

- [ ] **Step 2: Run focused source tests**

Run:

```bash
node scripts/androidNativeApkConfig.test.js
node scripts/nativePushDatabase.test.js
node scripts/nativePushClient.test.js
node scripts/pushDelivery.test.js
node scripts/nativeNotificationRouting.test.js
node scripts/nativeLocation.test.js
node scripts/pwaStartup.test.js
node scripts/pushReminderPrompt.test.js
node scripts/authSession.test.js
node scripts/navigationBackHistory.test.js
node scripts/chugProofStorage.test.js
node scripts/chugRecordScreen.test.js
node scripts/chugVerificationScreen.test.js
```

Expected: all commands PASS with their success messages.

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run web build to protect the PWA**

Run: `npm run build:web`

Expected: PASS and `dist/` is regenerated without errors. Do not commit generated `dist/` changes unless this repo normally tracks them for deployments.

- [ ] **Step 5: Run APK build configuration command if needed**

Run: `npx eas-cli@latest build:configure`

Expected:

- If already configured, command exits without meaningful changes.
- If not configured, `app.json` gains `expo.extra.eas.projectId`.
- If login is required, log in with the project Expo account and rerun.

- [ ] **Step 6: Build APK**

Run: `npm run build:android:apk`

Expected:

- EAS creates an Android APK build.
- The command prints an install/download URL.
- No APK artifact is committed to git.

- [ ] **Step 7: Manual Samsung verification**

Perform on a physical Samsung:

1. Install the APK.
2. Log in with an existing Beerva account.
3. Confirm feed matches the PWA.
4. Create a session/post on Android and confirm it appears on PWA.
5. Create a session/post on PWA and confirm it appears on Android.
6. Upload a session photo or avatar.
7. Use Nearby pub lookup.
8. Enable Android push notifications.
9. Trigger a notification from another account.
10. Confirm Android receives the push.
11. Tap the notification and confirm it opens the correct screen.
12. Confirm PWA Web Push still works from a browser/PWA subscription.

- [ ] **Step 8: Commit docs and final config**

Run:

```bash
git add docs/android-apk.md app.json
git commit -m "docs: add android apk build notes"
```

Only include `app.json` if `eas build:configure` added `expo.extra.eas.projectId`.

## Plan Self-Review

- Spec coverage: The plan covers APK config, native push schema, native client registration, backend fan-out, notification tap routing, native location, PWA regression tests, and manual Samsung verification.
- PWA protection: Tasks keep Web Push, service worker startup, PWA install prompt behavior, and web build checks intact.
- Type consistency: Native token table is `native_push_tokens`; diagnostics table is `native_push_delivery_attempts`; client source uses `expo_push_token`; Edge Function row type uses `NativePushTokenRow`.
- Scope: Google Play release, iOS native app, direct FCM sends, and native chug video playback are not included in APK v1.
