# Responsive Chug Bottle Button Design

## Summary

Replace the hand-built SVG bottle in `src/components/ChugBottleButton.tsx` with a photorealistic AI-generated horizontal amber bottle asset. The bottle should resemble a polished product image: warm amber glass, subtle golden edge lighting, a gold cap, and a clean bottle body that can carry the existing chug action label.

The generated image must not include text or a rectangular background. The app will render the label separately so it remains sharp, editable, accessible, and responsive across phone widths.

## Visual Direction

- Use a horizontal amber beer bottle viewed from the side.
- Keep the full bottle visible, including the rounded base, shoulder, neck, and capped end.
- Use warm amber and gold tones with realistic glass highlights.
- Keep the outside of the bottle transparent so no black rectangle appears around it.
- Leave the center of the bottle body visually calm enough for readable overlay text.
- Do not include a brand, logo, watermark, label, or baked-in text.
- Avoid strong reflections, dense bubbles, or dark patches behind the text area.

## Asset Strategy

Generate the photorealistic bottle as a raster image because realistic glass and lighting do not translate cleanly into true vector paths. Save the final bottle as a transparent PNG under the app assets directory.

Use the transparent PNG inside a responsive SVG wrapper rendered by `react-native-svg`. The wrapper scales the bottle proportionally to the available width while preserving its horizontal aspect ratio. This keeps the product-image appearance and gives the component predictable sizing on different phone widths.

## Component Behavior

Update `src/components/ChugBottleButton.tsx` to:

- Remove the current programmatically drawn bottle paths and baked-in SVG text.
- Render the generated PNG through a responsive SVG image element.
- Render `HOW FAST CAN YOU CHUG? >` as a separate SVG text overlay centered within the wide body portion of the bottle.
- Preserve the existing press behavior, disabled state, spacing, accessibility role, and accessibility label.
- Scale the rendered height from the measured component width using the generated asset aspect ratio.
- Keep the button image proportional instead of stretching it independently on either axis.

## Responsive Text

The label must fit on narrow phones as well as wider phones:

- Place text inside the wide body portion, not across the shoulder or neck.
- Compute a text size from the measured component width.
- Clamp the text size between a narrow-phone minimum and a wider-phone maximum.
- Reduce letter spacing slightly on narrow phones.
- Keep a fixed horizontal safety margin inside the bottle body.
- Use a warm cream or gold text color with a subtle dark shadow for contrast.

The label remains one line. If the available width becomes unusually small, the component reduces font size within the clamp rather than clipping or wrapping.

## Asset Generation Workflow

1. Generate a photorealistic horizontal amber bottle on a flat chroma-key background.
2. Remove the chroma-key background locally to produce a transparent PNG.
3. Validate transparent corners, clean bottle edges, and the absence of a dark rectangular backdrop.
4. Inspect the text-safe area in the center of the bottle body.
5. Copy the selected PNG into the project assets directory and reference it from `ChugBottleButton`.

If chroma-key removal leaves unacceptable edge artifacts around the glass bottle, use the true-transparency image-generation fallback only after explicit approval.

## Testing

- Add a source-level regression check that the chug button uses the generated bottle asset.
- Assert that the button no longer bakes the label into the generated bitmap.
- Assert that text size is calculated responsively and clamped.
- Run the focused chug record-screen check.
- Run the web build.
- Inspect the rendered button at a narrow phone width and a wider phone width.

## Non-Goals

- Reworking the chug recording flow.
- Changing button placement in the Drinks surface.
- Adding animation.
- Generating multiple branded bottle variants.
- Converting the photorealistic bottle into vector paths.
