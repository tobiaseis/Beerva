# Modern Feed Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Beerva feed cards feel less chunky and more modern while preserving all existing feed behavior and the current Beerva logo identity.

**Architecture:** Keep this as a focused presentation-layer change. Add local feed-card visual tokens, update the regular feed session card and pub crawl card to use lighter integrated metadata rows, and guard the intended styling with a source-level test that matches the repo's existing lightweight test style.

**Tech Stack:** Expo React Native Web, TypeScript, React Native StyleSheet, lucide-react-native, Node source contract tests.

---

## File Structure

- Create: `src/theme/feedCard.ts`
  - Holds local feed-card colors and radii so regular feed posts and pub crawl posts share the same visual language without changing global tokens.
- Create: `scripts/feedCardRedesign.test.js`
  - Source-level guard that verifies regular and pub crawl cards use integrated metadata rows and compact social actions.
- Modify: `package.json`
  - Adds `test:feed-redesign`.
- Modify: `src/screens/FeedScreen.tsx`
  - Updates regular session card styles only. All handlers, data loading, modals, maps, comments, cheers, double-tap behavior, and stats logic stay unchanged.
- Modify: `src/components/PubCrawlFeedCard.tsx`
  - Mirrors the same visual treatment for pub crawl feed cards. Pub crawl media, route summary, stop breakdown, comments, cheers, and stats logic stay unchanged.

Do not modify these preserved files:

- `src/screens/PeopleScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/components/ProfileStatsPanel.tsx`
- `src/screens/PubLegendsScreen.tsx`
- `src/screens/PubLegendDetailScreen.tsx`

---

### Task 1: Failing Feed Redesign Guard Test

**Files:**
- Create: `scripts/feedCardRedesign.test.js`
- Modify: `package.json`

- [ ] **Step 1: Create the source-level test**

Create `scripts/feedCardRedesign.test.js`:

```javascript
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
```

- [ ] **Step 2: Add the package script**

Modify `package.json` inside `"scripts"`:

```json
"test:feed-redesign": "node scripts/feedCardRedesign.test.js"
```

Keep the existing scripts unchanged.

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm run test:feed-redesign
```

Expected: FAIL with a message that `FeedScreen should import feed-card tokens` because `src/theme/feedCard.ts` has not been created or imported yet.

- [ ] **Step 4: Commit the failing guard**

Run:

```bash
git add package.json scripts/feedCardRedesign.test.js
git commit -m "test: guard modern feed card styling"
```

---

### Task 2: Shared Feed Card Visual Tokens

**Files:**
- Create: `src/theme/feedCard.ts`

- [ ] **Step 1: Create local feed-card tokens**

Create `src/theme/feedCard.ts`:

```typescript
export const feedCardColors = {
  card: 'rgba(15, 23, 42, 0.82)',
  border: 'rgba(148, 163, 184, 0.12)',
  metadataDivider: 'rgba(148, 163, 184, 0.10)',
  metadataIconBackground: 'rgba(247, 181, 58, 0.12)',
  statBackground: 'rgba(15, 23, 42, 0.56)',
  actionActiveBackground: 'rgba(247, 181, 58, 0.12)',
};

export const feedCardMetrics = {
  cardRadius: 14,
  mediaRadius: 0,
};
```

- [ ] **Step 2: Commit the token file**

Run:

```bash
git add src/theme/feedCard.ts
git commit -m "style: add feed card visual tokens"
```

---

### Task 3: Regular Feed Session Card Styling

**Files:**
- Modify: `src/screens/FeedScreen.tsx`

- [ ] **Step 1: Import feed-card tokens**

Add this import near the existing theme imports in `src/screens/FeedScreen.tsx`:

```typescript
import { feedCardColors, feedCardMetrics } from '../theme/feedCard';
```

- [ ] **Step 2: Keep the current Beerva logo usage**

Leave these existing lines unchanged:

```typescript
const beervaLogo = require('../../assets/beerva-header-logo.png');
const cheersLogoSource = Platform.OS === 'web' ? { uri: '/beerva-icon-192.png' } : beervaLogo;
```

Leave the drink row logo usage unchanged:

```tsx
<Image source={beervaLogo} style={styles.inlineLogoSmall} />
```

- [ ] **Step 3: Replace regular feed-card style blocks**

In `src/screens/FeedScreen.tsx`, replace these style blocks in `StyleSheet.create` with the following definitions.

Replace `card`:

```typescript
card: {
  borderRadius: feedCardMetrics.cardRadius,
  marginBottom: spacing.lg,
  overflow: 'hidden',
  backgroundColor: feedCardColors.card,
  borderColor: feedCardColors.border,
  ...shadows.card,
},
```

Replace `cardHeader`:

```typescript
cardHeader: {
  flexDirection: 'row',
  paddingHorizontal: spacing.lg,
  paddingTop: 16,
  paddingBottom: 13,
  alignItems: 'center',
},
```

Replace `imagePressable`:

```typescript
imagePressable: {
  marginHorizontal: 0,
  borderRadius: feedCardMetrics.mediaRadius,
  overflow: 'hidden',
  backgroundColor: colors.cardMuted,
},
```

Replace `imageWrap`:

```typescript
imageWrap: {
  position: 'relative',
  aspectRatio: 4 / 5,
  maxHeight: Platform.OS === 'web' ? 540 : undefined,
},
```

Replace `cardContent`:

```typescript
cardContent: {
  paddingHorizontal: spacing.lg,
  paddingTop: 12,
  paddingBottom: 13,
  gap: 10,
},
```

Replace `sessionSummary`:

```typescript
sessionSummary: {
  gap: 0,
  paddingVertical: 4,
  borderTopWidth: 1,
  borderTopColor: feedCardColors.metadataDivider,
  borderBottomWidth: 1,
  borderBottomColor: feedCardColors.metadataDivider,
},
```

Replace `summaryRow`:

```typescript
summaryRow: {
  minHeight: 34,
  flexDirection: 'row',
  alignItems: 'center',
  minWidth: 0,
  gap: 9,
},
```

Replace `summaryIcon`:

```typescript
summaryIcon: {
  width: 22,
  height: 22,
  borderRadius: 11,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: feedCardColors.metadataIconBackground,
},
```

Replace `inlineLogoSmall`:

```typescript
inlineLogoSmall: {
  width: 20,
  height: 20,
  resizeMode: 'contain',
},
```

Replace `statsToggle`:

```typescript
statsToggle: {
  minHeight: 28,
  alignSelf: 'flex-start',
  borderRadius: radius.pill,
  paddingRight: 2,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
},
```

Replace `statsPanel`:

```typescript
statsPanel: {
  gap: spacing.sm,
  paddingTop: 1,
},
```

Replace `detailPill`:

```typescript
detailPill: {
  flex: 1,
  flexBasis: 94,
  minHeight: 56,
  minWidth: 0,
  borderRadius: radius.md,
  backgroundColor: feedCardColors.statBackground,
  borderWidth: 1,
  borderColor: feedCardColors.metadataDivider,
  paddingHorizontal: 10,
  paddingVertical: 8,
  justifyContent: 'center',
},
```

Replace `engagementPanel`:

```typescript
engagementPanel: {
  paddingHorizontal: spacing.lg,
  paddingTop: 12,
  paddingBottom: 8,
  borderTopWidth: 1,
  borderTopColor: feedCardColors.metadataDivider,
  gap: 9,
},
```

Replace `cardFooter`:

```typescript
cardFooter: {
  paddingHorizontal: spacing.lg,
  paddingTop: 8,
  paddingBottom: 13,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 22,
},
```

Replace `actionWrapper`:

```typescript
actionWrapper: {
  alignSelf: 'flex-start',
},
```

Replace `actionBtn`:

```typescript
actionBtn: {
  alignSelf: 'flex-start',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 34,
  paddingHorizontal: 8,
  borderRadius: radius.pill,
},
```

Replace `actionBtnActive`:

```typescript
actionBtnActive: {
  backgroundColor: feedCardColors.actionActiveBackground,
},
```

- [ ] **Step 4: Run the feed redesign test**

Run:

```bash
npm run test:feed-redesign
```

Expected: FAIL with a Pub Crawl card token/import/style message because `src/components/PubCrawlFeedCard.tsx` has not been updated yet.

- [ ] **Step 5: Commit the regular feed styling**

Run:

```bash
git add src/screens/FeedScreen.tsx
git commit -m "style: modernize feed session cards"
```

---

### Task 4: Pub Crawl Feed Card Styling

**Files:**
- Modify: `src/components/PubCrawlFeedCard.tsx`

- [ ] **Step 1: Import feed-card tokens**

Add this import near the existing theme imports in `src/components/PubCrawlFeedCard.tsx`:

```typescript
import { feedCardColors, feedCardMetrics } from '../theme/feedCard';
```

- [ ] **Step 2: Keep the current Beerva logo usage**

Leave these existing lines unchanged:

```typescript
const beervaLogo = require('../../assets/beerva-header-logo.png');
const cheersLogoSource = Platform.OS === 'web' ? { uri: '/beerva-icon-192.png' } : beervaLogo;
```

Leave the drink summary logo usage unchanged:

```tsx
<Image source={beervaLogo} style={styles.inlineLogoSmall} />
```

- [ ] **Step 3: Replace pub crawl style blocks**

In `src/components/PubCrawlFeedCard.tsx`, replace these style blocks in `StyleSheet.create` with the following definitions.

Replace `card`:

```typescript
card: {
  borderRadius: feedCardMetrics.cardRadius,
  marginBottom: spacing.lg,
  overflow: 'hidden',
  backgroundColor: feedCardColors.card,
  borderColor: feedCardColors.border,
  ...shadows.card,
},
```

Replace `cardHeader`:

```typescript
cardHeader: {
  flexDirection: 'row',
  paddingHorizontal: spacing.lg,
  paddingTop: 16,
  paddingBottom: 13,
  alignItems: 'center',
},
```

Replace `imagePressable`:

```typescript
imagePressable: {
  marginHorizontal: 0,
  borderRadius: feedCardMetrics.mediaRadius,
  overflow: 'hidden',
  backgroundColor: colors.cardMuted,
},
```

Replace `inlineLogoSmall`:

```typescript
inlineLogoSmall: {
  width: 20,
  height: 20,
  resizeMode: 'contain',
},
```

Replace `cardContent`:

```typescript
cardContent: {
  paddingHorizontal: spacing.lg,
  paddingTop: 12,
  paddingBottom: 13,
  gap: 10,
},
```

Replace `sessionSummary`:

```typescript
sessionSummary: {
  gap: 0,
  paddingVertical: 4,
  borderTopWidth: 1,
  borderTopColor: feedCardColors.metadataDivider,
  borderBottomWidth: 1,
  borderBottomColor: feedCardColors.metadataDivider,
},
```

Replace `summaryRow`:

```typescript
summaryRow: {
  minHeight: 34,
  flexDirection: 'row',
  alignItems: 'center',
  minWidth: 0,
  gap: 9,
},
```

Replace `summaryIcon`:

```typescript
summaryIcon: {
  width: 22,
  height: 22,
  borderRadius: 11,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: feedCardColors.metadataIconBackground,
},
```

Replace `statsToggle`:

```typescript
statsToggle: {
  minHeight: 28,
  alignSelf: 'flex-start',
  borderRadius: radius.pill,
  paddingRight: 2,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
},
```

Replace `statsPanel`:

```typescript
statsPanel: {
  gap: spacing.sm,
  paddingTop: 1,
},
```

Replace `detailPill`:

```typescript
detailPill: {
  flex: 1,
  flexBasis: 94,
  minHeight: 56,
  minWidth: 0,
  borderRadius: radius.md,
  backgroundColor: feedCardColors.statBackground,
  borderWidth: 1,
  borderColor: feedCardColors.metadataDivider,
  paddingHorizontal: 10,
  paddingVertical: 8,
  justifyContent: 'center',
},
```

Replace `stopSection`:

```typescript
stopSection: {
  borderRadius: radius.md,
  backgroundColor: feedCardColors.statBackground,
  borderWidth: 1,
  borderColor: feedCardColors.metadataDivider,
  paddingHorizontal: 10,
  paddingVertical: 10,
},
```

Replace `engagementPanel`:

```typescript
engagementPanel: {
  paddingHorizontal: spacing.lg,
  paddingTop: 12,
  paddingBottom: 8,
  borderTopWidth: 1,
  borderTopColor: feedCardColors.metadataDivider,
  gap: 9,
},
```

Replace `cardFooter`:

```typescript
cardFooter: {
  paddingHorizontal: spacing.lg,
  paddingTop: 8,
  paddingBottom: 13,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 22,
},
```

Replace `actionWrapper`:

```typescript
actionWrapper: {
  alignSelf: 'flex-start',
},
```

Replace `actionBtn`:

```typescript
actionBtn: {
  alignSelf: 'flex-start',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 34,
  paddingHorizontal: 8,
  borderRadius: radius.pill,
},
```

Replace `actionBtnActive`:

```typescript
actionBtnActive: {
  backgroundColor: feedCardColors.actionActiveBackground,
},
```

- [ ] **Step 4: Run the feed redesign test**

Run:

```bash
npm run test:feed-redesign
```

Expected: PASS with `feed card redesign checks passed`.

- [ ] **Step 5: Commit the pub crawl styling**

Run:

```bash
git add src/components/PubCrawlFeedCard.tsx
git commit -m "style: modernize pub crawl feed cards"
```

---

### Task 5: Verification And Preserved-Screen Check

**Files:**
- No new files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm run test:feed-redesign
npm run test:feed-header
npm run test:pub-crawl
```

Expected:

```text
feed card redesign checks passed
feed header spacing checks passed
pub crawl tests passed
```

- [ ] **Step 2: Run preserved-area regression checks**

Run:

```bash
npm run test:profile-panel
npm run test:pub-legends
```

Expected:

```text
profile stats panel checks passed
Pub Legends tests passed
```

- [ ] **Step 3: Confirm preserved screens were not edited**

Run in PowerShell:

```powershell
git diff --name-only origin/master...HEAD | Select-String -Pattern "src/screens/PeopleScreen.tsx|src/screens/ProfileScreen.tsx|src/components/ProfileStatsPanel.tsx|src/screens/PubLegendsScreen.tsx|src/screens/PubLegendDetailScreen.tsx"
```

Expected: no output.

- [ ] **Step 4: Build the web app**

Run:

```bash
npm run build:web
```

Expected: Expo export completes successfully and writes the web bundle to `dist`.

- [ ] **Step 5: Manual feed inspection checklist**

Start the app with:

```bash
npm run web
```

Inspect the feed in a narrow mobile viewport and desktop web viewport. Confirm:

- Regular post metadata is two integrated rows, not a bulky filled block.
- The pub row still opens maps.
- The beverage row still uses the current Beerva logo.
- "More stats" remains small and expands/collapses the same way.
- Expanded stats still show drinks, true pints, and average ABV where available.
- Cheers and Comment controls are compact, unbordered, and do not stretch across the card.
- Active cheers still shows the amber accent.
- Comments and cheers modals still open.
- Pub crawl cards match regular feed cards visually.
- People, Profile stats, and Pub Legends layouts still look like the current redesign.

- [ ] **Step 6: Final git status**

Run:

```bash
git status --short --branch
```

Expected: the branch is `redesign-modern-feed`; no app implementation files are uncommitted. The existing untracked `possible_redesign` file may remain because it was supplied as reference material.
