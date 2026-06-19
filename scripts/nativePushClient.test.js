const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/pushNotifications.ts'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:native-push-client'],
  'node scripts/nativePushClient.test.js',
  'package script should run native push client checks'
);

assert.match(source, /const isNativePushPlatform = \(\) => Platform\.OS === 'android'/, 'push helper should identify Android as native push platform');
assert.match(source, /const getNativeNotificationModules = async \(\) =>/, 'native notification modules should be dynamically imported');
assert.match(source, /import\('expo-notifications'\)/, 'native branch should dynamically import expo-notifications');
assert.match(source, /import\('expo-constants'\)/, 'native branch should dynamically import expo-constants');
assert.match(source, /setNotificationChannelAsync\('default'/, 'Android branch should create the default notification channel');
assert.match(source, /requestPermission:\s*true/, 'enable should be the only native helper path that requests notification permission');
assert.match(source, /requestPermission:\s*false/, 'native subscription checks should inspect permission without prompting');
assert.match(source, /getExpoPushTokenAsync\(\{\s*projectId\s*\}\)/, 'Android branch should request an Expo push token with the EAS project id');
assert.match(source, /\.from\('native_push_tokens'\)[\s\S]*\.upsert/, 'Android branch should upsert native push tokens');
assert.match(source, /expo_push_token:\s*token/, 'native token upsert should store expo_push_token');
assert.match(source, /platform:\s*'android'/, 'native token upsert should mark platform android');
assert.match(source, /\.from\('native_push_tokens'\)[\s\S]*\.delete\(\)/, 'disable should delete native push token rows on Android');
assert.match(source, /\.from\('native_push_tokens'\)[\s\S]*\.select\('id'\)/, 'subscription checks should query native token rows on Android');

assert.match(source, /if \(Platform\.OS === 'web'\)/, 'web push branches should remain platform-gated');
assert.match(source, /navigator\.serviceWorker\.register\('\/sw\.js'/, 'service worker registration should remain in the web path');
assert.match(source, /pushManager\.subscribe/, 'Web Push subscription path should remain');
assert.match(source, /\.from\('push_subscriptions'\)/, 'Web Push table should remain in use');
assert.doesNotMatch(
  source,
  /from 'expo-notifications'/,
  'expo-notifications should not be statically imported into the shared push helper'
);

console.log('native push client checks passed');
