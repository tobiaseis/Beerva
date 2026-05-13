const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(__dirname, '..', relativePath),
  'utf8'
);

const scannedFiles = [
  'src/components/TrophyUnlockModal.tsx',
  'src/screens/ProfileScreen.tsx',
];

const legacySurfacePatterns = [
  /#2A063D/i,
  /#170822/i,
  /rgba\(30,\s*41,\s*59,\s*0\.45\)/,
];

for (const file of scannedFiles) {
  const source = readSource(file);

  for (const pattern of legacySurfacePatterns) {
    assert.doesNotMatch(
      source,
      pattern,
      `${file} should not use legacy hard-coded surface color ${pattern}`
    );
  }
}

const recordScreen = readSource('src/screens/RecordScreen.tsx');
assert.match(
  recordScreen,
  /rouletteCta:\s*\{[\s\S]*backgroundColor:\s*'#2A063D'/,
  'Record roulette CTA should preserve its casino purple surface'
);
assert.match(
  recordScreen,
  /rouletteCtaRailRed:\s*\{[\s\S]*backgroundColor:\s*'#E11D48'/,
  'Record roulette CTA should preserve the colorful casino rail'
);

const rouletteModal = readSource('src/components/PubRouletteModal.tsx');
assert.match(
  rouletteModal,
  /const WHEEL_COLORS = \['#E11D48', '#0EA5E9', '#16A34A', '#F59E0B', '#7C3AED', '#DC2626', '#0891B2', '#FACC15'\]/,
  'Roulette wheel should preserve the crazy casino color palette'
);
assert.match(
  rouletteModal,
  /sheet:\s*\{[\s\S]*backgroundColor:\s*'#190B2B'/,
  'Roulette modal sheet should preserve its casino surface'
);
assert.match(
  rouletteModal,
  /wheelStage:\s*\{[\s\S]*backgroundColor:\s*'#250F38'/,
  'Roulette modal wheel stage should preserve its casino surface'
);

const trophyModal = readSource('src/components/TrophyUnlockModal.tsx');
assert.match(
  trophyModal,
  /prizeCard:\s*\{[\s\S]*backgroundColor:\s*colors\.card/,
  'Prize card should use the shared feed card surface'
);
assert.match(
  trophyModal,
  /iconContainer:\s*\{[\s\S]*backgroundColor:\s*colors\.surface/,
  'Trophy icon container should use the shared inset surface'
);

console.log('app theme screen checks passed');
