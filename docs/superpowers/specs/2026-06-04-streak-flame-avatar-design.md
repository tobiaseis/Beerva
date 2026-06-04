# Streak Flame Avatar — Design

**Date:** 2026-06-04
**Status:** Approved (pending implementation plan)

## Summary

Show an animated flame around a user's avatar wherever their primary avatar
appears, while they are on a **current drinking streak** (a drink logged on
consecutive drinking days). The flame's intensity scales with the streak length
through four visual tiers. On profile pages only, a small label next to the
avatar shows the current streak count (e.g. `🔥 5`).

This is a purely visual/cosmetic feature: no notifications, no new trophies, no
schema beyond what is needed to read the current streak.

## Streak definition

The app already models a **drinking day** as a 6am-to-6am window in
`Europe/Copenhagen` time (see `DAY_ROLLOVER_HOURS` / `localDateKey` in
`src/lib/profileStats.ts` and the matching SQL in `get_profile_stats`). A late
night out (e.g. 11pm–2am) buckets into a single drinking day.

The **current streak** is defined as:

- The number of **consecutive drinking days** ending at the user's **most
  recent** drinking day.
- Only **active** if that most recent drinking day is **today or yesterday**
  (Copenhagen drinking-day). If the most recent drinking day is older than
  yesterday, the current streak is **0** (flame off).
- Only `published` sessions count (matching how existing stats filter).

This differs from the existing `longestDayStreak` stat, which is the all-time
longest run regardless of whether it is still alive. The new value is the
*currently alive* run.

Examples (assume "today" = drinking-day D):
- Sessions on D and D-1 → streak = 2 (active).
- Sessions on D-1 and D-2 (none on D) → streak = 2 (active, grace day).
- Sessions on D-2 and D-3 (none on D or D-1) → streak = 0 (decayed).
- Single session on D → streak = 1 (active but below display threshold).
- Sessions on D, D-1, D-2, gap, D-4 → streak = 3 (only the run ending at D).

## Display threshold

The flame appears only when the current streak is **≥ 2**. A streak of 0 or 1
renders the plain avatar exactly as today (true no-op — no extra layout, no
flame).

## Data layer (compute on read)

Chosen approach: compute the streak on read by reusing the existing drinking-day
bucketing logic. No denormalized columns, no triggers — the streak decays
naturally when no qualifying session exists today/yesterday, and reads are
always correct.

Delivered as a new timestamped migration in `supabase/migrations/`, following
the existing `do $$ ... end $$;` + `notify pgrst, 'reload schema';` conventions.

### New SQL helper

`public.get_current_streaks(user_ids uuid[])` returning
`(user_id uuid, current_streak integer)`:

- Buckets each listed user's `published` sessions into drinking days using the
  same 6am–6am Copenhagen logic as `get_profile_stats`.
- Computes the length of the consecutive-day run ending at each user's latest
  drinking day.
- Returns that length only if the latest drinking day is today or yesterday;
  otherwise returns 0.
- `security definer`, `set search_path = public`, executable by `authenticated`,
  revoked from `public`/`anon` — consistent with existing RPCs.

### Two call sites (zero extra round-trips)

- **`get_session_feed_details(session_ids)`** — add an
  `author_current_streak integer` column to each returned row, computed for that
  post's author. Covers the **feed** and **post detail** (both already call this
  RPC).
- **`get_profile_stats(user_id)`** — add a `current_streak integer` to the
  result. Covers the **own profile** and **other users' profiles**.

Both reuse the `get_current_streaks` logic so the definition lives in one place.

## Client plumbing

- `src/lib/sessionFeedDetails.ts`: `SessionFeedDetail` gains
  `authorCurrentStreak: number`, mapped from the new column in
  `mapSessionFeedDetailRow`. The feed threads this onto each post item so the
  card can pass it to the avatar.
- `src/lib/profileStatsApi.ts`: expose `currentStreak` from the
  `get_profile_stats` result; both profile screens read it.
- New pure helper `streakToFlameTier(streak)` in a small lib module
  (e.g. `src/lib/streakFlame.ts`), unit-tested in the existing
  `scripts/*.test.js` style alongside `profileStats`.

## Flame UI

### `StreakAvatar` component

New shared component `src/components/StreakAvatar.tsx`:

- Props: `uri`, `fallbackUri`, `size`, `recyclingKey`, `accessibilityLabel`,
  `streak`, and `showCount?: boolean`.
- Renders the existing `CachedImage` (preserving caching/recycling behavior)
  centered inside a flame layer.
- `streak < 2`: renders the plain avatar only — no flame, no extra layout.
- `streak >= 2`: renders an animated SVG flame ring (via `react-native-svg`)
  around the circular avatar, driven by the React Native `Animated` API. The
  flame tongues oscillate in scale + opacity on a loop, slightly randomized so
  it never looks mechanical.
- Honors reduced-motion (`AccessibilityInfo.isReduceMotionEnabled` /
  `prefers-reduced-motion`) → renders a static flame with no animation.

No new dependencies: `react-native-svg` and `Animated` are already available and
work identically on web/PWA and native.

### Flame tiers

Intensity scales with streak length. Mapping centralized in
`streakToFlameTier()` so the look is consistent everywhere and tunable in one
place.

| Tier | Streak | Look |
|------|--------|------|
| 1 | 2–3 | Small amber/orange flame, gentle slow flicker |
| 2 | 4–6 | Taller, red-ish flame, livelier flicker |
| 3 | 7–13 | Roaring blue-hot base, slow flicker |
| 4 | 14+ | Fully blue flame, fast flicker |

Progression: orange → red → blue-hot base → full blue. Flicker speed:
gentle → lively → slow → fast.

### Streak-count text

- Only rendered when `showCount` is true, which is passed on **profile pages
  only** (own + other).
- Small label next to the avatar: `🔥 5` plus `5 day streak` (singular `1 day`
  guarded for safety, though a count of 1 never displays since the minimum is
  2).
- Styled with existing `typography` / `colors` theme tokens.
- Feed and post-detail show the flame with **no** number, keeping cards clean.

## Surface integration

Swap the raw `CachedImage` for `StreakAvatar` at exactly four call sites:

| Surface | Location | Streak source | `showCount` |
|---------|----------|---------------|-------------|
| Feed post card | `src/screens/FeedScreen.tsx` (~L432) | `authorCurrentStreak` | no |
| Post detail | `src/screens/PostDetailScreen.tsx` | `authorCurrentStreak` | no |
| Own profile | `src/screens/ProfileScreen.tsx` | `currentStreak` | yes |
| Other profile | `src/screens/UserProfileScreen.tsx` | `currentStreak` | yes |

Intentionally **left untouched**: cheer-avatar stacks, comment avatars, and
people-list avatars. Only the primary author/profile avatar gets the flame.

## Testing

- Unit tests (existing `scripts/*.test.js` style) for the streak boundary logic:
  consecutive run length, gap breaks the streak, active-window today/yesterday
  vs. decayed, and the `< 2` hidden threshold.
- Unit tests for `streakToFlameTier` covering each tier boundary
  (1/2/3/4/6/7/13/14).
- Flame rendering and animation verified manually in the running PWA across the
  four surfaces, including the reduced-motion static fallback.

## Out of scope (YAGNI)

- Notifications, push, or feed events for streaks.
- New trophies/achievements for current streaks.
- Streaks on cheer/comment/people-list avatars.
- Denormalized streak columns or triggers.
