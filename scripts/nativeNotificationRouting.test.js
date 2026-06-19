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
