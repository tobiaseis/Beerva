export type OfficialFeedPostRow = {
  id?: string | null;
  challenge_id?: string | null;
  linked_challenge_id?: string | null;
  kind?: string | null;
  title?: string | null;
  body?: string | null;
  image_url?: string | null;
  metadata?: Record<string, unknown> | null;
  published_at?: string | null;
  created_at?: string | null;
};

export type OfficialFeedPost = {
  id: string;
  challengeId: string | null;
  linkedChallengeId: string | null;
  kind: string;
  title: string;
  body: string;
  imageUrl: string | null;
  winnerUserId: string | null;
  winnerUsername: string | null;
  winnerAvatarUrl: string | null;
  truePints: number;
  drinkCount: number;
  averageAbv: number;
  sessionCount: number;
  challengeSlug: string | null;
  publishedAt: string;
  createdAt: string;
  raw: OfficialFeedPostRow;
};

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toStringOrNull = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const formatOfficialWinnerStat = (
  label: string,
  value: number | string | null | undefined,
  suffix = ''
) => {
  const parsed = toNumber(value);
  const formatted = Number.isInteger(parsed) ? `${parsed}` : parsed.toFixed(1);
  return `${label} ${formatted}${suffix}`;
};

export const isOfficialWinnerPost = (post: Pick<OfficialFeedPost, 'kind'>) => (
  post.kind === 'challenge_winner'
);

export const mapOfficialFeedPostRow = (row: OfficialFeedPostRow): OfficialFeedPost => {
  const metadata = row.metadata || {};

  return {
    id: toStringOrNull(row.id) || 'unknown',
    challengeId: toStringOrNull(row.challenge_id),
    linkedChallengeId: toStringOrNull(row.linked_challenge_id),
    kind: toStringOrNull(row.kind) || 'official',
    title: toStringOrNull(row.title) || 'Official Beerva',
    body: toStringOrNull(row.body) || '',
    imageUrl: toStringOrNull(row.image_url),
    winnerUserId: toStringOrNull(metadata.winner_user_id),
    winnerUsername: toStringOrNull(metadata.winner_username),
    winnerAvatarUrl: toStringOrNull(metadata.winner_avatar_url),
    truePints: toNumber(metadata.true_pints),
    drinkCount: Math.round(toNumber(metadata.drink_count)),
    averageAbv: toNumber(metadata.average_abv),
    sessionCount: Math.round(toNumber(metadata.session_count)),
    challengeSlug: toStringOrNull(metadata.challenge_slug),
    publishedAt: toStringOrNull(row.published_at) || '',
    createdAt: toStringOrNull(row.created_at) || '',
    raw: row,
  };
};
