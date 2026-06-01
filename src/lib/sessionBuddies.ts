import { supabase } from './supabase';

export type SessionBuddy = {
  id: string;
  sessionId: string;
  buddyUserId: string;
  username: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
};

export type MutualMateOption = {
  id: string;
  username: string | null;
  avatarUrl: string | null;
};

type SessionBuddyRow = {
  id?: string | null;
  session_id?: string | null;
  buddy_user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
};

type FollowOutRow = { following_id: string };
type FollowInRow = { follower_id: string };

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const mapSessionBuddyRow = (row: SessionBuddyRow): SessionBuddy => ({
  id: toCleanString(row.id) || '',
  sessionId: toCleanString(row.session_id) || '',
  buddyUserId: toCleanString(row.buddy_user_id) || '',
  username: toCleanString(row.username),
  avatarUrl: toCleanString(row.avatar_url),
  createdAt: toCleanString(row.created_at),
});

export const formatDrinkingBuddyNames = (
  buddies: Array<Pick<SessionBuddy, 'username'> | { username?: string | null }> = []
) => {
  const names = buddies
    .map((buddy) => toCleanString(buddy.username) || 'Someone')
    .filter(Boolean);

  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
};

export const fetchSessionBuddySummaries = async (sessionIds: string[]) => {
  const cleanSessionIds = Array.from(new Set(sessionIds.map(toCleanString).filter(Boolean))) as string[];
  const bySession = new Map<string, SessionBuddy[]>();
  if (cleanSessionIds.length === 0) return bySession;

  const { data, error } = await supabase.rpc('get_session_buddy_summaries', {
    session_ids: cleanSessionIds,
  });

  if (error) throw error;

  ((data || []) as SessionBuddyRow[]).forEach((row) => {
    const buddy = mapSessionBuddyRow(row);
    if (!buddy.sessionId) return;
    const existing = bySession.get(buddy.sessionId) || [];
    existing.push(buddy);
    bySession.set(buddy.sessionId, existing);
  });

  return bySession;
};

export const fetchSessionBuddies = async (sessionId: string) => {
  const summaries = await fetchSessionBuddySummaries([sessionId]);
  return summaries.get(sessionId) || [];
};

export const fetchMutualMateOptions = async (currentUserId: string): Promise<MutualMateOption[]> => {
  const [followingResult, followersResult] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', currentUserId),
    supabase.from('follows').select('follower_id').eq('following_id', currentUserId),
  ]);

  if (followingResult.error) throw followingResult.error;
  if (followersResult.error) throw followersResult.error;

  const followers = new Set(((followersResult.data || []) as FollowInRow[]).map((row) => row.follower_id));
  const mutualIds = Array.from(new Set(
    ((followingResult.data || []) as FollowOutRow[])
      .map((row) => row.following_id)
      .filter((id) => followers.has(id))
  ));

  if (mutualIds.length === 0) return [];

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', mutualIds)
    .order('username', { ascending: true });

  if (error) throw error;

  return ((profiles || []) as Array<{ id: string; username?: string | null; avatar_url?: string | null }>).map((profile) => ({
    id: profile.id,
    username: profile.username || null,
    avatarUrl: profile.avatar_url || null,
  }));
};

export const setSessionBuddies = async (sessionId: string, buddyUserIds: string[]) => {
  const { error } = await supabase.rpc('set_session_buddies', {
    target_session_id: sessionId,
    buddy_user_ids: Array.from(new Set(buddyUserIds)),
  });

  if (error) throw error;
  return fetchSessionBuddies(sessionId);
};

export const declineSessionBuddy = async (sessionBuddyId: string) => {
  const { data, error } = await supabase.rpc('decline_session_buddy', {
    target_session_buddy_id: sessionBuddyId,
  });

  if (error) throw error;
  return data ? mapSessionBuddyRow(data as SessionBuddyRow) : null;
};
