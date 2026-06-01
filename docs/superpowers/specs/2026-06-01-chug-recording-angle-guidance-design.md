# Chug Recording Angle Guidance Design

## Goal

Add a short, always-visible pre-recording prompt to the chug setup modal so users frame the drinker and bottle in a way that improves local MediaPipe timing reliability.

## Scope

This is a small UI-only extension to the existing chug recording setup. It does not add a new step, alter camera behavior, require flash, or change database behavior.

## Placement

Add a compact guidance panel directly below the `How fast can you chug?` modal header and above the beer-selection controls.

The guidance remains visible whenever the chug setup modal is open, including before the user chooses a beer or mutual-follower verifier. This makes the instruction hard to miss without adding another tap before recording.

## Visual

Use the supplied asset:

```text
assets/person_drinking_beer.png
```

Render it as a restrained rectangular preview inside the guidance panel. Preserve its aspect ratio with `resizeMode="cover"` and cap the visible height so the modal still leaves room for beer and verifier selection on smaller screens.

## Copy

Show:

```text
Best recording angle
Keep the face and bottle visible. Film from a slight side angle in good lighting.
```

## Component Change

Modify only:

```text
src/components/ChugAttemptModal.tsx
```

Add a static asset import through React Native's `require` pattern and render the guidance panel as the first item inside the existing modal `ScrollView`.

## Testing

Extend `scripts/chugRecordScreen.test.js` to verify:

- The chug modal references `person_drinking_beer.png`.
- The modal renders `Best recording angle`.
- The modal renders the approved framing prompt.

Run the focused chug record check and the web export after implementation.

