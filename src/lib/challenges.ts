export const CHALLENGE_STATUS = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;

export type ChallengeStatus = typeof CHALLENGE_STATUS[keyof typeof CHALLENGE_STATUS];
export type ChallengeMetricType = 'true_pints';

export type ChallengeSummaryRow = {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  metric_type?: ChallengeMetricType | string | null;
  target_value?: number | string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  join_closes_at?: string | null;
  joined_at?: string | null;
  entrants_count?: number | string | null;
  current_user_rank?: number | string | null;
  current_user_progress?: number | string | null;
};

export type ChallengeLeaderboardRow = {
  rank?: number | string | null;
  user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  progress_value?: number | string | null;
  completed?: boolean | null;
};

export type ChallengeDetailRow = ChallengeSummaryRow & {
  leaderboard?: ChallengeLeaderboardRow[] | null;
};

export type ChallengeSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  metricType: ChallengeMetricType;
  targetValue: number;
  startsAt: string;
  endsAt: string;
  joinClosesAt: string;
  joinedAt: string | null;
  joined: boolean;
  entrantsCount: number;
  currentUserRank: number | null;
  currentUserProgress: number;
  status: ChallengeStatus;
  joinOpen: boolean;
  raw: ChallengeSummaryRow;
};

export type ChallengeLeaderboardEntry = {
  rank: number;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  progressValue: number;
  completed: boolean;
};

export type ChallengeDetail = ChallengeSummary & {
  leaderboard: ChallengeLeaderboardEntry[];
};

const toNumber = (value: number | string | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toInteger = (value: number | string | null | undefined) => Math.round(toNumber(value));

const toIntegerOrNull = (value: number | string | null | undefined) => {
  const parsed = toNumber(value);
  return parsed > 0 ? Math.round(parsed) : null;
};

const toStringOrNull = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toMetricType = (value: string | null | undefined): ChallengeMetricType => (
  value === 'true_pints' ? value : 'true_pints'
);

export const getChallengeStatus = (
  challenge: Pick<ChallengeSummary, 'startsAt' | 'endsAt'> | { startsAt?: string | null; endsAt?: string | null },
  now = new Date()
): ChallengeStatus => {
  const startsAt = new Date(challenge.startsAt || '');
  const endsAt = new Date(challenge.endsAt || '');

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return CHALLENGE_STATUS.ENDED;
  }

  if (now.getTime() < startsAt.getTime()) return CHALLENGE_STATUS.UPCOMING;
  if (now.getTime() >= endsAt.getTime()) return CHALLENGE_STATUS.ENDED;
  return CHALLENGE_STATUS.ACTIVE;
};

export const isChallengeJoinOpen = (
  challenge: { joinClosesAt?: string | null },
  now = new Date()
) => {
  const joinClosesAt = new Date(challenge.joinClosesAt || '');
  return !Number.isNaN(joinClosesAt.getTime()) && now.getTime() < joinClosesAt.getTime();
};

export const formatChallengeProgress = (
  progress: number | string | null | undefined,
  target: number | string | null | undefined
) => {
  const progressValue = toNumber(progress).toFixed(1);
  const targetValue = toNumber(target).toFixed(0);
  return `${progressValue}/${targetValue}`;
};

export const formatChallengeRank = (rank: number | null | undefined) => (
  rank ? `#${rank}` : 'Unranked'
);

export const formatChallengeStatusLabel = (status: ChallengeStatus) => {
  if (status === CHALLENGE_STATUS.UPCOMING) return 'Upcoming';
  if (status === CHALLENGE_STATUS.ENDED) return 'Closed';
  return 'Active';
};

export const mapChallengeSummaryRow = (row: ChallengeSummaryRow): ChallengeSummary => {
  const mapped = {
    id: toStringOrNull(row.id) || 'unknown',
    slug: toStringOrNull(row.slug) || 'unknown',
    title: toStringOrNull(row.title) || 'Challenge',
    description: toStringOrNull(row.description) || '',
    metricType: toMetricType(row.metric_type),
    targetValue: toNumber(row.target_value),
    startsAt: toStringOrNull(row.starts_at) || '',
    endsAt: toStringOrNull(row.ends_at) || '',
    joinClosesAt: toStringOrNull(row.join_closes_at) || '',
    joinedAt: toStringOrNull(row.joined_at),
    joined: Boolean(toStringOrNull(row.joined_at)),
    entrantsCount: toInteger(row.entrants_count),
    currentUserRank: toIntegerOrNull(row.current_user_rank),
    currentUserProgress: toNumber(row.current_user_progress),
    raw: row,
  };

  return {
    ...mapped,
    status: getChallengeStatus(mapped),
    joinOpen: isChallengeJoinOpen(mapped),
  };
};

export const mapChallengeLeaderboardRow = (row: ChallengeLeaderboardRow): ChallengeLeaderboardEntry => ({
  rank: toInteger(row.rank),
  userId: toStringOrNull(row.user_id) || 'unknown',
  username: toStringOrNull(row.username),
  avatarUrl: toStringOrNull(row.avatar_url),
  progressValue: toNumber(row.progress_value),
  completed: row.completed === true,
});

export const mapChallengeDetailRow = (row: ChallengeDetailRow): ChallengeDetail => ({
  ...mapChallengeSummaryRow(row),
  leaderboard: (row.leaderboard || []).map(mapChallengeLeaderboardRow),
});
