export const PUSH_REMINDER_SEEN_KEY_PREFIX = 'beerva.pushReminder.seen';

export type PushReminderStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export type PushReminderPermission = 'unsupported' | 'default' | 'denied' | 'granted' | 'prompt';

export type PushReminderSupportInfo = {
  supported: boolean;
};

type PushReminderEligibilityInput = {
  userId: string | null | undefined;
  support: PushReminderSupportInfo;
  permission: PushReminderPermission;
  subscribed: boolean;
  storage: PushReminderStorage | null;
};

const normalizeUserId = (userId: string) => userId.trim();

export const getPushReminderSeenKey = (userId: string) => {
  return `${PUSH_REMINDER_SEEN_KEY_PREFIX}.${normalizeUserId(userId)}`;
};

export const getPushReminderStorage = (): PushReminderStorage | null => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const hasSeenPushReminder = (
  storage: PushReminderStorage | null,
  userId: string | null | undefined
) => {
  if (!storage || !userId?.trim()) return false;

  return storage.getItem(getPushReminderSeenKey(userId)) === '1';
};

export const rememberPushReminderSeen = (
  storage: PushReminderStorage | null,
  userId: string | null | undefined
) => {
  if (!storage || !userId?.trim()) return;

  storage.setItem(getPushReminderSeenKey(userId), '1');
};

export const shouldShowPushReminder = ({
  userId,
  support,
  permission,
  subscribed,
  storage,
}: PushReminderEligibilityInput) => {
  if (!userId?.trim()) return false;
  if (!storage) return false;
  if (!support.supported) return false;
  if (subscribed) return false;
  if (permission === 'denied' || permission === 'unsupported') return false;

  return !hasSeenPushReminder(storage, userId);
};
