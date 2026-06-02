# Chug Bottle Button Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visible exterior glow box and obsolete trailing chevron from the generated chug bottle button.

**Architecture:** Keep the generated PNG, responsive SVG wrapper, and internal SVG text shadow unchanged. Tighten the focused component contract first, then remove only the wrapper shadow/elevation styles and update the editable label.

**Tech Stack:** Expo React Native, `react-native-svg`, Node source-level regression tests.

---

## File Structure

### Modify

- `scripts/chugBottleButton.test.js`
  - Rejects wrapper-level shadow and elevation styles and rejects a trailing chevron in the label.
- `src/components/ChugBottleButton.tsx`
  - Removes the exterior wrapper glow and trailing chevron.

## Task 1: Remove Exterior Glow And Chevron

**Files:**
- Modify: `scripts/chugBottleButton.test.js`
- Modify: `src/components/ChugBottleButton.tsx`

- [ ] **Step 1: Add the failing component contract assertions**

In `scripts/chugBottleButton.test.js`, replace:

```js
assert.match(componentSource, /HOW FAST CAN YOU CHUG\?  >/, 'component should preserve the chug action label');
```

with:

```js
assert.match(componentSource, /const LABEL = 'HOW FAST CAN YOU CHUG\?';/, 'component should keep the editable chug action label without a trailing chevron');
assert.doesNotMatch(componentSource, /shadowColor|shadowOffset|shadowOpacity|shadowRadius|elevation/, 'component wrapper should not add an exterior glow box');
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm run test:chug-button
```

Expected: FAIL with `component should keep the editable chug action label without a trailing chevron`.

- [ ] **Step 3: Remove the obsolete chevron and wrapper glow**

In `src/components/ChugBottleButton.tsx`, replace:

```ts
const LABEL = 'HOW FAST CAN YOU CHUG?  >';
```

with:

```ts
const LABEL = 'HOW FAST CAN YOU CHUG?';
```

Replace:

```ts
  wrapper: {
    marginVertical: spacing.md,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 15,
    elevation: 7,
  },
```

with:

```ts
  wrapper: {
    marginVertical: spacing.md,
  },
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm run test:chug-button
```

Expected: PASS with `responsive chug bottle asset checks passed`.

- [ ] **Step 5: Commit the polish**

Run:

```powershell
git add scripts/chugBottleButton.test.js src/components/ChugBottleButton.tsx
git commit -m "fix: remove chug bottle glow and chevron"
```

## Task 2: Verify The Polished Button

**Files:**
- Verify only.

- [ ] **Step 1: Run focused and consuming-screen tests**

Run:

```powershell
npm run test:chug-button
npm run test:chug-record
npm run test:chug-edit
```

Expected: all three commands PASS.

- [ ] **Step 2: Run TypeScript and web build checks**

Run:

```powershell
npx tsc --noEmit
npm run build:web
```

Expected: both commands exit successfully.

- [ ] **Step 3: Inspect the narrow-phone render**

Render the generated bottle button at `390x844` and confirm:

- No exterior glow box appears.
- The transparent background blends into the app background.
- The text reads `HOW FAST CAN YOU CHUG?`.
- The text remains on one line inside the bottle body.

- [ ] **Step 4: Inspect the worktree**

Run:

```powershell
git status --short
```

Expected: only pre-existing unrelated local changes remain.

## Spec Coverage Checklist

- Keep bottle PNG unchanged: Task 1 modifies only the component and test.
- Remove wrapper glow/elevation: Task 1 contract and component edit.
- Keep internal text shadow: Task 1 does not alter either `SvgText` layer.
- Remove trailing chevron: Task 1 label contract and edit.
- Preserve responsive sizing and behavior: Task 1 does not alter layout calculations or touch props.
- Verify narrow-phone appearance: Task 2 render inspection.
