const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const indexHtmlSource = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const pushSource = fs.readFileSync(path.join(root, 'src/lib/pushNotifications.ts'), 'utf8');
const rootNavigatorSource = fs.readFileSync(path.join(root, 'src/navigation/RootNavigator.tsx'), 'utf8');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
const manifestJson = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));

const readPngSize = (relativePath) => {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${relativePath} should be a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const getExportedAsyncFunctionBody = (source, name) => {
  const marker = `export const ${name} = async`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} should be exported`);

  const arrowStart = source.indexOf('=>', start);
  assert.notEqual(arrowStart, -1, `${name} should use an arrow function`);

  const bodyStart = source.indexOf('{', arrowStart);
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
const enablePushNotificationsBody = getExportedAsyncFunctionBody(pushSource, 'enablePushNotifications');
const isCurrentlySubscribedBody = getExportedAsyncFunctionBody(pushSource, 'isCurrentlySubscribed');
const navigationCacheBlock = serviceWorkerSource.slice(
  serviceWorkerSource.indexOf("if (event.request.mode === 'navigate')"),
  serviceWorkerSource.indexOf('  // Cache-first for static assets')
);

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

assert.match(
  serviceWorkerSource,
  /const CACHE_NAME = 'beerva-cache-v11'/,
  'service worker cache should be bumped when startup caching behavior changes'
);

assert.match(
  indexHtmlSource,
  /navigator\.serviceWorker\.register\('\/sw\.js'/,
  'index.html should register the service worker before React boots so PWA scanners can detect it'
);

assert.doesNotMatch(
  indexHtmlSource,
  /<link rel="icon" href="\/favicon\.ico"/,
  'index.html should not let the Expo export append an .ico favicon over the PNG favicons'
);

assert.equal(
  manifest.lang,
  'en',
  'manifest should define the primary language'
);

assert.equal(
  manifest.dir,
  'ltr',
  'manifest should define language direction'
);

assert.deepEqual(
  manifest.display_override,
  ['standalone', 'browser'],
  'manifest should define display_override for install surfaces'
);

assert.equal(
  manifest.prefer_related_applications,
  false,
  'manifest should prefer the PWA because no native store listing is configured'
);

assert.equal(
  manifest.related_applications,
  undefined,
  'manifest should not include placeholder native app IDs'
);

assert.equal(
  manifest.iarc_rating_id,
  undefined,
  'manifest should not include a placeholder IARC rating'
);

assert.deepEqual(
  manifestJson,
  manifest,
  'manifest.json and manifest.webmanifest should stay in sync'
);

for (const icon of manifest.icons) {
  assert.notEqual(icon.type, 'image/x-icon', 'manifest icons should not include .ico files');
  assert.doesNotMatch(icon.src, /\.ico$/i, 'manifest icon sources should not point to .ico files');
  assert.equal(icon.type, 'image/png', `${icon.src} should be declared as image/png`);
  assert.ok(fs.existsSync(path.join(root, 'public', icon.src.replace(/^\//, ''))), `${icon.src} should exist in public`);
}

assert.ok(Array.isArray(manifest.screenshots), 'manifest should include screenshots');
assert.ok(manifest.screenshots.length >= 2, 'manifest should include at least narrow and wide screenshots');
const screenshotFormFactors = new Set(manifest.screenshots.map((screenshot) => screenshot.form_factor));
assert.ok(screenshotFormFactors.has('narrow'), 'manifest should include a narrow screenshot');
assert.ok(screenshotFormFactors.has('wide'), 'manifest should include a wide screenshot');

for (const screenshot of manifest.screenshots) {
  assert.equal(screenshot.type, 'image/png', `${screenshot.src} should be declared as image/png`);
  assert.ok(screenshot.label, `${screenshot.src} should have a label`);
  const publicPath = path.join('public', screenshot.src.replace(/^\//, ''));
  assert.ok(fs.existsSync(path.join(root, publicPath)), `${screenshot.src} should exist in public`);
  const size = readPngSize(publicPath);
  assert.equal(`${size.width}x${size.height}`, screenshot.sizes, `${screenshot.src} sizes should match the PNG dimensions`);
}

assert.match(
  isCurrentlySubscribedBody,
  /supabase\.auth\.getUser\(\)/,
  'push enabled state should verify the signed-in Supabase user, not only browser permission'
);

assert.match(
  isCurrentlySubscribedBody,
  /\.from\('push_subscriptions'\)/,
  'push enabled state should confirm the backend has a matching push subscription row'
);

assert.match(
  isCurrentlySubscribedBody,
  /\.eq\('endpoint', json\.endpoint\)/,
  'push enabled state should match the stored subscription by endpoint'
);

assert.match(
  enablePushNotificationsBody,
  /await subscription\.unsubscribe\(\)/,
  'failed backend registration should clean up the browser subscription so the UI cannot show a false enabled state'
);

assert.match(
  navigationCacheBlock,
  /return cachedResponse \|\| networkFetch/,
  'navigation requests should show the cached app shell first for fast PWA startup'
);

assert.match(
  navigationCacheBlock,
  /cache\.put\('\/', responseClone\)/,
  'cached-first startup should still refresh the app shell in the background'
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
