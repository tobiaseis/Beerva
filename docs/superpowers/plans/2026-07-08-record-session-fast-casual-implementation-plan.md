# Record Session Fast Casual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active Record screen faster and less confusing by hiding the full volume grid behind a smart selected-size summary and making session-ending actions visually distinct from drink logging.

**Architecture:** Keep the existing data model and session insert/update flow. Refactor `BeerDraftForm` so volume selection is progressive disclosure inside the component, then update `RecordScreen` copy and action styling while preserving active-session drink row behavior.

**Tech Stack:** Expo React Native, TypeScript, source-level Node regression tests, existing Beerva theme tokens.

---

## File Structure

- Modify `src/components/BeerDraftForm.tsx`
  - Owns the active add-drink form UI.
  - Keeps catalog default volume, locked volume, and auto-add behavior local to the form.
  - Replaces the always-visible volume grid with a selected-size summary and modal chooser.
- Modify `src/screens/RecordScreen.tsx`
  - Changes the add-drink submit copy from `Add Booze` to `Add Drink`.
  - Gives normal `End Session` the existing danger button treatment.
  - Makes the existing repeat drink action read as a `+1` same-again action.
- Modify `scripts/recordSessionDrinks.test.js`
  - Adds source-level regression checks for the compact size selector and Record screen action hierarchy.
- Modify `scripts/sessionBeers.test.js`
  - Adds regression checks that existing default-volume and manually selected volume behavior remain stable.

No database files should be created or modified.

---

### Task 1: Compact Size Selector In `BeerDraftForm`

**Files:**
- Modify: `scripts/recordSessionDrinks.test.js`
- Modify: `src/components/BeerDraftForm.tsx`

- [ ] **Step 1: Add failing source tests for the compact size selector**

In `scripts/recordSessionDrinks.test.js`, after the existing `assert.doesNotMatch(beerDraftFormSource, /volumeOptions/, ...)` block, add:

```js
assert.match(
  beerDraftFormSource,
  /const COMMON_VOLUMES = \['33cl', '50cl', 'Pint'\];/,
  'beer draft form should define a short common-size set for fast casual logging'
);

assert.match(
  beerDraftFormSource,
  /const MORE_VOLUMES = VOLUMES\.filter\(\(volume\) => !COMMON_VOLUMES\.includes\(volume\)\);/,
  'beer draft form should keep uncommon sizes available behind the size chooser'
);

assert.match(
  beerDraftFormSource,
  /setSizeSheetVisible\(true\)/,
  'beer draft form should open a size chooser instead of rendering every volume by default'
);

assert.match(
  beerDraftFormSource,
  /Change size/,
  'beer draft form should expose a clear change-size action'
);

assert.match(
  beerDraftFormSource,
  /selectedVolume\} selected/,
  'beer draft form should show the currently selected size before submit'
);

assert.doesNotMatch(
  beerDraftFormSource,
  /<Text style=\{styles\.sectionLabel\}>Size<\/Text>\s*<View style=\{styles\.volumeRow\}>/,
  'beer draft form should not show the old full volume grid in the default form'
);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm run test:record-session-drinks
```

Expected: FAIL with a message containing `short common-size set` because `COMMON_VOLUMES` does not exist yet.

- [ ] **Step 3: Replace `BeerDraftForm.tsx` with the compact selector implementation**

Replace the full contents of `src/components/BeerDraftForm.tsx` with:

```tsx
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Beer, CheckCircle2, ChevronDown, Minus, Plus, X } from 'lucide-react-native';

import { AutocompleteInput } from './AutocompleteInput';
import { AppButton } from './AppButton';
import { colors } from '../theme/colors';
import { radius, spacing } from '../theme/layout';
import { typography } from '../theme/typography';
import {
  BeerDraft,
  getBeverageDefaultVolume,
  getBeverageOptionSearchText,
  isBeverageAutoAdded,
  isBeverageVolumeLocked,
  VOLUMES,
} from '../lib/sessionBeers';
import { useBeverageCatalog } from '../lib/beverageCatalogContext';

type BeerDraftFormProps = {
  draft: BeerDraft;
  onChange: (draft: BeerDraft) => void;
  onSubmit: (draft?: BeerDraft) => void;
  submitLabel: string;
  loading?: boolean;
};

const COMMON_VOLUMES = ['33cl', '50cl', 'Pint'];
const MORE_VOLUMES = VOLUMES.filter((volume) => !COMMON_VOLUMES.includes(volume));

export const BeerDraftForm = ({
  draft,
  onChange,
  onSubmit,
  submitLabel,
  loading = false,
}: BeerDraftFormProps) => {
  const { catalog, options } = useBeverageCatalog();
  const [autoAddingName, setAutoAddingName] = useState<string | null>(null);
  const [sizeSheetVisible, setSizeSheetVisible] = useState(false);

  useEffect(() => {
    const normalizedAutoAddingName = autoAddingName?.trim().toLowerCase();
    const normalizedDraftName = draft.beerName.trim().toLowerCase();
    if (!normalizedAutoAddingName || normalizedAutoAddingName === normalizedDraftName) return;
    setAutoAddingName(null);
  }, [autoAddingName, draft.beerName]);

  useEffect(() => {
    if (!loading) {
      setAutoAddingName(null);
    }
  }, [loading]);

  const updateDraft = (patch: Partial<BeerDraft>) => {
    setAutoAddingName(null);
    onChange({ ...draft, ...patch });
  };

  const updateBeverageName = (beerName: string) => {
    const defaultVolume = getBeverageDefaultVolume(beerName, catalog);
    updateDraft(defaultVolume ? { beerName, volume: defaultVolume } : { beerName });
  };

  const selectBeverageName = (beerName: string) => {
    const defaultVolume = getBeverageDefaultVolume(beerName, catalog);
    const nextDraft = defaultVolume ? { ...draft, beerName, volume: defaultVolume } : { ...draft, beerName };

    if (isBeverageAutoAdded(beerName, catalog)) {
      setAutoAddingName(beerName);
      onChange(nextDraft);
      onSubmit(nextDraft);
      return;
    }

    setAutoAddingName(null);
    onChange(nextDraft);
  };

  const volumeLocked = isBeverageVolumeLocked(draft.beerName, catalog);
  const lockedVolume = getBeverageDefaultVolume(draft.beerName, catalog);
  const selectedVolume = volumeLocked ? lockedVolume || draft.volume : draft.volume;
  const hideDrinkControls = Boolean(autoAddingName && isBeverageAutoAdded(draft.beerName, catalog));

  useEffect(() => {
    if (hideDrinkControls || volumeLocked) {
      setSizeSheetVisible(false);
    }
  }, [hideDrinkControls, volumeLocked]);

  const selectVolume = (volume: string) => {
    updateDraft({ volume });
    setSizeSheetVisible(false);
  };

  const renderVolumeOption = (volume: string) => {
    const selected = selectedVolume === volume;

    return (
      <TouchableOpacity
        key={volume}
        style={[styles.sizeOption, selected ? styles.sizeOptionActive : null]}
        onPress={() => selectVolume(volume)}
        activeOpacity={0.76}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Use ${volume}`}
      >
        <Text style={[styles.sizeOptionText, selected ? styles.sizeOptionTextActive : null]}>
          {volume}
        </Text>
        {selected ? <CheckCircle2 color={colors.background} size={16} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <AutocompleteInput
        value={draft.beerName}
        onChangeText={updateBeverageName}
        onSelectItem={selectBeverageName}
        data={options}
        placeholder="What are you drinking?"
        icon={<Beer color={colors.textMuted} size={20} />}
        getSearchText={(beverageName) => getBeverageOptionSearchText(beverageName, catalog)}
      />

      {!hideDrinkControls && (
        <>
          <View style={styles.sizeSummary}>
            <View style={styles.sizeSummaryText}>
              <Text style={styles.sizeLabel}>Size</Text>
              <Text style={styles.sizeValue}>{selectedVolume} selected</Text>
            </View>

            {!volumeLocked ? (
              <TouchableOpacity
                style={styles.sizeChangeButton}
                onPress={() => setSizeSheetVisible(true)}
                activeOpacity={0.76}
                accessibilityRole="button"
                accessibilityLabel="Change drink size"
              >
                <Text style={styles.sizeChangeText}>Change size</Text>
                <ChevronDown color={colors.primary} size={16} />
              </TouchableOpacity>
            ) : (
              <Text style={styles.sizeLockedText}>Auto</Text>
            )}
          </View>

          <Text style={styles.sectionLabel}>Quantity</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity
              style={styles.quantityBtn}
              onPress={() => updateDraft({ quantity: Math.max(1, draft.quantity - 1) })}
              activeOpacity={0.76}
              accessibilityRole="button"
              accessibilityLabel="Decrease quantity"
            >
              <Minus color={colors.primary} size={22} />
            </TouchableOpacity>

            <Text style={styles.quantityText}>{draft.quantity}</Text>

            <TouchableOpacity
              style={styles.quantityBtn}
              onPress={() => updateDraft({ quantity: draft.quantity + 1 })}
              activeOpacity={0.76}
              accessibilityRole="button"
              accessibilityLabel="Increase quantity"
            >
              <Plus color={colors.primary} size={22} />
            </TouchableOpacity>
          </View>

          <AppButton label={submitLabel} onPress={() => onSubmit()} loading={loading} />

          <Modal
            visible={sizeSheetVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setSizeSheetVisible(false)}
          >
            <View style={styles.sizeSheetBackdrop}>
              <View style={styles.sizeSheet}>
                <View style={styles.sizeSheetHeader}>
                  <Text style={styles.sizeSheetTitle}>Choose size</Text>
                  <TouchableOpacity
                    style={styles.sizeSheetClose}
                    onPress={() => setSizeSheetVisible(false)}
                    hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close size chooser"
                  >
                    <X color={colors.text} size={20} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.sizeGroupLabel}>Common</Text>
                <View style={styles.sizeOptionGrid}>
                  {COMMON_VOLUMES.map(renderVolumeOption)}
                </View>

                <Text style={styles.sizeGroupLabel}>More sizes</Text>
                <View style={styles.sizeOptionGrid}>
                  {MORE_VOLUMES.map(renderVolumeOption)}
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 8,
  },
  sizeSummary: {
    minHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sizeSummaryText: {
    flex: 1,
    minWidth: 0,
  },
  sizeLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  sizeValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '800',
    marginTop: 2,
  },
  sizeChangeButton: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sizeChangeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '800',
  },
  sizeLockedText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 8,
    marginBottom: spacing.sm,
  },
  quantityBtn: {
    padding: 12,
    backgroundColor: colors.glass,
    borderRadius: radius.sm,
  },
  quantityText: {
    ...typography.h1,
    color: colors.text,
    width: 60,
    textAlign: 'center',
  },
  sizeSheetBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: 16,
  },
  sizeSheet: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: 16,
    gap: 12,
  },
  sizeSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sizeSheetTitle: {
    ...typography.h3,
    color: colors.text,
  },
  sizeSheetClose: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sizeGroupLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '800',
    marginTop: 4,
  },
  sizeOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sizeOption: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 92,
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sizeOptionActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sizeOptionText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '800',
    textAlign: 'center',
  },
  sizeOptionTextActive: {
    color: colors.background,
  },
});
```

- [ ] **Step 4: Run the focused test and confirm the compact selector passes**

Run:

```powershell
npm run test:record-session-drinks
```

Expected: PASS with `record session drink checks passed`.

- [ ] **Step 5: Commit the compact selector**

Run:

```powershell
git add scripts/recordSessionDrinks.test.js src/components/BeerDraftForm.tsx
git commit -m "feat: simplify record drink size picker"
```

Expected: commit succeeds with two files changed.

---

### Task 2: Record Screen Copy, End Action, And Repeat Affordance

**Files:**
- Modify: `scripts/recordSessionDrinks.test.js`
- Modify: `src/screens/RecordScreen.tsx`

- [ ] **Step 1: Add failing source tests for Record screen action hierarchy**

In `scripts/recordSessionDrinks.test.js`, after the compact size selector assertions from Task 1, add:

```js
assert.match(
  source,
  /submitLabel="Add Drink"/,
  'record screen should use Add Drink as the primary logging copy'
);

assert.doesNotMatch(
  source,
  /submitLabel="Add Booze"/,
  'record screen should not use the less clear Add Booze copy'
);

assert.match(
  source,
  /<AppButton\s+label="End Session"\s+variant="danger"\s+onPress=\{endSession\}\s+loading=\{ending\}\s+\/>/,
  'normal End Session should use danger styling instead of primary styling'
);

assert.match(
  source,
  /<Text style=\{styles\.incrementBeerLabel\}>\+1<\/Text>/,
  'existing drink rows should show the repeat action as a visible +1 same-again control'
);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
npm run test:record-session-drinks
```

Expected: FAIL with a message containing `Add Drink` because `RecordScreen` still passes `submitLabel="Add Booze"`.

- [ ] **Step 3: Update `RecordScreen.tsx` add-drink copy**

Find this `BeerDraftForm` prop block:

```tsx
              <BeerDraftForm
                draft={beerDraft}
                onChange={setBeerDraft}
                onSubmit={addBeerToSession}
                submitLabel="Add Booze"
                loading={addingBeer}
              />
```

Replace it with:

```tsx
              <BeerDraftForm
                draft={beerDraft}
                onChange={setBeerDraft}
                onSubmit={addBeerToSession}
                submitLabel="Add Drink"
                loading={addingBeer}
              />
```

- [ ] **Step 4: Update the normal End Session button styling**

Find this normal-session end button:

```tsx
                    <AppButton label="End Session" onPress={endSession} loading={ending} />
```

Replace it with:

```tsx
                    <AppButton
                      label="End Session"
                      variant="danger"
                      onPress={endSession}
                      loading={ending}
                    />
```

- [ ] **Step 5: Add the visible `+1` repeat affordance**

Find the increment drink button contents:

```tsx
                          <PlusCircle color={colors.primary} size={17} />
```

Replace it with:

```tsx
                          <PlusCircle color={colors.primary} size={17} />
                          <Text style={styles.incrementBeerLabel}>+1</Text>
```

Then find the existing `incrementBeerButton` style:

```tsx
  incrementBeerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
```

Replace it with:

```tsx
  incrementBeerButton: {
    minWidth: 46,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  incrementBeerLabel: {
    ...typography.tiny,
    color: colors.primary,
    fontWeight: '900',
  },
```

- [ ] **Step 6: Run the focused test and confirm the screen changes pass**

Run:

```powershell
npm run test:record-session-drinks
```

Expected: PASS with `record session drink checks passed`.

- [ ] **Step 7: Commit the Record screen hierarchy changes**

Run:

```powershell
git add scripts/recordSessionDrinks.test.js src/screens/RecordScreen.tsx
git commit -m "feat: clarify record session primary actions"
```

Expected: commit succeeds with two files changed.

---

### Task 3: Session Beer Data Regression Tests

**Files:**
- Modify: `scripts/sessionBeers.test.js`

- [ ] **Step 1: Import the helper exports needed for fallback-volume regression tests**

In `scripts/sessionBeers.test.js`, update the destructuring assignment from `loadTypeScriptModule('src/lib/sessionBeers.ts')`.

Find:

```js
  beerDraftToPayload,
  getBeverageDefaultVolume,
  isBeverageAutoAdded,
  isBeverageVolumeLocked,
  getSessionBeerBreakdownLines,
  getSessionBeerSummary,
  getBeverageCatalogItem,
  mergeBeverageCatalog,
} = loadTypeScriptModule('src/lib/sessionBeers.ts');
```

Replace it with:

```js
  beerDraftToPayload,
  createEmptyBeerDraft,
  getBeverageDefaultVolume,
  isBeverageAutoAdded,
  isBeverageVolumeLocked,
  getSessionBeerBreakdownLines,
  getSessionBeerSummary,
  getBeverageCatalogItem,
  mergeBeverageCatalog,
} = loadTypeScriptModule('src/lib/sessionBeers.ts');
```

- [ ] **Step 2: Add regression checks for fallback and selected volume preservation**

In `scripts/sessionBeers.test.js`, after the `ordinary beer payload records beer category` check, add:

```js
check('empty draft keeps Pint as the unknown-drink fallback', () => {
  assert.equal(createEmptyBeerDraft().volume, 'Pint');
});

check('manually selected size is preserved in payload', () => {
  assert.deepEqual(
    beerDraftToPayload({ beerName: 'Mystery Pub Ale', volume: '50cl', quantity: 3 }),
    { beer_name: 'Mystery Pub Ale', volume: '50cl', quantity: 3, abv: 5, beverage_category: 'beer' }
  );
});
```

- [ ] **Step 3: Run session beer tests**

Run:

```powershell
npm run test:session-beers
```

Expected: PASS with `session beer formatting checks passed`.

- [ ] **Step 4: Commit the data regression tests**

Run:

```powershell
git add scripts/sessionBeers.test.js
git commit -m "test: lock record drink volume defaults"
```

Expected: commit succeeds with one file changed.

---

### Task 4: Final Verification

**Files:**
- Verify: `src/components/BeerDraftForm.tsx`
- Verify: `src/screens/RecordScreen.tsx`
- Verify: `scripts/recordSessionDrinks.test.js`
- Verify: `scripts/sessionBeers.test.js`

- [ ] **Step 1: Run the focused test suite**

Run:

```powershell
npm run test:session-beers
npm run test:record-session-drinks
```

Expected:

```text
session beer formatting checks passed
record session drink checks passed
```

- [ ] **Step 2: Run the web export build**

Run:

```powershell
npm run build:web
```

Expected: Expo export completes without TypeScript, Metro, or bundling errors.

- [ ] **Step 3: Inspect git status**

Run:

```powershell
git status --short
```

Expected: no output.
