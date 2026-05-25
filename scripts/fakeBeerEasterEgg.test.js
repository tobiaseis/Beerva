const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(__dirname, '..', relativePath),
  'utf8'
);

const packageJson = JSON.parse(readSource('package.json'));
const appJson = JSON.parse(readSource('app.json'));
const rootNavigatorSource = readSource('src/navigation/RootNavigator.tsx');
const feedScreenSource = readSource('src/screens/FeedScreen.tsx');

assert.ok(
  packageJson.dependencies['expo-sensors'],
  'expo-sensors should be installed for real phone tilt'
);

assert.match(
  appJson.expo?.ios?.infoPlist?.NSMotionUsageDescription || '',
  /tilt/i,
  'iOS config should explain why Beerva uses motion access for the fake beer tilt'
);

assert.match(
  rootNavigatorSource,
  /import \{ FakeBeerScreen \} from '\.\.\/screens\/FakeBeerScreen';/,
  'RootNavigator should import the hidden FakeBeer screen'
);

assert.match(
  rootNavigatorSource,
  /<Stack\.Screen name="FakeBeer" component=\{FakeBeerScreen\} options=\{\{ animation: 'none' \}\} \/>/,
  'RootNavigator should register FakeBeer as a hidden stack route with no normal route animation'
);

assert.match(
  feedScreenSource,
  /import \{ FakeBeerUnlockOverlay \} from '\.\.\/components\/FakeBeerUnlockOverlay';/,
  'FeedScreen should import the beer fill transition overlay'
);

assert.match(
  feedScreenSource,
  /const FAKE_BEER_LONG_PRESS_MS = 2000;/,
  'FeedScreen should require a 2 second logo hold'
);

assert.match(
  feedScreenSource,
  /onLongPress=\{startFakeBeerUnlock\}/,
  'Feed header logo should start the easter egg on long press'
);

assert.match(
  feedScreenSource,
  /delayLongPress=\{FAKE_BEER_LONG_PRESS_MS\}/,
  'Feed header logo should use the shared 2 second long press delay'
);

assert.match(
  feedScreenSource,
  /navigation\.navigate\('FakeBeer'\)/,
  'Feed unlock overlay should navigate to FakeBeer after filling the screen'
);

assert.match(
  feedScreenSource,
  /<FakeBeerUnlockOverlay\s+visible=\{fakeBeerUnlocking\}\s+onFilled=\{openFakeBeer\}\s+\/>/,
  'FeedScreen should render the fill overlay during unlock'
);

const fakeBeerScreenSource = readSource('src/screens/FakeBeerScreen.tsx');
const fakeBeerVisualSource = readSource('src/components/FakeBeerVisual.tsx');
const fakeBeerOverlaySource = readSource('src/components/FakeBeerUnlockOverlay.tsx');

assert.match(
  fakeBeerScreenSource,
  /import \{ DeviceMotion \} from 'expo-sensors';/,
  'FakeBeerScreen should use DeviceMotion from expo-sensors'
);

assert.match(
  fakeBeerScreenSource,
  /DeviceMotion\.addListener/,
  'FakeBeerScreen should subscribe to real phone motion'
);

assert.match(
  fakeBeerScreenSource,
  /const DRINK_TILT_THRESHOLD = 0\.72;/,
  'FakeBeerScreen should define a deliberate drinking tilt threshold'
);

assert.match(
  fakeBeerScreenSource,
  /const triggerRefill = useCallback/,
  'FakeBeerScreen should expose refill behavior when the beer empties'
);

assert.match(
  fakeBeerScreenSource,
  /setFillLevel\(1\);/,
  'FakeBeerScreen should restore the beer to full after refill'
);

assert.match(
  fakeBeerVisualSource,
  /const BUBBLES = \[/,
  'FakeBeerVisual should render persistent beer bubbles'
);

assert.match(
  fakeBeerVisualSource,
  /Tilt to drink/,
  'FakeBeerVisual should include the subtle opening hint'
);

assert.match(
  fakeBeerOverlaySource,
  /const FAKE_BEER_UNLOCK_FILL_MS = 950;/,
  'FakeBeerUnlockOverlay should define the feed fill transition duration'
);

assert.match(
  fakeBeerOverlaySource,
  /onFilled\(\);/,
  'FakeBeerUnlockOverlay should call onFilled after the beer fill animation'
);

console.log('fake beer easter egg checks passed');
