const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'src/lib/deviceLocation.ts');
assert.ok(fs.existsSync(helperPath), 'device location helper should exist');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const recordSource = fs.readFileSync(path.join(root, 'src/screens/RecordScreen.tsx'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(
  packageJson.scripts['test:native-location'],
  'node scripts/nativeLocation.test.js',
  'package script should run native location checks'
);

assert.match(helperSource, /import \{ Platform \} from 'react-native'/, 'location helper should branch by platform');
assert.match(helperSource, /import\('expo-location'\)/, 'native branch should dynamically import expo-location');
assert.match(helperSource, /requestForegroundPermissionsAsync/, 'native location should request foreground permission');
assert.match(helperSource, /getCurrentPositionAsync/, 'native location should read current GPS position');
assert.match(helperSource, /getForegroundPermissionsAsync/, 'native passive location should check existing permission');
assert.match(helperSource, /navigator\.geolocation/, 'web location fallback should keep browser geolocation');

assert.match(
  recordSource,
  /import \{ getCurrentDeviceLocation, getPreviouslyGrantedDeviceLocation \} from '\.\.\/lib\/deviceLocation';/,
  'RecordScreen should import shared device location helpers'
);

assert.doesNotMatch(
  recordSource,
  /const getCurrentBrowserLocation =/,
  'RecordScreen should no longer define browser-only current location helper'
);

assert.doesNotMatch(
  recordSource,
  /const getPreviouslyGrantedBrowserLocation =/,
  'RecordScreen should no longer define browser-only passive location helper'
);

assert.match(recordSource, /getCurrentDeviceLocation\(\)/, 'RecordScreen should request shared current device location');
assert.match(recordSource, /getPreviouslyGrantedDeviceLocation\(\)/, 'RecordScreen should pre-warm location with shared helper');

console.log('native location checks passed');
