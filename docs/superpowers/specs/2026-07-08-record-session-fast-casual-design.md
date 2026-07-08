# Record Session Fast Casual Redesign

## Goal

Make the active Record screen easier to use in a pub setting by reducing choices, improving action hierarchy, and making the common path fast enough to log a drink in a few seconds.

The primary user goal is fast casual logging, not perfect manual precision on every entry.

## Current Problem

The active session drink form shows every volume option at once:

- `2cl`
- `4cl`
- `25cl`
- `27.5cl`
- `33cl`
- `40cl`
- `44cl`
- `50cl`
- `Pint`
- `1L`

This creates too much decision work before the user can add a drink. The app already has catalog defaults and locked counted volumes for mixed drinks, so the UI should trust those defaults and expose manual size changes only when needed.

The screen also gives `Add Booze` and `End Session` similar visual weight in some states, which can make the destructive/final action feel too close to the main logging action.

## Design Direction

Use a smart-default, progressive-disclosure flow:

1. User chooses or types the drink.
2. The app selects a default serving size.
3. The form shows the selected size as a compact summary.
4. User taps the primary add button.
5. Advanced size selection stays behind `Change size`.

This keeps the common path short while preserving access to all existing volume values.

## Add-Drink Form

The active session form should become:

- Drink search/input: `What are you drinking?`
- Compact selected-size summary, for example `Pint selected` or `33cl selected`
- A `Change size` affordance next to or below that summary
- Quantity controls
- Primary submit button labeled `Add Drink`

The UI should not show the full volume grid by default.

For catalog drinks with a default volume, use that default. For catalog drinks with locked counted volume, such as mixed drinks and shots, keep the size locked and avoid asking the user to choose.

For unknown beers or drinks without a default, keep the current fallback volume: `Pint`.

## Change Size Sheet

Tapping `Change size` opens a compact chooser.

The chooser should separate common choices from edge cases:

- Common: `33cl`, `50cl`, `Pint`
- More sizes: `2cl`, `4cl`, `25cl`, `27.5cl`, `40cl`, `44cl`, `1L`

The selected size should be visually obvious. Inactive options should have enough contrast for low-brightness use in dark environments.

## Repeat-Friendly Logged Drinks

The existing drink rows should keep the one-tap increment action, but the layout should make it clear that `+` means "same again."

The row should still show:

- Drink name
- Size/quantity summary
- Add-one-more action
- Remove action

This supports the common session pattern: select the first drink once, then tap `+` for repeats.

## Action Hierarchy

`Add Drink` is the main positive action and should use the primary yellow button.

`End Session` should not use the same primary styling. It should use the existing danger treatment so it reads as a finalizing action, not the next normal logging step.

`Cancel` remains a quiet secondary/destructive action with confirmation.

For pub crawls, existing end-crawl danger treatment should remain visually distinct from normal add-drink behavior.

## Visual And Copy Updates

Rename `Add Booze` to `Add Drink` for clarity.

Keep the dark Beerva theme, but improve contrast for inactive selectable controls in the size chooser.

The drink search should read clearly as an input/search field rather than competing visually with action buttons.

Do not add camera or computer-vision volume detection in this version. It is out of scope for the first usability fix.

## Components And Data Flow

Primary files likely involved during implementation:

- `src/components/BeerDraftForm.tsx`
- `src/lib/sessionBeers.ts`
- `src/screens/RecordScreen.tsx`
- `src/components/AppButton.tsx` only if a reusable danger/outline variant needs adjustment

The data model should not change. Existing `session_beers.volume`, `quantity`, `abv`, and catalog default-volume behavior are sufficient.

The implementation should preserve:

- Existing catalog default volumes
- Existing locked counted volumes for mixed drinks
- Existing auto-add behavior for catalog items that intentionally bypass manual controls
- Existing session beer insert/update behavior
- Existing legacy session field sync

## Acceptance Criteria

- The full volume grid is not visible in the default add-drink form.
- A selected size is visible before submission.
- `Change size` exposes all current volume options.
- Common sizes are easier to find than uncommon sizes.
- Locked/counting-specific mixed drinks still avoid unnecessary size choice.
- `Add Drink` is visually primary.
- `End Session` is visually distinct from `Add Drink`.
- Existing one-tap repeat and remove actions still work for logged drinks.
- No database migration is required.

## Test Plan

Add or update focused tests for:

- Default draft volume is shown without rendering all volume buttons.
- `Change size` exposes the complete set of volumes.
- Selecting a size updates the draft submitted to `beerDraftToPayload`.
- Locked counted-volume drinks do not expose irrelevant manual size changes.
- `Add Drink` label replaces `Add Booze` in the Record screen.
- `End Session` uses non-primary/danger styling.

Run the existing record/session drink tests after implementation:

- `npm run test:session-beers`
- `npm run test:record-session-drinks`

