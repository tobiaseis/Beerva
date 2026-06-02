# Chug Bottle Button Polish Design

## Summary

Polish the responsive generated chug bottle button without changing its bottle asset or layout. Remove the wrapper-level glow that makes the transparent canvas read as a visible rectangle, and remove the trailing chevron from the editable overlay label.

## Changes

- Keep `assets/chug-bottle-button.png` unchanged.
- Remove wrapper `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius`, and Android `elevation` from `src/components/ChugBottleButton.tsx`.
- Keep the subtle dark SVG text shadow because it improves readability against the amber bottle body without producing an exterior box.
- Change the overlay label from `HOW FAST CAN YOU CHUG?  >` to `HOW FAST CAN YOU CHUG?`.
- Preserve responsive SVG sizing, clamped text sizing, press behavior, disabled opacity, and accessibility label.

## Testing

- Extend the focused chug bottle contract test to reject wrapper shadows and elevation.
- Assert that the label no longer contains a trailing chevron.
- Run the focused bottle, consuming-screen, TypeScript, and web-build checks.
- Inspect the rendered button at a narrow phone width.

## Non-Goals

- Regenerating or editing the bottle PNG.
- Changing button dimensions or placement.
- Removing the internal text shadow.
