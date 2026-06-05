const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const indexHtmlSource = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const pushSource = fs.readFileSync(path.join(root, 'src/lib/pushNotifications.ts'), 'utf8');
const rootNavigatorSource = fs.readFileSync(path.join(root, 'src/navigation/RootNavigator.tsx'), 'utf8');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));
const manifestJson = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
const APP_BACKGROUND_RGB = { red: 0x0d, green: 0x12, blue: 0x1a };
const MAX_BACKGROUND_CHANNEL_DELTA = 3;

const readPngSize = (relativePath) => {
  const buffer = fs.readFileSync(path.join(root, relativePath));
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${relativePath} should be a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const readPngPixels = (relativePath) => PNG.sync.read(fs.readFileSync(path.join(root, relativePath)));

const getPixelRgb = (png, x, y) => {
  const index = ((y * png.width) + x) * 4;
  return {
    red: png.data[index],
    green: png.data[index + 1],
    blue: png.data[index + 2],
  };
};

const assertRgbNear = (actual, expected, message) => {
  assert.ok(
    Math.abs(actual.red - expected.red) <= MAX_BACKGROUND_CHANNEL_DELTA
      && Math.abs(actual.green - expected.green) <= MAX_BACKGROUND_CHANNEL_DELTA
      && Math.abs(actual.blue - expected.blue) <= MAX_BACKGROUND_CHANNEL_DELTA,
    `${message}; expected rgb(${expected.red}, ${expected.green}, ${expected.blue}), got rgb(${actual.red}, ${actual.green}, ${actual.blue})`
  );
};

const assertStartupImageUsesFlatAppBackground = (relativePath) => {
  const png = readPngPixels(relativePath);
  const shortSide = Math.min(png.width, png.height);
  const samples = [
    [-0.28, -0.28],
    [0.28, -0.28],
    [-0.28, 0.28],
    [0.28, 0.28],
  ];

  for (const [xOffset, yOffset] of samples) {
    const x = Math.round((png.width / 2) + (xOffset * shortSide));
    const y = Math.round((png.height / 2) + (yOffset * shortSide));
    assertRgbNear(
      getPixelRgb(png, x, y),
      APP_BACKGROUND_RGB,
      `${relativePath} should not contain a second icon background at (${x}, ${y})`
    );
  }
};

const assertManifestIconUsesAppBackground = (relativePath) => {
  const png = readPngPixels(relativePath);
  const samples = [
    [Math.round(png.width * 0.12), Math.round(png.height * 0.12)],
    [Math.round(png.width * 0.88), Math.round(png.height * 0.12)],
    [Math.round(png.width * 0.12), Math.round(png.height * 0.88)],
    [Math.round(png.width * 0.88), Math.round(png.height * 0.88)],
  ];

  for (const [x, y] of samples) {
    assertRgbNear(
      getPixelRgb(png, x, y),
      APP_BACKGROUND_RGB,
      `${relativePath} should match the Android PWA splash background at (${x}, ${y})`
    );
  }
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
const syncPushSubscriptionBody = getExportedAsyncFunctionBody(pushSource, 'syncPushSubscription');
const navigationCacheBlock = serviceWorkerSource.slice(
  serviceWorkerSource.indexOf("if (event.request.mode === 'navigate')"),
  serviceWorkerSource.indexOf('  // Cache-first for static assets')
);
const staticAssetCacheBlock = serviceWorkerSource.slice(
  serviceWorkerSource.indexOf('  // Cache-first for static assets'),
  serviceWorkerSource.indexOf('  // Stale-while-revalidate for other requests')
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
  /const CACHE_NAME = 'beerva-cache-v14'/,
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
  const iconPath = path.join('public', icon.src.replace(/^\//, ''));
  assert.ok(fs.existsSync(path.join(root, iconPath)), `${icon.src} should exist in public`);
  assertManifestIconUsesAppBackground(iconPath);
}

const startupImagePaths = [
  ...indexHtmlSource.matchAll(/<link rel="apple-touch-startup-image" href="\/(apple-splash-\d+-\d+\.png)"/g),
].map((match) => path.join('public', match[1]));

assert.ok(startupImagePaths.length > 0, 'index.html should include generated iOS startup images');

for (const startupImagePath of startupImagePaths) {
  assertStartupImageUsesFlatAppBackground(startupImagePath);
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
  pushSource,
  /const upsertPushSubscription = async/,
  'push registration should share backend upsert logic between enable and repair flows'
);

assert.match(
  syncPushSubscriptionBody,
  /Notification\.permission !== 'granted'/,
  'push subscription sync should only repair granted browser notification subscriptions'
);

assert.match(
  syncPushSubscriptionBody,
  /registration\.pushManager\.getSubscription\(\)/,
  'push subscription sync should read the current browser push subscription'
);

assert.match(
  syncPushSubscriptionBody,
  /upsertPushSubscription\(subscription,\s*user\.id\)/,
  'push subscription sync should upsert the current browser subscription for the signed-in user'
);

assert.match(
  isCurrentlySubscribedBody,
  /await syncPushSubscription\(\)/,
  'push enabled checks should repair a missing backend row when the browser subscription still exists'
);

assert.match(
  pushSource,
  /window\.addEventListener\('focus', syncCurrentPushSubscription\)/,
  'push registration should repair subscriptions when the installed PWA returns to focus'
);

assert.match(
  pushSource,
  /document\.addEventListener\('visibilitychange'/,
  'push registration should repair subscriptions when the installed PWA becomes visible'
);

assert.match(
  pushSource,
  /event\.data\?\.type === 'SYNC_PUSH_SUBSCRIPTION'/,
  'push registration should respond to service worker subscription sync messages'
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

assert.match(
  staticAssetCacheBlock,
  /isHtmlResponse/,
  'static asset caching should detect HTML fallbacks served for missing bundles'
);

assert.match(
  staticAssetCacheBlock,
  /cache\.delete\(event\.request\)/,
  'static asset caching should evict poisoned cached HTML responses'
);

assert.match(
  staticAssetCacheBlock,
  /missingAssetResponse\(\)/,
  'static asset caching should return a real 404 for HTML fallbacks on asset URLs'
);

assert.match(
  serviceWorkerSource,
  /const missingAssetResponse = \(\) => new Response\('Not found'[\s\S]*status:\s*404/,
  'missing asset fallback should produce a 404 response'
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
