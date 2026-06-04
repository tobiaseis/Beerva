// Pure mapping from a current drinking streak to its flame tier and visual config.
// Tier 0 means "no flame" (streak below the display threshold of 2).

export type FlameTier = 0 | 1 | 2 | 3 | 4;

export type FlameTierConfig = {
  tier: Exclude<FlameTier, 0>;
  // Gradient stops from hot center outward.
  colors: { core: string; mid: string; outer: string };
  // Full flicker cycle in ms (lower = faster).
  flickerDurationMs: number;
  // Flame height multiplier relative to the avatar radius.
  scale: number;
};

export const FLAME_DISPLAY_THRESHOLD = 2;

export const streakToFlameTier = (streak: number): FlameTier => {
  if (streak >= 14) return 4;
  if (streak >= 7) return 3;
  if (streak >= 4) return 2;
  if (streak >= FLAME_DISPLAY_THRESHOLD) return 1;
  return 0;
};

export const FLAME_TIERS: Record<Exclude<FlameTier, 0>, FlameTierConfig> = {
  // 2-3 days: small amber/orange, gentle slow flicker.
  1: {
    tier: 1,
    colors: { core: '#FFE08A', mid: '#FFA53C', outer: '#FF6A00' },
    flickerDurationMs: 1600,
    scale: 1.0,
  },
  // 4-6 days: taller, red-ish, livelier flicker.
  2: {
    tier: 2,
    colors: { core: '#FFB37A', mid: '#FF5A2C', outer: '#E11900' },
    flickerDurationMs: 1100,
    scale: 1.12,
  },
  // 7-13 days: roaring blue-hot base, slow flicker.
  3: {
    tier: 3,
    colors: { core: '#FFFFFF', mid: '#6EC6FF', outer: '#1E64FF' },
    flickerDurationMs: 1700,
    scale: 1.22,
  },
  // 14+ days: fully blue flame, fast flicker.
  4: {
    tier: 4,
    colors: { core: '#CFE8FF', mid: '#3D8BFF', outer: '#0A2FFF' },
    flickerDurationMs: 650,
    scale: 1.32,
  },
};

export const getFlameTierConfig = (streak: number): FlameTierConfig | null => {
  const tier = streakToFlameTier(streak);
  return tier === 0 ? null : FLAME_TIERS[tier];
};
