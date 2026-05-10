export type PubLegendRow = {
  pub_key?: string | null;
  pub_id?: string | null;
  pub_name?: string | null;
  city?: string | null;
  address?: string | null;
  session_count?: number | string | null;
  unique_drinker_count?: number | string | null;
  top_true_pints?: number | string | null;
  champion_user_id?: string | null;
  champion_username?: string | null;
  champion_avatar_url?: string | null;
  champion_session_id?: string | null;
  champion_at?: string | null;
};

export type PubLegend = {
  pubKey: string;
  pubId: string | null;
  pubName: string;
  city: string | null;
  address: string | null;
  sessionCount: number;
  uniqueDrinkerCount: number;
  topTruePints: number;
  championUserId: string | null;
  championUsername: string | null;
  championAvatarUrl: string | null;
  championSessionId: string | null;
  championAt: string | null;
};

export type PubKingSessionRow = {
  rank?: number | string | null;
  user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  session_id?: string | null;
  true_pints?: number | string | null;
  drink_count?: number | string | null;
  session_started_at?: string | null;
  published_at?: string | null;
};

export type PubKingSession = {
  rank: number;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  sessionId: string;
  truePints: number;
  drinkCount: number;
  sessionStartedAt: string | null;
  publishedAt: string | null;
};

const toNumber = (value: number | string | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toInteger = (value: number | string | null | undefined) => Math.round(toNumber(value));

const toStringOrNull = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const formatTruePints = (value: number | string | null | undefined) => {
  const rounded = toNumber(value).toFixed(1);
  return `${rounded} true ${rounded === '1.0' ? 'pint' : 'pints'}`;
};

export const mapPubLegendRow = (row: PubLegendRow): PubLegend => ({
  pubKey: toStringOrNull(row.pub_key) || toStringOrNull(row.pub_id) || toStringOrNull(row.pub_name) || 'unknown',
  pubId: toStringOrNull(row.pub_id),
  pubName: toStringOrNull(row.pub_name) || 'Unknown pub',
  city: toStringOrNull(row.city),
  address: toStringOrNull(row.address),
  sessionCount: toInteger(row.session_count),
  uniqueDrinkerCount: toInteger(row.unique_drinker_count),
  topTruePints: toNumber(row.top_true_pints),
  championUserId: toStringOrNull(row.champion_user_id),
  championUsername: toStringOrNull(row.champion_username),
  championAvatarUrl: toStringOrNull(row.champion_avatar_url),
  championSessionId: toStringOrNull(row.champion_session_id),
  championAt: toStringOrNull(row.champion_at),
});

export const mapPubKingSessionRow = (row: PubKingSessionRow): PubKingSession => ({
  rank: toInteger(row.rank),
  userId: toStringOrNull(row.user_id) || 'unknown',
  username: toStringOrNull(row.username),
  avatarUrl: toStringOrNull(row.avatar_url),
  sessionId: toStringOrNull(row.session_id) || 'unknown',
  truePints: toNumber(row.true_pints),
  drinkCount: toInteger(row.drink_count),
  sessionStartedAt: toStringOrNull(row.session_started_at),
  publishedAt: toStringOrNull(row.published_at),
});
