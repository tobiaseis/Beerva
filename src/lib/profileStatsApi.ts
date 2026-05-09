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
    .from('session_beers')
    .select(`
      session_id,
      beer_name,
      volume,
      quantity,
      abv,
      consumed_at,
      sessions!inner(user_id, pub_id, pub_name, status, started_at, published_at, created_at)
    `)
    .eq('sessions.user_id', userId)
    .eq('sessions.status', 'published');

  if (!error) {
    const rows = ((data || []) as any[]).map((beer) => ({
      session_id: beer.session_id,
      pub_id: beer.sessions?.pub_id,
      pub_name: beer.sessions?.pub_name,
      beer_name: beer.beer_name,
      volume: beer.volume,
      quantity: beer.quantity,
      abv: beer.abv,
      created_at: beer.consumed_at || beer.sessions?.started_at || beer.sessions?.created_at,
    }));

    return calculateStats(rows as ProfileSessionStatsRow[]);
  }

  console.warn('Session beer stats unavailable, using legacy sessions fallback:', error.message);

  const legacy = await supabase
    .from('sessions')
    .select('id, pub_id, pub_name, beer_name, volume, quantity, abv, created_at')
    .eq('user_id', userId);

  if (legacy.error) throw legacy.error;
  return calculateStats(((legacy.data || []) as any[]).map((session) => ({
    session_id: session.id,
    pub_id: session.pub_id,
    pub_name: session.pub_name,
    beer_name: session.beer_name,
    volume: session.volume,
    quantity: session.quantity,
    abv: session.abv,
    created_at: session.created_at,
  })) as ProfileSessionStatsRow[]);
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
