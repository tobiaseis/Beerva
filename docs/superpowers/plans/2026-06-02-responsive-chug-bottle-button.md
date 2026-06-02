# Responsive Chug Bottle Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-built chug bottle SVG with a photorealistic AI-generated transparent bottle asset inside a responsive SVG wrapper whose overlay label remains readable across phone widths.

**Architecture:** Generate one horizontal amber bottle cutout with the built-in image generation tool, remove its chroma-key backdrop locally, and normalize it onto a stable `1600x360` transparent canvas. Keep interaction and accessibility in `ChugBottleButton`, but replace its authored bottle paths with an SVG image layer plus separately rendered responsive SVG text. Add a focused source-and-pixel contract test and update stale screen-level regression checks left by the earlier component extraction.

**Tech Stack:** Expo React Native, `react-native-svg`, static PNG assets, built-in image generation, Python Pillow post-processing, Node `pngjs` regression checks.

---

## File Structure

### Create

- `assets/chug-bottle-button.png`
  - Final generated transparent bottle asset on a stable `1600x360` canvas.
- `scripts/normalizeChugBottleAsset.py`
  - Crops a transparent generated bottle cutout and centers it on the stable app canvas.
- `scripts/chugBottleButton.test.js`
  - Verifies asset transparency, dimensions, component wiring, responsive text sizing, and removal of the hand-authored SVG bottle.

### Modify

- `package.json`
  - Adds `test:chug-button`.
- `src/components/ChugBottleButton.tsx`
  - Renders the generated asset and responsive SVG label.
- `scripts/chugRecordScreen.test.js`
  - Replaces stale inline bottle checks with the extracted component contract.
- `scripts/chugEditSession.test.js`
  - Replaces stale inline bottle checks with the extracted component contract.

### Temporary, Do Not Commit

- `tmp/imagegen/chug-bottle-source.png`
  - Raw built-in image generation output.
- `tmp/imagegen/chug-bottle-keyed.png`
  - Chroma-key-removed intermediate image.

## Task 1: Generate And Normalize The Transparent Bottle Asset

**Files:**
- Create: `scripts/normalizeChugBottleAsset.py`
- Create: `scripts/chugBottleButton.test.js`
- Create: `assets/chug-bottle-button.png`
- Modify: `package.json`

- [ ] **Step 1: Add the initial asset contract test**

Create `scripts/chugBottleButton.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const assetPath = path.resolve(__dirname, '..', 'assets/chug-bottle-button.png');

assert.ok(fs.existsSync(assetPath), 'generated chug bottle asset should exist');

const png = PNG.sync.read(fs.readFileSync(assetPath));
assert.equal(png.width, 1600, 'generated chug bottle asset should use the stable wrapper width');
assert.equal(png.height, 360, 'generated chug bottle asset should use the stable wrapper height');

const alphaAt = (x, y) => png.data[((png.width * y) + x) * 4 + 3];
[
  [0, 0],
  [png.width - 1, 0],
  [0, png.height - 1],
  [png.width - 1, png.height - 1],
].forEach(([x, y]) => {
  assert.equal(alphaAt(x, y), 0, `asset corner ${x},${y} should be transparent`);
});

let visiblePixels = 0;
for (let offset = 3; offset < png.data.length; offset += 4) {
  if (png.data[offset] > 8) visiblePixels += 1;
}

const visibleRatio = visiblePixels / (png.width * png.height);
assert.ok(visibleRatio > 0.28, 'bottle should occupy enough of the canvas to read as a button');
assert.ok(visibleRatio < 0.88, 'bottle canvas should preserve transparent space around the cutout');
assert.ok(alphaAt(520, 180) > 80, 'wide bottle body should remain visible behind the label area');

console.log('responsive chug bottle asset checks passed');
```

Add the script in `package.json` beside the other chug checks:

```json
"test:chug-button": "node scripts/chugBottleButton.test.js",
```

- [ ] **Step 2: Run the asset check to verify it fails**

Run:

```powershell
npm run test:chug-button
```

Expected: FAIL with `generated chug bottle asset should exist`.

- [ ] **Step 3: Add the normalization script**

Create `scripts/normalizeChugBottleAsset.py`:

```python
#!/usr/bin/env python3
from argparse import ArgumentParser
from pathlib import Path

from PIL import Image

CANVAS_WIDTH = 1600
CANVAS_HEIGHT = 360
HORIZONTAL_PADDING = 24
VERTICAL_PADDING = 18
ALPHA_THRESHOLD = 8


def get_trim_box(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError("No visible bottle pixels found after background removal.")
    return bounds


def normalize_bottle(source: Path, output: Path) -> None:
    bottle = Image.open(source).convert("RGBA")
    bottle = bottle.crop(get_trim_box(bottle))
    bottle.thumbnail(
        (
            CANVAS_WIDTH - (HORIZONTAL_PADDING * 2),
            CANVAS_HEIGHT - (VERTICAL_PADDING * 2),
        ),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    position = (
        (CANVAS_WIDTH - bottle.width) // 2,
        (CANVAS_HEIGHT - bottle.height) // 2,
    )
    canvas.alpha_composite(bottle, dest=position)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    normalize_bottle(args.input, args.out)
```

- [ ] **Step 4: Generate the chroma-key source image**

Use the built-in `image_gen` tool with this prompt:

```text
Use case: product-mockup
Asset type: responsive mobile app button bottle cutout
Primary request: Create one photorealistic horizontal amber 33cl beer bottle viewed perfectly from the side, matching a polished product advertisement. The rounded bottle base is on the left and the capped neck points to the right. The bottle should be wide and low, with the body occupying about the left two thirds of the total width. Leave the central bottle body visually calm and evenly amber so app-rendered text can sit over it.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal
Subject: one unbranded amber beer bottle with a realistic gold crown cap, crisp silhouette, warm restrained highlights, and sufficiently opaque dark amber glass around the exterior edge
Style/medium: photorealistic studio product cutout
Composition/framing: very wide horizontal composition, full bottle visible, side profile only, generous even padding, no perspective tilt
Lighting/mood: warm golden edge light and subtle realistic glass reflections; keep the body center uncluttered
Constraints: the background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation; keep the bottle fully separated from the background with crisp edges; do not use #00ff00 anywhere in the bottle; no cast shadow; no contact shadow; no reflection outside the bottle; no watermark; no text; no label; no logo; no brand
Avoid: black rectangle, black backdrop, dramatic hotspots behind the text area, dense bubbles, extra objects, condensation outside the silhouette
```

Copy the generated output from `$CODEX_HOME/generated_images/...` to:

```text
tmp/imagegen/chug-bottle-source.png
```

- [ ] **Step 5: Remove the chroma key and normalize the app asset**

Run:

```powershell
New-Item -ItemType Directory -Force 'tmp/imagegen' | Out-Null
python "$env:USERPROFILE/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py" --input 'tmp/imagegen/chug-bottle-source.png' --out 'tmp/imagegen/chug-bottle-keyed.png' --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
python 'scripts/normalizeChugBottleAsset.py' --input 'tmp/imagegen/chug-bottle-keyed.png' --out 'assets/chug-bottle-button.png'
```

Expected: `assets/chug-bottle-button.png` exists and has transparent corners.

- [ ] **Step 6: Inspect the generated asset**

Open `assets/chug-bottle-button.png` with the local image viewer and confirm:

- The bottle has no black or green rectangle around it.
- The full rounded base, body, shoulder, neck, and cap are visible.
- The center of the body is calm enough for overlay text.
- No text, label, logo, watermark, cast shadow, or detached reflection appears.
- Chroma-key removal did not leave an obvious green fringe.

If a thin green fringe remains, rerun the helper once with:

```powershell
python "$env:USERPROFILE/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py" --input 'tmp/imagegen/chug-bottle-source.png' --out 'tmp/imagegen/chug-bottle-keyed.png' --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill --edge-contract 1
python 'scripts/normalizeChugBottleAsset.py' --input 'tmp/imagegen/chug-bottle-keyed.png' --out 'assets/chug-bottle-button.png'
```

If chroma-key removal still leaves unacceptable glass-edge artifacts, stop and ask for approval before using the CLI `gpt-image-1.5` true-transparency fallback.

- [ ] **Step 7: Run the asset check**

Run:

```powershell
npm run test:chug-button
```

Expected: PASS with `responsive chug bottle asset checks passed`.

- [ ] **Step 8: Commit the generated asset contract**

Run:

```powershell
git add package.json scripts/chugBottleButton.test.js scripts/normalizeChugBottleAsset.py assets/chug-bottle-button.png
git commit -m "feat: add generated chug bottle asset"
```

## Task 2: Render The Asset In A Responsive SVG Wrapper

**Files:**
- Modify: `scripts/chugBottleButton.test.js`
- Modify: `src/components/ChugBottleButton.tsx`

- [ ] **Step 1: Extend the component contract test**

Append this block before the final `console.log` in `scripts/chugBottleButton.test.js`:

```js
const componentSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/components/ChugBottleButton.tsx'),
  'utf8'
);

assert.match(componentSource, /require\('\.\.\/\.\.\/assets\/chug-bottle-button\.png'\)/, 'component should use the generated bottle asset');
assert.match(componentSource, /Image as SvgImage/, 'component should render the bottle asset inside SVG');
assert.match(componentSource, /Text as SvgText/, 'component should render the editable label as SVG text');
assert.match(componentSource, /const renderedFontSize = clamp\(width \* 0\.044, 13, 18\)/, 'label size should adapt to phone width within readable bounds');
assert.match(componentSource, /const renderedLetterSpacing = clamp\(width \* 0\.004, 0\.6, 1\.5\)/, 'label spacing should tighten on narrow phones');
assert.match(componentSource, /textLength=\{TEXT_MAX_WIDTH\}/, 'label should be constrained to the text-safe bottle body width');
assert.match(componentSource, /HOW FAST CAN YOU CHUG\?  >/, 'component should preserve the chug action label');
assert.doesNotMatch(componentSource, /SvgXml|BOTTLE_SVG|<path/, 'component should no longer draw the bottle with authored SVG paths');
```

- [ ] **Step 2: Run the component contract to verify it fails**

Run:

```powershell
npm run test:chug-button
```

Expected: FAIL with `component should use the generated bottle asset`.

- [ ] **Step 3: Replace the hand-built bottle component**

Replace `src/components/ChugBottleButton.tsx` with:

```tsx
import React, { useState } from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import Svg, { Image as SvgImage, Text as SvgText } from 'react-native-svg';

import { spacing } from '../theme/layout';

const bottleImage = require('../../assets/chug-bottle-button.png');

const VIEW_WIDTH = 1600;
const VIEW_HEIGHT = 360;
const TEXT_CENTER_X = 580;
const TEXT_CENTER_Y = 185;
const TEXT_MAX_WIDTH = 820;
const LABEL = 'HOW FAST CAN YOU CHUG?  >';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface Props {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ChugBottleButton({ onPress, disabled, style }: Props) {
  const [width, setWidth] = useState(0);
  const height = width > 0 ? Math.round((width * VIEW_HEIGHT) / VIEW_WIDTH) : 0;
  const renderedFontSize = clamp(width * 0.044, 13, 18);
  const renderedLetterSpacing = clamp(width * 0.004, 0.6, 1.5);
  const viewBoxScale = width > 0 ? VIEW_WIDTH / width : 1;
  const svgFontSize = renderedFontSize * viewBoxScale;
  const svgLetterSpacing = renderedLetterSpacing * viewBoxScale;

  return (
    <TouchableOpacity
      style={[styles.wrapper, style, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.76}
      accessibilityRole="button"
      accessibilityLabel="Record a 33cl bottle chug attempt"
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
    >
      {width > 0 ? (
        <Svg width={width} height={height} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
          <SvgImage
            href={bottleImage}
            x={0}
            y={0}
            width={VIEW_WIDTH}
            height={VIEW_HEIGHT}
            preserveAspectRatio="xMidYMid meet"
          />
          <SvgText
            x={TEXT_CENTER_X + 3}
            y={TEXT_CENTER_Y + 3}
            fill="rgba(0, 0, 0, 0.8)"
            fontFamily="system-ui, -apple-system, Helvetica Neue, sans-serif"
            fontWeight="900"
            fontSize={svgFontSize}
            letterSpacing={svgLetterSpacing}
            textAnchor="middle"
            alignmentBaseline="middle"
            textLength={TEXT_MAX_WIDTH}
            lengthAdjust="spacingAndGlyphs"
          >
            {LABEL}
          </SvgText>
          <SvgText
            x={TEXT_CENTER_X}
            y={TEXT_CENTER_Y}
            fill="#FDE68A"
            fontFamily="system-ui, -apple-system, Helvetica Neue, sans-serif"
            fontWeight="900"
            fontSize={svgFontSize}
            letterSpacing={svgLetterSpacing}
            textAnchor="middle"
            alignmentBaseline="middle"
            textLength={TEXT_MAX_WIDTH}
            lengthAdjust="spacingAndGlyphs"
          >
            {LABEL}
          </SvgText>
        </Svg>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: spacing.md,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 15,
    elevation: 7,
  },
  disabled: {
    opacity: 0.68,
  },
});
```

- [ ] **Step 4: Run the focused component check**

Run:

```powershell
npm run test:chug-button
```

Expected: PASS with `responsive chug bottle asset checks passed`.

- [ ] **Step 5: Commit the responsive component**

Run:

```powershell
git add scripts/chugBottleButton.test.js src/components/ChugBottleButton.tsx
git commit -m "feat: render responsive chug bottle button"
```

## Task 3: Repair Screen-Level Regression Checks

**Files:**
- Modify: `scripts/chugRecordScreen.test.js`
- Modify: `scripts/chugEditSession.test.js`

- [ ] **Step 1: Run the existing screen checks to capture the stale failures**

Run:

```powershell
npm run test:chug-record
npm run test:chug-edit
```

Expected: both checks FAIL because they still search the screens for the pre-extraction inline bottle styles.

- [ ] **Step 2: Update the record-screen component assertions**

In `scripts/chugRecordScreen.test.js`, replace:

```js
assert.match(recordSource, /How fast can you chug\?/, 'record screen should expose the chug entry point');
assert.match(recordSource, /chugBottleButton/, 'record screen should render the chug entry point as a bottle button');
assert.match(recordSource, /chugBottleBody/, 'chug button should include a beer bottle body');
assert.match(recordSource, /chugBottleNeck/, 'chug button should include a beer bottle neck');
assert.match(recordSource, /chugBottleCap/, 'chug button should include a beer bottle cap');
assert.match(recordSource, /chugBottleLabel/, 'chug button should include a label area for the text');
```

with:

```js
assert.match(recordSource, /import \{ ChugBottleButton \} from '\.\.\/components\/ChugBottleButton';/, 'record screen should import the shared bottle button');
assert.match(recordSource, /<ChugBottleButton onPress=\{openChugFlow\} \/>/, 'record screen should render the shared bottle button');
```

Replace:

```js
const chugPanelIndex = recordSource.indexOf('styles.chugBottleButton');
```

with:

```js
const chugPanelIndex = recordSource.indexOf('<ChugBottleButton');
```

- [ ] **Step 3: Update the edit-screen component assertions**

In `scripts/chugEditSession.test.js`, replace:

```js
assert.match(editSource, /How fast can you chug\?/, 'edit screen should expose the chug entry point');
assert.match(editSource, /chugBottleButton/, 'edit screen should render the chug entry point as a bottle button');
assert.match(editSource, /chugBottleBody/, 'chug button should include a beer bottle body');
assert.match(editSource, /chugBottleNeck/, 'chug button should include a beer bottle neck');
assert.match(editSource, /chugBottleCap/, 'chug button should include a beer bottle cap');
assert.match(editSource, /chugBottleLabel/, 'chug button should include a label area for the text');
```

with:

```js
assert.match(editSource, /import \{ ChugBottleButton \} from '\.\.\/components\/ChugBottleButton';/, 'edit screen should import the shared bottle button');
assert.match(editSource, /<ChugBottleButton onPress=\{openChugFlow\} disabled=\{saving\} style=\{styles\.chugBottleMargin\} \/>/, 'edit screen should render the shared bottle button');
```

Replace:

```js
const chugPanelIndex = editSource.indexOf('styles.chugBottleButton');
```

with:

```js
const chugPanelIndex = editSource.indexOf('<ChugBottleButton');
```

- [ ] **Step 4: Run the screen checks**

Run:

```powershell
npm run test:chug-record
npm run test:chug-edit
```

Expected:

```text
chug record screen checks passed
chug edit session checks passed
```

- [ ] **Step 5: Commit the repaired checks**

Run:

```powershell
git add scripts/chugRecordScreen.test.js scripts/chugEditSession.test.js
git commit -m "test: update shared chug bottle checks"
```

## Task 4: Verify The Complete Button Change

**Files:**
- Verify only.

- [ ] **Step 1: Run focused chug checks**

Run:

```powershell
npm run test:chug-button
npm run test:chug-record
npm run test:chug-edit
```

Expected: all three commands PASS.

- [ ] **Step 2: Run the adjacent theme check**

Run:

```powershell
npm run test:app-theme-screens
```

Expected: PASS.

- [ ] **Step 3: Build the web app**

Run:

```powershell
npm run build:web
```

Expected: Expo web export succeeds.

- [ ] **Step 4: Inspect narrow and wider phone layouts**

Serve the built web output, open the active-session Drinks surface, and inspect the bottle button at:

```text
390x844
430x932
```

Confirm:

- No black or green rectangle appears around the bottle.
- The bottle remains proportional at both widths.
- `HOW FAST CAN YOU CHUG? >` remains on one line.
- The label stays inside the wide bottle body and does not overlap the shoulder or neck.
- The button still opens the chug flow.

- [ ] **Step 5: Inspect the working tree**

Run:

```powershell
git status --short
```

Expected: only pre-existing unrelated changes remain:

```text
 M .claude/settings.local.json
 M skills-lock.json
```

## Spec Coverage Checklist

- Photorealistic horizontal amber bottle: Task 1 generation prompt and visual inspection.
- No black rectangle: Task 1 chroma-key removal, alpha checks, and inspection.
- Transparent project asset: Task 1 normalization into `assets/chug-bottle-button.png`.
- Responsive SVG wrapper: Task 2 `Svg` and `SvgImage`.
- Editable app-rendered label: Task 2 `SvgText` overlays and bitmap contract.
- Narrow-phone text fit: Task 2 clamped font size, clamped letter spacing, constrained `textLength`; Task 4 viewport inspection.
- Existing accessibility and interaction: Task 2 preserves `TouchableOpacity`, disabled state, and accessibility label.
- Stale extracted-component tests: Task 3 repairs the existing screen contracts.
