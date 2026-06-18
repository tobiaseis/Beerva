export const CHALLENGE_STATUS = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;

export const CHALLENGE_TYPE = {
  TARGET: 'target',
  LEADERBOARD: 'leaderboard',
} as const;

export const CHALLENGE_LEADERBOARD_SCOPE = {
  LOCAL: 'local',
  GLOBAL: 'global',
} as const;

export type ChallengeStatus = typeof CHALLENGE_STATUS[keyof typeof CHALLENGE_STATUS];
export type ChallengeType = typeof CHALLENGE_TYPE[keyof typeof CHALLENGE_TYPE];
export type ChallengeLeaderboardScope = typeof CHALLENGE_LEADERBOARD_SCOPE[keyof typeof CHALLENGE_LEADERBOARD_SCOPE];
export type ChallengeMetricType = 'true_pints' | 'alcohol_units';

export type ChallengeSummaryRow = {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  metric_type?: ChallengeMetricType | string | null;
  challenge_type?: ChallengeType | string | null;
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

export type ChallengeLeaderboardScopeRow = {
  entrants_count?: number | string | null;
  current_user_rank?: number | string | null;
  leaderboard?: ChallengeLeaderboardRow[] | null;
};

export type ChallengeDetailRow = ChallengeSummaryRow & {
  leaderboards?: {
    local?: ChallengeLeaderboardScopeRow | null;
    global?: ChallengeLeaderboardScopeRow | null;
  } | null;
};

export type ChallengeSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  metricType: ChallengeMetricType;
  challengeType: ChallengeType;
  targetValue: number | null;
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

export type ChallengeLeaderboard = {
  entrantsCount: number;
  currentUserRank: number | null;
  entries: ChallengeLeaderboardEntry[];
};

export type ChallengeDetail = ChallengeSummary & {
  leaderboards: Record<ChallengeLeaderboardScope, ChallengeLeaderboard>;
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
  value === 'alcohol_units' ? 'alcohol_units' : 'true_pints'
);

const toChallengeType = (value: string | null | undefined): ChallengeType => (
  value === CHALLENGE_TYPE.LEADERBOARD ? CHALLENGE_TYPE.LEADERBOARD : CHALLENGE_TYPE.TARGET
);

const toTargetValue = (value: number | string | null | undefined, challengeType: ChallengeType) => {
  if (challengeType === CHALLENGE_TYPE.LEADERBOARD) return null;
  return toNumber(value);
};

export const isLeaderboardChallenge = (challenge: { challengeType?: ChallengeType | string | null }) => (
  challenge.challengeType === CHALLENGE_TYPE.LEADERBOARD
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
  target: number | string | null | undefined,
  challengeType: ChallengeType = CHALLENGE_TYPE.TARGET,
  metricType: ChallengeMetricType | string | null | undefined = 'true_pints'
) => {
  const progressValue = toNumber(progress).toFixed(1);
  if (challengeType === CHALLENGE_TYPE.LEADERBOARD) {
    return `${progressValue} true pints`;
  }

  const targetValue = toNumber(target).toFixed(0);
  if (metricType === 'alcohol_units') {
    return `${progressValue}/${targetValue} units`;
  }

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

export const getChallengePreJoinCopy = (
  challenge: Pick<ChallengeSummary, 'challengeType' | 'slug'> | { challengeType?: ChallengeType | string | null; slug?: string | null }
) => (
  challenge.slug === 'karnevalsdruk-2026'
    ? 'Join to count your Karneval drinks from the full 06:00 to 06:00 window.'
    : 'Join this challenge to track your progress.'
);

export const getLeaderboardEntryMeta = (
  entry: Pick<ChallengeLeaderboardEntry, 'completed' | 'progressValue'> | { completed?: boolean | null; progressValue?: number | string | null },
  challenge: Pick<ChallengeSummary, 'challengeType' | 'metricType'> | { challengeType?: ChallengeType | string | null; metricType?: ChallengeMetricType | string | null }
) => {
  if (isLeaderboardChallenge(challenge)) {
    return formatChallengeProgress(entry.progressValue, null, CHALLENGE_TYPE.LEADERBOARD);
  }

  return entry.completed ? 'Completed' : 'In progress';
};

export const mapChallengeSummaryRow = (row: ChallengeSummaryRow): ChallengeSummary => {
  const challengeType = toChallengeType(row.challenge_type);
  const mapped = {
    id: toStringOrNull(row.id) || 'unknown',
    slug: toStringOrNull(row.slug) || 'unknown',
    title: toStringOrNull(row.title) || 'Challenge',
    description: toStringOrNull(row.description) || '',
    metricType: toMetricType(row.metric_type),
    challengeType,
    targetValue: toTargetValue(row.target_value, challengeType),
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

const mapChallengeLeaderboardScopeRow = (
  row: ChallengeLeaderboardScopeRow | null | undefined
): ChallengeLeaderboard => ({
  entrantsCount: toInteger(row?.entrants_count),
  currentUserRank: toIntegerOrNull(row?.current_user_rank),
  entries: (row?.leaderboard || []).map(mapChallengeLeaderboardRow),
});

export const mapChallengeDetailRow = (row: ChallengeDetailRow): ChallengeDetail => ({
  ...mapChallengeSummaryRow(row),
  leaderboards: {
    [CHALLENGE_LEADERBOARD_SCOPE.LOCAL]: mapChallengeLeaderboardScopeRow(row.leaderboards?.local),
    [CHALLENGE_LEADERBOARD_SCOPE.GLOBAL]: mapChallengeLeaderboardScopeRow(row.leaderboards?.global),
  },
});
