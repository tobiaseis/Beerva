# Chug Recording Angle Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an always-visible pre-recording angle prompt with the supplied illustration in the chug setup modal.

**Architecture:** Keep the change inside the existing `ChugAttemptModal` setup surface. Render a static React Native image and concise framing copy as the first item in the modal scroll content so users see the guidance before selecting a beer, verifier, or recording action.

**Tech Stack:** Expo React Native/Web, React Native `Image`, existing Node source-contract tests.

---

## Scope Check

This is a focused UI-only extension. It does not change camera behavior, MediaPipe analysis, database state, or the verifier workflow.

## File Structure

- Add `assets/person_drinking_beer.png`: supplied recording-angle illustration.
- Modify `src/components/ChugAttemptModal.tsx`: render the always-visible recording guidance panel.
- Modify `scripts/chugRecordScreen.test.js`: require the asset and approved copy.

---

### Task 1: Recording Angle Guidance Panel

**Files:**
- Add: `assets/person_drinking_beer.png`
- Modify: `src/components/ChugAttemptModal.tsx`
- Modify: `scripts/chugRecordScreen.test.js`

- [ ] **Step 1: Write the failing modal assertions**

Append to `scripts/chugRecordScreen.test.js`:

```js
assert.match(modalSource, /person_drinking_beer\.png/, 'modal should render the supplied recording-angle illustration');
assert.match(modalSource, /Best recording angle/, 'modal should label the recording-angle guidance');
assert.match(
  modalSource,
  /Keep the face and bottle visible\. Film from a slight side angle in good lighting\./,
  'modal should explain how to frame the chug video'
);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm run test:chug-record
```

Expected: FAIL with `modal should render the supplied recording-angle illustration`.

- [ ] **Step 3: Add the static asset require**

In `src/components/ChugAttemptModal.tsx`, after the theme imports, add:

```ts
const recordingAngleImage = require('../../assets/person_drinking_beer.png');
```

- [ ] **Step 4: Render the guidance panel first in the modal scroll content**

In `src/components/ChugAttemptModal.tsx`, add this as the first child inside:

```tsx
<ScrollView contentContainerStyle={styles.content}>
```

Use:

```tsx
<View style={styles.guidancePanel}>
  <Image
    source={recordingAngleImage}
    style={styles.guidanceImage}
    resizeMode="cover"
    accessibilityLabel="Example of filming a drinker and bottle from a slight side angle"
  />
  <View style={styles.guidanceCopy}>
    <Text style={styles.guidanceTitle}>Best recording angle</Text>
    <Text style={styles.guidanceText}>
      Keep the face and bottle visible. Film from a slight side angle in good lighting.
    </Text>
  </View>
</View>
```

- [ ] **Step 5: Add the restrained guidance styles**

Add to the `StyleSheet.create` call in `src/components/ChugAttemptModal.tsx`:

```ts
guidancePanel: {
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: colors.borderSoft,
  backgroundColor: colors.surface,
  overflow: 'hidden',
},
guidanceImage: {
  width: '100%',
  height: 138,
},
guidanceCopy: {
  gap: 4,
  padding: 12,
},
guidanceTitle: {
  ...typography.body,
  color: colors.text,
  fontWeight: '800',
},
guidanceText: {
  ...typography.caption,
  color: colors.textMuted,
  lineHeight: 18,
},
```

- [ ] **Step 6: Run the focused test to verify it passes**

Run:

```bash
npm run test:chug-record
```

Expected: PASS with `chug record screen checks passed`.

- [ ] **Step 7: Commit**

```bash
git add assets/person_drinking_beer.png scripts/chugRecordScreen.test.js src/components/ChugAttemptModal.tsx
git commit -m "feat: add chug recording angle guidance"
```

---

### Task 2: Verification Sweep

**Files:**
- Verify only

- [ ] **Step 1: Run the focused record-flow test**

```bash
npm run test:chug-record
```

Expected: exit `0`.

- [ ] **Step 2: Run the adjacent chug UI tests**

```bash
npm run test:chugs
npm run test:chug-review
```

Expected: every command exits `0`.

- [ ] **Step 3: Export the web app**

```bash
npm run build:web
```

Expected: exit `0` with `Exported: dist`.

- [ ] **Step 4: Inspect branch status**

```bash
git status --short --branch
```

Expected: clean `feature/beer-chugging` worktree.

- [ ] **Step 5: Finish the branch workflow**

Use `superpowers:finishing-a-development-branch` and present the standard merge, PR, keep, or discard options.

