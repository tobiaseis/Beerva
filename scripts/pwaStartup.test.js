const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const pushSource = fs.readFileSync(path.join(root, 'src/lib/pushNotifications.ts'), 'utf8');
const rootNavigatorSource = fs.readFileSync(path.join(root, 'src/navigation/RootNavigator.tsx'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));

const getExportedAsyncFunctionBody = (source, name) => {
  const marker = `export const ${name} = async`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} should be exported`);

  const bodyStart = source.indexOf('{', start);
  assert.notEqual(bodyStart, -1, `${name} should have a function body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(bodyStart + 1, index);
    }
  }

  throw new Error(`${name} body should close`);
};

const registerServiceWorkerBody = getExportedAsyncFunctionBody(pushSource, 'registerServiceWorker');

assert.match(
  pushSource,
  /const isServiceWorkerSupported = \(\): boolean =>/,
  'service worker support should be checked independently from push support'
);

assert.doesNotMatch(
  registerServiceWorkerBody,
  /isPushSupported\(\)/,
  'registering the service worker should not be gated by push support'
);

assert.match(
  registerServiceWorkerBody,
  /if \(!isServiceWorkerSupported\(\)\) return null;/,
  'registerServiceWorker should only require service worker support'
);

[
  '@expo-google-fonts/inter/400Regular',
  '@expo-google-fonts/inter/500Medium',
  '@expo-google-fonts/inter/600SemiBold',
  '@expo-google-fonts/inter/700Bold',
  '@expo-google-fonts/righteous/400Regular',
].forEach((fontImport) => {
  assert.match(
    appSource,
    new RegExp(`from '${fontImport.replace(/\//g, '\\/')}'`),
    `App should directly import ${fontImport}`
  );
});

assert.doesNotMatch(
  appSource,
  /from '@expo-google-fonts\/inter'/,
  'App should not import Inter from the barrel file because it exports every weight'
);

assert.doesNotMatch(
  appSource,
  /from '@expo-google-fonts\/righteous'/,
  'App should not import Righteous from the barrel file'
);

assert.match(
  appSource,
  /const \[fontsLoaded, fontError\] = useFonts/,
  'App should capture font loading errors'
);

assert.match(
  appSource,
  /const fontsReady = fontsLoaded \|\| Boolean\(fontError\);/,
  'App should continue when font loading fails so the splash cannot hang forever'
);

assert.match(
  appSource,
  /if \(!fontsReady\) return;/,
  'splash fade should wait for fontsReady, not only fontsLoaded'
);

assert.doesNotMatch(
  appSource,
  /fontsLoaded && splashDone/,
  'RootNavigator should render when fonts are loaded or font loading failed'
);

const recordShortcut = manifest.shortcuts.find((shortcut) => shortcut.short_name === 'Record');
assert.equal(
  recordShortcut?.url,
  '/?tab=record',
  'Record manifest shortcut should launch with tab=record'
);

assert.match(
  rootNavigatorSource,
  /const shouldOpenRecordFromUrl = \(\) =>/,
  'RootNavigator should parse the Record shortcut URL'
);

assert.match(
  rootNavigatorSource,
  /params\.get\('tab'\) === 'record'/,
  'Record shortcut parsing should check tab=record'
);

assert.match(
  rootNavigatorSource,
  /const pendingRecordOpenRef = useRef\(shouldOpenRecordFromUrl\(\)\)/,
  'Record shortcut should be queued until navigation is ready'
);

assert.match(
  rootNavigatorSource,
  /navigationRef\.navigate\('MainTabs', \{ screen: 'Record' \}\)/,
  'Record shortcut should navigate to the Record tab after bootstrap'
);

assert.match(
  rootNavigatorSource,
  /url\.searchParams\.delete\('tab'\)/,
  'Record shortcut query parameter should be cleared after handling'
);

console.log('PWA startup checks passed');
