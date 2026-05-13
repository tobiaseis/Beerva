const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/navigation/RootNavigator.tsx'),
  'utf8'
);

const extractScreenOptionsBlock = (navigatorSource) => {
  const marker = 'screenOptions={{';
  const start = navigatorSource.indexOf(marker);
  assert.notEqual(start, -1, 'Main tab navigator should define screenOptions');

  const openBrace = navigatorSource.indexOf('{', start);
  let depth = 0;

  for (let index = openBrace; index < navigatorSource.length; index += 1) {
    const char = navigatorSource[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return navigatorSource.slice(start, index + 1);
      }
    }
  }

  throw new Error('Could not parse Main tab screenOptions block');
};

const extractTabScreenBlock = (navigatorSource, screenName) => {
  const marker = `name="${screenName}"`;
  const nameIndex = navigatorSource.indexOf(marker);
  assert.notEqual(nameIndex, -1, `${screenName} tab should exist`);

  const screenStart = navigatorSource.lastIndexOf('<Tab.Screen', nameIndex);
  const nextScreenStart = navigatorSource.indexOf('<Tab.Screen', nameIndex + marker.length);
  const screenEnd = nextScreenStart === -1 ? navigatorSource.indexOf('</Tab.Navigator>', nameIndex) : nextScreenStart;

  assert.notEqual(screenStart, -1, `Could not find ${screenName} tab start`);
  assert.notEqual(screenEnd, -1, `Could not find ${screenName} tab end`);

  return navigatorSource.slice(screenStart, screenEnd);
};

assert.match(
  source,
  /useWindowDimensions/,
  'Main tabs should size the floating pill from the viewport'
);
assert.match(
  source,
  /floatingTabBarBackground\s*=\s*'#172238'/,
  'Floating nav should be darker than the old raised box without matching the post/background surfaces'
);
assert.match(
  source,
  /floatingTabBarWidth\s*=\s*Math\.min\(Math\.max\(viewportWidth - 32,\s*0\),\s*520\)/,
  'Floating nav should keep mobile side gutters and avoid becoming a full-width desktop box'
);

const screenOptions = extractScreenOptionsBlock(source);

assert.match(
  screenOptions,
  /backgroundColor:\s*floatingTabBarBackground/,
  'Web tab bar should use the dedicated floating pill color'
);
assert.match(
  screenOptions,
  /position:\s*'absolute'/,
  'Web tab bar should float above the viewport instead of sitting as a boxed dock'
);
assert.match(
  screenOptions,
  /left:\s*floatingTabBarLeft/,
  'Floating nav should be centered from a computed left offset'
);
assert.match(
  screenOptions,
  /bottom:\s*16/,
  'Floating nav should sit off the bottom edge'
);
assert.match(
  screenOptions,
  /width:\s*floatingTabBarWidth/,
  'Floating nav should use the computed responsive pill width'
);
assert.match(
  screenOptions,
  /borderRadius:\s*radius\.pill/,
  'Floating nav should use a full pill radius'
);
assert.doesNotMatch(
  screenOptions,
  /marginBottom:\s*8/,
  'Floating nav should not keep the old boxed dock margin'
);

const recordTab = extractTabScreenBlock(source, 'Record');

assert.doesNotMatch(
  recordTab,
  /tabBarButton/,
  'Record should remain a normal tab inside the pill, not a breakout add-post button'
);
assert.doesNotMatch(
  recordTab,
  /position:\s*'absolute'/,
  'Record tab should not be positioned outside the pill'
);

console.log('floating bottom nav checks passed');
