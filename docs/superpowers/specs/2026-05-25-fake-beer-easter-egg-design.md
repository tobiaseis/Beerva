# Fake Beer Easter Egg Design

## Goal

Add a hidden fake beer drinking experience without crowding the main app. The feature should feel like a playful easter egg: long-press the Beerva logo on the Feed screen, watch the feed fill with beer from the bottom up, then tilt the phone to "drink" the fullscreen beer. When the beer is empty, it refills automatically.

## Entry Point

The easter egg is triggered from the Feed header by pressing and holding the Beerva logo/title area for at least 2000ms. The normal feed UI keeps its current layout; no visible buttons, tabs, labels, or hints are added to advertise the feature.

On successful long press, the Feed screen starts a local transition overlay before navigation. The overlay fills upward with amber beer, bubbles, highlights, and foam while the feed content fades behind it. After the fill reaches the top, navigation moves to the dedicated fake beer screen with the standard stack transition minimized so the handoff feels continuous.

## Screen Experience

The fake beer screen is fullscreen and visually reads as a cold glass of beer:

- Amber liquid fills the full viewport.
- A foam layer sits along the top of the liquid.
- Bubbles rise continuously at different speeds and sizes.
- Subtle glass highlights and cold condensation keep the screen from feeling flat.
- A small close button returns to the previous screen.

The screen avoids extra panels or explanatory UI. A brief, subtle "Tilt to drink" hint may appear when the screen opens and then fade away.

## Motion And Drinking

Native iOS and Android builds use real device tilt through `expo-sensors`. The beer surface tilts with the phone, and the beer drains only when the device is held at a drinking angle. The drain rate increases as the tilt becomes more deliberate.

The beer level moves from full to empty. When it reaches empty, the screen automatically refills from the bottom up with the same bubbly/foamy visual language used by the entry transition.

On web or any platform where motion sensors are unavailable, the screen still opens and renders. It uses a lightweight fallback interaction or idle animation so the page does not appear broken, while native devices remain the primary target.

## Architecture

Add a root stack route named `FakeBeer` and a new `FakeBeerScreen` under `src/screens`.

Keep the reusable visual and motion pieces outside `FeedScreen`:

- `FakeBeerScreen` owns the fullscreen route, close action, refill loop, and sensor subscription.
- A reusable beer visual component renders liquid, foam, bubbles, and glass highlights based on fill level and tilt.
- A small Feed-owned transition overlay handles the unlock animation and calls navigation after the fill completes.

This keeps the already-large Feed screen from absorbing the sensor and beer simulation logic.

## Dependencies

Add `expo-sensors` for real phone tilt. Use React Native `Animated` and existing project styling patterns for visuals and transitions. Do not introduce a game engine or heavy animation framework for this feature.

## Testing And Verification

Add focused source-level tests matching the project's current script style:

- The root navigator registers the hidden `FakeBeer` route.
- The Feed header logo/title uses a 2000ms long-press trigger and navigates to `FakeBeer` only after running the fill overlay.
- The fake beer screen imports and uses `expo-sensors`.
- The fake beer screen includes refill behavior when the fill reaches empty.

Run TypeScript verification and the relevant app/theme/source tests. If sensor behavior cannot be fully automated in this project setup, verify the static integration and keep the runtime sensor logic isolated enough to test manually in Expo Go on a phone.

## Out Of Scope

The easter egg does not log drinks, update stats, award trophies, affect the database, or appear in navigation UI.
