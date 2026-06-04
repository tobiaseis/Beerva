import { supabase } from './supabase';

export type LiveMateSession = {
  id: string;
  userId: string;
  sessionId: string;
  pubCrawlId: string | null;
  username: string | null;
  avatarUrl: string | null;
  currentPubName: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  truePints: number;
  isPubCrawl: boolean;
};

type LiveMateSessionRow = {
  id?: string | null;
  user_id?: string | null;
  session_id?: string | null;
  pub_crawl_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  current_pub_name?: string | null;
  started_at?: string | null;
  last_activity_at?: string | null;
  true_pints?: number | string | null;
  is_pub_crawl?: boolean | null;
};

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const mapLiveMateSessionRow = (row: LiveMateSessionRow): LiveMateSession => ({
  id: toCleanString(row.id) || '',
  userId: toCleanString(row.user_id) || '',
  sessionId: toCleanString(row.session_id) || '',
  pubCrawlId: toCleanString(row.pub_crawl_id),
  username: toCleanString(row.username),
  avatarUrl: toCleanString(row.avatar_url),
  currentPubName: toCleanString(row.current_pub_name),
  startedAt: toCleanString(row.started_at),
  lastActivityAt: toCleanString(row.last_activity_at),
  truePints: toNumber(row.true_pints),
  isPubCrawl: Boolean(row.is_pub_crawl),
});

export const fetchLiveMateSessions = async (): Promise<LiveMateSession[]> => {
  const { data, error } = await supabase.rpc('get_live_mate_sessions');
  if (error) throw error;

  return ((data || []) as LiveMateSessionRow[])
    .map(mapLiveMateSessionRow)
    .filter((session) => session.id && session.userId && session.sessionId);
};

export const formatLiveMateCount = (count: number) => `${Math.max(0, count)} drinking now`;

export const formatLiveTruePints = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safeValue * 10) / 10;
  const label = rounded === 1 ? 'true pint' : 'true pints';
  return `${rounded.toFixed(1)} ${label}`;
};

export const getLiveMateDisplayName = (session: Pick<LiveMateSession, 'username'>) => (
  toCleanString(session.username) || 'Someone'
);

export const getLiveMatePubName = (session: Pick<LiveMateSession, 'currentPubName'>) => (
  toCleanString(session.currentPubName) || 'Somewhere'
);

export const formatLiveStartedLabel = (
  startedAt: string | null,
  now: Date = new Date()
) => {
  const started = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const elapsedMs = now.getTime() - started;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 'Just started';

  const totalMinutes = Math.max(1, Math.floor(elapsedMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};
