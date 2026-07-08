import { Platform } from 'react-native';

import { getChallengeLaunchParamsFromSearch } from './challengeLaunchParams';
import { getPostLaunchParamsFromSearch } from './postTargets';

// Supported push launch markers: notifications=1, post_type, hangover=1, chug_verification=1, challenge=.
export type NativeNotificationTarget =
  | { kind: 'notifications'; notificationId?: string | null }
  | { kind: 'record' }
  | { kind: 'post'; targetType: 'session' | 'pub_crawl'; targetId: string; notificationId?: string | null }
  | { kind: 'hangover'; targetType: 'session' | 'pub_crawl'; targetId: string; notificationId?: string | null }
  | { kind: 'chugVerification'; attemptId: string; notificationId?: string | null }
  | { kind: 'adminTools'; initialSegment: 'submissions'; notificationId?: string | null }
  | { kind: 'challenge'; challengeSlug: string; notificationId?: string | null };

const getSearchFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.search || '';
  } catch {
    const queryIndex = url.indexOf('?');
    return queryIndex === -1 ? '' : url.slice(queryIndex);
  }
};

const cleanString = (value: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const getNativeNotificationTargetFromUrl = (url?: string | null): NativeNotificationTarget | null => {
  if (!url) return null;
  const search = getSearchFromUrl(url);
  const params = new URLSearchParams(search);

  const challenge = getChallengeLaunchParamsFromSearch(search);
  if (challenge) {
    return { kind: 'challenge', challengeSlug: challenge.challengeSlug, notificationId: challenge.notificationId };
  }

  const post = getPostLaunchParamsFromSearch(search);
  if (post) {
    return {
      kind: 'post',
      targetType: post.targetType,
      targetId: post.targetId,
      notificationId: post.notificationId,
    };
  }

  if (params.get('hangover') === '1') {
    const targetType = params.get('target_type') === 'pub_crawl' ? 'pub_crawl' : 'session';
    const targetId = cleanString(params.get('target_id') || params.get('id'));
    if (targetId) {
      return {
        kind: 'hangover',
        targetType,
        targetId,
        notificationId: cleanString(params.get('notificationId')),
      };
    }
  }

  if (params.get('chug_verification') === '1') {
    const attemptId = cleanString(params.get('attempt_id') || params.get('id'));
    if (attemptId) {
      return {
        kind: 'chugVerification',
        attemptId,
        notificationId: cleanString(params.get('notificationId')),
      };
    }
  }

  if (params.get('beverage_submission') === '1') {
    return {
      kind: 'adminTools',
      initialSegment: 'submissions',
      notificationId: cleanString(params.get('notificationId')),
    };
  }

  if (params.get('tab') === 'record') {
    return { kind: 'record' };
  }

  if (params.get('notifications') === '1') {
    return {
      kind: 'notifications',
      notificationId: cleanString(params.get('notificationId')),
    };
  }

  if (url.startsWith('beerva://open')) {
    return { kind: 'notifications' };
  }

  return null;
};

const getTargetFromNotificationResponse = (response: any) => {
  const url = response?.notification?.request?.content?.data?.url;
  return typeof url === 'string' ? getNativeNotificationTargetFromUrl(url) : null;
};

export const consumeInitialNativeNotificationTarget = async () => {
  if (Platform.OS === 'web') return null;
  const Notifications = await import('expo-notifications');
  const response = await Notifications.getLastNotificationResponseAsync();
  return getTargetFromNotificationResponse(response);
};

export const subscribeToNativeNotificationTargets = (
  listener: (target: NativeNotificationTarget) => void
) => {
  if (Platform.OS === 'web') {
    return { remove: () => {} };
  }

  let active = true;
  let subscription: { remove: () => void } | null = null;

  import('expo-notifications').then((Notifications) => {
    if (!active) return;
    subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = getTargetFromNotificationResponse(response);
      if (target) listener(target);
    });
  }).catch((error) => {
    console.warn('Could not subscribe to native notification responses', error);
  });

  return {
    remove: () => {
      active = false;
      subscription?.remove();
    },
  };
};
