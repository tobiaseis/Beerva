const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/components/ProfileStatsPanel.tsx'),
  'utf8'
);

assert.match(
  source,
  /ChevronDown[\s\S]*ChevronUp|ChevronUp[\s\S]*ChevronDown/,
  'trophy cabinet header should use chevron icons'
);

assert.match(
  source,
  /const \[trophyCabinetExpanded, setTrophyCabinetExpanded\] = useState\(true\)/,
  'trophy cabinet should default to expanded'
);

assert.match(
  source,
  /setTrophyCabinetExpanded\(\(expanded\) => !expanded\)/,
  'pressing the trophy cabinet header should toggle expansion'
);

assert.match(
  source,
  /accessibilityRole="button"[\s\S]*accessibilityState=\{\{ expanded: trophyCabinetExpanded \}\}/,
  'trophy cabinet header should expose button and expanded accessibility state'
);

assert.match(
  source,
  /\{trophyCabinetExpanded \? \([\s\S]*<View style=\{styles\.badges\}>[\s\S]*orderedTrophies\.map[\s\S]*\) : null\}/,
  'trophy grid should render only when the cabinet is expanded'
);

assert.match(
  source,
  />\s*Best Session\s*<\/Text>/,
  'best session label should stay as plain text'
);

assert.match(
  source,
  />\s*Longest Streak\s*<\/Text>/,
  'longest streak label should stay as plain text'
);

assert.match(
  source,
  /<View style=\{styles\.highScoreMetricRow\}>[\s\S]*🍺[\s\S]*stats\.maxSessionPints[\s\S]*🍺[\s\S]*<\/View>/,
  'best session tile should place one beer emoji on each side of the number'
);

assert.match(
  source,
  /<View style=\{styles\.highScoreMetricRow\}>[\s\S]*🔥[\s\S]*stats\.longestDayStreak[\s\S]*🔥[\s\S]*<\/View>/,
  'longest streak tile should place one fire emoji on each side of the number'
);

assert.match(
  source,
  /highScoreLabel: \{[\s\S]*fontSize: 14,[\s\S]*lineHeight: 18,/,
  'high-score labels should use the tuned 14/18 compact type size'
);

assert.match(
  source,
  /highScoreValue: \{[\s\S]*fontSize: 30,[\s\S]*lineHeight: 36,/,
  'high-score values should be larger than the smallest version but smaller than the original'
);

console.log('profile stats panel checks passed');
