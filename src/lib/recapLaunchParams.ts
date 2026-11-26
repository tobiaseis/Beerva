// Parses "?recap=YYYY-MM-DD&notificationId=..." from push links. Kept free of
// imports so the web and Android routing code can share it.

export type RecapLaunchParams = {
  weekStart: string;
  notificationId: string | null;
};

const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const getRecapLaunchParamsFromSearch = (search: string): RecapLaunchParams | null => {
  const params = new URLSearchParams(search);
  const weekStart = params.get('recap')?.trim() || '';
  if (!WEEK_START_PATTERN.test(weekStart)) return null;

  return {
    weekStart,
    notificationId: params.get('notificationId')?.trim() || null,
  };
};
