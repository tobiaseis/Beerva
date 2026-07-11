# Native Version 1 PWA Parity Design

## Context

Beerva currently ships from one Expo React Native codebase. The web target is the production PWA used by the existing user base, while Android is distributed as an installable native APK. Android and the PWA share Supabase authentication, data, storage, notification rows, business rules, navigation concepts, theme tokens, and most screen components.

The Android app does not yet meet the expected production standard. In-app notifications appear, Android reports push as enabled, but a Samsung Galaxy S22 running Android 16 has never received a Beerva system notification. The native UI also differs from the PWA because many screens use fixed Android top offsets and larger Android-only spacing, sizes, and bottom-navigation offsets.

The production evidence identifies a concrete notification failure: the deployed `send-push` Supabase Edge Function is version 13 from 2026-06-01, while native Expo push fan-out was added to the repository on 2026-06-19. Android can register and persist an Expo push token, but the deployed sender does not attempt native delivery.

## Product Direction

Beerva will use a shared product core with platform-specific adapters:

- Supabase data access, domain rules, routes, theme tokens, and most UI remain shared.
- Native Android and future iPhone apps use native adapters for push, permissions, safe areas, media, location, sensors, haptics, and OS lifecycle behavior.
- The PWA retains web-specific adapters for service workers, Web Push, install prompts, browser routing, and update handling.
- Platform-specific files such as `.native.tsx` and `.web.tsx` are used where behavior genuinely differs.
- The PWA is the visual and functional reference for shared version 1 flows.

Expo produces real native Android and iOS applications. A separate duplicated Android UI is therefore unnecessary and would create long-term drift between Android, iPhone, and the PWA.

## Goals

- Deliver reliable native Android system notifications through Expo Push Service and FCM.
- Make Android version 1 match the PWA's shared look and standard feature set while retaining necessary native behavior.
- Protect the existing PWA from visual, behavioral, routing, Web Push, installation, and service-worker regressions.
- Establish platform boundaries that support a future native iPhone app without duplicating product logic.
- Verify Android version 1 on a Samsung Galaxy S22 running Android 16.
- Establish repeatable native release versioning and verification.

## Non-Goals

- Do not change the PWA's intended appearance or behavior.
- Do not replace or remove Web Push.
- Do not build a separate Android application or duplicate all screens.
- Do not implement the native iPhone app in this version.
- Do not implement native chug proof video playback, verification, or manual retiming in this version. That work will follow as a separate project.
- Do not remove PWA subscriptions, rewrite existing notification history, or destructively migrate production data.
- Do not redesign Beerva's brand, colors, typography, content hierarchy, or information architecture.

## Architecture

### Shared Product Core

Shared modules remain authoritative for:

- Supabase authentication and persistence
- notification rows and notification copy
- feed, sessions, pub crawls, challenges, profiles, legends, and admin domain logic
- route intent and deep-link targets
- color, typography, radius, spacing, and component tokens
- shared screen content and interaction rules

Platform adapters own behavior that depends on browser or operating-system APIs. Existing native performance differences such as FlashList remain implementation details and must not change visible content or interactions.

### Platform Boundaries

Native-only behavior includes:

- Expo push tokens and notification channels
- Android notification permission and presentation
- safe-area placement and edge-to-edge system UI
- Android back behavior and native navigation lifecycle
- native image preparation, media-library saves, location, sensors, haptics, and permission prompts
- native list and refresh implementations

Web-only behavior includes:

- service-worker registration and updates
- VAPID Web Push subscriptions
- PWA install prompts
- browser URL and visibility APIs
- web-specific media and canvas implementations

These differences must be explicit, small, and covered by platform-specific tests.

## Native Notification Design

### Client Registration And Lifecycle

Android continues to create the `default` Beerva notification channel before requesting permission or fetching a token. The channel remains high importance with vibration, sound-capable payloads, and the Beerva notification color.

The app will:

1. Request notification permission only through a user-initiated enable action.
2. Fetch the Expo push token with the configured EAS project ID.
3. Upsert the token into `public.native_push_tokens` for the signed-in user.
4. Resynchronize the current token automatically after authentication and whenever the native app returns to the foreground.
5. Keep the Profile toggle as the visible permission and subscription control.
6. Remove the current device token when the user disables push.
7. Configure foreground notification presentation so native notifications may show a banner, play sound, and appear in Android's notification list while Beerva is open.

Automatic synchronization must not prompt for permission. It only repairs a token row after permission has already been granted.

### Backend Fan-Out

`public.notifications` remains the single event source. The deployed `send-push` Edge Function will independently fan out each eligible notification to:

- PWA endpoints in `public.push_subscriptions`
- native Expo tokens in `public.native_push_tokens`

Web and native sends must be isolated so failure in one channel never prevents attempts through the other. Native payloads include title, body, sound, the `default` channel, high priority, notification ID, and the same route intent used by Web Push.

The current local `send-push` implementation containing native fan-out must be reviewed against all database migrations applied since the deployed June 1 function, tested, and then deployed. Deploying the sender is required to resolve the confirmed production failure.

### FCM And Expo Credentials

The EAS Android application identifier, Expo project, Firebase Android application, `google-services.json`, and uploaded FCM V1 service-account credential must all correspond to `com.beerva.app`. The existing source configuration is necessary but not sufficient; the EAS credential must be verified before the release build is accepted.

### Tickets, Receipts, And Token Health

An accepted Expo push ticket proves only that Expo accepted the request. Version 1 will process the later Expo receipts so Beerva can distinguish:

- successful handoff to FCM
- invalid or unregistered device tokens
- missing or invalid FCM credentials
- malformed payloads
- temporary Expo or FCM failures

Native delivery diagnostics will record the ticket and final receipt outcome without storing raw tokens. Invalid tokens will be removed. Temporary failures will remain diagnosable and may be retried only with bounded backoff appropriate to the failure. Receipt processing will run after the recommended delivery window rather than blocking the original notification request.

`public.native_push_delivery_attempts` will retain its ticket fields and gain explicit receipt fields: receipt status, checked timestamp, provider error code, and provider error message. A receipt starts as pending when Expo returns a ticket ID. A dedicated `check-native-push-receipts` Edge Function will batch pending ticket IDs that are at least 15 minutes old and less than 24 hours old, request their Expo receipts, and update the corresponding diagnostic rows. Supabase Cron will invoke this function on a 15-minute schedule. Receipt errors classified as `DeviceNotRegistered` remove the matching token; credential and payload errors remain visible without deleting valid tokens.

The original send request may retry only transient network, HTTP 429, and HTTP 5xx failures with a small bounded exponential backoff. Permanent ticket or receipt errors are not retried automatically, preventing duplicate user-visible notifications.

### Tap Routing

Native notification responses continue to use the shared route intent. Version 1 supports:

- notification list
- session and pub-crawl post detail
- hangover rating
- challenge detail
- chug verification destination, with the agreed native video limitation still visible
- record tab launches
- beverage submission/admin destination

Opening a push marks the referenced notification as read when an ID is present. Cold-start responses wait for authentication, profile setup, and navigation readiness before routing.

## UI And Feature Parity Design

### Visual Reference

The PWA is the reference for shared visual geometry. Android retains only those differences required by native OS behavior or accessibility.

Android will match the PWA's:

- content padding and vertical rhythm
- card dimensions and internal spacing
- avatar and badge sizing
- form and photo-preview geometry
- floating navigation appearance
- typography, colors, borders, radii, and icon treatment
- modal and detail-screen hierarchy

No new visual language is introduced.

### Safe Areas And Edge-To-Edge Layout

Fixed native top values such as `54`, `58`, and `60` will be replaced with reusable safe-area-aware layout primitives. Each native header uses the actual top inset plus the same visible gap used by the PWA. This avoids double spacing and inconsistent placement on Android 16 edge-to-edge devices.

The floating native tab bar keeps the PWA's pill height, width, five equal columns, labels, icons, badge, surface, and border. Its vertical position is calculated from the actual Android bottom inset plus the PWA visual gap. The current fixed 56-point fallback will not override a valid system inset. Scrollable tab content reserves the resulting dynamic pill space so content is neither hidden nor excessively padded.

### Screen Audit

Version 1 covers the standard shared flows across:

- authentication and profile setup
- Feed
- People
- Record and active sessions
- Pub Legends and challenges
- Profile and user profiles
- Notifications
- post, pub, challenge, edit-session, and hangover detail screens
- admin tools and beverage submissions
- dialogs, sheets, image previews, avatar crop, trophies, roulette, and other shared overlays
- deep links and notification launches

For each screen, accidental Android-only values are replaced by shared visual values or an explicit native safe-area adapter. Native performance settings such as FlashList, clipped-subview optimization, and native pull-to-refresh remain in place.

### Intentional Native Differences

The following remain native adaptations rather than parity defects:

- system safe areas and edge-to-edge placement
- Android back and keyboard behavior
- minimum accessible touch targets
- native permissions and system settings
- native image manipulation and media saving
- native location, sensor, and haptic APIs
- native list virtualization and pull-to-refresh
- absence of PWA installation and service-worker update UI

Chug proof video review and manual timing remain deferred and must continue to show an honest native limitation instead of a broken control.

## Error Handling

- Native token synchronization failures must not sign the user out or block app startup.
- Permission denial must produce clear device-specific guidance and remain user-controlled.
- One invalid push token must not block other native tokens or Web Push endpoints.
- Web Push failure must not block native delivery, and native delivery failure must not block Web Push.
- Missing FCM credentials, invalid payloads, and stale tokens must be visible through diagnostics.
- Notification routing waits for navigation readiness and falls back safely when data is incomplete.
- Safe-area calculations must fall back to non-negative values without hard-coded device assumptions.
- Native platform failures should present actionable feedback without introducing browser-specific wording.

## PWA Protection

There will be no intentional PWA visual or behavioral changes. PWA protection includes:

- retaining service-worker registration, caching, update behavior, and install prompts
- retaining VAPID Web Push and `public.push_subscriptions`
- retaining web routing and URL launch behavior
- retaining the existing web tab bar and content geometry
- retaining browser image, media, and location paths
- retaining existing Supabase data and authentication behavior

Shared refactors must be platform-neutral or preserve the exact web branch. Where risk is material, native behavior will be introduced through `.native` files or `Platform.OS !== 'web'` adapters rather than changing the working web implementation.

## Testing And Verification

### Automated Tests

Implementation follows test-driven development. Tests will be added or extended before each behavior change to cover:

- automatic native token synchronization after authentication and foreground resume
- no native permission prompt during background synchronization
- Android notification channel and foreground presentation configuration
- independent Web Push and native fan-out
- Expo ticket persistence and receipt processing
- receipt error classification and stale-token deletion
- native notification tap parsing and cold-start routing
- shared PWA geometry versus explicit native safe-area adjustments
- removal of accidental Android-only sizing across audited screens
- dynamic native bottom navigation placement and content inset
- intentional platform exclusions, including deferred chug video review
- explicit Android version-code configuration

Existing notification, PWA startup, routing, theme, navigation, feed, record, profile, and native configuration tests remain required.

### Build And Static Verification

Before release:

1. Run TypeScript without emitting files.
2. Run Expo Doctor.
3. Run affected tests after each task.
4. Run the broader repository test suite.
5. Produce a production web export.
6. Smoke-test the exported PWA at a mobile viewport.
7. Build a fresh Android APK with an incremented Android version code.

### Device Verification

The Galaxy S22 on Android 16 is the version 1 reference device. Manual checks cover:

- install and update behavior
- authentication and profile setup
- every standard shared screen and action
- short, long, empty, loading, and error content states
- keyboard and Android back behavior
- camera, photos, media saving, location, sensors, and haptics
- navigation-bar and status-bar safe areas
- foreground, background, and terminated notification delivery
- notification delivery after offline/reconnect and device reboot
- tap routing from cold and warm starts

A real notification test uses two accounts: one account creates an event and the S22 account receives both the in-app row and the system notification.

### Cross-Platform Verification

The same notification row must be tested against a PWA Web Push subscription and the Android native token. Both channels must receive appropriate payloads independently. Existing users' PWA behavior is verified before and after backend deployment.

## Release And Rollback

Backend deployment occurs only after local tests, web export, and sender review pass. The current deployed Edge Function version is recorded before deployment so it can be restored if production Web Push regresses.

The Android release receives an incremented version code and is installed as an update over the existing S22 build. Notification credentials and receipt results are verified before the APK is considered releasable.

Database migrations are additive. Existing Web Push subscriptions and notification history are not deleted or rewritten. Rollback of native delivery does not require removing the PWA path.

## Acceptance Criteria

- The PWA has no intentional visual or behavioral changes.
- The PWA production export and regression suite pass.
- Existing Web Push delivery still works.
- Android shared screens and standard flows visually match the PWA, except for approved native adaptations.
- Android safe areas and floating navigation are correct on the Galaxy S22 running Android 16.
- Android synchronizes its native token after login and foreground resume without prompting unexpectedly.
- The deployed sender attempts native delivery for the same notification rows used by Web Push.
- Expo tickets and receipts are recorded and actionable.
- Invalid native tokens are removed without affecting other destinations.
- The Galaxy S22 receives system notifications while Beerva is foregrounded, backgrounded, and terminated.
- Notification taps open the correct Beerva destination from warm and cold starts.
- Android installs as an update using an incremented version code.
- The design supports adding an iPhone native adapter later without duplicating domain logic or changing the PWA architecture.

## References

- Expo Android FCM V1 credentials: https://docs.expo.dev/push-notifications/fcm-credentials/
- Expo Push Service tickets and receipts: https://docs.expo.dev/push-notifications/sending-notifications/
- Expo push troubleshooting: https://docs.expo.dev/push-notifications/faq/
- Expo SDK 54 notifications: https://docs.expo.dev/versions/v54.0.0/sdk/notifications/
