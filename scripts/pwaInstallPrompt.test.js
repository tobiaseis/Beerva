const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const installPromptLibSource = fs.readFileSync(path.join(root, 'src/lib/pwaInstallPrompt.ts'), 'utf8');
const installPromptComponentSource = fs.readFileSync(
  path.join(root, 'src/components/PwaInstallPrompt.tsx'),
  'utf8'
);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(
  installPromptLibSource,
  /export const INSTALL_PROMPT_DISMISSED_AT_KEY = 'beerva\.installPrompt\.dismissedAt';/,
  'install prompt dismissals should be stored under a stable Beerva-specific key'
);

assert.match(
  installPromptLibSource,
  /display-mode: standalone/,
  'install prompt should detect users already running the standalone PWA'
);

assert.match(
  installPromptLibSource,
  /standalone: \(navigator as Navigator & \{ standalone\?: boolean \}\)\.standalone/,
  'install prompt should detect iOS standalone mode'
);

assert.match(
  installPromptLibSource,
  /CriOS\|FxiOS\|EdgiOS/,
  'iOS Safari detection should exclude common third-party iOS browsers'
);

assert.match(
  installPromptLibSource,
  /INSTALL_PROMPT_DISMISS_WINDOW_MS/,
  'install prompt should avoid reappearing immediately after dismissal'
);

assert.match(
  installPromptComponentSource,
  /Platform\.OS !== 'web'/,
  'install prompt should be web-only'
);

assert.match(
  installPromptComponentSource,
  /beforeinstallprompt/,
  'install prompt should use the native browser install event where supported'
);

assert.match(
  installPromptComponentSource,
  /deferredPrompt\.prompt\(\)/,
  'native install action should call the retained beforeinstallprompt event'
);

assert.match(
  installPromptComponentSource,
  /isIosSafari\(environment\)/,
  'iOS Safari users should receive the manual Home Screen guide'
);

assert.match(
  installPromptComponentSource,
  /Tap the Share button/,
  'iOS guide should tell users to tap the Share button'
);

assert.match(
  installPromptComponentSource,
  /Add to Home Screen/,
  'iOS guide should tell users to choose Add to Home Screen'
);

assert.match(
  appSource,
  /import \{ PwaInstallPrompt \} from '\.\/src\/components\/PwaInstallPrompt';/,
  'App should import the PWA install prompt'
);

assert.match(
  appSource,
  /<PwaInstallPrompt \/>/,
  'App should mount the PWA install prompt once at the root'
);

assert.equal(
  packageJson.scripts['test:pwa-install'],
  'node scripts/pwaInstallPrompt.test.js',
  'package script should run the PWA install prompt checks'
);

console.log('PWA install prompt checks passed');
