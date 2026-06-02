# One-Time Push Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a one-time app-open push notification reminder to signed-in users who have not enabled push, with direct enable and profile-guidance actions.

**Architecture:** Add a pure helper for one-time eligibility and localStorage state, then a root authenticated prompt component that uses the existing push helpers. Mount the prompt in `RootNavigator` after profile setup and add a transient Profile tab hint via route params.

**Tech Stack:** Expo React Native, React Navigation, TypeScript, Supabase auth, Web Push helpers, Node source-level regression scripts.

---

## File Structure

### Create

- `src/lib/pushReminderPrompt.ts`
  - Pure helper for one-time reminder keys, safe storage access, seen-state reads/writes, and eligibility decisions.
- `src/components/PushReminderPrompt.tsx`
  - Authenticated root overlay that checks eligibility, enables push, records one-time seen state, and opens the Profile hint.
- `scripts/pushReminderPrompt.test.js`
  - Focused source and helper tests for the reminder behavior.

### Modify

- `package.json`
  - Adds `test:push-reminder`.
- `src/navigation/RootNavigator.tsx`
  - Mounts `PushReminderPrompt` inside the authenticated app tree and routes `Show me where` to the Profile tab.
- `src/screens/ProfileScreen.tsx`
  - Reads `showPushReminderHint`, shows a short hint beside the existing push button, and clears the param.

### Intentionally Unchanged

- `src/lib/pushNotifications.ts`
  - Existing enable/disable/support/subscription behavior remains the source of truth.
- `src/screens/ProfileSetupScreen.tsx`
  - Existing setup push button stays unchanged.
- Supabase migrations/functions
  - No database changes are needed for a client-only reminder.

## Task 1: Add Reminder Eligibility And One-Time Storage

**Files:**
- Create: `scripts/pushReminderPrompt.test.js`
- Create: `src/lib/pushReminderPrompt.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing helper tests**

Create `scripts/pushReminderPrompt.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });

  const compiledModule = new Module(filename, module);
  compiledModule.filename = filename;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(filename));
  compiledModule._compile(outputText, filename);
  return compiledModule.exports;
};

const helperPath = path.join(root, 'src/lib/pushReminderPrompt.ts');
assert.ok(fs.existsSync(helperPath), 'push reminder helper should exist');

const {
  PUSH_REMINDER_SEEN_KEY_PREFIX,
  getPushReminderSeenKey,
  hasSeenPushReminder,
  rememberPushReminderSeen,
  shouldShowPushReminder,
} = loadTypeScriptModule('src/lib/pushReminderPrompt.ts');

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

assert.equal(
  PUSH_REMINDER_SEEN_KEY_PREFIX,
  'beerva.pushReminder.seen',
  'push reminder should use a stable Beerva-specific localStorage key prefix'
);

assert.equal(
  getPushReminderSeenKey('user-1'),
  'beerva.pushReminder.seen.user-1',
  'push reminder seen keys should be scoped by user id'
);

assert.equal(
  getPushReminderSeenKey(' user-2 '),
  'beerva.pushReminder.seen.user-2',
  'push reminder seen keys should trim user ids'
);

{
  const storage = createStorage();
  assert.equal(hasSeenPushReminder(storage, 'user-1'), false, 'new users should not be marked seen');
  rememberPushReminderSeen(storage, 'user-1');
  assert.equal(hasSeenPushReminder(storage, 'user-1'), true, 'remembering should mark that user seen');
  assert.equal(hasSeenPushReminder(storage, 'user-2'), false, 'seen state should not leak across users');
}

{
  const storage = createStorage();
  const baseInput = {
    userId: 'user-1',
    support: { supported: true },
    permission: 'default',
    subscribed: false,
    storage,
  };

  assert.equal(
    shouldShowPushReminder(baseInput),
    true,
    'supported unsubscribed users who have not seen the reminder should qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, subscribed: true }),
    false,
    'subscribed users should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, support: { supported: false } }),
    false,
    'unsupported push environments should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, permission: 'denied' }),
    false,
    'denied browser notification permission should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, permission: 'unsupported' }),
    false,
    'unsupported notification permission should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, userId: null }),
    false,
    'missing signed-in users should not qualify'
  );

  assert.equal(
    shouldShowPushReminder({ ...baseInput, storage: null }),
    false,
    'unavailable localStorage should not show a one-time prompt'
  );

  rememberPushReminderSeen(storage, 'user-1');
  assert.equal(
    shouldShowPushReminder(baseInput),
    false,
    'users who have already seen the reminder should not qualify again'
  );
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(
  packageJson.scripts['test:push-reminder'],
  'node scripts/pushReminderPrompt.test.js',
  'package script should run the push reminder checks'
);

console.log('push reminder helper checks passed');
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run:

```powershell
node scripts/pushReminderPrompt.test.js
```

Expected: FAIL with `push reminder helper should exist`.

- [ ] **Step 3: Add the helper module**

Create `src/lib/pushReminderPrompt.ts`:

```ts
export const PUSH_REMINDER_SEEN_KEY_PREFIX = 'beerva.pushReminder.seen';

export type PushReminderStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type PushReminderPermission = 'unsupported' | 'default' | 'denied' | 'granted' | 'prompt';

export type PushReminderSupportInfo = {
  supported: boolean;
};

type PushReminderEligibilityInput = {
  userId: string | null | undefined;
  support: PushReminderSupportInfo;
  permission: PushReminderPermission;
  subscribed: boolean;
  storage: PushReminderStorage | null;
};

const normalizeUserId = (userId: string) => userId.trim();

export const getPushReminderSeenKey = (userId: string) => {
  return `${PUSH_REMINDER_SEEN_KEY_PREFIX}.${normalizeUserId(userId)}`;
};

export const getPushReminderStorage = (): PushReminderStorage | null => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const hasSeenPushReminder = (
  storage: PushReminderStorage | null,
  userId: string | null | undefined
) => {
  if (!storage || !userId?.trim()) return false;

  return storage.getItem(getPushReminderSeenKey(userId)) === '1';
};

export const rememberPushReminderSeen = (
  storage: PushReminderStorage | null,
  userId: string | null | undefined
) => {
  if (!storage || !userId?.trim()) return;

  storage.setItem(getPushReminderSeenKey(userId), '1');
};

export const shouldShowPushReminder = ({
  userId,
  support,
  permission,
  subscribed,
  storage,
}: PushReminderEligibilityInput) => {
  if (!userId?.trim()) return false;
  if (!storage) return false;
  if (!support.supported) return false;
  if (subscribed) return false;
  if (permission === 'denied' || permission === 'unsupported') return false;

  return !hasSeenPushReminder(storage, userId);
};
```

- [ ] **Step 4: Add the package test script**

In `package.json`, add this entry inside `scripts` near the existing notification tests:

```json
"test:push-reminder": "node scripts/pushReminderPrompt.test.js",
```

- [ ] **Step 5: Run the helper tests to verify they pass**

Run:

```powershell
node scripts/pushReminderPrompt.test.js
```

Expected: PASS with `push reminder helper checks passed`.

- [ ] **Step 6: Commit the helper**

```powershell
git add scripts/pushReminderPrompt.test.js src/lib/pushReminderPrompt.ts package.json package-lock.json
git commit -m "feat: add push reminder eligibility"
```

## Task 2: Add The Root Push Reminder Prompt

**Files:**
- Modify: `scripts/pushReminderPrompt.test.js`
- Create: `src/components/PushReminderPrompt.tsx`

- [ ] **Step 1: Add failing component source checks**

Append this block to `scripts/pushReminderPrompt.test.js` before the final `console.log`:

```js
const componentPath = path.join(root, 'src/components/PushReminderPrompt.tsx');
assert.ok(fs.existsSync(componentPath), 'PushReminderPrompt component should exist');
const componentSource = fs.readFileSync(componentPath, 'utf8');

assert.match(
  componentSource,
  /export const PushReminderPrompt = \(\{ onShowProfileHint \}: PushReminderPromptProps\)/,
  'push reminder prompt should accept a profile-hint callback'
);

assert.match(
  componentSource,
  /isCurrentlySubscribed\(\)/,
  'push reminder prompt should check the current push subscription before showing'
);

assert.match(
  componentSource,
  /enablePushNotifications\(\)/,
  'Enable now should reuse the existing push enable flow'
);

assert.match(
  componentSource,
  /rememberPushReminderSeen\(getPushReminderStorage\(\), userId\)/,
  'dismissal actions should record the one-time seen state'
);

assert.match(componentSource, />Enable now</, 'prompt should expose an Enable now action');
assert.match(componentSource, />Show me where</, 'prompt should expose a Show me where action');
assert.match(componentSource, />Not now</, 'prompt should expose a Not now action');
assert.match(
  componentSource,
  /Notifications blocked/,
  'failed permission requests should reuse the blocked notifications copy style'
);
```

Update the final log line to:

```js
console.log('push reminder checks passed');
```

- [ ] **Step 2: Run the push reminder tests to verify they fail**

Run:

```powershell
npm run test:push-reminder
```

Expected: FAIL with `PushReminderPrompt component should exist`.

- [ ] **Step 3: Create the prompt component**

Create `src/components/PushReminderPrompt.tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, UserCircle, X } from 'lucide-react-native';

import { colors } from '../theme/colors';
import { radius, shadows, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import { showAlert } from '../lib/dialogs';
import {
  enablePushNotifications,
  getPushPermissionStatus,
  getPushSupportInfo,
  isCurrentlySubscribed,
} from '../lib/pushNotifications';
import {
  getPushReminderStorage,
  rememberPushReminderSeen,
  shouldShowPushReminder,
} from '../lib/pushReminderPrompt';
import { supabase } from '../lib/supabase';

type PushReminderPromptProps = {
  onShowProfileHint: () => void;
};

const SHOW_REMINDER_DELAY_MS = 1200;

export const PushReminderPrompt = ({ onShowProfileHint }: PushReminderPromptProps) => {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    let active = true;
    const timeout = setTimeout(() => {
      const checkEligibility = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const currentUserId = user?.id || null;
        if (!currentUserId) return;

        const support = getPushSupportInfo();
        const permission = getPushPermissionStatus();
        const storage = getPushReminderStorage();
        const subscribed = support.supported ? await isCurrentlySubscribed() : false;

        if (!active) return;
        if (shouldShowPushReminder({
          userId: currentUserId,
          support,
          permission,
          subscribed,
          storage,
        })) {
          setUserId(currentUserId);
          setVisible(true);
        }
      };

      checkEligibility().catch((error) => {
        console.warn('Could not check push reminder eligibility:', error);
      });
    }, SHOW_REMINDER_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      translateY.setValue(28);
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 7,
        tension: 58,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY, visible]);

  const rememberAndClose = useCallback(() => {
    rememberPushReminderSeen(getPushReminderStorage(), userId);
    setVisible(false);
  }, [userId]);

  const enableNow = useCallback(async () => {
    if (busy) return;

    setBusy(true);
    try {
      const result = await enablePushNotifications();
      if (result.ok) {
        rememberAndClose();
        showAlert('Push notifications on', 'We will buzz you when someone cheers, comments, or invites you.');
        return;
      }

      const status = getPushPermissionStatus();
      if (status === 'denied') {
        showAlert(
          'Notifications blocked',
          'Your browser is blocking notifications for Beerva. Re-enable them in your browser settings, then try again.'
        );
      } else {
        showAlert('Could not enable push', result.reason || 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, rememberAndClose]);

  const showWhere = useCallback(() => {
    rememberAndClose();
    onShowProfileHint();
  }, [onShowProfileHint, rememberAndClose]);

  if (Platform.OS !== 'web' || !visible) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={rememberAndClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss push notification reminder"
      />
      <Animated.View
        style={[
          styles.card,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.iconBadge}>
            <Bell color={colors.background} size={22} />
          </View>
          <Pressable
            style={styles.closeButton}
            onPress={rememberAndClose}
            accessibilityRole="button"
            accessibilityLabel="Close push notification reminder"
          >
            <X color={colors.textMuted} size={18} />
          </Pressable>
        </View>

        <Text style={styles.title}>Turn on push notifications</Text>
        <Text style={styles.description}>
          Get a buzz when someone cheers, comments, invites you, tags you as a drinking buddy, or posts an official Beerva update.
        </Text>

        <View style={styles.profileHint}>
          <View style={styles.profileHintIcon}>
            <UserCircle color={colors.primary} size={18} />
          </View>
          <Text style={styles.profileHintText}>You can also find the button on your Profile tab.</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={enableNow}
            disabled={busy}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel="Enable push notifications now"
          >
            {busy ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>Enable now</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={showWhere}
            disabled={busy}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Show push notification button on profile"
          >
            <Text style={styles.secondaryButtonText}>Show me where</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.notNowButton}
          onPress={rememberAndClose}
          disabled={busy}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Do not show push notification reminder again"
        >
          <Text style={styles.notNowText}>Not now</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 94,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.54)',
  },
  card: {
    width: '100%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceRaised,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.raised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  title: {
    ...typography.h2,
    fontSize: 22,
    lineHeight: 28,
  },
  description: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 22,
  },
  profileHint: {
    minHeight: 44,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileHintIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  profileHintText: {
    ...typography.caption,
    flex: 1,
    color: colors.text,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '900',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  secondaryButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
    textAlign: 'center',
  },
  notNowButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notNowText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
});
```

- [ ] **Step 4: Run the push reminder tests to verify they pass**

Run:

```powershell
npm run test:push-reminder
```

Expected: PASS with `push reminder checks passed`.

- [ ] **Step 5: Commit the prompt component**

```powershell
git add scripts/pushReminderPrompt.test.js src/components/PushReminderPrompt.tsx
git commit -m "feat: add one-time push reminder prompt"
```

## Task 3: Wire Profile Navigation And Hint

**Files:**
- Modify: `scripts/pushReminderPrompt.test.js`
- Modify: `src/navigation/RootNavigator.tsx`
- Modify: `src/screens/ProfileScreen.tsx`

- [ ] **Step 1: Add failing navigation and Profile hint checks**

Append this block to `scripts/pushReminderPrompt.test.js` before the final `console.log`:

```js
const rootNavigatorSource = fs.readFileSync(path.join(root, 'src/navigation/RootNavigator.tsx'), 'utf8');
assert.match(
  rootNavigatorSource,
  /import \{ PushReminderPrompt \} from '\.\.\/components\/PushReminderPrompt';/,
  'root navigator should import the push reminder prompt'
);
assert.match(
  rootNavigatorSource,
  /navigationRef\.navigate\('MainTabs', \{\s*screen: 'Profile',\s*params: \{ showPushReminderHint: true \},\s*\}\)/,
  'Show me where should navigate to the Profile tab with the hint param'
);
assert.match(
  rootNavigatorSource,
  /<PushReminderPrompt onShowProfileHint=\{openPushReminderProfileHint\} \/>/,
  'authenticated root navigation should mount the push reminder prompt'
);

const profileScreenSource = fs.readFileSync(path.join(root, 'src/screens/ProfileScreen.tsx'), 'utf8');
assert.match(
  profileScreenSource,
  /route\?\.params\?\.showPushReminderHint/,
  'Profile screen should read the push reminder hint route param'
);
assert.match(
  profileScreenSource,
  /navigation\.setParams\(\{ showPushReminderHint: undefined \}\)/,
  'Profile screen should clear the one-shot push reminder hint param'
);
assert.match(
  profileScreenSource,
  /This is the button/,
  'Profile screen should show contextual copy beside the push button'
);
assert.match(
  profileScreenSource,
  /pushReminderHintVisible && pushSupported && !pushSubscribed/,
  'Profile hint should only appear around an available unsubscribed push button'
);
```

- [ ] **Step 2: Run the push reminder tests to verify they fail**

Run:

```powershell
npm run test:push-reminder
```

Expected: FAIL with `root navigator should import the push reminder prompt`.

- [ ] **Step 3: Mount the prompt in authenticated root navigation**

In `src/navigation/RootNavigator.tsx`, add the import near the other component imports:

```ts
import { PushReminderPrompt } from '../components/PushReminderPrompt';
```

Inside `RootNavigator`, after `const sessionUserId = session?.user?.id ?? null;`, add:

```ts
  const openPushReminderProfileHint = useCallback(() => {
    if (!navigationRef.isReady()) return;

    navigationRef.navigate('MainTabs', {
      screen: 'Profile',
      params: { showPushReminderHint: true },
    });
  }, []);
```

In the authenticated, post-profile-setup branch, replace the existing `Stack.Navigator` child of `NotificationsProvider` with this fragment:

```tsx
              <>
                <Stack.Navigator
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    animation: 'slide_from_right',
                  }}
                >
                  <Stack.Screen name="MainTabs" component={MainTabs} />
                  <Stack.Screen name="UserProfile" component={UserProfileScreen} />
                  <Stack.Screen name="PubLegendDetail" component={PubLegendDetailScreen} />
                  <Stack.Screen name="ChallengeDetail" component={ChallengeDetailScreen} />
                  <Stack.Screen name="Notifications" component={NotificationsScreen} />
                  <Stack.Screen name="PostDetail" component={PostDetailScreen} />
                  <Stack.Screen name="EditSession" component={EditSessionScreen} />
                  <Stack.Screen name="HangoverRating" component={HangoverRatingScreen} />
                  <Stack.Screen name="ChugVerification" component={ChugVerificationScreen} />
                  <Stack.Screen name="FakeBeer" component={FakeBeerScreen} options={{ animation: 'none' }} />
                  <Stack.Screen name="AdminTools" component={AdminToolsScreen} />
                </Stack.Navigator>
                <PushReminderPrompt onShowProfileHint={openPushReminderProfileHint} />
              </>
```

- [ ] **Step 4: Add the Profile hint behavior**

In `src/screens/ProfileScreen.tsx`, change the React import to include `useEffect`:

```ts
import React, { useState, useCallback, useEffect } from 'react';
```

Change the component signature:

```ts
export const ProfileScreen = ({ route }: any) => {
```

After the existing push state declarations, add:

```ts
  const [pushReminderHintVisible, setPushReminderHintVisible] = useState(false);
  const showPushReminderHint = Boolean(route?.params?.showPushReminderHint);

  useEffect(() => {
    if (!showPushReminderHint) return;

    setPushReminderHintVisible(true);
    navigation.setParams({ showPushReminderHint: undefined });
  }, [navigation, showPushReminderHint]);
```

Inside `togglePush`, in the `if (result.ok)` branch, add this line before the success alert:

```ts
          setPushReminderHintVisible(false);
```

Immediately before the existing `{pushSupported ? (` push button block, add:

```tsx
      {pushReminderHintVisible && pushSupported && !pushSubscribed ? (
        <View style={styles.pushReminderHint}>
          <Bell color={colors.primary} size={18} />
          <View style={styles.pushReminderHintTextWrap}>
            <Text style={styles.pushReminderHintTitle}>This is the button</Text>
            <Text style={styles.pushReminderHintText}>Tap it here whenever you want Beerva to buzz you about cheers, comments, invites, and updates.</Text>
          </View>
          <TouchableOpacity
            style={styles.pushReminderHintClose}
            onPress={() => setPushReminderHintVisible(false)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Hide push notification hint"
          >
            <X color={colors.textMuted} size={16} />
          </TouchableOpacity>
        </View>
      ) : null}
```

Add these styles near the existing push styles:

```ts
  pushReminderHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  pushReminderHintTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  pushReminderHintTitle: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '900',
  },
  pushReminderHintText: {
    ...typography.caption,
    color: colors.text,
    lineHeight: 18,
    marginTop: 3,
  },
  pushReminderHintClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test:push-reminder
npm run test:app-theme-screens
```

Expected: both commands PASS.

- [ ] **Step 6: Commit navigation and Profile hint**

```powershell
git add scripts/pushReminderPrompt.test.js src/navigation/RootNavigator.tsx src/screens/ProfileScreen.tsx
git commit -m "feat: show push reminder profile hint"
```

## Task 4: Verify The Complete Reminder

**Files:**
- Verify only.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
npm run test:push-reminder
npm run test:pwa-install
npm run test:notifications
npm run test:app-theme-screens
```

Expected: all commands PASS.

- [ ] **Step 2: Run the web build**

Run:

```powershell
npm run build:web
```

Expected: Expo web export succeeds.

- [ ] **Step 3: Inspect the working tree**

Run:

```powershell
git status --short
```

Expected: no uncommitted implementation files.

- [ ] **Step 4: Report behavior and rollout**

Report:

```text
The one-time push reminder is client-side only. No Supabase migration or backend deployment is required. Existing users will see it once on a supported unsubscribed device after they open the updated app.
```

## Spec Coverage Checklist

- One-time only: Task 1 scoped localStorage seen state.
- Signed-in and past setup: Task 2 checks Supabase user and Task 3 mounts only inside the authenticated post-setup tree.
- Supported push only: Task 1 eligibility and Task 2 existing support helper.
- Unsubscribed only: Task 1 eligibility and Task 2 `isCurrentlySubscribed()`.
- Denied permission skipped: Task 1 eligibility.
- Direct enable action: Task 2 `Enable now`.
- Show Profile button location: Task 3 route param and Profile hint.
- Existing profile/setup buttons preserved: Task 3 adds only adjacent Profile hint and does not change ProfileSetup.
- No backend fan-out: no migration/function files in this plan.
- Verification: Task 4 focused regressions and web build.
