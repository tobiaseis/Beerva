# Native Version 1 UI And Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android's shared version 1 screens and standard flows look and behave like the production PWA while preserving native safe areas, performance, permissions, and OS interactions.

**Architecture:** Introduce one safe-area-aware parity hook that derives native header and floating-tab geometry from real device insets while returning the existing PWA values on web. Apply it across shared screens, then remove accidental Android-only sizes and spacing in focused groups. Keep browser-only lifecycle UI and the deferred chug video feature explicitly platform-gated.

**Tech Stack:** Expo SDK 54, React Native 0.81, React Navigation 7, `react-native-safe-area-context`, FlashList, shared Beerva theme tokens, Node.js assertion tests, TypeScript, Expo web export.

---

## File Structure

- Create `src/theme/usePwaParityInsets.ts`: the single safe-area and floating-navigation geometry hook.
- Modify `src/theme/layout.ts`: expose shared pill height/gaps without a fixed Android bottom fallback.
- Modify `src/navigation/AndroidFloatingTabBar.tsx`: consume dynamic native bottom placement.
- Modify the five main tab screens: dynamic content insets and PWA visual values.
- Modify detail and modal screens: safe-area top bars using the same visible PWA gaps.
- Modify profile/auth/form components: remove accidental Android-only dimensions.
- Create `scripts/nativePwaParity.test.js`: explicit visual and feature parity source contract.
- Modify `scripts/floatingBottomNav.test.js`, `scripts/appThemeScreens.test.js`, and `package.json`: focused regression coverage.

### Task 1: Shared Safe-Area Parity Geometry

**Files:**
- Create: `scripts/nativePwaParity.test.js`
- Modify: `package.json`
- Create: `src/theme/usePwaParityInsets.ts`
- Modify: `src/theme/layout.ts`

- [ ] **Step 1: Write the failing parity primitive test**

Create `scripts/nativePwaParity.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const hook = read('src/theme/usePwaParityInsets.ts');
const layout = read('src/theme/layout.ts');

assert.equal(packageJson.scripts['test:native-pwa-parity'], 'node scripts/nativePwaParity.test.js');
assert.match(hook, /useSafeAreaInsets/);
assert.match(hook, /screenTopBarPaddingTop:\s*isWeb\s*\?\s*18\s*:\s*insets\.top \+ 18/);
assert.match(hook, /profileHeaderPaddingTop:\s*isWeb\s*\?\s*22\s*:\s*insets\.top \+ 22/);
assert.match(hook, /feedHeaderPaddingTop:\s*isWeb\s*\?\s*12\s*:\s*insets\.top \+ 12/);
assert.match(hook, /insets\.bottom \+ floatingTabBarMetrics\.nativeGap/);
assert.doesNotMatch(layout, /floatingTabBarNativeBottom\s*=\s*56/);
assert.match(layout, /nativeGap:\s*16/);

console.log('native PWA parity checks passed');
```

Add to `package.json`:

```json
"test:native-pwa-parity": "node scripts/nativePwaParity.test.js"
```

- [ ] **Step 2: Run the parity test and verify it fails**

Run: `npm run test:native-pwa-parity`

Expected: FAIL because the parity hook does not exist.

- [ ] **Step 3: Replace fixed native metrics with shared gaps**

Replace the floating-tab section of `src/theme/layout.ts` with:

```ts
const floatingTabBarHeight = 60;
const floatingTabBarWebBottom = 16;

export const floatingTabBarMetrics = {
  webBottom: floatingTabBarWebBottom,
  webHeight: floatingTabBarHeight,
  webContentInset: floatingTabBarHeight + floatingTabBarWebBottom + 16,
  nativeHeight: floatingTabBarHeight,
  nativeGap: 16,
  contentGap: 16,
};
```

Create `src/theme/usePwaParityInsets.ts`:

```ts
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { floatingTabBarMetrics } from './layout';

export const usePwaParityInsets = () => {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const tabBarBottom = isWeb
    ? floatingTabBarMetrics.webBottom
    : insets.bottom + floatingTabBarMetrics.nativeGap;

  return {
    feedHeaderPaddingTop: isWeb ? 12 : insets.top + 12,
    screenTopBarPaddingTop: isWeb ? 18 : insets.top + 18,
    profileHeaderPaddingTop: isWeb ? 22 : insets.top + 22,
    tabBarBottom,
    tabContentPaddingBottom: floatingTabBarMetrics.nativeHeight
      + tabBarBottom
      + floatingTabBarMetrics.contentGap,
  };
};
```

- [ ] **Step 4: Run the primitive test**

Run: `npm run test:native-pwa-parity`

Expected: PASS and print `native PWA parity checks passed`.

- [ ] **Step 5: Commit the parity primitive**

```powershell
git add package.json scripts/nativePwaParity.test.js src/theme/layout.ts src/theme/usePwaParityInsets.ts
git commit -m "feat: add safe-area parity geometry"
```

### Task 2: Floating Navigation And Main Tab Insets

**Files:**
- Modify: `scripts/floatingBottomNav.test.js`
- Modify: `src/navigation/AndroidFloatingTabBar.tsx`
- Modify: `src/screens/FeedScreen.tsx`
- Modify: `src/screens/PeopleScreen.tsx`
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `src/screens/PubLegendsScreen.tsx`
- Modify: `src/screens/ProfileScreen.tsx`

- [ ] **Step 1: Update the failing floating-navigation contract**

In `scripts/floatingBottomNav.test.js`, replace the fixed-bottom assertion with:

```js
assert.match(
  androidTabBarSource,
  /const \{ tabBarBottom \} = usePwaParityInsets\(\)/,
  'Android pill should derive its bottom position from the shared safe-area hook'
);
assert.doesNotMatch(
  androidTabBarSource,
  /Math\.max\(insets\.bottom \+ 12, floatingTabBarMetrics\.nativeBottom\)/,
  'Android pill should not override real system insets with a fixed 56-point fallback'
);
```

For each main tab source, require `tabContentPaddingBottom`:

```js
assert.match(
  readSource(file),
  /tabContentPaddingBottom/,
  `${file} should reserve the dynamic native pill inset`
);
```

- [ ] **Step 2: Run the navigation test and verify it fails**

Run: `npm run test:floating-nav`

Expected: FAIL on the missing hook usage.

- [ ] **Step 3: Make the native pill use the real bottom inset**

In `src/navigation/AndroidFloatingTabBar.tsx`:

```ts
import { usePwaParityInsets } from '../theme/usePwaParityInsets';
```

Remove `useSafeAreaInsets`, replace its local bottom calculation with:

```ts
const { tabBarBottom } = usePwaParityInsets();
```

and render:

```tsx
<View pointerEvents="box-none" style={[styles.wrapper, { bottom: tabBarBottom, width }]}>
```

- [ ] **Step 4: Apply dynamic main-tab content padding**

In each main tab component, import and call:

```ts
import { usePwaParityInsets } from '../theme/usePwaParityInsets';

const { tabContentPaddingBottom } = usePwaParityInsets();
```

Use the following exact style-array pattern on the screen's primary list or scroll container:

```tsx
contentContainerStyle={[styles.scrollContent, { paddingBottom: tabContentPaddingBottom }]}
```

For screens that already append empty-state styles, retain them after the dynamic object:

```tsx
contentContainerStyle={[
  styles.listContent,
  { paddingBottom: tabContentPaddingBottom },
  items.length === 0 ? styles.emptyContent : null,
]}
```

Remove `floatingTabBarMetrics.nativeContentInset` from all five screen styles. Keep `floatingTabBarMetrics.webContentInset` only where the web navigator still consumes a static web value; the runtime object overrides native padding.

- [ ] **Step 5: Run navigation, TypeScript, and PWA checks**

```powershell
npm run test:floating-nav
npm run test:native-pwa-parity
npx tsc --noEmit
npm run build:web
```

Expected: all pass; the web tab bar remains byte-for-byte behaviorally unchanged.

- [ ] **Step 6: Commit navigation parity**

```powershell
git add scripts/floatingBottomNav.test.js src/navigation/AndroidFloatingTabBar.tsx src/screens/FeedScreen.tsx src/screens/PeopleScreen.tsx src/screens/RecordScreen.tsx src/screens/PubLegendsScreen.tsx src/screens/ProfileScreen.tsx
git commit -m "fix: align native floating navigation insets"
```

### Task 3: Main Tab Visual Geometry

**Files:**
- Modify: `scripts/nativePwaParity.test.js`
- Modify: `src/screens/FeedScreen.tsx`
- Modify: `src/screens/PeopleScreen.tsx`
- Modify: `src/screens/RecordScreen.tsx`
- Modify: `src/screens/PubLegendsScreen.tsx`
- Modify: `src/screens/ProfileScreen.tsx`
- Modify: `src/components/ProfileStatsPanel.tsx`
- Modify: `src/components/PubCrawlMediaCarousel.tsx`

- [ ] **Step 1: Add failing main-tab geometry assertions**

Append to `scripts/nativePwaParity.test.js`:

```js
const visualFiles = [
  'src/screens/FeedScreen.tsx',
  'src/screens/PeopleScreen.tsx',
  'src/screens/RecordScreen.tsx',
  'src/screens/PubLegendsScreen.tsx',
  'src/screens/ProfileScreen.tsx',
  'src/components/ProfileStatsPanel.tsx',
];

for (const file of visualFiles) {
  assert.doesNotMatch(
    read(file),
    /Platform\.OS === 'web'\s*\?\s*(10|12|14|16|18|20|22|24|104|132|146)\s*:\s*(12|14|16|18|20|22|24|28|30|32|60|70|88|120|150|154)/,
    `${file} should not keep accidental larger Android geometry`
  );
}
assert.equal(
  (read('src/screens/ProfileScreen.tsx').match(/size=\{104\}/g) || []).length,
  1,
  'own-profile avatar should match the PWA size'
);
assert.match(read('src/components/PubCrawlMediaCarousel.tsx'), /const FEED_HORIZONTAL_PADDING = 14/);
```

- [ ] **Step 2: Run the parity test and verify it fails**

Run: `npm run test:native-pwa-parity`

Expected: FAIL on current Android-only dimensions.

- [ ] **Step 3: Apply the PWA values to Feed, People, Record, and Legends**

Use `usePwaParityInsets()` for header padding:

```ts
const { feedHeaderPaddingTop, screenTopBarPaddingTop, tabContentPaddingBottom } = usePwaParityInsets();
```

Apply the relevant runtime top style:

```tsx
<View style={[styles.header, { paddingTop: feedHeaderPaddingTop }]}>
```

or:

```tsx
<View style={[styles.header, { paddingTop: screenTopBarPaddingTop }]}>
```

Then make these values unconditional:

```ts
// FeedScreen
header: { paddingBottom: 10 /* retain other fields */ },
scrollContent: { padding: 10, maxWidth: 520 /* retain other fields */ },
imageWrap: { maxHeight: 540 /* retain other fields */ },
modalList: { maxHeight: 420 },

// PeopleScreen
searchInput: { paddingVertical: 10 /* retain other fields */ },
listContent: { padding: 14 /* retain other fields */ },

// RecordScreen
header: { paddingBottom: 14 /* retain other fields */ },
content: { padding: 16 /* retain other fields */ },
imagePicker: { height: 132 /* retain other fields */ },

// PubLegendsScreen
// Remove fixed paddingTop from listContent; use screenTopBarPaddingTop in the dynamic content style.
```

Keep native RefreshControl, FlashList, `removeClippedSubviews`, and image-manipulation branches unchanged.

- [ ] **Step 4: Apply PWA profile and stats geometry**

In `ProfileScreen.tsx`, use:

```tsx
<StreakAvatar size={104} ... />
<View style={[styles.header, { paddingTop: profileHeaderPaddingTop }]}>
```

Make these style values unconditional:

```ts
header: { paddingBottom: 22 /* retain other fields */ },
avatar: { width: 104, height: 104, borderRadius: 52 /* retain other fields */ },
statsContainer: { padding: 16 /* retain other fields */ },
highScoreCard: { padding: 16 /* retain other fields */ },
section: { padding: 16 },
badge: { minHeight: 146 /* retain other fields */ },
```

In `ProfileStatsPanel.tsx`, make the PWA branch values unconditional: `66`, `6`, `9`, `82`, `10`, `11`, `8`, `16`, and `146` in their existing corresponding style fields.

In `PubCrawlMediaCarousel.tsx`, replace the platform ternary with:

```ts
const FEED_HORIZONTAL_PADDING = 14;
```

- [ ] **Step 5: Run focused visual contracts**

```powershell
npm run test:native-pwa-parity
npm run test:profile-panel
npm run test:feed-redesign
npm run test:floating-nav
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 6: Commit main-tab parity**

```powershell
git add scripts/nativePwaParity.test.js src/screens/FeedScreen.tsx src/screens/PeopleScreen.tsx src/screens/RecordScreen.tsx src/screens/PubLegendsScreen.tsx src/screens/ProfileScreen.tsx src/components/ProfileStatsPanel.tsx src/components/PubCrawlMediaCarousel.tsx
git commit -m "fix: match native main tabs to PWA geometry"
```

### Task 4: Detail Screen Safe Areas And Geometry

**Files:**
- Modify: `scripts/nativePwaParity.test.js`
- Modify: `src/screens/AdminToolsScreen.tsx`
- Modify: `src/screens/ChallengeDetailScreen.tsx`
- Modify: `src/screens/ChugVerificationScreen.tsx`
- Modify: `src/screens/EditSessionScreen.tsx`
- Modify: `src/screens/HangoverRatingScreen.tsx`
- Modify: `src/screens/NotificationsScreen.tsx`
- Modify: `src/screens/PostDetailScreen.tsx`
- Modify: `src/screens/PubLegendDetailScreen.tsx`
- Modify: `src/screens/UserProfileScreen.tsx`

- [ ] **Step 1: Add failing fixed-offset assertions**

Append to `scripts/nativePwaParity.test.js`:

```js
const safeAreaScreens = [
  'AdminToolsScreen.tsx',
  'ChallengeDetailScreen.tsx',
  'ChugVerificationScreen.tsx',
  'EditSessionScreen.tsx',
  'HangoverRatingScreen.tsx',
  'NotificationsScreen.tsx',
  'PostDetailScreen.tsx',
  'PubLegendDetailScreen.tsx',
  'UserProfileScreen.tsx',
];

for (const name of safeAreaScreens) {
  const source = read(`src/screens/${name}`);
  assert.match(source, /usePwaParityInsets/);
  assert.doesNotMatch(source, /paddingTop:\s*Platform\.OS === 'web'\s*\?\s*18\s*:\s*(54|58|60)/);
}
```

- [ ] **Step 2: Run the parity test and verify it fails**

Run: `npm run test:native-pwa-parity`

Expected: FAIL on each fixed native top offset.

- [ ] **Step 3: Apply the shared top-bar inset to every detail screen**

In every listed screen, import and call:

```ts
import { usePwaParityInsets } from '../theme/usePwaParityInsets';

const { screenTopBarPaddingTop } = usePwaParityInsets();
```

Change each top bar render to:

```tsx
<View style={[styles.topBar, { paddingTop: screenTopBarPaddingTop }]}>
```

For `ChallengeDetailScreen` and `PubLegendsScreen`, apply the dynamic padding to the list header/content wrapper that currently owns `paddingTop`. Remove the corresponding fixed `paddingTop` style declaration.

Do not change the web route logic, native notification routes, list virtualization, or chug limitation copy.

- [ ] **Step 4: Match remaining detail geometry to PWA values**

Make these existing values unconditional:

```ts
// EditSessionScreen
content: { paddingBottom: 24 /* retain other fields */ },
imagePicker: { height: 132 /* retain other fields */ },

// PostDetailScreen
listContent: { padding: 12, maxWidth: 520 /* retain other fields */ },

// PubLegendDetailScreen
listContent: { paddingBottom: 28 /* retain other fields */ },

// UserProfileScreen
content: { paddingBottom: 24 /* retain other fields */ },
header: { paddingTop: 22 /* this is below the safe top bar */ },
avatar: { width: 104, height: 104, borderRadius: 52 /* retain other fields */ },
```

Change the `UserProfileScreen` `StreakAvatar` prop to `size={104}`.

- [ ] **Step 5: Run detail-flow contracts**

```powershell
npm run test:native-pwa-parity
npm run test:notifications
npm run test:native-notification-routing
npm run test:admin-tools
npm run test:chug-review
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 6: Commit detail parity**

```powershell
git add scripts/nativePwaParity.test.js src/screens/AdminToolsScreen.tsx src/screens/ChallengeDetailScreen.tsx src/screens/ChugVerificationScreen.tsx src/screens/EditSessionScreen.tsx src/screens/HangoverRatingScreen.tsx src/screens/NotificationsScreen.tsx src/screens/PostDetailScreen.tsx src/screens/PubLegendDetailScreen.tsx src/screens/UserProfileScreen.tsx
git commit -m "fix: align native detail screen safe areas"
```

### Task 5: Authentication, Setup, And Modal Parity

**Files:**
- Modify: `scripts/nativePwaParity.test.js`
- Modify: `src/screens/AuthScreen.tsx`
- Modify: `src/screens/ProfileSetupScreen.tsx`
- Modify: `src/components/AvatarCropModal.tsx`
- Modify: `src/screens/FakeBeerScreen.tsx`

- [ ] **Step 1: Add failing auth and modal assertions**

Append:

```js
const auth = read('src/screens/AuthScreen.tsx');
assert.doesNotMatch(auth, /Platform\.OS === 'web'\s*\?\s*24\s*:\s*20/);
assert.doesNotMatch(auth, /Platform\.OS === 'web'\s*\?\s*34\s*:\s*60/);
assert.doesNotMatch(auth, /Platform\.OS === 'web'\s*\?\s*spacing\.lg\s*:\s*spacing\.xl/);

const crop = read('src/components/AvatarCropModal.tsx');
assert.match(crop, /usePwaParityInsets/);
assert.doesNotMatch(crop, /paddingTop:\s*Platform\.OS === 'web'\s*\?\s*18\s*:\s*48/);

const fakeBeer = read('src/screens/FakeBeerScreen.tsx');
assert.match(fakeBeer, /usePwaParityInsets/);
assert.doesNotMatch(fakeBeer, /top:\s*Platform\.OS === 'web'\s*\?\s*18\s*:\s*54/);
```

- [ ] **Step 2: Verify failure**

Run: `npm run test:native-pwa-parity`

Expected: FAIL on current platform ternaries.

- [ ] **Step 3: Match authentication and setup geometry**

In `AuthScreen.tsx`, make these values unconditional:

```ts
container: { padding: 24 /* retain other fields */ },
logoContainer: { marginBottom: 34 /* retain other fields */ },
formContainer: { padding: spacing.lg },
```

In `ProfileSetupScreen.tsx`, use `padding: spacing.xl`, `paddingBottom: 32`, and form `padding: 18` unconditionally. Preserve the native image-picker and avatar-crop behavior.

- [ ] **Step 4: Make modal controls safe-area aware**

In `AvatarCropModal.tsx`, call `usePwaParityInsets()` and render its header with:

```tsx
<View style={[styles.header, { paddingTop: screenTopBarPaddingTop }]}>
```

Use `minHeight: 68` and remove the fixed platform `paddingTop` from the style.

In `FakeBeerScreen.tsx`, call the hook and render the close control with:

```tsx
<TouchableOpacity style={[styles.closeButton, { top: screenTopBarPaddingTop }]} ...>
```

Remove the fixed `top` style. Keep native sensors and web motion-permission logic unchanged.

- [ ] **Step 5: Run focused tests**

```powershell
npm run test:native-pwa-parity
npm run test:profile-avatar-crop
npm run test:avatar-crop
npm run test:fake-beer
npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 6: Commit auth and modal parity**

```powershell
git add scripts/nativePwaParity.test.js src/screens/AuthScreen.tsx src/screens/ProfileSetupScreen.tsx src/components/AvatarCropModal.tsx src/screens/FakeBeerScreen.tsx
git commit -m "fix: align native auth and modal geometry"
```

### Task 6: Explicit Feature-Parity Boundaries

**Files:**
- Modify: `scripts/nativePwaParity.test.js`
- Verify: shared feature sources.

- [ ] **Step 1: Add feature-boundary assertions**

Append:

```js
const chug = read('src/screens/ChugVerificationScreen.tsx');
assert.match(chug, /Proof video review is available in the web app for this version\./);
assert.match(chug, /Manual timing is available in the web app for this version\./);

for (const webOnlyComponent of [
  'src/components/PwaInstallPrompt.tsx',
  'src/components/PushReminderPrompt.tsx',
  'src/components/UpdateAvailableBanner.tsx',
]) {
  assert.match(read(webOnlyComponent), /Platform\.OS !== 'web'/);
}

for (const nativeCapability of [
  'src/lib/deviceLocation.ts',
  'src/lib/devicePhotoSave.ts',
  'src/lib/haptics.ts',
  'src/lib/pushNotifications.ts',
]) {
  assert.match(read(nativeCapability), /Platform\.OS/);
}
```

- [ ] **Step 2: Run parity and feature tests**

```powershell
npm run test:native-pwa-parity
npm run test:native-location
npm run test:active-photo-save
npm run test:native-push-client
npm run test:chug-review
```

Expected: all pass without implementation changes. If an assertion fails, investigate the boundary before editing; do not enable deferred chug video controls.

- [ ] **Step 3: Commit only if the contract required corrections**

```powershell
git add scripts/nativePwaParity.test.js
git commit -m "test: lock native feature parity boundaries"
```

### Task 7: Full PWA Protection Gate

**Files:**
- Verify only; no source edits expected.

- [ ] **Step 1: Run every repository test script**

```powershell
$tests = Get-ChildItem scripts -File -Filter '*.test.js' | Sort-Object Name
foreach ($test in $tests) {
  node $test.FullName
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Expected: every test prints its success message and the loop exits 0.

- [ ] **Step 2: Run static and dependency checks**

```powershell
npx tsc --noEmit
npx expo-doctor
git diff --check
```

Expected: TypeScript exits 0, Expo Doctor passes all checks, and no whitespace errors appear.

- [ ] **Step 3: Export and validate the production PWA**

```powershell
npm run build:web
npm run test:serve-dist
```

Expected: production export succeeds and `serve-dist checks passed`.

- [ ] **Step 4: Smoke-test the PWA at the S22 viewport**

Run the built PWA and inspect it at 360×780 and 390×844. Verify authentication, Feed, People, Record, Legends, Profile, Notifications, post details, and PWA install/update behavior. Compare against the pre-change PWA reference; there must be no intentional web visual or behavioral difference.

### Task 8: Final Android Build And Galaxy S22 Parity Pass

**Files:**
- Modify: `app.json` only if the notification plan's version code has already shipped; increment from 2 to 3 before this later build.
- Build artifact only.

- [ ] **Step 1: Increment version code when required**

If version code 2 was installed during the notification plan, update:

```json
"versionCode": 3
```

Run: `npm run test:android-apk-config`

Expected: PASS. Commit with `git commit -m "chore: version Android parity build"`.

- [ ] **Step 2: Build the final preview APK**

Run: `npm run build:android:apk`

Expected: EAS produces an updateable APK for `com.beerva.app`.

- [ ] **Step 3: Install on the Galaxy S22**

Install over the existing app and confirm version upgrade, retained data, status-bar placement, navigation-bar clearance, and no first-launch crash.

- [ ] **Step 4: Audit every standard screen**

Compare Android against the PWA for:

- authentication and profile setup;
- Feed cards, media, comments, cheers, mentions, challenges, live sessions, and pagination;
- People search/follow flows;
- Record session, drinks, photos, buddies, pub crawl, and editing;
- Legends, leaderboards, challenges, and detail routes;
- own and other profiles, stats, badges, avatars, and settings;
- Notifications and all supported tap destinations;
- admin posts and beverage submissions;
- dialogs, sheets, cropper, image viewer, trophies, roulette, loading, empty, long-content, and error states.

Expected: shared content geometry matches the PWA; only approved native adaptations differ.

- [ ] **Step 5: Verify native interactions**

Test Android back, keyboard dismissal, pull-to-refresh, long press photo saving, camera/gallery permissions, location, haptics, fake-beer sensors, offline/reconnect, and app resume. Confirm no web-only install or service-worker UI appears.

- [ ] **Step 6: Re-run notification acceptance**

Repeat foreground, background, and terminated push delivery and tap routing from the notification plan. UI changes must not regress native token synchronization or routing.

- [ ] **Step 7: Final release evidence**

```powershell
npm run test:native-pwa-parity
npm run test:floating-nav
npm run test:native-push-lifecycle
npm run test:native-push-receipts
npx tsc --noEmit
npm run build:web
git status --short
```

Expected: all commands pass, the PWA export succeeds, and the worktree contains no unintended changes.

