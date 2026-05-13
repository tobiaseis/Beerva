# Modern Feed Redesign Design

## Summary

Beerva will receive a focused visual refresh on the feed cards so the app feels less chunky and more modern while preserving the current feature set. The redesign keeps the deep dark-mode palette, the current Beerva logo identity, the smaller Instagram-style social actions, the People page redesign, the profile stats widgets, the Pub Legends ranking layout, and the existing "More stats" expansion behavior.

The main change is to make the feed post metadata feel integrated instead of boxed in. Pub/location and beverage information remain in the same post area and keep the same content, but the heavy dark pill-block treatment is replaced with lighter metadata rows, softer dividers, and smaller icon anchors.

## Requirements

- Work on the `redesign-modern-feed` branch only.
- Keep all feed functionality intact: published sessions, pub crawls, images, comments, cheers, modals, maps links, edit/delete actions, double-tap cheers, hangover badges, and stats expansion.
- Keep the current Beerva logo asset as the drink and cheers brand mark. Do not use Gemini's proposed replacement logo.
- Keep the deep dark palette direction already in the app: dark slate backgrounds, amber brand accent, muted borders.
- Keep the compact Cheers and Comment action buttons. Do not revert to large bordered pill actions.
- Keep the People/Search page exactly as it currently exists.
- Keep Profile stats and Pub Legends widget-based layouts exactly as they currently exist.
- Keep the "More stats" button small and preserve the current collapsible logic.
- Apply the same feed-card polish to regular session posts and pub crawl posts so they feel like one product.

## Visual Direction

The direction is a light, integrated feed refresh rather than a full app redesign.

Feed cards keep their current structure:

1. User header.
2. Optional caption.
3. Media.
4. Pub/location and beverage summary.
5. Small "More stats" control.
6. Optional expanded stats.
7. Engagement preview.
8. Compact social actions.

The pub/location and beverage summary should no longer read as a heavy inset module. Instead, it should behave like post metadata:

- Use transparent or near-transparent rows on the card background.
- Use a small `MapPin` anchor for the pub row.
- Use the existing Beerva logo mark for the beverage row.
- Keep typography clear, with the pub name slightly stronger than the drink line.
- Use spacing and subtle separators rather than large filled blocks.
- Preserve tap behavior for opening maps from the pub row.

Card polish should reduce visual bulk:

- Slightly quieter card surfaces and borders.
- Less boxed-in interior treatment around metadata.
- Media remains the visual anchor.
- Engagement preview remains readable but secondary.
- Action buttons stay compact and social, with active cheers using the amber accent.

## Components And Modules

- `src/screens/FeedScreen.tsx`
  - Update `FeedSessionCard` styling for card surface, session summary rows, metadata icons, expanded stats panel, engagement preview, and social action buttons.
  - Preserve all existing handlers, state, accessibility labels, data loading, and optimistic cheers behavior.

- `src/components/PubCrawlFeedCard.tsx`
  - Mirror the same card and metadata styling so pub crawl cards match regular feed session cards.
  - Preserve pub crawl media carousel, route summary, stop breakdown, cheers, comments, and stats expansion.

- `src/theme/colors.ts` and `src/theme/layout.ts`
  - Only adjust shared tokens if a small token refinement is needed for the feed polish.
  - Avoid broad palette changes that would unintentionally alter People, Profile, or Pub Legends.

## Preserved Screens

These surfaces are out of scope except for unavoidable shared-token compatibility:

- `src/screens/PeopleScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/components/ProfileStatsPanel.tsx`
- `src/screens/PubLegendsScreen.tsx`
- `src/screens/PubLegendDetailScreen.tsx`

If a shared token change would visibly alter these screens, prefer a local feed style instead.

## Error Handling

No data or network behavior changes are planned. Existing error handling remains in place for feed loading, refreshing, image loading, comments, cheers, delete confirmation, and maps opening.

## Testing

Verification should focus on unchanged behavior and layout safety:

- Run the existing feed-related tests if available.
- Run the profile stats and Pub Legends tests if shared tokens are changed.
- Run the web build.
- Manually inspect the feed with:
  - a regular post with an image,
  - a regular post without comments,
  - expanded and collapsed "More stats",
  - an active and inactive cheers state,
  - a pub crawl post,
  - a narrow mobile viewport.

## Non-Goals

- No replacement of the Beerva logo.
- No rewrite of navigation, feed loading, comments, cheers, profile stats, People search, or Pub Legends data behavior.
- No new features.
- No major theme overhaul.
- No changes to the current People page redesign.
- No changes to profile or leaderboard widget layouts.
