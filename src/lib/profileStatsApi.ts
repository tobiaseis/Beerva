import { supabase } from './supabase';
import { calculateStats, emptyStats, ProfileSessionStatsRow, Stats } from './profileStats';

type ProfileStatsRpcRow = {
  total_pints?: number | null;
  unique_pubs?: number | null;
  avg_abv?: number | null;
  max_session_pints?: number | null;
  strongest_abv?: number | null;
  has_late_night_session?: boolean | null;
  max_sessions_in_one_day?: number | null;
  max_pubs_in_one_day?: number | null;
  max_sessions_at_same_pub?: number | null;
  longest_day_streak?: number | null;
  unique_beers?: number | null;
  max_beers_in_one_day?: number | null;
  has_early_bird_session?: boolean | null;
  months_logged?: number | null;
};

const numberOrZero = (value?: number | null) => Number(value || 0);

const statsFromRpcRow = (row?: ProfileStatsRpcRow | null): Stats => {
  if (!row) return emptyStats;

  return {
    totalPints: numberOrZero(row.total_pints),
    uniquePubs: numberOrZero(row.unique_pubs),
    avgAbv: numberOrZero(row.avg_abv),
    maxSessionPints: numberOrZero(row.max_session_pints),
    strongestAbv: numberOrZero(row.strongest_abv),
    hasLateNightSession: Boolean(row.has_late_night_session),
    maxSessionsInOneDay: numberOrZero(row.max_sessions_in_one_day),
    maxPubsInOneDay: numberOrZero(row.max_pubs_in_one_day),
    maxSessionsAtSamePub: numberOrZero(row.max_sessions_at_same_pub),
    longestDayStreak: numberOrZero(row.longest_day_streak),
    uniqueBeers: numberOrZero(row.unique_beers),
    maxBeersInOneDay: numberOrZero(row.max_beers_in_one_day),
    hasEarlyBirdSession: Boolean(row.has_early_bird_session),
    monthsLogged: numberOrZero(row.months_logged),
  };
};

const fetchStatsFallback = async (userId: string): Promise<Stats> => {
  const { data, error } = await supabase
    .from('sessions')
    .select('pub_name, beer_name, volume, quantity, abv, created_at')
    .eq('user_id', userId);

  if (error) throw error;
  return calculateStats((data || []) as ProfileSessionStatsRow[]);
};

export const fetchProfileStats = async (userId: string): Promise<Stats> => {
  const { data, error } = await supabase.rpc('get_profile_stats', {
    target_user_id: userId,
  });

  if (error) {
    console.warn('Profile stats RPC unavailable, using client fallback:', error.message);
    return fetchStatsFallback(userId);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return statsFromRpcRow(row as ProfileStatsRpcRow | null);
};
