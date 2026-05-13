const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(__dirname, '..', relativePath),
  'utf8'
);

const uiSources = [
  'App.tsx',
  'src/components/PubCrawlFeedCard.tsx',
  'src/navigation/RootNavigator.tsx',
  'src/screens/AuthScreen.tsx',
  'src/screens/EditSessionScreen.tsx',
  'src/screens/FeedScreen.tsx',
  'src/screens/RecordScreen.tsx',
];

for (const file of uiSources) {
  assert.doesNotMatch(
    readSource(file),
    /beerva-icon-192\.png/,
    `${file} should not render the blue PWA app icon as an inline logo`
  );
}

const authConfirmed = readSource('public/auth-confirmed.html');
assert.match(
  authConfirmed,
  /<img class="logo" src="\/beerva-logo-transparent\.png" alt="Beerva" \/>/,
  'Auth confirmation page should display the transparent beer-arrow logo'
);

assert.ok(
  fs.existsSync(path.resolve(__dirname, '..', 'public/beerva-logo-transparent.png')),
  'Transparent public logo asset should exist for static HTML pages'
);

console.log('logo usage checks passed');
