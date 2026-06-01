import { mapOfficialFeedPostRow, OfficialFeedPost, OfficialFeedPostRow } from './officialFeedPosts';
import { ChallengeSummary } from './challenges';
import { fetchOfficialChallenges } from './challengesApi';
import { supabase } from './supabase';
import { getErrorMessage, withTimeout } from './timeouts';

const OFFICIAL_FEED_TIMEOUT_MS = 15000;

export const fetchOfficialFeedPostsForFeedPage = async (
  limit: number,
  offset: number
): Promise<OfficialFeedPost[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('official_feed_posts')
        .select('id, challenge_id, linked_challenge_id, kind, title, body, image_url, metadata, published_at, created_at')
        .order('published_at', { ascending: false })
        .range(offset, offset + limit - 1),
      OFFICIAL_FEED_TIMEOUT_MS,
      'Official Beerva posts are taking too long.'
    );

    if (error) throw error;
    return ((data || []) as OfficialFeedPostRow[]).map(mapOfficialFeedPostRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load official Beerva posts.'));
  }
};

export const fetchOfficialPostLinkedChallengeSummaries = async (
  posts: OfficialFeedPost[]
): Promise<Map<string, ChallengeSummary>> => {
  const linkedIds = new Set(
    posts.map((post) => post.linkedChallengeId).filter(Boolean) as string[]
  );

  if (linkedIds.size === 0) return new Map();

  const challenges = await fetchOfficialChallenges();
  return new Map(
    challenges
      .filter((challenge) => linkedIds.has(challenge.id))
      .map((challenge) => [challenge.id, challenge])
  );
};
