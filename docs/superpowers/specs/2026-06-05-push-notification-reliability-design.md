# Push Notification Reliability Design

## Context

Beerva currently uses Web Push for the installed PWA. The app registers `/sw.js`, stores browser push subscriptions in `public.push_subscriptions`, and invokes the `send-push` Supabase Edge Function from an `after insert` trigger on `public.notifications`.

The reported Android symptom is that notifications feel unreliable and are most visible when the app is opened or was recently opened. Because the app is installed as a PWA, this is already the strongest web delivery mode, but it still does not have the same operating-system privileges as a native Android app using FCM.

The goal of this work is to make the PWA push path as reliable and observable as practical without changing Beerva into a native app.

## Goals

- Improve delivery attempts for user-visible pushes from the backend to the browser push service.
- Add diagnostics that separate Beerva pipeline failures from Android or Chrome delivery delays.
- Clean up dead subscriptions more consistently.
- Recover browser subscriptions when the browser rotates or invalidates a subscription.
- Keep the current user experience and notification copy intact.

## Non-Goals

- Build a native Android app in this change.
- Replace Web Push with Firebase Cloud Messaging for the PWA.
- Guarantee Instagram-level delivery. That requires native Android notification infrastructure.
- Add user-facing notification settings beyond the existing enable/disable flow.

## Recommended Approach

Harden the existing PWA push pipeline.

Server sends should include explicit Web Push delivery options for user-visible notifications:

- `urgency: 'high'` for immediate, user-visible notifications.
- `TTL: 86400` so notifications can survive one day of temporary offline time without appearing several days stale.
- No `topic` replacement in this change. Beerva social notifications represent individual events and should not replace each other while pending.
- `timeout: 8000` so failed push-service calls do not hang Edge Function execution.

The backend should also write diagnostic rows for each delivery attempt. This gives us evidence for:

- notification id
- target user id
- push subscription id
- endpoint hash
- send status
- push-service HTTP status code when available
- error text when available
- created timestamp

The browser/client should keep subscriptions healthy:

- Add a `pushsubscriptionchange` listener in `public/sw.js`.
- When the event fires, post a message to any open Beerva client telling it to resync push state.
- Because service workers do not have direct Supabase auth context, use client-side startup and focus checks as the primary self-healing path: if notification permission is granted but the backend row is missing, re-upsert the current subscription.
- Keep stale-subscription cleanup on 404 and 410 responses.

## Data Model

Add a small diagnostics table:

`public.push_delivery_attempts`

- `id uuid primary key default gen_random_uuid()`
- `notification_id uuid not null references public.notifications(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `push_subscription_id uuid null references public.push_subscriptions(id) on delete set null`
- `endpoint_hash text not null`, computed as a SHA-256 hex digest in the Edge Function
- `status text not null`
- `http_status integer null`
- `error_message text null`
- `created_at timestamptz not null default now()`

Allowed status values:

- `accepted`
- `expired_subscription`
- `failed`

RLS should be enabled with no normal user read policies. The Edge Function writes diagnostics through the service role key.

## Backend Flow

1. `public.notifications` insert triggers `public.enqueue_notification_push()`.
2. The trigger invokes `send-push` with the notification row id.
3. `send-push` fetches the stored notification and target user's subscriptions.
4. For each subscription, it sends a Web Push payload with delivery options.
5. For each attempt, it writes a diagnostic row.
6. On 404 or 410, it deletes the stale subscription and records `expired_subscription`.
7. Other failures are logged as `failed`, without blocking other subscriptions.

## Client Flow

1. The app still registers the service worker at startup.
2. `enablePushNotifications()` still requests permission, subscribes, and upserts the backend subscription row.
3. Add a reusable `syncPushSubscription()` helper:
   - checks Web Push support
   - requires `Notification.permission === 'granted'`
   - gets the active service worker registration
   - gets the browser push subscription
   - verifies the signed-in Supabase user
   - upserts the current subscription row
4. Call `syncPushSubscription()` on startup and when checking push state, so installed PWAs can repair missing backend rows.
5. Add web `visibilitychange` and `focus` listeners that call `syncPushSubscription()` after the installed PWA returns to the foreground.
6. The service worker handles `pushsubscriptionchange` as best effort by messaging open clients. If no client is open, the next app startup or focus handles repair.

## Android Reality

This improves Beerva's side of the PWA pipeline, but Android and Chrome still control final delivery. Web Push can wake a service worker while the PWA is closed, but it cannot fully match native Android FCM delivery, notification channel importance, or OS-level priority behavior used by apps like Instagram.

If diagnostics show that Beerva sends are accepted by the browser push service while the phone still delays or drops notifications, the next reliability step is a native Android build with FCM.

## Error Handling

- A single failed subscription must not prevent delivery to other subscriptions.
- Expired subscriptions should be deleted automatically on 404 or 410.
- Diagnostic logging failures should be logged but should not prevent push sends.
- Missing VAPID configuration should continue to fail loudly in the Edge Function logs.
- Empty subscription lists should return the existing successful `sent: 0` response.

## Testing

Add or update lightweight source-level tests in the existing script style:

- `scripts/pushDelivery.test.js`
  - asserts `send-push` uses Web Push options with high urgency and TTL
  - asserts delivery attempts are recorded
  - asserts stale subscriptions are deleted and recorded
  - asserts diagnostics include endpoint hashing rather than storing raw endpoints in logs
- `scripts/pwaStartup.test.js`
  - asserts a `syncPushSubscription` helper exists
  - asserts startup or push-state checks call the helper when permission is granted
  - asserts `pushsubscriptionchange` is handled in `public/sw.js`

Manual verification:

- Enable push on the installed Android PWA.
- Insert a test notification for the user.
- Confirm a `push_delivery_attempts` row is created.
- Confirm the Edge Function reports an accepted send.
- Confirm expired subscriptions are removed after forcing a stale endpoint scenario.

## Acceptance Criteria

- Existing push delivery tests still pass.
- Existing PWA startup tests still pass.
- A new notification send records one diagnostic attempt per subscription.
- User-visible Web Push sends specify high urgency and TTL.
- Stale subscriptions are removed and diagnosable.
- The app can repair a missing backend subscription row when permission and browser subscription still exist.
- The final user-facing behavior remains the same except for improved reliability.
