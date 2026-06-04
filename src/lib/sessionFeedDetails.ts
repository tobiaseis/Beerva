import { SessionBeer } from './sessionBeers';
import { SessionPhoto } from './sessionPhotos';
import { supabase } from './supabase';
import { withTimeout } from './timeouts';

const SESSION_FEED_DETAILS_TIMEOUT_MS = 15000;

export type FeedDetailAuthor = {
  username: string | null;
  avatarUrl: string | null;
};

export type FeedDetailCheer = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
};

export type FeedDetailComment = {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  username: string | null;
  avatarUrl: string | null;
};

export type SessionFeedDetail = {
  sessionId: string;
  author: FeedDetailAuthor | null;
  cheers: FeedDetailCheer[];
  cheersCount: number;
  comments: FeedDetailComment[];
  commentsCount: number;
  beers: SessionBeer[];
  photos: SessionPhoto[];
  authorCurrentStreak: number;
};

type SessionFeedDetailRow = {
  session_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  cheers_count: number | null;
  cheers: unknown;
  beers: unknown;
  comments: unknown;
  photos: unknown;
  author_current_streak?: number | null;
};

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const mapSessionFeedDetailRow = (row: SessionFeedDetailRow): SessionFeedDetail => {
  const cheers: FeedDetailCheer[] = asArray<any>(row.cheers).map((cheer) => ({
    userId: cheer.user_id,
    username: cheer.username ?? null,
    avatarUrl: cheer.avatar_url ?? null,
    createdAt: cheer.created_at ?? null,
  }));

  const comments: FeedDetailComment[] = asArray<any>(row.comments).map((comment) => ({
    id: comment.id,
    userId: comment.user_id,
    body: comment.body,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at ?? null,
    username: comment.username ?? null,
    avatarUrl: comment.avatar_url ?? null,
  }));

  const hasAuthor = row.author_username !== null || row.author_avatar_url !== null;

  return {
    sessionId: row.session_id,
    author: hasAuthor
      ? { username: row.author_username, avatarUrl: row.author_avatar_url }
      : null,
    cheers,
    cheersCount: row.cheers_count ?? cheers.length,
    comments,
    commentsCount: comments.length,
    beers: asArray<SessionBeer>(row.beers),
    photos: asArray<SessionPhoto>(row.photos),
    authorCurrentStreak: Number(row.author_current_streak || 0),
  };
};

export const fetchSessionFeedDetails = async (
  sessionIds: string[]
): Promise<Map<string, SessionFeedDetail>> => {
  const bySession = new Map<string, SessionFeedDetail>();
  const cleanIds = Array.from(new Set(sessionIds.filter(Boolean)));
  if (cleanIds.length === 0) return bySession;

  const { data, error } = await withTimeout(
    supabase.rpc('get_session_feed_details', { session_ids: cleanIds }),
    SESSION_FEED_DETAILS_TIMEOUT_MS,
    'Feed details are taking too long.'
  );

  if (error) throw error;

  ((data || []) as SessionFeedDetailRow[]).forEach((row) => {
    const detail = mapSessionFeedDetailRow(row);
    if (detail.sessionId) bySession.set(detail.sessionId, detail);
  });

  return bySession;
};
