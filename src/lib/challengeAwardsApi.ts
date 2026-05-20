import { ChallengeAwardRow, mapChallengeAwardRow } from './challengeAwards';
import { TrophyDefinition } from './profileStats';
import { supabase } from './supabase';
import { getErrorMessage, withTimeout } from './timeouts';

const CHALLENGE_AWARDS_TIMEOUT_MS = 15000;

export const fetchChallengeAwards = async (userId: string): Promise<TrophyDefinition[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_challenge_awards', { target_user_id: userId }),
      CHALLENGE_AWARDS_TIMEOUT_MS,
      'Challenge awards are taking too long.'
    );

    if (error) throw error;
    return ((data || []) as ChallengeAwardRow[]).map(mapChallengeAwardRow);
  } catch (error) {
    console.warn('Challenge awards unavailable:', getErrorMessage(error, 'Could not load challenge awards.'));
    return [];
  }
};
