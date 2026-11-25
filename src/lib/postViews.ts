import type { FeedItem } from './feedTypes';
import type { PostTargetType } from './postTargets';
import { supabase } from './supabase';
import { withTimeout } from './timeouts';

export const POST_VIEW_FLUSH_DELAY_MS = 4000;
export const POST_VIEW_MAX_BATCH = 50;
const POST_VIEWS_TIMEOUT_MS = 12000;

// A post counts as "seen" once at least half of its card has been on screen
// for one second. Used by both FlatList (PWA) and FlashList (native).
export const POST_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 1000,
};

export type PostViewTarget = {
  targetType: PostTargetType;
  targetId: string;
};

export type PostViewer = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

type PostViewerRow = {
  viewer_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
};

type PostViewCountRow = {
  target_type?: string | null;
  target_id?: string | null;
  views_count?: number | null;
};

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getPostViewKey = (target: PostViewTarget) => `${target.targetType}:${target.targetId}`;

export const getPostViewTargetForAuthor = (
  target: PostViewTarget,
  authorId: string | null | undefined,
  currentUserId: string | null | undefined
): PostViewTarget | null => {
  if (!currentUserId || !authorId || !toCleanString(target.targetId)) return null;
  if (authorId === currentUserId) return null;
  return target;
};

export const getFeedItemViewTarget = (
  item: FeedItem | null | undefined,
  currentUserId: string | null
): PostViewTarget | null => {
  if (!item) return null;
  if (item.type === 'session') {
    return getPostViewTargetForAuthor(
      { targetType: 'session', targetId: item.session.id },
      item.session.user_id,
      currentUserId
    );
  }
  if (item.type === 'pub_crawl') {
    return getPostViewTargetForAuthor(
      { targetType: 'pub_crawl', targetId: item.crawl.id },
      item.crawl.userId,
      currentUserId
    );
  }
  return null;
};

export const formatSeenByLabel = (count: number) => (
  `Seen by ${count} ${count === 1 ? 'person' : 'people'}`
);

export const formatSeenAgo = (isoDate: string | null, now = Date.now()) => {
  if (!isoDate) return 'Seen';
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) return 'Seen';
  const diffMins = Math.max(0, Math.round((now - timestamp) / 60000));
  if (diffMins < 1) return 'Seen just now';
  if (diffMins < 60) return `Seen ${diffMins} min ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `Seen ${diffHours}h ago`;
  return `Seen ${Math.round(diffHours / 24)}d ago`;
};

export const mapPostViewerRow = (row: PostViewerRow): PostViewer => ({
  userId: toCleanString(row.viewer_id) || '',
  username: toCleanString(row.username),
  avatarUrl: toCleanString(row.avatar_url),
  firstSeenAt: toCleanString(row.first_seen_at),
  lastSeenAt: toCleanString(row.last_seen_at),
});

const splitTargetsByType = (targets: PostViewTarget[]) => ({
  session_ids: targets.filter((target) => target.targetType === 'session').map((target) => target.targetId),
  pub_crawl_ids: targets.filter((target) => target.targetType === 'pub_crawl').map((target) => target.targetId),
});

export const recordPostViews = async (targets: PostViewTarget[]) => {
  if (targets.length === 0) return;
  const { error } = await supabase.rpc('record_post_views', splitTargetsByType(targets));
  if (error) throw error;
};

export const fetchMyPostViewCounts = async (targets: PostViewTarget[]) => {
  const counts = new Map<string, number>();
  if (targets.length === 0) return counts;

  const { data, error } = await withTimeout(
    supabase.rpc('get_my_post_view_counts', splitTargetsByType(targets)),
    POST_VIEWS_TIMEOUT_MS,
    'Post view counts are taking too long.'
  );
  if (error) throw error;

  ((data || []) as PostViewCountRow[]).forEach((row) => {
    const targetId = toCleanString(row.target_id);
    if (!targetId) return;
    const targetType: PostTargetType = row.target_type === 'pub_crawl' ? 'pub_crawl' : 'session';
    counts.set(getPostViewKey({ targetType, targetId }), Math.max(0, Number(row.views_count) || 0));
  });
  return counts;
};

export const fetchPostViewers = async (target: PostViewTarget): Promise<PostViewer[]> => {
  const { data, error } = await withTimeout(
    supabase.rpc('get_post_viewers', { post_type: target.targetType, post_id: target.targetId }),
    POST_VIEWS_TIMEOUT_MS,
    'Viewers are taking too long to load.'
  );
  if (error) throw error;
  return ((data || []) as PostViewerRow[])
    .map(mapPostViewerRow)
    .filter((viewer) => viewer.userId.length > 0);
};

export type PostViewRecorder = {
  markSeen: (target: PostViewTarget) => void;
  flush: () => Promise<void>;
};

type PostViewRecorderOptions = {
  send: (targets: PostViewTarget[]) => Promise<void>;
  flushDelayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
};

// Dedupes sightings for the lifetime of the app run, batches them, and sends
// them every few seconds. A failed batch is forgotten so the next sighting of
// the same post can try again.
export const createPostViewRecorder = ({
  send,
  flushDelayMs = POST_VIEW_FLUSH_DELAY_MS,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: PostViewRecorderOptions): PostViewRecorder => {
  const recordedKeys = new Set<string>();
  let pending = new Map<string, PostViewTarget>();
  let timer: unknown = null;

  const flush = async () => {
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    if (pending.size === 0) return;

    const batch = Array.from(pending.values());
    pending = new Map();
    try {
      await send(batch);
    } catch (error) {
      console.error('Post views flush error:', error);
      batch.forEach((target) => recordedKeys.delete(getPostViewKey(target)));
    }
  };

  const markSeen = (target: PostViewTarget) => {
    const key = getPostViewKey(target);
    if (recordedKeys.has(key)) return;
    recordedKeys.add(key);
    pending.set(key, target);

    if (pending.size >= POST_VIEW_MAX_BATCH) {
      void flush();
      return;
    }
    if (timer === null) {
      timer = schedule(() => {
        timer = null;
        void flush();
      }, flushDelayMs);
    }
  };

  return { markSeen, flush };
};

export const postViewRecorder = createPostViewRecorder({ send: recordPostViews });
