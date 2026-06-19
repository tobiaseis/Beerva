# Android PWA Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android's floating navigation, top spacing, and launcher icon match the PWA while leaving the PWA unchanged.

**Architecture:** Keep the existing React Navigation tab bar for web. Render a native-only custom bar with five equal columns on Android, calculate its vertical position from the safe area, and use a padded adaptive foreground derived from the PWA icon.

**Tech Stack:** Expo SDK 54, React Native, React Navigation bottom tabs, react-native-safe-area-context, pngjs, Node.js assert tests.

---

### Task 1: Write Failing Parity Tests

**Files:**
- Modify: `scripts/floatingBottomNav.test.js`
- Modify: `scripts/androidNativeApkConfig.test.js`
- Create: `src/navigation/AndroidFloatingTabBar.tsx`
- Create: `assets/beerva-android-adaptive-foreground.png`

- [x] **Step 1: Add the regression assertions**

Add to `scripts/floatingBottomNav.test.js`:

```js
const androidTabBarPath = 'src/navigation/AndroidFloatingTabBar.tsx';
const feedScreenPath = 'src/screens/FeedScreen.tsx';
assert.ok(fs.existsSync(path.resolve(__dirname, '..', androidTabBarPath)));
const androidTabBarSource = readSource(androidTabBarPath);
const feedScreenSource = readSource(feedScreenPath);
assert.match(source, /tabBar=\{Platform\.OS === 'android' \? \(props\) => <AndroidFloatingTabBar \{\.\.\.props\} \/> : undefined\}/);
assert.match(androidTabBarSource, /flex: 1[\s\S]*alignItems: 'center'[\s\S]*justifyContent: 'center'/);
assert.match(androidTabBarSource, /const bottom = Math\.max\(insets\.bottom \+ 12, floatingTabBarMetrics\.nativeBottom\)/);
assert.match(androidTabBarSource, /size: 24/);
assert.match(feedScreenSource, /useSafeAreaInsets/);
assert.match(feedScreenSource, /paddingTop: Platform\.OS === 'web' \? 12 : insets\.top \+ 12/);
```

Add to `scripts/androidNativeApkConfig.test.js`:

```js
const androidForegroundPath = path.join(root, 'assets', 'beerva-android-adaptive-foreground.png');
assert.equal(appJson.expo.android.adaptiveIcon.foregroundImage, './assets/beerva-android-adaptive-foreground.png');
assert.ok(fs.existsSync(androidForegroundPath));
assert.equal(appJson.expo.icon, './assets/beerva-app-icon.png');
```

- [x] **Step 2: Prove the tests are red**

Run:

```powershell
node scripts/floatingBottomNav.test.js
node scripts/androidNativeApkConfig.test.js
```

Expected: both tests fail because the custom Android bar and adaptive foreground do not exist.

### Task 2: Implement the Native-Only Pill

**Files:**
- Create: `src/navigation/AndroidFloatingTabBar.tsx`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/theme/layout.ts`
- Test: `scripts/floatingBottomNav.test.js`

- [x] **Step 1: Create the deterministic tab-bar component**

Create `src/navigation/AndroidFloatingTabBar.tsx` with a `BottomTabBarProps` component that:
- calculates `width` with `Math.min(Math.max(viewportWidth - 32, 0), 520)`;
- calculates `bottom` with `Math.max(insets.bottom + 12, floatingTabBarMetrics.nativeBottom)`;
- renders a 60dp `#172238` pill with 6dp top and 7dp bottom padding;
- maps `state.routes` to `Pressable` children with `flex: 1`, `alignItems: 'center'`, and `justifyContent: 'center'`;
- calls each descriptor's `tabBarIcon` with a fixed `size: 24`;
- renders a 24dp icon slot, an 11dp `Inter_600SemiBold` label, and an optional descriptor `tabBarBadge`;
- emits `tabPress` and `tabLongPress` navigation events before navigating.

Use this style contract:

```tsx
wrapper: { alignSelf: 'center', position: 'absolute', zIndex: 20 },
pill: {
  ...shadows.raised,
  backgroundColor: '#172238',
  borderColor: 'rgba(148, 163, 184, 0.18)',
  borderRadius: radius.pill,
  borderWidth: 1,
  flexDirection: 'row',
  height: floatingTabBarMetrics.nativeHeight,
  paddingBottom: 7,
  paddingTop: 6,
},
tab: { alignItems: 'center', flex: 1, justifyContent: 'center', minWidth: 0 },
iconSlot: { alignItems: 'center', height: 24, justifyContent: 'center', position: 'relative', width: 24 },
label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 14, marginTop: 2 },
```

- [x] **Step 2: Use it on Android only**

In `src/navigation/RootNavigator.tsx`, import `AndroidFloatingTabBar` and add this navigator prop:

```tsx
tabBar={Platform.OS === 'android' ? (props) => <AndroidFloatingTabBar {...props} /> : undefined}
```

Keep the existing web `tabBarStyle` block byte-for-byte intact. Replace the current native default tab-bar style branch with `{ display: 'none' }`; remove the native `insets`, `nativeTabBarBottom`, and `nativeTabBarLeft` calculations from `MainTabs`.

- [x] **Step 3: Reserve native content space**

Set the native metrics in `src/theme/layout.ts`:

```ts
const floatingTabBarNativeBottom = 56;
nativeHeight: floatingTabBarHeight,
nativeContentInset: floatingTabBarHeight + floatingTabBarNativeBottom + 24,
```

- [x] **Step 4: Verify the component**

Run: `node scripts/floatingBottomNav.test.js`

Expected: `floating bottom nav checks passed`.

### Task 3: Correct the Feed Header and Adaptive Icon

**Files:**
- Modify: `src/screens/FeedScreen.tsx`
- Create: `scripts/generateAndroidAdaptiveIcon.js`
- Create: `assets/beerva-android-adaptive-foreground.png`
- Modify: `app.json`
- Test: `scripts/androidNativeApkConfig.test.js`

- [x] **Step 1: Use the real top safe area**

Import `useSafeAreaInsets` into `FeedScreen`, call `const insets = useSafeAreaInsets();`, and change the header usage to:

```tsx
<View style={[styles.header, { paddingTop: Platform.OS === 'web' ? 12 : insets.top + 12 }]}>
```

Remove the static `paddingTop` from `styles.header`. Do not change the web header's 12dp spacing.

- [x] **Step 2: Generate the Android foreground**

Create `scripts/generateAndroidAdaptiveIcon.js` that reads `assets/beerva-app-icon.png` with `pngjs`, creates a transparent 432x432 canvas, and nearest-neighbor copies the source into a 362x362 square centered with a 35px inset. Write it to `assets/beerva-android-adaptive-foreground.png`.

Run:

```powershell
node scripts/generateAndroidAdaptiveIcon.js
```

- [x] **Step 3: Configure only Android**

Change only this value in `app.json`:

```json
"foregroundImage": "./assets/beerva-android-adaptive-foreground.png"
```

Leave the top-level `icon` and every `web` field unchanged.

- [x] **Step 4: Verify the icon configuration**

Run: `node scripts/androidNativeApkConfig.test.js`

Expected: `Android native APK config checks passed`.

### Task 4: Verify Both Surfaces

**Files:**
- Modify: all files listed in Tasks 1-3
- Test: native and PWA static checks

- [x] **Step 1: Run focused checks**

```powershell
node scripts/floatingBottomNav.test.js
node scripts/androidNativeApkConfig.test.js
node scripts/pwaStartup.test.js
npx tsc --noEmit
```

Expected: each command exits 0.

- [x] **Step 2: Protect the active PWA**

Run: `npm run build:web`

Expected: Expo web export and service-worker versioning exit 0.

- [x] **Step 3: Commit the repair**

```powershell
git add app.json assets/beerva-android-adaptive-foreground.png scripts/androidNativeApkConfig.test.js scripts/floatingBottomNav.test.js scripts/generateAndroidAdaptiveIcon.js src/navigation/AndroidFloatingTabBar.tsx src/navigation/RootNavigator.tsx src/screens/FeedScreen.tsx src/theme/layout.ts docs/superpowers/plans/2026-06-19-android-pwa-parity.md
git commit -m "fix: match android navigation to PWA"
```

Expected: one commit containing only Android navigation, adaptive-icon, regression-test, and plan changes. Do not start an APK build in this task.
