import { TrophyDefinition } from './profileStats';

export type ChallengeAwardRow = {
  id?: string | null;
  challenge_id?: string | null;
  user_id?: string | null;
  award_slug?: string | null;
  title?: string | null;
  description?: string | null;
  rank?: number | string | null;
  progress_value?: number | string | null;
  metadata?: Record<string, unknown> | null;
  awarded_at?: string | null;
};

const toStringOrNull = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const mapChallengeAwardRow = (row: ChallengeAwardRow): TrophyDefinition => {
  const awardSlug = toStringOrNull(row.award_slug) || toStringOrNull(row.id) || 'challenge-award';

  return {
    id: `challenge-award-${awardSlug}`,
    title: toStringOrNull(row.title) || 'Challenge Award',
    description: toStringOrNull(row.description) || 'Won an official Beerva challenge.',
    kind: 'challenge',
    earned: true,
  };
};
