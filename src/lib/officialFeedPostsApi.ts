import { mapOfficialFeedPostRow, OfficialFeedPost, OfficialFeedPostRow } from './officialFeedPosts';
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
        .select('id, challenge_id, kind, title, body, metadata, published_at, created_at')
        .order('published_at', { ascending: false })
        .range(offset, offset + limit),
      OFFICIAL_FEED_TIMEOUT_MS,
      'Official Beerva posts are taking too long.'
    );

    if (error) throw error;
    return ((data || []) as OfficialFeedPostRow[]).map(mapOfficialFeedPostRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load official Beerva posts.'));
  }
};
