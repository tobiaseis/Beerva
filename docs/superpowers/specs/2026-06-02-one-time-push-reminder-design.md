# One-Time Push Reminder Design

## Summary

Beerva should remind signed-in users who have not enabled push notifications that they can turn them on. The reminder appears the next time an eligible user opens the app, explains why notifications matter, and either enables push directly or shows them where the existing profile button lives.

This is a client-side reminder. It does not send a real push message, because users without push subscriptions cannot receive one, and it does not create an in-app notification row.

## Requirements

- Show the reminder only to signed-in users who are past profile setup.
- Show it only where Beerva push notifications are supported.
- Show it only when the current user/device is not already subscribed.
- Show it only once for now. If the user dismisses it, do not show it again for that user on that device.
- Do not show it when browser notification permission is already denied.
- Keep the existing profile and setup push enable buttons.
- Let users enable push immediately from the reminder.
- Let users jump to the existing Profile tab and see where the enable button is.
- If push enable fails, use the existing blocked/unsupported/failure copy style.

## User Experience

After app startup and auth/profile checks complete, eligible users see a bottom-sheet style prompt consistent with the existing PWA install prompt.

The prompt copy should explain the value plainly:

- title: "Turn on push notifications"
- body: "Get a buzz when someone cheers, comments, invites you, tags you as a drinking buddy, or posts an official Beerva update."

Actions:

- `Enable now`: calls the existing `enablePushNotifications()` flow. On success, the prompt closes and records the one-time seen state.
- `Show me where`: records the one-time seen state, closes the prompt, navigates to the Profile tab, and highlights or explains the existing `Enable push notifications` button.
- `Not now`: records the one-time seen state and closes the prompt.
- Close button/backdrop dismissal: same as `Not now`.

The Profile tab should show a short contextual hint only when opened through `Show me where`. The hint should sit next to the existing push button and avoid covering other controls. It can be a compact highlighted panel or a temporary highlighted state around the button.

## Architecture

Add an authenticated root-level `PushReminderPrompt` component mounted inside `RootNavigator` after profile setup is complete. It should sit beside the authenticated stack, not inside an individual screen, and reuse the app's existing overlay pattern and theme tokens.

Add a small helper module, for example `src/lib/pushReminderPrompt.ts`, for eligibility and storage:

- stable localStorage key prefix, scoped by user id
- safe storage getter for web
- `hasSeenPushReminder(storage, userId)`
- `rememberPushReminderSeen(storage, userId)`
- `shouldShowPushReminder({ userId, support, permission, subscribed, storage })`

Eligibility data comes from existing APIs:

- `supabase.auth.getUser()` for the signed-in user id
- `getPushSupportInfo()` for platform support
- `getPushPermissionStatus()` for browser permission status
- `isCurrentlySubscribed()` for current subscription state

The component should wait briefly until auth is available and should re-check state on mount. If the user enables push somewhere else before the reminder resolves, the prompt should not appear.

## Navigation And Hinting

The root prompt opens the Profile tab through the existing root navigation ref. `Show me where` should navigate to:

```ts
navigationRef.navigate('MainTabs', {
  screen: 'Profile',
  params: { showPushReminderHint: true },
});
```

`ProfileScreen` should read `route.params?.showPushReminderHint`, show the contextual hint near the existing push button, and then clear that route param after the hint is visible so it does not reappear during normal profile visits. The hint is an immediate teaching moment, not a lasting user preference.

## Error Handling

- Unsupported browser/device: do not show the reminder.
- iOS browser that requires Home Screen install before push is supported: do not show this reminder; the existing install prompt owns that education.
- Permission denied: do not show the reminder.
- Enable fails: keep the reminder open and show an alert with the existing `Could not enable push` or `Notifications blocked` style.
- Missing user session: do not show the reminder.
- localStorage unavailable: skip one-time reminder storage and do not show the prompt, so private browsing or storage errors do not create repeated nagging.

## Testing

Add focused source-level checks in a new script, for example `scripts/pushReminderPrompt.test.js`.

Test coverage should assert:

- reminder storage uses a stable Beerva-specific key prefix
- seen state is scoped by user id
- denied permission and unsupported push do not qualify
- subscribed users do not qualify
- unsubscribed supported users who have not seen the reminder qualify
- `PushReminderPrompt` calls `isCurrentlySubscribed()` and `enablePushNotifications()`
- the prompt has `Enable now`, `Show me where`, and `Not now` actions
- root navigation mounts the reminder in the authenticated app experience
- `Show me where` navigates to `MainTabs` with the Profile tab and `showPushReminderHint` param
- Profile screen has a reminder hint path next to the existing push button
- `package.json` exposes the focused test script

Run:

```powershell
npm run test:push-reminder
npm run build:web
```

If Profile styling is touched, also run:

```powershell
npm run test:app-theme-screens
```

## Non-Goals

- No database migration.
- No server-side broadcast job.
- No in-app notification row.
- No repeated reminder cooldown.
- No changes to actual push delivery.
- No native mobile push implementation.
- No removal or redesign of the existing profile/setup push buttons.
