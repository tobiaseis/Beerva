export type ChallengeLaunchParams = {
  challengeSlug: string;
  notificationId: string | null;
};

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getChallengeLaunchParamsFromSearch = (
  search: string
): ChallengeLaunchParams | null => {
  const params = new URLSearchParams(search);
  const challengeSlug = toCleanString(params.get('challenge'));
  if (!challengeSlug) return null;

  return {
    challengeSlug,
    notificationId: toCleanString(params.get('notificationId')),
  };
};
