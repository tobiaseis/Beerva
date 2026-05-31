import type { AdminBeverage, AdminChallenge, AdminChallengeType } from './adminApi';

export type AdminBeerDraft = {
  id?: string;
  name: string;
  abv: string;
};

export type AdminChallengeDraft = {
  id?: string;
  title: string;
  description: string;
  challengeType: AdminChallengeType;
  targetValue: string;
  startsAt: string;
  endsAt: string;
  joinClosesAt: string;
  winnerTrophyEnabled: boolean;
  winnerTrophyTitle: string;
  winnerTrophyDescription: string;
};

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export const toLocalDateTimeInput = (
  isoValue?: string | null,
  offsetMinutes = new Date().getTimezoneOffset()
) => {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 16);
};

export const fromLocalDateTimeInput = (
  value: string,
  offsetMinutes = new Date().getTimezoneOffset()
) => {
  const match = value.trim().match(LOCAL_DATE_TIME_PATTERN);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const numericParts = [year, month, day, hour, minute].map(Number);
  const [numericYear, numericMonth, numericDay, numericHour, numericMinute] = numericParts;
  const utcMs = Date.UTC(numericYear, numericMonth - 1, numericDay, numericHour, numericMinute);
  const normalized = new Date(utcMs);

  if (
    normalized.getUTCFullYear() !== numericYear
    || normalized.getUTCMonth() !== numericMonth - 1
    || normalized.getUTCDate() !== numericDay
    || normalized.getUTCHours() !== numericHour
    || normalized.getUTCMinutes() !== numericMinute
  ) {
    return null;
  }

  return new Date(utcMs + offsetMinutes * 60_000).toISOString();
};

export const createEmptyBeerDraft = (): AdminBeerDraft => ({
  name: '',
  abv: '',
});

export const adminBeverageToDraft = (beverage: AdminBeverage): AdminBeerDraft => ({
  id: beverage.id,
  name: beverage.name,
  abv: `${beverage.abv}`,
});

export const createEmptyChallengeDraft = (now = new Date()): AdminChallengeDraft => {
  const startsAt = new Date(now);
  startsAt.setMinutes(0, 0, 0);
  startsAt.setHours(startsAt.getHours() + 1);
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);

  return {
    title: '',
    description: '',
    challengeType: 'target',
    targetValue: '',
    startsAt: toLocalDateTimeInput(startsAt.toISOString()),
    endsAt: toLocalDateTimeInput(endsAt.toISOString()),
    joinClosesAt: toLocalDateTimeInput(endsAt.toISOString()),
    winnerTrophyEnabled: false,
    winnerTrophyTitle: '',
    winnerTrophyDescription: '',
  };
};

export const adminChallengeToDraft = (challenge: AdminChallenge): AdminChallengeDraft => ({
  id: challenge.id,
  title: challenge.title,
  description: challenge.description,
  challengeType: challenge.challengeType,
  targetValue: challenge.targetValue === null ? '' : `${challenge.targetValue}`,
  startsAt: toLocalDateTimeInput(challenge.startsAt),
  endsAt: toLocalDateTimeInput(challenge.endsAt),
  joinClosesAt: toLocalDateTimeInput(challenge.joinClosesAt),
  winnerTrophyEnabled: challenge.winnerTrophyEnabled,
  winnerTrophyTitle: challenge.winnerTrophyTitle || '',
  winnerTrophyDescription: challenge.winnerTrophyDescription || '',
});

export const validateBeerDraft = (draft: Pick<AdminBeerDraft, 'name' | 'abv'>) => {
  if (!draft.name.trim()) return 'Beer name is required.';

  const abv = Number(draft.abv.trim().replace(',', '.'));
  if (!Number.isFinite(abv) || abv < 0 || abv > 100) {
    return 'ABV must be between 0 and 100.';
  }

  return null;
};

export const validateChallengeDraft = (draft: AdminChallengeDraft) => {
  if (!draft.title.trim()) return 'Challenge title is required.';
  if (!draft.description.trim()) return 'Challenge description is required.';

  const startsAt = fromLocalDateTimeInput(draft.startsAt);
  const endsAt = fromLocalDateTimeInput(draft.endsAt);
  const joinClosesAt = fromLocalDateTimeInput(draft.joinClosesAt);
  if (!startsAt || !endsAt || !joinClosesAt) {
    return 'Use YYYY-MM-DDTHH:mm for challenge dates.';
  }

  const startsAtMs = new Date(startsAt).getTime();
  const endsAtMs = new Date(endsAt).getTime();
  const joinClosesAtMs = new Date(joinClosesAt).getTime();
  if (startsAtMs >= endsAtMs) return 'Challenge end must be after its start.';
  if (joinClosesAtMs < startsAtMs || joinClosesAtMs > endsAtMs) {
    return 'Joining must close between the challenge start and end.';
  }

  if (draft.challengeType === 'target') {
    const targetValue = Number(draft.targetValue.trim().replace(',', '.'));
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      return 'Target true pints must be greater than 0.';
    }
  }

  if (draft.challengeType === 'leaderboard' && draft.winnerTrophyEnabled) {
    if (!draft.winnerTrophyTitle.trim()) return 'Trophy title is required.';
    if (!draft.winnerTrophyDescription.trim()) return 'Trophy description is required.';
  }

  return null;
};
