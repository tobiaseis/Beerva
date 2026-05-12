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
  /🍺 Best Session 🍺/,
  'best session high-score tile should add beer emoji flair'
);

assert.match(
  source,
  /🔥 Longest Streak 🔥/,
  'longest streak high-score tile should add fire emoji flair'
);

assert.match(
  source,
  /highScoreLabel: \{[\s\S]*fontSize: 12,[\s\S]*lineHeight: 16,/,
  'high-score labels should use smaller compact type'
);

assert.match(
  source,
  /highScoreValue: \{[\s\S]*fontSize: 28,[\s\S]*lineHeight: 34,/,
  'high-score values should be slightly smaller than before'
);

console.log('profile stats panel checks passed');
