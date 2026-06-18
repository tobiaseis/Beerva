import type { AdminBeverage, AdminBeverageCategory, AdminChallenge, AdminChallengeType, AdminModerationDrink } from './adminApi';

export type AdminBeverageDraft = {
  id?: string;
  name: string;
  abv: string;
  category: AdminBeverageCategory;
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

export type AdminOfficialPostDraft = {
  title: string;
  body: string;
  linkedChallengeId: string | null;
  sendInAppNotification: boolean;
  notificationBody: string;
  sendPushNotification: boolean;
  pushTitle: string;
  pushBody: string;
};

type OfficialPostChallengePrefillInput = {
  id: string;
  slug: string;
  title: string;
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

export const createEmptyBeverageDraft = (): AdminBeverageDraft => ({
  name: '',
  abv: '',
  category: 'beer',
});

export const adminBeverageToDraft = (beverage: AdminBeverage): AdminBeverageDraft => ({
  id: beverage.id,
  name: beverage.name,
  abv: `${beverage.abv}`,
  category: beverage.category,
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

export const createEmptyOfficialPostDraft = (): AdminOfficialPostDraft => ({
  title: '',
  body: '',
  linkedChallengeId: null,
  sendInAppNotification: false,
  notificationBody: '',
  sendPushNotification: false,
  pushTitle: '',
  pushBody: '',
});

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

export const validateBeverageDraft = (draft: Pick<AdminBeverageDraft, 'name' | 'abv' | 'category'>) => {
  if (!draft.name.trim()) return 'Beverage name is required.';
  if (!['beer', 'wine', 'drink'].includes(draft.category)) return 'Choose a beverage category.';

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
      return 'Target units must be greater than 0.';
    }
  }

  if (draft.challengeType === 'leaderboard' && draft.winnerTrophyEnabled) {
    if (!draft.winnerTrophyTitle.trim()) return 'Trophy title is required.';
    if (!draft.winnerTrophyDescription.trim()) return 'Trophy description is required.';
  }

  return null;
};

const getOfficialPostChallengePrefill = (challenge: OfficialPostChallengePrefillInput) => {
  if (
    challenge.slug.trim().toLowerCase() === 'booze-in-june'
    || challenge.title.trim().toLowerCase() === 'booze-in-june'
  ) {
    const pushBody = 'Booze-in-June is live. Tap to join before your first beer starts counting itself lonely.';
    return {
      title: 'Booze-in-June has begun',
      body: 'June is here, the taps are flowing, and your liver has been assigned a side quest. Join Booze-in-June, log your beers, and prove your pintsmanship before the month runs dry.',
      notificationBody: pushBody,
      pushTitle: 'New June challenge',
      pushBody,
    };
  }

  const pushBody = `${challenge.title} is live. Tap to join the challenge.`;
  return {
    title: `${challenge.title} has begun`,
    body: `${challenge.title} is live. Join the challenge and log your drinks to take part.`,
    notificationBody: pushBody,
    pushTitle: `New challenge: ${challenge.title}`,
    pushBody,
  };
};

export const applyOfficialPostChallengePrefill = (
  draft: AdminOfficialPostDraft,
  challenge: OfficialPostChallengePrefillInput
): AdminOfficialPostDraft => {
  const prefill = getOfficialPostChallengePrefill(challenge);
  return {
    ...draft,
    linkedChallengeId: challenge.id,
    title: draft.title.trim() ? draft.title : prefill.title,
    body: draft.body.trim() ? draft.body : prefill.body,
    notificationBody: draft.notificationBody.trim() ? draft.notificationBody : prefill.notificationBody,
    pushTitle: draft.pushTitle.trim() ? draft.pushTitle : prefill.pushTitle,
    pushBody: draft.pushBody.trim() ? draft.pushBody : prefill.pushBody,
  };
};

export const validateOfficialPostDraft = (draft: AdminOfficialPostDraft) => {
  if (!draft.title.trim()) return 'Official post title is required.';
  if (!draft.body.trim()) return 'Official post body is required.';
  if (draft.sendPushNotification && !draft.sendInAppNotification) {
    return 'Enable in-app notifications before sending a push.';
  }
  if (draft.sendInAppNotification && !draft.notificationBody.trim()) {
    return 'Notification body is required.';
  }
  if (draft.sendPushNotification && !draft.pushTitle.trim()) return 'Push title is required.';
  if (draft.sendPushNotification && !draft.pushBody.trim()) return 'Push body is required.';
  return null;
};

const formatModerationDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function getAdminModerationDrinkTitle(drink: AdminModerationDrink): string {
  const quantity = drink.quantity > 1 ? `${drink.quantity} x ` : '';
  return `${quantity}${drink.beerName}`;
}

export function getAdminModerationDrinkMeta(drink: AdminModerationDrink): string {
  const parts = [
    drink.username || 'Unknown user',
    drink.volume,
    drink.abv === null ? null : `${drink.abv}% ABV`,
    drink.pubName,
    formatModerationDate(drink.consumedAt || drink.sessionStartedAt || drink.sessionCreatedAt),
  ].filter(Boolean);

  return parts.join(' - ');
}
