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
  assert.match(
    source,
    /getCompactFeedActionCount/,
    `${label} should render compact social action counts`
  );
  assert.match(
    source,
    /cheerAvatarStack/,
    `${label} should show avatar-stack social proof instead of a bulky cheer row`
  );

  const footerIndex = source.indexOf('<View style={styles.cardFooter}>');
  const engagementIndex = source.indexOf('<View style={styles.engagementPanel}>');
  assert.ok(
    footerIndex !== -1 && engagementIndex !== -1 && footerIndex < engagementIndex,
    `${label} action bar should appear before social proof and comments`
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
  assert.doesNotMatch(
    summaryBlock,
    /border(Top|Bottom)Width:/,
    `${label} metadata should feel integrated, not boxed in by horizontal rails`
  );
  assert.doesNotMatch(
    summaryBlock,
    /backgroundColor:\s*colors\.(surface|cardMuted|surfaceRaised)/,
    `${label} metadata should not be a heavy filled block`
  );

  const summaryRowBlock = extractStyleBlock(source, 'summaryRow');
  assert.match(
    summaryRowBlock,
    /minHeight:\s*30/,
    `${label} metadata rows should be visually compact`
  );

  const summaryIconBlock = extractStyleBlock(source, 'summaryIcon');
  assert.match(
    summaryIconBlock,
    /backgroundColor:\s*feedCardColors\.metadataIconBackground/,
    `${label} metadata icon should be a small brand anchor`
  );
  assert.match(
    summaryIconBlock,
    /width:\s*20/,
    `${label} metadata icon should be smaller than the old chip`
  );

  const engagementBlock = extractStyleBlock(source, 'engagementPanel');
  assert.doesNotMatch(
    engagementBlock,
    /borderTopWidth:/,
    `${label} social proof should not be a separated panel`
  );

  const actionBlock = extractStyleBlock(source, 'actionBtn');
  assert.match(
    actionBlock,
    /alignSelf:\s*'flex-start'/,
    `${label} actions should size to their content`
  );
  assert.match(
    actionBlock,
    /minHeight:\s*30/,
    `${label} actions should be small Instagram-style controls`
  );
  assert.match(
    actionBlock,
    /paddingHorizontal:\s*2/,
    `${label} actions should avoid chunky pill padding`
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

  assert.doesNotMatch(
    source,
    /\{getCheersLabel\((item\.cheers_count|crawl\.cheersCount)\)\}/,
    `${label} cheers action should show a compact count, not a wordy label`
  );
  assert.doesNotMatch(
    source,
    /\{getCommentsLabel\((item\.comments_count|crawl\.commentsCount)\)\}/,
    `${label} comments action should show a compact count, not a wordy label`
  );
};

const feedScreen = readSource('src/screens/FeedScreen.tsx');
const pubCrawlCard = readSource('src/components/PubCrawlFeedCard.tsx');

assert.doesNotMatch(
  feedScreen,
  /beerva-icon-192\.png/,
  'Feed inline logos should use the transparent beer-arrow mark, not the blue PWA app icon'
);
assert.doesNotMatch(
  pubCrawlCard,
  /beerva-icon-192\.png/,
  'Pub crawl inline logos should use the transparent beer-arrow mark, not the blue PWA app icon'
);
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
assert.match(
  feedScreen,
  /maxWidth:\s*Platform\.OS === 'web' \? 520/,
  'Feed should use a narrower Instagram-style web column'
);

assertModernFeedCard(feedScreen, 'Feed session');
assertModernFeedCard(pubCrawlCard, 'Pub crawl');

console.log('feed card redesign checks passed');
