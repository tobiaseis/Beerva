import { PubRecord, formatPubLabel, incrementPubUseCount } from './pubDirectory';
import {
  buildFallbackActivePubCrawlState,
  mapPubCrawlRow,
  PubCrawl,
  PubCrawlBeerRow,
  PubCrawlComment,
  PubCrawlProfile,
  PubCrawlRow,
  PubCrawlStopRow,
} from './pubCrawls';
import { supabase } from './supabase';
import { getErrorMessage, withTimeout } from './timeouts';

const PUB_CRAWL_TIMEOUT_MS = 15000;

type PubCrawlBaseRow = {
  id: string;
  user_id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  published_at: string | null;
  hangover_score: number | null;
  created_at: string | null;
};

type CrawlSessionRow = {
  id: string;
  pub_crawl_id: string | null;
  crawl_stop_order: number | null;
  pub_id: string | null;
  pub_name: string | null;
  image_url: string | null;
  comment: string | null;
  started_at: string | null;
  ended_at: string | null;
  published_at: string | null;
  created_at: string | null;
};

type PubPreviewRow = {
  id: string;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  address: string | null;
};

type BeerRow = {
  id: string;
  session_id: string;
  beer_name: string;
  volume: string | null;
  quantity: number | null;
  abv: number | null;
  consumed_at: string | null;
  created_at: string | null;
};

type CheerRow = {
  pub_crawl_id: string;
  user_id: string;
  created_at?: string | null;
};

type CommentRow = {
  id: string;
  pub_crawl_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string | null;
};

export type ActivePubCrawlState = {
  crawl: PubCrawl;
  activeStop: PubCrawl['stops'][number] | null;
};

export type ConvertPubCrawlFallback = {
  session?: PubCrawlStopRow | null;
  beers?: PubCrawlBeerRow[] | null;
};

export type PubCrawlFeedPage = {
  crawls: PubCrawl[];
  hasMore: boolean;
  loadedCount: number;
};

const toActivePubCrawlState = (crawl: PubCrawl): ActivePubCrawlState => ({
  crawl,
  activeStop: crawl.stops.find((stop) => !stop.endedAt && !stop.publishedAt) || crawl.stops[crawl.stops.length - 1] || null,
});

const profileFromRow = (row: any): PubCrawlProfile => ({
  id: row.id,
  username: row.username || null,
  avatarUrl: row.avatar_url || null,
});

const toComment = (row: CommentRow, profilesById: Map<string, PubCrawlProfile>): PubCrawlComment => ({
  id: row.id,
  crawlId: row.pub_crawl_id,
  userId: row.user_id,
  body: row.body,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  profile: profilesById.get(row.user_id) || null,
});

const normalizePubCrawlBaseRow = (data: unknown): PubCrawlBaseRow => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('id' in row)) {
    throw new Error('Could not read the pub crawl that was created.');
  }
  return row as PubCrawlBaseRow;
};

const hydratePubCrawls = async (crawlRows: PubCrawlBaseRow[], currentUserId?: string | null): Promise<PubCrawl[]> => {
  if (crawlRows.length === 0) return [];

  const crawlIds = crawlRows.map((crawl) => crawl.id);

  const [stopsResult, cheersResult, commentsResult] = await withTimeout(
    Promise.all([
      supabase
        .from('sessions')
        .select('id, pub_crawl_id, crawl_stop_order, pub_id, pub_name, image_url, comment, started_at, ended_at, published_at, created_at')
        .in('pub_crawl_id', crawlIds)
        .order('crawl_stop_order', { ascending: true }),
      supabase
        .from('pub_crawl_cheers')
        .select('pub_crawl_id, user_id, created_at')
        .in('pub_crawl_id', crawlIds),
      supabase
        .from('pub_crawl_comments')
        .select('id, pub_crawl_id, user_id, body, created_at, updated_at')
        .in('pub_crawl_id', crawlIds)
        .order('created_at', { ascending: true }),
    ]),
    PUB_CRAWL_TIMEOUT_MS,
    'Pub crawl details are taking too long.'
  );

  if (stopsResult.error) throw stopsResult.error;
  if (cheersResult.error) throw cheersResult.error;
  if (commentsResult.error) throw commentsResult.error;

  const stopRows = (stopsResult.data || []) as CrawlSessionRow[];
  const sessionIds = stopRows.map((stop) => stop.id);
  const pubIds = Array.from(new Set(stopRows.map((stop) => stop.pub_id).filter(Boolean))) as string[];
  const cheers = (cheersResult.data || []) as CheerRow[];
  const comments = (commentsResult.data || []) as CommentRow[];
  const profileIds = Array.from(new Set([
    ...crawlRows.map((crawl) => crawl.user_id),
    ...cheers.map((cheer) => cheer.user_id),
    ...comments.map((comment) => comment.user_id),
    currentUserId,
  ].filter(Boolean))) as string[];

  const [beersResult, pubsResult, profilesResult] = await withTimeout(
    Promise.all([
      sessionIds.length > 0
        ? supabase
            .from('session_beers')
            .select('id, session_id, beer_name, volume, quantity, abv, consumed_at, created_at')
            .in('session_id', sessionIds)
            .order('consumed_at', { ascending: true })
        : Promise.resolve({ data: [] as BeerRow[], error: null }),
      pubIds.length > 0
        ? supabase
            .from('pubs')
            .select('id, latitude, longitude, city, address')
            .in('id', pubIds)
        : Promise.resolve({ data: [] as PubPreviewRow[], error: null }),
      profileIds.length > 0
        ? supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', profileIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]),
    PUB_CRAWL_TIMEOUT_MS,
    'Pub crawl support data is taking too long.'
  );

  if (beersResult.error) throw beersResult.error;
  if (pubsResult.error) throw pubsResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const beersBySession = new Map<string, BeerRow[]>();
  ((beersResult.data || []) as BeerRow[]).forEach((beer) => {
    const existing = beersBySession.get(beer.session_id) || [];
    existing.push(beer);
    beersBySession.set(beer.session_id, existing);
  });

  const pubsById = new Map<string, PubPreviewRow>();
  ((pubsResult.data || []) as PubPreviewRow[]).forEach((pub) => {
    pubsById.set(pub.id, pub);
  });

  const profilesById = new Map<string, PubCrawlProfile>();
  ((profilesResult.data || []) as any[]).forEach((profile) => {
    profilesById.set(profile.id, profileFromRow(profile));
  });

  const stopsByCrawl = new Map<string, PubCrawlStopRow[]>();
  stopRows.forEach((stop) => {
    if (!stop.pub_crawl_id) return;
    const pub = stop.pub_id ? pubsById.get(stop.pub_id) : null;
    const existing = stopsByCrawl.get(stop.pub_crawl_id) || [];
    existing.push({
      id: stop.id,
      pub_crawl_id: stop.pub_crawl_id,
      crawl_stop_order: stop.crawl_stop_order,
      pub_id: stop.pub_id,
      pub_name: stop.pub_name,
      image_url: stop.image_url,
      comment: stop.comment,
      started_at: stop.started_at || stop.created_at,
      ended_at: stop.ended_at,
      published_at: stop.published_at,
      pubs: pub ? {
        latitude: pub.latitude,
        longitude: pub.longitude,
        city: pub.city,
        address: pub.address,
      } : null,
      session_beers: beersBySession.get(stop.id) || [],
    });
    stopsByCrawl.set(stop.pub_crawl_id, existing);
  });

  const cheersByCrawl = new Map<string, CheerRow[]>();
  cheers.forEach((cheer) => {
    const existing = cheersByCrawl.get(cheer.pub_crawl_id) || [];
    existing.push(cheer);
    cheersByCrawl.set(cheer.pub_crawl_id, existing);
  });

  const commentsByCrawl = new Map<string, CommentRow[]>();
  comments.forEach((comment) => {
    const existing = commentsByCrawl.get(comment.pub_crawl_id) || [];
    existing.push(comment);
    commentsByCrawl.set(comment.pub_crawl_id, existing);
  });

  return crawlRows.map((crawlRow) => {
    const crawlCheers = cheersByCrawl.get(crawlRow.id) || [];
    const crawlComments = commentsByCrawl.get(crawlRow.id) || [];
    const mapped = mapPubCrawlRow({
      ...crawlRow,
      profiles: profilesById.get(crawlRow.user_id)
        ? {
            username: profilesById.get(crawlRow.user_id)?.username || null,
            avatar_url: profilesById.get(crawlRow.user_id)?.avatarUrl || null,
          }
        : null,
      pub_crawl_cheers: crawlCheers,
      pub_crawl_comments: crawlComments,
      stops: stopsByCrawl.get(crawlRow.id) || [],
    } as PubCrawlRow);

    return {
      ...mapped,
      cheerProfiles: crawlCheers
        .map((cheer) => profilesById.get(cheer.user_id))
        .filter(Boolean) as PubCrawlProfile[],
      comments: crawlComments.map((comment) => toComment(comment, profilesById)),
      cheersCount: crawlCheers.length,
      commentsCount: crawlComments.length,
    };
  });
};

export const fetchActivePubCrawl = async (): Promise<ActivePubCrawlState | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await withTimeout(
    supabase
      .from('pub_crawls')
      .select('id, user_id, status, started_at, ended_at, published_at, hangover_score, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle(),
    PUB_CRAWL_TIMEOUT_MS,
    'Active pub crawl is taking too long.'
  );

  if (error) throw error;
  if (!data) return null;

  const [crawl] = await hydratePubCrawls([data as PubCrawlBaseRow], user.id);
  return toActivePubCrawlState(crawl);
};

export const convertActiveSessionToPubCrawl = async (
  sessionId: string,
  fallback?: ConvertPubCrawlFallback
): Promise<ActivePubCrawlState> => {
  const { data, error } = await withTimeout(
    supabase.rpc('convert_session_to_pub_crawl', { target_session_id: sessionId }),
    PUB_CRAWL_TIMEOUT_MS,
    'Turning this session into a pub crawl is taking too long.'
  );

  if (error) throw error;
  const crawlRow = normalizePubCrawlBaseRow(data);

  try {
    const [crawl] = await hydratePubCrawls([crawlRow]);
    return toActivePubCrawlState(crawl);
  } catch (hydrationError) {
    if (!fallback?.session) throw hydrationError;

    console.warn('Could not hydrate converted pub crawl; using active session fallback.', hydrationError);
    return buildFallbackActivePubCrawlState(
      crawlRow as PubCrawlRow,
      fallback.session,
      fallback.beers || []
    );
  }
};

export const updateCurrentCrawlStopPub = async (
  crawlId: string,
  pub: PubRecord | null,
  fallbackPubName: string
) => {
  const { data, error } = await withTimeout(
    supabase.rpc('update_active_crawl_stop_pub', {
      target_crawl_id: crawlId,
      target_pub_id: pub?.id || null,
      fallback_pub_name: pub ? formatPubLabel(pub) : fallbackPubName,
    }),
    PUB_CRAWL_TIMEOUT_MS,
    'Updating the current pub is taking too long.'
  );

  if (error) throw error;
  return data as CrawlSessionRow;
};

export const finishCrawlStopAndStartNext = async (
  crawlId: string,
  nextPub: PubRecord | null,
  fallbackPubName: string
) => {
  const { data: finishedStop, error: finishError } = await withTimeout(
    supabase.rpc('finish_active_crawl_stop', { target_crawl_id: crawlId }),
    PUB_CRAWL_TIMEOUT_MS,
    'Finishing this pub crawl stop is taking too long.'
  );

  if (finishError) throw finishError;
  incrementPubUseCount((finishedStop as CrawlSessionRow | null)?.pub_id);

  const { data, error } = await withTimeout(
    supabase.rpc('start_next_crawl_stop', {
      target_crawl_id: crawlId,
      target_pub_id: nextPub?.id || null,
      fallback_pub_name: nextPub ? formatPubLabel(nextPub) : fallbackPubName,
    }),
    PUB_CRAWL_TIMEOUT_MS,
    'Starting the next pub crawl stop is taking too long.'
  );

  if (error) throw error;
  return data as CrawlSessionRow;
};

export const publishPubCrawl = async (crawlId: string): Promise<PubCrawl> => {
  const { data, error } = await withTimeout(
    supabase.rpc('publish_pub_crawl', { target_crawl_id: crawlId }),
    PUB_CRAWL_TIMEOUT_MS,
    'Publishing the pub crawl is taking too long.'
  );

  if (error) throw error;
  const [crawl] = await hydratePubCrawls([data as PubCrawlBaseRow]);
  const lastStop = crawl.stops[crawl.stops.length - 1];
  incrementPubUseCount(lastStop?.pubId);
  return crawl;
};

export const cancelPubCrawl = async (crawlId: string) => {
  const { error } = await withTimeout(
    supabase.rpc('cancel_pub_crawl', { target_crawl_id: crawlId }),
    PUB_CRAWL_TIMEOUT_MS,
    'Cancelling the pub crawl is taking too long.'
  );

  if (error) throw error;
};

export const fetchPublishedPubCrawlsForFeed = async (
  userIds: string[],
  limit = 20
): Promise<PubCrawl[]> => {
  const page = await fetchPublishedPubCrawlsForFeedPage(userIds, limit, 0);
  return page.crawls;
};

export const fetchPublishedPubCrawlsForFeedPage = async (
  userIds: string[],
  pageSize = 20,
  offset = 0
): Promise<PubCrawlFeedPage> => {
  if (userIds.length === 0) {
    return { crawls: [], hasMore: false, loadedCount: 0 };
  }

  const { data, error } = await withTimeout(
    supabase
      .from('pub_crawls')
      .select('id, user_id, status, started_at, ended_at, published_at, hangover_score, created_at')
      .in('user_id', userIds)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + pageSize),
    PUB_CRAWL_TIMEOUT_MS,
    'Pub crawl feed posts are taking too long.'
  );

  if (error) throw error;
  const { data: { user } } = await supabase.auth.getUser();
  const rows = (data || []) as PubCrawlBaseRow[];
  const pageRows = rows.slice(0, pageSize);
  const crawls = await hydratePubCrawls(pageRows, user?.id || null);

  return {
    crawls,
    hasMore: rows.length > pageSize,
    loadedCount: pageRows.length,
  };
};

export const togglePubCrawlCheers = async (crawl: PubCrawl, currentUserId: string) => {
  const hasCheered = crawl.cheerProfiles.some((profile) => profile.id === currentUserId);

  if (hasCheered) {
    const { error } = await supabase
      .from('pub_crawl_cheers')
      .delete()
      .eq('pub_crawl_id', crawl.id)
      .eq('user_id', currentUserId);

    if (error) throw error;
    return false;
  }

  const { error } = await supabase
    .from('pub_crawl_cheers')
    .insert({ pub_crawl_id: crawl.id, user_id: currentUserId });

  if (error) throw error;
  return true;
};

export const addPubCrawlComment = async (crawlId: string, body: string) => {
  const cleanBody = body.trim();
  if (!cleanBody) throw new Error('Write a comment first.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in!');

  const { data, error } = await supabase
    .from('pub_crawl_comments')
    .insert({
      pub_crawl_id: crawlId,
      user_id: user.id,
      body: cleanBody,
    })
    .select('id, pub_crawl_id, user_id, body, created_at, updated_at')
    .single();

  if (error) throw error;
  return data as CommentRow;
};

export const deletePubCrawlComment = async (commentId: string) => {
  const { error } = await supabase
    .from('pub_crawl_comments')
    .delete()
    .eq('id', commentId);

  if (error) throw new Error(getErrorMessage(error, 'Could not delete comment.'));
};
