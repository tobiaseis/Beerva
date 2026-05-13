const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(__dirname, '..', relativePath),
  'utf8'
);

const extractStyleBlock = (source, styleName) => {
  const marker = `  ${styleName}: {`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${styleName} style should exist`);

  const openBrace = source.indexOf('{', start);
  let depth = 0;

  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not parse ${styleName} style block`);
};

const assertModernFeedCard = (source, label) => {
  assert.match(
    source,
    /feedCardColors/,
    `${label} should use shared feed-card visual tokens`
  );

  const cardBlock = extractStyleBlock(source, 'card');
  assert.match(
    cardBlock,
    /backgroundColor:\s*feedCardColors\.card/,
    `${label} card should use the quieter feed-card surface`
  );
  assert.match(
    cardBlock,
    /borderColor:\s*feedCardColors\.border/,
    `${label} card should use the softer feed-card border`
  );

  const summaryBlock = extractStyleBlock(source, 'sessionSummary');
  assert.match(
    summaryBlock,
    /borderTopWidth:\s*1/,
    `${label} metadata should be separated by a light top divider`
  );
  assert.match(
    summaryBlock,
    /borderBottomWidth:\s*1/,
    `${label} metadata should be separated by a light bottom divider`
  );
  assert.match(
    summaryBlock,
    /borderTopColor:\s*feedCardColors\.metadataDivider/,
    `${label} metadata top divider should be subtle`
  );
  assert.match(
    summaryBlock,
    /borderBottomColor:\s*feedCardColors\.metadataDivider/,
    `${label} metadata bottom divider should be subtle`
  );
  assert.doesNotMatch(
    summaryBlock,
    /backgroundColor:\s*colors\.(surface|cardMuted|surfaceRaised)/,
    `${label} metadata should not be a heavy filled block`
  );

  const summaryIconBlock = extractStyleBlock(source, 'summaryIcon');
  assert.match(
    summaryIconBlock,
    /backgroundColor:\s*feedCardColors\.metadataIconBackground/,
    `${label} metadata icon should be a small brand anchor`
  );

  const actionBlock = extractStyleBlock(source, 'actionBtn');
  assert.match(
    actionBlock,
    /alignSelf:\s*'flex-start'/,
    `${label} actions should size to their content`
  );
  assert.doesNotMatch(
    actionBlock,
    /flex:\s*1/,
    `${label} actions should not stretch into large pills`
  );
  assert.doesNotMatch(
    actionBlock,
    /borderWidth:/,
    `${label} actions should not have bordered pill chrome`
  );
  assert.doesNotMatch(
    actionBlock,
    /backgroundColor:\s*colors\.surface/,
    `${label} actions should not use the old heavy surface background`
  );

  const activeActionBlock = extractStyleBlock(source, 'actionBtnActive');
  assert.match(
    activeActionBlock,
    /backgroundColor:\s*feedCardColors\.actionActiveBackground/,
    `${label} active cheers should keep a subtle amber state`
  );
};

const feedScreen = readSource('src/screens/FeedScreen.tsx');
const pubCrawlCard = readSource('src/components/PubCrawlFeedCard.tsx');

assert.match(
  feedScreen,
  /from '..\/theme\/feedCard'/,
  'FeedScreen should import feed-card tokens'
);
assert.match(
  pubCrawlCard,
  /from '..\/theme\/feedCard'/,
  'PubCrawlFeedCard should import feed-card tokens'
);

assertModernFeedCard(feedScreen, 'Feed session');
assertModernFeedCard(pubCrawlCard, 'Pub crawl');

console.log('feed card redesign checks passed');
