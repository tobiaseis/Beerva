# App-Wide Feed Theme Design

## Summary

Beerva should use the modern feed color theme across the whole app so every page feels consistent, premium, and part of the same product. The feed page is the visual authority: deep dark background, quiet translucent slate cards, soft low-contrast borders, compact amber accents, and restrained inset stat surfaces.

This is a presentation-layer theme pass. It should not change navigation structure, data loading, forms, auth behavior, feed behavior, stats calculations, comments, cheers, pub crawls, trophies, notifications, or profile logic.

## Requirements

- Treat the current feed page as the ruling color direction.
- Apply the feed theme to all pages, including:
  - Auth/sign-in
  - Feed-adjacent modals and image viewer surfaces
  - Record
  - People
  - Profile
  - User Profile
  - Pub Legends
  - Pub Legend Detail
  - Notifications
  - Edit Session
  - Hangover Rating
  - Profile Setup
  - Shared forms, buttons, inputs, cards, panels, skeletons, and modal surfaces
- Keep existing layouts and behavior intact unless a tiny spacing/color adjustment is necessary to make the theme read correctly.
- Keep the Beerva logo and amber accent identity unchanged.
- Keep the floating bottom nav design unchanged except for any shared-token compatibility needed to keep it aligned with the feed theme.
- Preserve accessibility contrast for text, disabled states, inputs, and action buttons.

## Visual Direction

The app should move away from heavier blue boxed surfaces and toward the feed's integrated dark-slate language.

Primary app surfaces should use the feed card color:

```ts
rgba(15, 23, 42, 0.82)
```

Secondary or inset surfaces should use the feed stat color:

```ts
rgba(15, 23, 42, 0.56)
```

Borders should become quieter and closer to the feed card border/divider values:

```ts
rgba(148, 163, 184, 0.12)
rgba(148, 163, 184, 0.10)
```

Amber should remain the only strong accent:

- primary buttons
- selected states
- active chips
- important icons
- current-user/active/trophy highlights
- subtle accent backgrounds using the existing amber alpha style

Text should keep the existing hierarchy:

- `colors.text` for main labels and values
- `colors.textMuted` for supporting copy
- `colors.textSubtle` for quiet metadata

## Architecture

Use a controlled shared-token approach rather than manual one-off colors on every page.

Add or update app-wide surface tokens so screens can share the same feed-derived palette:

- app/card surface
- app/inset surface
- app/raised/floating surface
- app/soft border
- app/divider
- app/accent soft

Then update existing screens and shared components to consume these tokens through the existing `colors`, `Surface`, and local `StyleSheet` patterns.

This keeps the change broad enough for consistency but controlled enough to avoid accidental visual regressions.

## Components And Screens

### Shared Components

- `src/theme/colors.ts`
  - Align shared surface colors with the feed theme.
  - Keep semantic names stable so existing imports continue to work.
- `src/components/Surface.tsx`
  - Make default surfaces match the feed card surface and softer border.
  - Make raised surfaces closer to the floating nav/feed direction, not the old chunky blue.
- `src/components/AppButton.tsx`
  - Keep primary amber buttons.
  - Make secondary/disabled buttons use the softer feed surfaces.
- `src/components/BeerDraftForm.tsx`
  - Update segmented controls, steppers, and inputs to the feed-style surface/border palette.
- `src/components/AutocompleteInput.tsx`
  - Update input and dropdown surfaces to match the feed theme.
- `src/components/ProfileStatsPanel.tsx`
  - Keep its existing widget layout but soften card, inset, trophy, and detail modal surfaces.
- Shared modal/utility components
  - Update modal backgrounds, prompt surfaces, skeletons, and install prompt panels to the same palette where applicable.

### Screens

- `AuthScreen`
  - Bring the form surface and inputs into the same card/inset palette.
- `RecordScreen`
  - Apply feed-themed surfaces to forms, active session panels, pub search, roulette, upload/photo, draft cards, and action panels.
- `PeopleScreen`
  - Keep the current redesign layout but update list cards/search surfaces to the feed palette.
- `ProfileScreen` and `UserProfileScreen`
  - Keep the profile and stats layouts but soften panels, session cards, follow stats, and trophy surfaces.
- `PubLegendsScreen` and `PubLegendDetailScreen`
  - Keep ranking layout and detail layout while using feed-style cards/insets.
- `NotificationsScreen`
  - Update notification cards, unread states, invite controls, and filter/action surfaces.
- `EditSessionScreen`
  - Update form sections, locked pub panels, inputs, image controls, and drink draft rows.
- `HangoverRatingScreen`
  - Update hero/summary cards, score selector, and action surfaces.
- `ProfileSetupScreen`
  - Update setup card, avatar controls, notification prompt, and inputs.

## Testing

Add focused source-level guard tests rather than screenshot tests for this pass.

Suggested checks:

- Shared theme exposes/feed-aligns app-wide surface tokens.
- `Surface` default and raised variants use feed-derived surfaces and soft borders.
- Major non-feed screens no longer use the old heavy `colors.card`/`colors.surfaceRaised` treatment for primary cards after token alignment, or use the aligned token values if semantic names are preserved.
- Existing feature tests continue to pass:
  - feed redesign
  - floating nav
  - session beer formatting
  - profile stats/profile panel
  - pub legends
  - pub crawl
  - notifications if touched
  - record/pub directory/place category if touched
- Run `npm run build:web`.

Manual inspection should cover:

- Feed, to ensure the ruling theme is unchanged.
- Record, because it has the densest form UI.
- People, Profile, Pub Legends, and Notifications in a mobile-sized viewport.
- Auth/Profile Setup if logged-out or setup states are available.

## Non-Goals

- No new app features.
- No layout redesign beyond necessary theme polish.
- No logo changes.
- No new typography system.
- No changes to database, Supabase queries, RPCs, notifications behavior, profile stats, pub crawl logic, cheers, comments, or feed ordering.
- No reintroduction of the breakout add-post button in the floating bottom nav.

