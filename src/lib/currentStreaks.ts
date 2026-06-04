import { supabase } from './supabase';

type CurrentStreakRow = {
  user_id: string;
  current_streak: number | null;
};

// Returns a map of userId -> current streak. Missing/zero users are simply
// absent (callers should default to 0). Used by surfaces that do not already
// receive the streak through get_profile_stats or get_session_feed_details.
export const fetchCurrentStreaks = async (
  userIds: string[]
): Promise<Map<string, number>> => {
  const result = new Map<string, number>();
  const cleanIds = Array.from(new Set(userIds.filter(Boolean)));
  if (cleanIds.length === 0) return result;

  const { data, error } = await supabase.rpc('get_current_streaks', {
    user_ids: cleanIds,
  });

  if (error) {
    console.warn('Current streaks unavailable:', error.message);
    return result;
  }

  ((data || []) as CurrentStreakRow[]).forEach((row) => {
    result.set(row.user_id, Number(row.current_streak || 0));
  });
  return result;
};
