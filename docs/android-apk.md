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
