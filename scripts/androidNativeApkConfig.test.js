const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const easPath = path.join(root, 'eas.json');

assert.ok(fs.existsSync(easPath), 'eas.json should exist for Android APK builds');
const easJson = JSON.parse(fs.readFileSync(easPath, 'utf8'));

assert.equal(
  packageJson.scripts['build:android:apk'],
  'eas build -p android --profile preview',
  'package script should build the installable Android APK profile'
);

assert.equal(
  packageJson.scripts['build:android:apk:local'],
  'eas build -p android --profile preview --local',
  'package script should support local APK builds'
);

for (const dependencyName of ['expo-notifications', 'expo-constants', 'expo-location']) {
  assert.ok(
    packageJson.dependencies[dependencyName],
    `${dependencyName} should be installed for native Android support`
  );
}

assert.equal(appJson.expo.scheme, 'beerva', 'app should declare a beerva:// native scheme');
assert.equal(appJson.expo.android.package, 'com.beerva.app', 'Android package id should be stable');
assert.equal(appJson.expo.android.edgeToEdgeEnabled, true, 'existing Android edge-to-edge config should remain enabled');
assert.equal(appJson.expo.icon, './assets/beerva-app-icon.png', 'native app icon should use the Beerva logo');
assert.equal(
  appJson.expo.android.adaptiveIcon.foregroundImage,
  './assets/beerva-app-icon.png',
  'Android adaptive icon should use the Beerva logo instead of the Expo placeholder'
);

assert.ok(Array.isArray(appJson.expo.plugins), 'Expo plugins should be configured');
assert.ok(
  appJson.expo.plugins.some((plugin) => (
    Array.isArray(plugin)
      && plugin[0] === 'expo-notifications'
      && plugin[1].defaultChannel === 'default'
      && plugin[1].color === '#F5C542'
  )),
  'expo-notifications plugin should configure Android notification channel defaults'
);

for (const permission of [
  'CAMERA',
  'ACCESS_COARSE_LOCATION',
  'ACCESS_FINE_LOCATION',
  'POST_NOTIFICATIONS',
  'VIBRATE',
]) {
  assert.ok(
    appJson.expo.android.permissions.includes(permission),
    `Android permission ${permission} should be declared`
  );
}

assert.equal(
  easJson.build.preview.android.buildType,
  'apk',
  'preview build profile should produce an installable APK'
);
assert.equal(
  easJson.build.preview.distribution,
  'internal',
  'preview profile should be marked for internal distribution'
);

assert.equal(appJson.expo.web.output, 'single', 'PWA web output should stay single-file');
assert.equal(appJson.expo.web.display, 'standalone', 'PWA display mode should stay standalone');
assert.equal(appJson.expo.web.scope, '/', 'PWA scope should stay rooted');
assert.equal(appJson.expo.web.favicon, './assets/favicon.png', 'PWA favicon should stay unchanged');

console.log('Android native APK config checks passed');
