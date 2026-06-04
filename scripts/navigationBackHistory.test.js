const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/navigation/RootNavigator.tsx'),
  'utf8'
);

assert.match(
  source,
  /type RootStackParamList = \{/,
  'Root navigator should define a typed param list for route linking'
);

assert.match(
  source,
  /const linking:\s*LinkingOptions<RootStackParamList>\s*=\s*\{/,
  'Root navigator should define a React Navigation linking config'
);

assert.match(
  source,
  /enabled:\s*Platform\.OS === 'web'/,
  'Linking should be enabled for the web/PWA shell that depends on browser history'
);

assert.match(
  source,
  /prefixes:\s*\[\]/,
  'Web-only linking should not add native deep-link prefixes'
);

assert.match(
  source,
  /<NavigationContainer[^>]+linking=\{linking\}/,
  'NavigationContainer should receive the linking config so state changes update history'
);

assert.match(
  source,
  /<Tab\.Navigator[^>]+backBehavior="history"/,
  'Bottom tabs should use history back behavior so Android back returns to the previous tab'
);

const expectedRoutePaths = [
  "MainTabs: {",
  "Feed: ''",
  "People: 'people'",
  "Record: 'record'",
  "Legends: 'legends'",
  "Profile: 'profile'",
  "UserProfile: 'users/:userId'",
  "PubLegendDetail: 'pub-legends/:pubKey'",
  "ChallengeDetail: 'challenges/:challengeSlug'",
  "Notifications: 'notifications'",
  "PostDetail: 'posts/:targetType/:targetId'",
  "EditSession: 'sessions/:sessionId/edit'",
  "HangoverRating: 'hangover/:targetType/:targetId'",
  "ChugVerification: 'chug-verification/:attemptId'",
  "FakeBeer: 'fake-beer'",
  "AdminTools: 'admin'",
];

for (const routePath of expectedRoutePaths) {
  assert.ok(
    source.includes(routePath),
    `Linking config should include ${routePath}`
  );
}

console.log('navigation back history checks passed');
