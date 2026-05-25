const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(__dirname, '..', relativePath),
  'utf8'
);

const loadTypeScriptModule = (relativePath) => {
  const filename = path.resolve(__dirname, '..', relativePath);
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

const packageJson = JSON.parse(readSource('package.json'));
const appJson = JSON.parse(readSource('app.json'));
const rootNavigatorSource = readSource('src/navigation/RootNavigator.tsx');
const feedScreenSource = readSource('src/screens/FeedScreen.tsx');
const fakeBeerMotionPath = path.resolve(__dirname, '..', 'src/lib/fakeBeerMotion.ts');

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
  /<View style=\{styles\.logoContainer\}>\s*<Image source=\{beervaLogo\} style=\{styles\.logoImage\} \/>\s*<TouchableOpacity[\s\S]*?onLongPress=\{startFakeBeerUnlock\}[\s\S]*?<Text style=\{styles\.logoText\}>Beerva<\/Text>[\s\S]*?<\/TouchableOpacity>\s*<\/View>/,
  'Feed header should keep the logo visual while putting the hidden long press only on the Beerva text'
);

assert.match(
  feedScreenSource,
  /delayLongPress=\{FAKE_BEER_LONG_PRESS_MS\}/,
  'Feed header text should use the shared 2 second long press delay'
);

const longPressIndex = feedScreenSource.indexOf('onLongPress={startFakeBeerUnlock}');
const longPressTriggerStart = feedScreenSource.lastIndexOf('<TouchableOpacity', longPressIndex);
const longPressTriggerEnd = feedScreenSource.indexOf('</TouchableOpacity>', longPressIndex);
const longPressTriggerBlock = feedScreenSource.slice(
  longPressTriggerStart,
  longPressTriggerEnd + '</TouchableOpacity>'.length
);

assert.doesNotMatch(
  longPressTriggerBlock,
  /<Image source=\{beervaLogo\}/,
  'The fake beer easter egg should not trigger from pressing the Beerva logo image'
);

assert.match(
  longPressTriggerBlock,
  /accessibilityLabel="Open fake beer"/,
  'The hidden Beerva text trigger should still have an explicit accessibility label'
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
  /import \{ Accelerometer, DeviceMotion \} from 'expo-sensors';/,
  'FakeBeerScreen should use DeviceMotion and Accelerometer from expo-sensors'
);

assert.match(
  fakeBeerScreenSource,
  /DeviceMotion\.addListener/,
  'FakeBeerScreen should subscribe to real phone motion'
);

assert.match(
  fakeBeerScreenSource,
  /Accelerometer\.addListener/,
  'FakeBeerScreen should fall back to accelerometer gravity data when DeviceMotion is unavailable or unreliable'
);

assert.match(
  fakeBeerScreenSource,
  /const DEVICE_MOTION_WATCHDOG_MS = 650;/,
  'FakeBeerScreen should define a watchdog for Android devices where DeviceMotion is available but silent'
);

assert.match(
  fakeBeerScreenSource,
  /deviceMotionWatchdogTimeout/,
  'FakeBeerScreen should fall back when DeviceMotion does not emit readings'
);

assert.match(
  fakeBeerScreenSource,
  /getFakeBeerMotionSignal/,
  'FakeBeerScreen should derive drinking from a shared motion helper'
);

assert.match(
  fakeBeerScreenSource,
  /const targetTiltDegreesRef = useRef\(0\);/,
  'FakeBeerScreen should keep raw device tilt separate from the lagged liquid tilt'
);

assert.match(
  fakeBeerScreenSource,
  /setLiquidTiltDegrees/,
  'FakeBeerScreen should animate a delayed liquid tilt for slosh instead of snapping the beer surface'
);

assert.match(
  fakeBeerScreenSource,
  /setSloshOffset/,
  'FakeBeerScreen should compute a slosh offset from tilt momentum'
);

assert.match(
  fakeBeerScreenSource,
  /sloshOffset=\{sloshOffset\}/,
  'FakeBeerScreen should pass slosh momentum into the beer visual'
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
  /sloshOffset\?: number;/,
  'FakeBeerVisual should accept sloshOffset to make the liquid move like a surface with momentum'
);

assert.match(
  fakeBeerVisualSource,
  /styles\.liquidSurface/,
  'FakeBeerVisual should render a visible moving liquid surface, not just a flat fill'
);

assert.match(
  fakeBeerVisualSource,
  /styles\.foamSurface/,
  'FakeBeerVisual should attach foam to the moving liquid surface'
);

assert.match(
  fakeBeerVisualSource,
  /const waveProgress = useRef\(new Animated\.Value\(0\)\)\.current;/,
  'FakeBeerVisual should animate subtle wave motion across the beer'
);

assert.match(
  fakeBeerVisualSource,
  /styles\.deepAmberLayer/,
  'FakeBeerVisual should include darker amber depth layers so it reads as beer'
);

assert.match(
  fakeBeerVisualSource,
  /Tilt to drink/,
  'FakeBeerVisual should include the subtle opening hint'
);

assert.ok(
  fs.existsSync(fakeBeerMotionPath),
  'Android drinking should be handled by a reusable fakeBeerMotion helper'
);

const {
  createFakeBeerMotionBaseline,
  getFakeBeerMotionSignal,
} = loadTypeScriptModule('src/lib/fakeBeerMotion.ts');

const androidNeutralMotion = {
  rotation: { alpha: 0, beta: 0, gamma: 0, timestamp: 1 },
  accelerationIncludingGravity: { x: 0, y: 9.81, z: 0, timestamp: 1 },
};

const androidDrinkingMotion = {
  rotation: { alpha: 0, beta: 0, gamma: 0, timestamp: 2 },
  accelerationIncludingGravity: { x: 0, y: 5.8, z: 7.9, timestamp: 2 },
};

const androidSideTiltMotion = {
  rotation: { alpha: 0, beta: 0, gamma: 0, timestamp: 3 },
  accelerationIncludingGravity: { x: 4.4, y: 8.7, z: 0, timestamp: 3 },
};

const motionBaseline = createFakeBeerMotionBaseline(androidNeutralMotion);

assert.equal(
  getFakeBeerMotionSignal(androidNeutralMotion, motionBaseline).drinkPressure,
  0,
  'A calibrated neutral Android phone position should not drain the beer'
);

assert.ok(
  getFakeBeerMotionSignal(androidDrinkingMotion, motionBaseline).drinkPressure > 0.1,
  'Android gravity-vector tilt should drain the beer even when rotation beta stays zero'
);

assert.notEqual(
  getFakeBeerMotionSignal(androidSideTiltMotion, motionBaseline).tiltDegrees,
  0,
  'Android gravity-vector side tilt should still move the liquid surface when rotation gamma stays zero'
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
