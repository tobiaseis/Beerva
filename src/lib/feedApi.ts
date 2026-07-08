import { supabase } from './supabase';
import { getCurrentUser } from './authSession';
import { fetchSessionFeedDetails, SessionFeedDetail } from './sessionFeedDetails';
import { sortFeedItemsByPublishedAt } from './feedPagination';
import { withTimeout } from './timeouts';
import { fetchPublishedPubCrawlsForFeedPage } from './pubCrawlsApi';
import { fetchContentMentionsForSources } from './mentions';
import { fetchOfficialFeedPostsForFeedPage, fetchOfficialPostLinkedChallengeSummaries } from './officialFeedPostsApi';
import { fetchSessionBuddySummaries, SessionBuddy } from './sessionBuddies';
import { mapChugAttemptRow, SessionChugAttempt, SessionChugAttemptRow } from './chugAttempts';
import { FeedItem } from './feedTypes';
import { ChallengeSummary } from './challenges';

type FollowRow = {
  following_id: string;
};

export type FetchFeedPageArgs = {
  sessionOffset: number;
  crawlOffset: number;
  officialOffset: number;
  pageSize: number;
  timeoutMs: number;
};

export type FetchFeedPageResult = {
  items: FeedItem[];
  currentUserId: string | null;
  followedUserCount: number;
  hasMore: boolean;
  loadedSessionCount: number;
  loadedCrawlCount: number;
  loadedOfficialPostCount: number;
  officialPostChallengesById: Map<string, ChallengeSummary>;
};

const emptyFeedPage = (currentUserId: string | null = null): FetchFeedPageResult => ({
  items: [],
  currentUserId,
  followedUserCount: 0,
  hasMore: false,
  loadedSessionCount: 0,
  loadedCrawlCount: 0,
  loadedOfficialPostCount: 0,
  officialPostChallengesById: new Map<string, ChallengeSummary>(),
});

export const fetchFeedPage = async (args: FetchFeedPageArgs): Promise<FetchFeedPageResult> => (
  fetchFeedPageViaClientHydration(args)
);

const fetchFeedPageViaClientHydration = async ({
  sessionOffset,
  crawlOffset,
  officialOffset,
  pageSize,
  timeoutMs,
}: FetchFeedPageArgs): Promise<FetchFeedPageResult> => {
  const user = await getCurrentUser();
  const currentUserId = user?.id || null;

  if (!user) {
    return emptyFeedPage(currentUserId);
  }

  const { data: followsData, error: followsError } = await withTimeout(
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id),
    timeoutMs,
    'Feed follows are taking too long.'
  );

  if (followsError) {
    console.error('Feed follows fetch error:', followsError);
  }

  const followingIds = ((followsData || []) as FollowRow[]).map((follow) => follow.following_id);
  const feedUserIds = Array.from(new Set([user.id, ...followingIds]));

  const [sessionsResult, crawlsResult, officialPostsResult] = await withTimeout(
    Promise.all([
      supabase
        .from('sessions')
        .select(`
          id,
          user_id,
          pub_id,
          pub_name,
          beer_name,
          volume,
          quantity,
          abv,
          comment,
          image_url,
          status,
          started_at,
          ended_at,
          published_at,
          edited_at,
          hangover_score,
          created_at,
          hide_from_feed
        `)
        .in('user_id', feedUserIds)
        .eq('status', 'published')
        .eq('hide_from_feed', false)
        .order('published_at', { ascending: false, nullsFirst: false })
        .range(sessionOffset, sessionOffset + pageSize),
      fetchPublishedPubCrawlsForFeedPage(feedUserIds, pageSize, crawlOffset),
      fetchOfficialFeedPostsForFeedPage(pageSize, officialOffset),
    ]),
    timeoutMs,
    'Feed items are taking too long.'
  );

  if (sessionsResult.error) throw sessionsResult.error;

  const rawRows = (sessionsResult.data || []) as any[];
  const hasMore = rawRows.length > pageSize || crawlsResult.hasMore || officialPostsResult.length > pageSize;
  const sessionRows = rawRows.slice(0, pageSize);
  const crawls = crawlsResult.crawls;
  const officialPosts = officialPostsResult.slice(0, pageSize);
  const sessionIds = sessionRows.map((session) => session.id);

  const [detailsBySession, chugsResult, buddiesBySession, officialPostChallengeSummaries] = await withTimeout(
    Promise.all([
      sessionIds.length > 0
        ? fetchSessionFeedDetails(sessionIds)
        : Promise.resolve(new Map<string, SessionFeedDetail>()),
      sessionIds.length > 0
        ? supabase.rpc('get_session_chug_attempt_summaries', { session_ids: sessionIds })
        : Promise.resolve({ data: [] as SessionChugAttemptRow[], error: null }),
      sessionIds.length > 0
        ? fetchSessionBuddySummaries(sessionIds).catch((error) => {
            console.error('Session buddies fetch error:', error);
            return new Map<string, SessionBuddy[]>();
          })
        : Promise.resolve(new Map<string, SessionBuddy[]>()),
      fetchOfficialPostLinkedChallengeSummaries(officialPosts).catch((error) => {
        console.error('Official challenge actions fetch error:', error);
        return new Map<string, ChallengeSummary>();
      }),
    ]),
    timeoutMs,
    'Feed details are taking too long.'
  );

  if (chugsResult.error) {
    console.error('Session chugs fetch error:', chugsResult.error);
  }

  const chugRows = ((chugsResult.data || []) as SessionChugAttemptRow[]).map(mapChugAttemptRow);
  const chugsBySession = chugRows.reduce((acc, attempt) => {
    const existing = acc.get(attempt.sessionId) || [];
    existing.push(attempt);
    acc.set(attempt.sessionId, existing);
    return acc;
  }, new Map<string, SessionChugAttempt[]>());

  const pageSessions = sessionRows.map((session): FeedItem => {
    const detail = detailsBySession.get(session.id);
    const detailCheers = detail?.cheers || [];
    const detailComments = detail?.comments || [];
    const sessionBeers = (detail?.beers && detail.beers.length > 0)
      ? detail.beers
      : (session.beer_name
          ? [{
              session_id: session.id,
              beer_name: session.beer_name,
              volume: session.volume,
              quantity: session.quantity,
              abv: session.abv ?? null,
              consumed_at: session.created_at,
            }]
          : []);

    return {
      type: 'session',
      id: session.id,
      publishedAt: session.published_at || session.created_at,
      session: {
        ...session,
        session_photos: detail?.photos || [],
        session_beers: sessionBeers,
        units: detail?.units ?? null,
        session_chug_attempts: chugsBySession.get(session.id) || [],
        drinking_buddies: buddiesBySession.get(session.id) || [],
        profiles: detail?.author
          ? { username: detail.author.username, avatar_url: detail.author.avatarUrl }
          : null,
        author_current_streak: detail?.authorCurrentStreak ?? 0,
        cheer_profiles: detailCheers.map((cheer) => ({
          id: cheer.userId,
          username: cheer.username,
          avatar_url: cheer.avatarUrl,
        })),
        comments: detailComments.map((comment) => ({
          id: comment.id,
          session_id: session.id,
          user_id: comment.userId,
          body: comment.body,
          created_at: comment.createdAt,
          updated_at: comment.updatedAt,
          profiles: {
            id: comment.userId,
            username: comment.username,
            avatar_url: comment.avatarUrl,
          },
        })),
        comments_count: detail?.commentsCount ?? detailComments.length,
        cheers_count: detail?.cheersCount ?? detailCheers.length,
        has_cheered: detailCheers.some((cheer) => cheer.userId === user.id),
      },
    };
  });

  const pageCrawls = crawls.map((crawl): FeedItem => ({
    type: 'pub_crawl',
    id: crawl.id,
    publishedAt: crawl.publishedAt || crawl.createdAt || '',
    crawl: {
      ...crawl,
      has_cheered: crawl.cheerProfiles.some((profile) => profile.id === user.id),
    } as any,
  }));

  const pageOfficialPosts = officialPosts.map((post): FeedItem => ({
    type: 'official_post',
    id: post.id,
    publishedAt: post.publishedAt || post.createdAt || '',
    post,
  }));

  const commentSourceIds = [
    ...pageSessions.flatMap((feedItem) => (
      feedItem.type === 'session'
        ? feedItem.session.comments.map((comment) => comment.id)
        : []
    )),
    ...pageCrawls.flatMap((feedItem) => (
      feedItem.type === 'pub_crawl'
        ? feedItem.crawl.comments.map((comment) => comment.id)
        : []
    )),
  ];
  const postSourceIds = [
    ...pageSessions.flatMap((feedItem) => (
      feedItem.type === 'session' ? [feedItem.session.id] : []
    )),
    ...pageCrawls.flatMap((feedItem) => (
      feedItem.type === 'pub_crawl'
        ? feedItem.crawl.stops.map((stop) => stop.id)
        : []
    )),
  ];

  const [commentMentionsBySource, postMentionsBySource] = await withTimeout(
    Promise.all([
      fetchContentMentionsForSources(supabase, 'comment', commentSourceIds),
      fetchContentMentionsForSources(supabase, 'post', postSourceIds),
    ]),
    timeoutMs,
    'Feed mentions are taking too long.'
  );

  const hydratedPageSessions = pageSessions.map((feedItem): FeedItem => {
    if (feedItem.type !== 'session') return feedItem;
    return {
      ...feedItem,
      session: {
        ...feedItem.session,
        mentions: postMentionsBySource.get(feedItem.session.id) || [],
        comments: feedItem.session.comments.map((comment) => ({
          ...comment,
          mentions: commentMentionsBySource.get(comment.id) || [],
        })),
      },
    };
  });

  const hydratedPageCrawls = pageCrawls.map((feedItem): FeedItem => {
    if (feedItem.type !== 'pub_crawl') return feedItem;
    return {
      ...feedItem,
      crawl: {
        ...feedItem.crawl,
        comments: feedItem.crawl.comments.map((comment) => ({
          ...comment,
          mentions: commentMentionsBySource.get(comment.id) || [],
        })),
        stops: feedItem.crawl.stops.map((stop) => ({
          ...stop,
          mentions: postMentionsBySource.get(stop.id) || [],
        })),
      },
    };
  });

  return {
    items: sortFeedItemsByPublishedAt([...hydratedPageSessions, ...hydratedPageCrawls, ...pageOfficialPosts]),
    currentUserId,
    followedUserCount: followingIds.length,
    hasMore,
    loadedSessionCount: sessionRows.length,
    loadedCrawlCount: crawlsResult.loadedCount,
    loadedOfficialPostCount: officialPosts.length,
    officialPostChallengesById: officialPostChallengeSummaries,
  };
};
