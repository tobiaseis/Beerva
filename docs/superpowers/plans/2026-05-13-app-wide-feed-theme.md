# App-Wide Feed Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Beerva page use the modern feed color theme so the app feels consistent and premium.

**Architecture:** Align the shared theme tokens with the feed palette, then update the few hard-coded non-feed surfaces that bypass shared tokens. Keep layouts, data flows, and behavior unchanged; this is a controlled visual surface pass.

**Tech Stack:** Expo React Native Web, TypeScript, React Native StyleSheet, Node source-level tests.

---

## File Structure

- Create: `scripts/appThemeTokens.test.js`
  - Guards the shared theme colors, feed-card tokens, and `Surface` component against drifting away from the feed palette.
- Create: `scripts/appThemeScreens.test.js`
  - Guards major non-roulette surfaces against old hard-coded colors that clash with the feed theme and protects the Pub Roulette casino styling from being normalized.
- Modify: `package.json`
  - Adds `test:app-theme` and `test:app-theme-screens`.
- Modify: `src/theme/colors.ts`
  - Makes shared semantic color names resolve to the feed-derived palette.
- Modify: `src/theme/feedCard.ts`
  - Points feed-card tokens at shared theme tokens so the feed remains the authority and other pages can share the same palette.
- Modify: `src/components/Surface.tsx`
  - Keeps `Surface` on shared tokens; raised surfaces inherit the aligned floating/nav color.
- Modify: `src/components/TrophyUnlockModal.tsx`
  - Recolors trophy/prize modal cards and buttons to the app-wide feed theme while keeping celebratory confetti accents.
- Modify: `src/screens/ProfileScreen.tsx`
  - Replaces the remaining hard-coded locked trophy panel surfaces with shared feed-theme tokens.

No data, navigation, auth, Supabase, notification, feed, pub crawl, cheers, comments, stats, or trophy logic should change.
The Pub Roulette CTA, modal, wheel, rails, and casino colors should not change; they are intentionally loud.

---

### Task 1: Failing Shared Theme Token Guard

**Files:**
- Create: `scripts/appThemeTokens.test.js`
- Modify: `package.json`

- [ ] **Step 1: Create the shared theme token test**

Create `scripts/appThemeTokens.test.js`:

```javascript
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(__dirname, '..', relativePath),
  'utf8'
);

const colorsSource = readSource('src/theme/colors.ts');
const feedCardSource = readSource('src/theme/feedCard.ts');
const surfaceSource = readSource('src/components/Surface.tsx');

assert.match(
  colorsSource,
  /card:\s*appThemeColors\.card/,
  'shared card color should point at the feed card surface'
);
assert.match(
  colorsSource,
  /surface:\s*appThemeColors\.inset/,
  'shared inset surface should point at the feed stat surface'
);
assert.match(
  colorsSource,
  /surfaceRaised:\s*appThemeColors\.floating/,
  'raised surfaces should use the floating feed/nav surface'
);
assert.match(
  colorsSource,
  /border:\s*appThemeColors\.border/,
  'strong borders should use the feed soft border'
);
assert.match(
  colorsSource,
  /borderSoft:\s*appThemeColors\.divider/,
  'soft borders should use the feed divider'
);
assert.match(
  colorsSource,
  /card:\s*'rgba\(15,\s*23,\s*42,\s*0\.82\)'/,
  'feed card surface value should be app-wide'
);
assert.match(
  colorsSource,
  /inset:\s*'rgba\(15,\s*23,\s*42,\s*0\.56\)'/,
  'feed stat inset value should be app-wide'
);
assert.match(
  colorsSource,
  /floating:\s*'#172238'/,
  'floating nav/feed raised color should be app-wide'
);
assert.match(
  colorsSource,
  /border:\s*'rgba\(148,\s*163,\s*184,\s*0\.12\)'/,
  'feed card border value should be app-wide'
);
assert.match(
  colorsSource,
  /divider:\s*'rgba\(148,\s*163,\s*184,\s*0\.10\)'/,
  'feed metadata divider value should be app-wide'
);

assert.match(
  feedCardSource,
  /import \{ colors \} from '\.\/colors';/,
  'feed card tokens should consume shared app theme colors'
);
assert.match(
  feedCardSource,
  /card:\s*colors\.card/,
  'feed cards should use the shared app card surface'
);
assert.match(
  feedCardSource,
  /statBackground:\s*colors\.cardMuted/,
  'feed stat surfaces should use the shared app inset surface'
);

assert.match(
  surfaceSource,
  /backgroundColor:\s*colors\.card/,
  'Surface default should use the shared feed card surface'
);
assert.match(
  surfaceSource,
  /backgroundColor:\s*colors\.surfaceRaised/,
  'Surface raised variant should use the shared floating surface'
);
assert.match(
  surfaceSource,
  /borderColor:\s*colors\.borderSoft/,
  'Surface should keep the shared feed divider border'
);

console.log('app theme token checks passed');
```

- [ ] **Step 2: Add package scripts**

Modify `package.json` inside `"scripts"`:

```json
"test:app-theme": "node scripts/appThemeTokens.test.js",
```

Place it near the other source-level test scripts.

- [ ] **Step 3: Run the failing test**

Run:

```bash
npm run test:app-theme
```

Expected: FAIL with a message such as `shared card color should point at the feed card surface` because `src/theme/colors.ts` does not yet define `appThemeColors`.

- [ ] **Step 4: Commit the failing guard**

Run:

```bash
git add package.json scripts/appThemeTokens.test.js
git commit -m "test: guard app-wide feed theme tokens"
```

---

### Task 2: Shared Feed-Derived Theme Tokens

**Files:**
- Modify: `src/theme/colors.ts`
- Modify: `src/theme/feedCard.ts`
- Modify: `src/components/Surface.tsx`

- [ ] **Step 1: Replace the shared color tokens**

Replace the full contents of `src/theme/colors.ts` with:

```typescript
export const appThemeColors = {
  card: 'rgba(15, 23, 42, 0.82)',
  inset: 'rgba(15, 23, 42, 0.56)',
  floating: '#172238',
  border: 'rgba(148, 163, 184, 0.12)',
  divider: 'rgba(148, 163, 184, 0.10)',
};

export const colors = {
  background: '#0D121A',
  surface: appThemeColors.inset,
  surfaceRaised: appThemeColors.floating,
  card: appThemeColors.card,
  cardMuted: appThemeColors.inset,
  primary: '#F7B53A',
  primaryDark: '#D58A08',
  primarySoft: 'rgba(247, 181, 58, 0.14)',
  primaryBorder: 'rgba(247, 181, 58, 0.34)',
  text: '#F8FAFC',
  textMuted: '#9AA7BA',
  textSubtle: '#64748B',
  border: appThemeColors.border,
  borderSoft: appThemeColors.divider,
  success: '#10B981',
  successSoft: 'rgba(16, 185, 129, 0.13)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  glass: appThemeColors.card,
  overlay: 'rgba(2, 6, 23, 0.76)',
};
```

- [ ] **Step 2: Point feed-card tokens at shared colors**

Replace the full contents of `src/theme/feedCard.ts` with:

```typescript
import { colors } from './colors';

export const feedCardColors = {
  card: colors.card,
  border: colors.border,
  metadataDivider: colors.borderSoft,
  metadataIconBackground: colors.primarySoft,
  statBackground: colors.cardMuted,
  actionActiveBackground: colors.primarySoft,
};

export const feedCardMetrics = {
  cardRadius: 14,
  mediaRadius: 0,
};

export const getCompactFeedActionCount = (count: number) => {
  if (count < 1000) return String(count);

  const compact = count < 10000
    ? (count / 1000).toFixed(1).replace(/\.0$/, '')
    : String(Math.round(count / 1000));

  return `${compact}K`;
};
```

- [ ] **Step 3: Keep Surface on semantic shared tokens**

Open `src/components/Surface.tsx` and confirm the style block remains:

```typescript
const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  padded: {
    padding: spacing.lg,
  },
  raised: {
    backgroundColor: colors.surfaceRaised,
    ...shadows.raised,
  },
});
```

If it differs, replace the style block with the snippet above.

- [ ] **Step 4: Run the shared theme token test**

Run:

```bash
npm run test:app-theme
```

Expected: PASS with `app theme token checks passed`.

- [ ] **Step 5: Run feed guards**

Run:

```bash
npm run test:feed-redesign
npm run test:floating-nav
```

Expected:

```text
feed card redesign checks passed
floating bottom nav checks passed
```

- [ ] **Step 6: Commit shared theme tokens**

Run:

```bash
git add src/theme/colors.ts src/theme/feedCard.ts src/components/Surface.tsx
git commit -m "style: align shared colors with feed theme"
```

---

### Task 3: Failing Hard-Coded Surface Guard

**Files:**
- Create: `scripts/appThemeScreens.test.js`
- Modify: `package.json`

- [ ] **Step 1: Create the screen-level theme guard**

Create `scripts/appThemeScreens.test.js`:

```javascript
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
```

- [ ] **Step 2: Add the package script**

Modify `package.json` inside `"scripts"`:

```json
"test:app-theme-screens": "node scripts/appThemeScreens.test.js",
```

- [ ] **Step 3: Run the failing screen guard**

Run:

```bash
npm run test:app-theme-screens
```

Expected: FAIL with a message mentioning `src/components/TrophyUnlockModal.tsx should not use legacy hard-coded surface color /#2A063D/i`.

- [ ] **Step 4: Commit the failing screen guard**

Run:

```bash
git add package.json scripts/appThemeScreens.test.js
git commit -m "test: guard non-feed theme surfaces"
```

---

### Task 4: Recolor Non-Roulette Hard-Coded Surfaces

**Files:**
- Modify: `src/components/TrophyUnlockModal.tsx`
- Modify: `src/screens/ProfileScreen.tsx`

- [ ] **Step 1: Preserve the roulette casino feature**

Do not edit `src/screens/RecordScreen.tsx` roulette CTA styles or `src/components/PubRouletteModal.tsx` styles in this task. The source-level guard from Task 3 intentionally asserts that these casino colors remain in place:

```typescript
backgroundColor: '#2A063D'
backgroundColor: '#190B2B'
backgroundColor: '#250F38'
const WHEEL_COLORS = ['#E11D48', '#0EA5E9', '#16A34A', '#F59E0B', '#7C3AED', '#DC2626', '#0891B2', '#FACC15'];
```

- [ ] **Step 2: Recolor trophy unlock modal surfaces**

In `src/components/TrophyUnlockModal.tsx`, replace these style blocks:

```typescript
  header: {
    ...typography.caption,
    fontWeight: '900',
    color: colors.primary,
    marginBottom: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  iconContainer: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.raised,
  },
  prizeCard: {
    width: '100%',
    maxWidth: 380,
    minHeight: 360,
    paddingHorizontal: 26,
    paddingVertical: 30,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.card,
  },
  prizeWow: {
    fontFamily: 'Righteous_400Regular',
    fontSize: 62,
    lineHeight: 68,
    color: colors.primary,
    textAlign: 'center',
    textShadowColor: colors.primaryBorder,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  prizeButton: {
    width: '100%',
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: colors.primary,
  },
  prizeButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '900',
    textAlign: 'center',
  },
```

Keep `prizeColors` unchanged; the floating celebratory shapes can remain colorful while the modal chrome follows the app theme.

- [ ] **Step 3: Recolor remaining profile trophy surfaces**

In `src/screens/ProfileScreen.tsx`, replace these style blocks:

```typescript
  badgeLocked: {
    backgroundColor: colors.cardMuted,
    borderColor: colors.borderSoft,
  },
  badgeIconEarned: {
    backgroundColor: colors.primarySoft,
  },
  badgeIconLocked: {
    backgroundColor: colors.surface,
  },
```

- [ ] **Step 4: Run the screen-level theme guard**

Run:

```bash
npm run test:app-theme-screens
```

Expected: PASS with `app theme screen checks passed`.

- [ ] **Step 5: Run shared theme guard**

Run:

```bash
npm run test:app-theme
```

Expected: PASS with `app theme token checks passed`.

- [ ] **Step 6: Commit hard-coded surface cleanup**

Run:

```bash
git add src/components/TrophyUnlockModal.tsx src/screens/ProfileScreen.tsx
git commit -m "style: align special surfaces with feed theme"
```

---

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Run theme guards**

Run:

```bash
npm run test:app-theme
npm run test:app-theme-screens
```

Expected:

```text
app theme token checks passed
app theme screen checks passed
```

- [ ] **Step 2: Run feed and navigation guards**

Run:

```bash
npm run test:feed-redesign
npm run test:feed-header
npm run test:floating-nav
npm run test:session-beers
```

Expected:

```text
feed card redesign checks passed
feed header spacing checks passed
floating bottom nav checks passed
session beer formatting checks passed
```

- [ ] **Step 3: Run affected feature tests**

Run:

```bash
npm run test:stats
npm run test:profile-panel
npm run test:pub-legends
npm run test:pub-crawl
npm run test:notifications
npm run test:pub-directory
npm run test:record-place-category
```

Expected:

```text
profileStats trophy tests passed
profile stats panel checks passed
Pub Legends tests passed
pub crawl tests passed
notifications tests passed
pub directory tests passed
record place category checks passed
```

- [ ] **Step 4: Build web**

Run:

```bash
npm run build:web
```

Expected: Expo export completes successfully and writes the bundle to `dist`.

- [ ] **Step 5: Manual visual inspection**

Start the preview:

```bash
npm run preview:web
```

Inspect these pages in a mobile-sized viewport:

- Feed: feed cards still match the approved modern look.
- Record: form panels, drink controls, and upload/photo choices use the same dark slate/amber palette; roulette CTA keeps its loud casino colors.
- Pub Roulette modal: wheel, sheet, rails, pointer, spin button, and jackpot visuals keep the crazy casino colors.
- People: search and list cards use the same feed card/inset colors.
- Profile and User Profile: profile header, stat widgets, session cards, trophy cards, and modals use the same feed palette.
- Pub Legends and Pub Legend Detail: leaderboard cards and detail rows use the same feed palette.
- Notifications: notification cards, unread highlights, invite controls, and action chips use the same feed palette.
- Auth/Profile Setup/Hangover/Edit Session when reachable: form surfaces and panels use the same feed palette.

- [ ] **Step 6: Final status**

Run:

```bash
git status --short --branch
```

Expected: no uncommitted app implementation changes. The branch may be ahead of `origin/redesign-modern-feed` by the new commits.
