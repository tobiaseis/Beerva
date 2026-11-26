import { supabase } from './supabase';

export type WeeklyStreak = {
  weeklyStreak: number;
  activeThisWeek: boolean;
  nightsThisWeek: number;
};

type WeeklyStreakRow = {
  user_id?: string | null;
  weekly_streak?: number | string | null;
  active_this_week?: boolean | null;
  nights_this_week?: number | string | null;
};

type SessionNightRunRow = {
  session_id?: string | null;
  nights_in_a_row?: number | string | null;
};

export const EMPTY_WEEKLY_STREAK: WeeklyStreak = {
  weeklyStreak: 0,
  activeThisWeek: false,
  nightsThisWeek: 0,
};

// A post shows "N nights in a row" from the second consecutive night.
export const NIGHTS_IN_A_ROW_THRESHOLD = 2;

const toCount = (value: number | string | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const mapWeeklyStreakRow = (row: WeeklyStreakRow): WeeklyStreak => ({
  weeklyStreak: toCount(row.weekly_streak),
  activeThisWeek: row.active_this_week === true,
  nightsThisWeek: toCount(row.nights_this_week),
});

export const formatWeeklyStreak = (weeks: number) => `${weeks}-week streak`;

export const formatNightsInARow = (nights: number) => `${nights} nights in a row`;

export const shouldShowNightsInARow = (nights: number | null | undefined): nights is number => (
  typeof nights === 'number' && nights >= NIGHTS_IN_A_ROW_THRESHOLD
);

export type WeeklyStreakBadgeCopy = {
  title: string;
  hint: string | null;
};

export const getWeeklyStreakBadgeCopy = (
  weeks: number,
  activeThisWeek: boolean,
  isOwnProfile: boolean
): WeeklyStreakBadgeCopy | null => {
  if (weeks <= 0) {
    return isOwnProfile
      ? { title: 'No weekly streak yet', hint: 'One night out this week starts one' }
      : null;
  }
  return {
    title: formatWeeklyStreak(weeks),
    hint: isOwnProfile && !activeThisWeek ? 'Log a night out this week to keep it' : null,
  };
};

export const fetchWeeklyStreaks = async (userIds: string[]): Promise<Map<string, WeeklyStreak>> => {
  const result = new Map<string, WeeklyStreak>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return result;

  const { data, error } = await supabase.rpc('get_weekly_streaks', { user_ids: ids });
  if (error) {
    console.warn('Weekly streaks unavailable:', error.message);
    return result;
  }

  ((data || []) as WeeklyStreakRow[]).forEach((row) => {
    if (row.user_id) result.set(row.user_id, mapWeeklyStreakRow(row));
  });
  return result;
};

export const fetchSessionNightRuns = async (sessionIds: string[]): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  const ids = Array.from(new Set(sessionIds.filter(Boolean)));
  if (ids.length === 0) return result;

  const { data, error } = await supabase.rpc('get_session_night_runs', { session_ids: ids });
  if (error) {
    console.warn('Nights in a row unavailable:', error.message);
    return result;
  }

  ((data || []) as SessionNightRunRow[]).forEach((row) => {
    if (row.session_id) result.set(row.session_id, toCount(row.nights_in_a_row));
  });
  return result;
};
