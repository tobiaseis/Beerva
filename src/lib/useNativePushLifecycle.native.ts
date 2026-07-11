import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

import { syncPushSubscription } from './pushNotifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const repairNativePushToken = () => {
  syncPushSubscription().then((result) => {
    if (!result.ok && !['permission-not-granted', 'not-signed-in'].includes(result.reason || '')) {
      console.warn('Could not synchronize native push token:', result.reason);
    }
  }).catch((error) => {
    console.warn('Could not synchronize native push token:', error);
  });
};

export const useNativePushLifecycle = (userId: string | null) => {
  useEffect(() => {
    if (!userId) return undefined;

    repairNativePushToken();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') repairNativePushToken();
    });

    return () => subscription.remove();
  }, [userId]);
};
