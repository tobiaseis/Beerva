const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
assert.ok(
  fs.existsSync(path.join(root, 'src/lib/useNativePushLifecycle.native.ts')),
  'native push lifecycle hook should exist'
);
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
