const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const hookPath = 'src/theme/usePwaParityInsets.ts';

assert.equal(packageJson.scripts['test:native-pwa-parity'], 'node scripts/nativePwaParity.test.js');
assert.ok(fs.existsSync(path.join(root, hookPath)), 'PWA parity inset hook should exist');

const hook = read(hookPath);
const layout = read('src/theme/layout.ts');

assert.match(hook, /useSafeAreaInsets/);
assert.match(hook, /screenTopBarPaddingTop:\s*isWeb\s*\?\s*18\s*:\s*insets\.top \+ 18/);
assert.match(hook, /profileHeaderPaddingTop:\s*isWeb\s*\?\s*22\s*:\s*insets\.top \+ 22/);
assert.match(hook, /feedHeaderPaddingTop:\s*isWeb\s*\?\s*12\s*:\s*insets\.top \+ 12/);
assert.match(hook, /insets\.bottom \+ floatingTabBarMetrics\.nativeGap/);
assert.doesNotMatch(layout, /floatingTabBarNativeBottom\s*=\s*56/);
assert.match(layout, /nativeGap:\s*16/);

console.log('native PWA parity checks passed');
