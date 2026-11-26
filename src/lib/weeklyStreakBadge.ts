// The small badge on avatars for long weekly streaks. The flame stays the
// "nights in a row" signal; this badge only appears once a weekly streak is
// long enough to be worth showing off. Kept free of imports so the avatar and
// the Node tests can both load it.

export type WeeklyAvatarBadgeTier = 'bronze' | 'silver' | 'gold';

export const WEEKLY_AVATAR_BADGE_MIN_WEEKS = 4;
const SILVER_MIN_WEEKS = 12;
const GOLD_MIN_WEEKS = 26;

export const WEEKLY_AVATAR_BADGE_COLORS: Record<WeeklyAvatarBadgeTier, { fill: string; text: string }> = {
  bronze: { fill: '#C98A4B', text: '#1A1206' },
  silver: { fill: '#C9D3E0', text: '#0E1420' },
  gold: { fill: '#F7B53A', text: '#1A1206' },
};

export const getWeeklyAvatarBadgeTier = (weeks: number): WeeklyAvatarBadgeTier | null => {
  if (!Number.isFinite(weeks) || weeks < WEEKLY_AVATAR_BADGE_MIN_WEEKS) return null;
  if (weeks >= GOLD_MIN_WEEKS) return 'gold';
  if (weeks >= SILVER_MIN_WEEKS) return 'silver';
  return 'bronze';
};

export const formatWeeklyAvatarBadge = (weeks: number) => `${weeks}w`;
