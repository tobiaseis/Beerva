import { supabase } from './supabase';
import {
  ChallengeDetail,
  ChallengeDetailRow,
  ChallengeSummary,
  ChallengeSummaryRow,
  mapChallengeDetailRow,
  mapChallengeSummaryRow,
} from './challenges';
import { getErrorMessage, withTimeout } from './timeouts';

const CHALLENGE_TIMEOUT_MS = 15000;

export const fetchOfficialChallenges = async (): Promise<ChallengeSummary[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_official_challenges'),
      CHALLENGE_TIMEOUT_MS,
      'Challenges are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as ChallengeSummaryRow[]).map(mapChallengeSummaryRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load challenges.'));
  }
};

export const fetchChallengeDetail = async (challengeIdOrSlug: string): Promise<ChallengeDetail> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_challenge_detail', { target_challenge_slug: challengeIdOrSlug }),
      CHALLENGE_TIMEOUT_MS,
      'Challenge leaderboard is taking too long to load.'
    );

    if (error) throw error;
    if (!data) throw new Error('Challenge not found.');

    return mapChallengeDetailRow(data as ChallengeDetailRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load challenge.'));
  }
};

export const joinChallenge = async (challengeId: string) => {
  try {
    const { error } = await withTimeout(
      supabase.rpc('join_challenge', { target_challenge_id: challengeId }),
      CHALLENGE_TIMEOUT_MS,
      'Joining the challenge is taking too long.'
    );

    if (error) throw error;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not join challenge.'));
  }
};

export const fetchJoinedActiveChallengeSummary = async (): Promise<ChallengeSummary | null> => {
  const challenges = await fetchOfficialChallenges();
  return challenges.find((challenge) => challenge.joined && challenge.status === 'active') || null;
};
