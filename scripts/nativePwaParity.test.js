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

const visualFiles = [
  'src/screens/FeedScreen.tsx',
  'src/screens/PeopleScreen.tsx',
  'src/screens/RecordScreen.tsx',
  'src/screens/PubLegendsScreen.tsx',
  'src/screens/ProfileScreen.tsx',
  'src/components/ProfileStatsPanel.tsx',
];

for (const file of visualFiles) {
  assert.doesNotMatch(
    read(file),
    /Platform\.OS === 'web'\s*\?\s*(10|12|14|16|18|20|22|24|104|132|146)\s*:\s*(12|14|16|18|20|22|24|28|30|32|60|70|88|120|150|154)/,
    `${file} should not keep accidental larger Android geometry`
  );
}
assert.equal(
  (read('src/screens/ProfileScreen.tsx').match(/size=\{104\}/g) || []).length,
  1,
  'own-profile avatar should match the PWA size'
);
assert.match(read('src/components/PubCrawlMediaCarousel.tsx'), /const FEED_HORIZONTAL_PADDING = 14/);

const safeAreaScreens = [
  'AdminToolsScreen.tsx',
  'ChallengeDetailScreen.tsx',
  'ChugVerificationScreen.tsx',
  'EditSessionScreen.tsx',
  'HangoverRatingScreen.tsx',
  'NotificationsScreen.tsx',
  'PostDetailScreen.tsx',
  'PubLegendDetailScreen.tsx',
  'UserProfileScreen.tsx',
];

for (const name of safeAreaScreens) {
  const source = read(`src/screens/${name}`);
  assert.match(source, /usePwaParityInsets/);
  assert.doesNotMatch(source, /paddingTop:\s*Platform\.OS === 'web'\s*\?\s*18\s*:\s*(54|58|60)/);
}

for (const file of [
  'src/screens/EditSessionScreen.tsx',
  'src/screens/PostDetailScreen.tsx',
  'src/screens/PubLegendDetailScreen.tsx',
  'src/screens/UserProfileScreen.tsx',
]) {
  assert.doesNotMatch(
    read(file),
    /Platform\.OS === 'web'\s*\?\s*(12|24|28|104|132)\s*:\s*(14|32|120|150)/,
    `${file} should preserve PWA detail geometry on native`
  );
}
assert.equal(
  (read('src/screens/UserProfileScreen.tsx').match(/size=\{104\}/g) || []).length,
  1,
  'other-user avatar should match the PWA size'
);

console.log('native PWA parity checks passed');
