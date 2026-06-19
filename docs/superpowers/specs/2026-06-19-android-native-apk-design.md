# Android Native APK Design

## Context

Beerva is already built as an Expo React Native app that exports to web as a PWA. The current PWA uses Supabase for auth, feed data, storage, realtime notifications, and Web Push. Android users can install the PWA today, but Web Push reliability is limited by browser and operating-system behavior.

The goal is to add an installable native Android APK for Samsung and other Android users while keeping the PWA path intact for iPhone and web users.

## Goals

- Produce an installable Android APK.
- Keep the current PWA working as-is.
- Keep one shared Supabase backend, database, auth user base, storage, feed, and notification table.
- Support native Android push notifications in the APK.
- Let Android users create posts, record sessions, upload media, receive notifications, and see the same feed as PWA users.
- Make the Android work additive and platform-gated so web behavior is not accidentally replaced.

## Non-Goals

- Do not publish to Google Play in this change.
- Do not build a separate Android rewrite.
- Do not remove or replace the PWA.
- Do not migrate iPhone users to native iOS yet.
- Do not replace the existing Web Push implementation for PWA users.
- Do not change the Supabase project or split production data across environments.

## Recommended Approach

Keep Beerva as one Expo codebase with two distribution targets:

- `npm run build:web` continues producing the PWA.
- A new EAS `preview` build profile produces an installable Android `.apk`.

The Android APK uses native capabilities where the current shared code already supports them: AsyncStorage auth persistence, native image upload, haptics, sensors, and React Native navigation. Native push is added with `expo-notifications` and `expo-constants`.

The backend notification pipeline remains centered on `public.notifications` and the existing `send-push` Supabase Edge Function. When a notification row is inserted, `send-push` sends to:

- existing Web Push subscriptions in `public.push_subscriptions`
- new native Android Expo push tokens in `public.native_push_tokens`

This keeps in-app notifications, feed updates, and push delivery driven by the same notification row.

## PWA Safety

The PWA must remain stable throughout this work.

- Keep `public/sw.js`, VAPID Web Push, PWA install prompts, service worker update handling, and web routing.
- Keep `public.push_subscriptions` dedicated to Web Push subscriptions.
- Store Android native tokens in a separate table so native push bugs cannot corrupt browser subscriptions.
- Keep the public push helper API in `src/lib/pushNotifications.ts`, but branch internally by platform.
- Use dynamic imports for native-only notification code if needed so web bundles do not require native push modules at runtime.
- Keep `Platform.OS === 'web'` guards around browser APIs.
- Add source tests that assert the web push path still registers service workers, still upserts Web Push subscriptions, and still does not depend on native tokens.

## APK Build

Add EAS build configuration without committing a generated native `android/` directory.

Add `eas.json` with an Android preview profile:

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

Add Android app identity in `app.json`:

- `expo.scheme`: `beerva`
- `expo.android.package`: `com.beerva.app`
- retain existing app name, icon, adaptive icon, splash, and web manifest settings
- add Android notification plugin config for `expo-notifications`
- add Android permissions required by existing features

Add package scripts:

- `build:android:apk`: `eas build -p android --profile preview`
- optionally `build:android:apk:local`: `eas build -p android --profile preview --local`

EAS requires an Expo account and Android signing credentials. For APK v1, EAS-managed credentials are acceptable.

## Native Push Data Model

Add a table for native device tokens:

```sql
create table public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'android',
  device_name text null,
  app_version text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint native_push_tokens_platform_check check (platform in ('android')),
  unique (user_id, expo_push_token)
);
```

Enable RLS:

- Users can select their own native token rows.
- Users can insert their own native token rows.
- Users can update their own native token rows.
- Users can delete their own native token rows.

Add indexes:

- `native_push_tokens_user_id_idx` on `(user_id)`
- `native_push_tokens_last_seen_at_idx` on `(last_seen_at desc)`

Add a native diagnostics table instead of changing the existing Web Push diagnostics shape:

```sql
create table public.native_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  native_push_token_id uuid null references public.native_push_tokens(id) on delete set null,
  token_hash text not null,
  status text not null,
  http_status integer null,
  error_message text null,
  expo_ticket_id text null,
  created_at timestamptz not null default now(),
  constraint native_push_delivery_attempts_status_check
    check (status in ('ticket_accepted', 'stale_token', 'failed'))
);
```

Enable RLS on diagnostics with no normal user read policies. The Edge Function writes diagnostics with the service role key.

## Native Push Client Flow

On Android, `enablePushNotifications()` should:

1. Create an Android notification channel before requesting or fetching a token.
2. Check existing notification permission.
3. Request notification permission if needed.
4. Read the EAS project id from Expo config through `expo-constants`.
5. Call `Notifications.getExpoPushTokenAsync({ projectId })`.
6. Upsert the token into `public.native_push_tokens` for the signed-in Supabase user.
7. Return `{ ok: true }` when the token is stored.

On Android, `disablePushNotifications()` should:

1. Get the current Expo push token when possible.
2. Delete that token row for the signed-in user.
3. Leave Web Push subscriptions untouched.

On Android, `isCurrentlySubscribed()` should:

1. Return false if permission is not granted.
2. Get the current Expo push token.
3. Confirm a matching `native_push_tokens` row exists for the user.
4. Re-upsert the token if permission is granted but the row is missing.

On web, these same public helpers keep the existing service worker and Web Push behavior.

## Native Push Backend Flow

`send-push` keeps the existing Web Push behavior and adds native fan-out.

1. Fetch the stored notification row and build the existing title, body, tag, and URL payload.
2. Fetch Web Push subscriptions from `public.push_subscriptions`.
3. Fetch native Android tokens from `public.native_push_tokens`.
4. Send Web Push exactly as today.
5. Send native pushes to Expo Push Service in batches.
6. Include route data so notification taps can open the right screen.
7. Record one native diagnostic attempt per token.
8. Delete stale native tokens when Expo reports `DeviceNotRegistered` in an immediate error response or in a later receipt workflow.

For APK v1, immediate Expo push tickets are enough to prove the send pipeline works. A later hardening pass can add scheduled receipt polling if diagnostics show accepted tickets without device delivery.

## Notification Tap Routing

Use the same route intent currently encoded for Web Push URLs.

Native push data should include:

```json
{
  "url": "beerva://posts/session/<id>?notificationId=<id>"
}
```

The route mapping should support:

- notifications list
- post detail for sessions and pub crawls
- hangover rating
- chug verification
- official challenge detail
- record tab when needed

React Navigation linking should be enabled for native with the `beerva://` prefix while retaining web linking behavior. Notification response listeners from `expo-notifications` should pass the URL into the same navigation handling path.

## Auth And Deep Links

Email/password login already works natively and should stay the APK v1 auth path.

Signup confirmation can keep the current `auth-confirmed.html` flow. The user confirms their email in a browser and then logs in from the APK. This avoids changing Supabase auth redirects and protects the PWA.

Magic-link or email-confirmation links that open directly into the native app are out of scope for this APK v1. They can be added later with Supabase redirect URL configuration and Android App Links.

## Platform Feature Review

Before shipping the APK, review browser-only and native-sensitive areas:

- Service worker registration should only run on web.
- PWA install prompt should only render on web.
- Web update banner should only react to service worker events.
- Location lookup in `RecordScreen` currently uses browser geolocation and needs an Android-native location path or a graceful fallback.
- Image upload already has a native upload branch and should be manually verified.
- Avatar crop uses browser canvas for web and should be verified on Android for the existing modal behavior.
- Chug MediaPipe verification is web-only today; Android should show the existing unsupported/native fallback until a native verifier is designed.
- Fake beer sensors already branch by platform and should be manually verified on Samsung.

## External Setup

Native Android push requires:

- Expo account.
- EAS project configured with `eas build:configure`.
- Android FCM credentials configured for Expo notifications.
- A physical Android device for real push testing.
- Supabase Edge Function secrets already used for Web Push should remain unchanged.

The native push implementation should not require changing VAPID secrets, PWA service worker files, or existing browser subscription rows.

## Error Handling

- Web Push failure must not block native push delivery.
- Native push failure must not block Web Push delivery.
- One failed native token must not block other native tokens.
- Missing Expo project id should return a clear client error.
- Denied notification permission should return the same user-facing blocked/denied flow as web.
- Invalid or stale native tokens should be deleted when detected.
- Diagnostic insert failures should be logged but should not fail the whole push send.
- If a user has no Web Push subscriptions and no native tokens, `send-push` should return a successful `sent: 0` style response.

## Testing

Add or update lightweight tests in the existing script style.

Client/source tests should verify:

- `expo-notifications` and `expo-constants` are dependencies.
- `app.json` has a `beerva` scheme and Android package id.
- `app.json` keeps the existing web manifest/PWA settings.
- `eas.json` has a preview Android profile with `buildType: "apk"`.
- `src/lib/pushNotifications.ts` keeps the Web Push path for web.
- `src/lib/pushNotifications.ts` has an Android path that stores Expo push tokens.
- `App.tsx` still registers the service worker only on web.
- PWA install and update UI remain web-only.

Backend/source tests should verify:

- A migration creates `native_push_tokens` with RLS.
- A migration creates native push diagnostics.
- `send-push` still sends Web Push using existing VAPID behavior.
- `send-push` fetches native tokens for the same notification recipient.
- `send-push` calls Expo Push Service for native tokens.
- `send-push` records native diagnostics.
- `send-push` cleans up stale native tokens when Expo returns `DeviceNotRegistered`.

Manual APK verification should cover:

- Install APK on Samsung.
- Log in with an existing Beerva account.
- Confirm the feed matches the PWA feed.
- Create a session/post on Android and see it on PWA.
- Create a session/post on PWA and see it on Android.
- Upload a session photo or avatar if available.
- Try nearby pub/location flow.
- Enable push on Android.
- Trigger a notification from another account.
- Confirm Android receives the push.
- Tap the push and land on the correct screen.
- Confirm PWA Web Push still works for a browser/PWA subscription.

## Acceptance Criteria

- Existing PWA build and tests continue to pass.
- Existing Web Push subscriptions continue to work.
- Android APK builds through EAS preview profile as an installable `.apk`.
- Android users can log in with the same Supabase account used on PWA.
- Android and PWA users see the same feed and posts.
- Android-created posts are visible to PWA users.
- PWA-created posts are visible to Android users.
- Android can register a native push token.
- A single notification row can send push to both PWA Web Push and Android native push recipients.
- Native push taps route to the correct in-app screen.
- PWA install prompts, service worker updates, and Web Push remain web-only and functional.

## References

- Expo APK builds: https://docs.expo.dev/build-reference/apk/
- Expo push notification setup: https://docs.expo.dev/push-notifications/push-notifications-setup/
- Expo notification config and Android permission behavior: https://docs.expo.dev/versions/latest/sdk/notifications/
- Expo linking overview: https://docs.expo.dev/linking/overview/
