import { Platform } from 'react-native';
import { supabase } from './supabase';

// Replace with your VAPID public key (output of `npx web-push generate-vapid-keys`).
// Safe to ship in client code — only the private key must stay secret.
export const VAPID_PUBLIC_KEY = 'BFFNJlO-5vCdNg6M0nLgs2mTcJwy0XWoXQItXu8IvWSbI7z2l09a_lvikodkQK2q1IhjDKAxLxyuWEtdDRG-lAU';

type PushSupportInfo = {
  supported: boolean;
  reason?: string;
  shouldInstall?: boolean;
};

type PushPermissionStatus = 'unsupported' | 'default' | 'denied' | 'granted';

type NativeNotificationModules = {
  Notifications: typeof import('expo-notifications');
  Constants: typeof import('expo-constants').default;
};

let nativePermissionStatusCache: PushPermissionStatus = 'default';

const isNativePushPlatform = () => Platform.OS === 'android';

const isWebPushPlatform = () => {
  if (Platform.OS === 'web') return true;
  return false;
};

const getNativeNotificationModules = async () => {
  const [Notifications, ConstantsModule] = await Promise.all([
    import('expo-notifications'),
    import('expo-constants'),
  ]);

  return {
    Notifications,
    Constants: ConstantsModule.default,
  };
};

const getExpoProjectId = (Constants: NativeNotificationModules['Constants']) => {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = Constants.easConfig?.projectId || extra?.eas?.projectId;

  if (!projectId) {
    throw new Error('Expo project id is missing. Run eas build:configure before building the APK.');
  }

  return projectId;
};

const ensureAndroidNotificationChannel = async (
  Notifications: NativeNotificationModules['Notifications']
) => {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Beerva',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [120, 60, 120],
    lightColor: '#F5C542',
  });
};

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const isStandalonePwa = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
};

const isServiceWorkerSupported = (): boolean => (
  isWebPushPlatform()
  && typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
);

export const getPushSupportInfo = (): PushSupportInfo => {
  if (isNativePushPlatform()) {
    return { supported: true };
  }

  if (Platform.OS !== 'web') {
    return { supported: false, reason: 'Push notifications are only configured for web and Android.' };
  }

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'Push notifications are not available yet.' };
  }

  const userAgent = navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  const hasRequiredApis = (
    isServiceWorkerSupported() &&
    'PushManager' in window &&
    'Notification' in window
  );

  if (hasRequiredApis) {
    return { supported: true };
  }

  if (isIos && !isStandalonePwa()) {
    return {
      supported: false,
      shouldInstall: true,
      reason: 'Install Beerva to your home screen to enable push notifications on iPhone or iPad.',
    };
  }

  return { supported: false, reason: 'Push notifications are not supported by this browser.' };
};

export const isPushSupported = (): boolean => {
  return getPushSupportInfo().supported;
};

export const getPushPermissionStatus = (): PushPermissionStatus => {
  if (isNativePushPlatform()) return nativePermissionStatusCache;
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
};

let waitingServiceWorker: ServiceWorker | null = null;
let serviceWorkerUpdateFlowAttached = false;
let pushSubscriptionRepairFlowAttached = false;

const attachServiceWorkerUpdateFlow = (registration: ServiceWorkerRegistration) => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || typeof window === 'undefined') {
    return;
  }

  if (serviceWorkerUpdateFlowAttached) return;
  serviceWorkerUpdateFlowAttached = true;

  const hadControllerAtStartup = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadControllerAtStartup || reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        waitingServiceWorker = newWorker;
        window.dispatchEvent(new Event('appUpdateAvailable'));
      }
    });
  });
};

const attachPushSubscriptionRepairFlow = () => {
  if (
    Platform.OS !== 'web'
    || typeof window === 'undefined'
    || typeof document === 'undefined'
    || typeof navigator === 'undefined'
    || !('serviceWorker' in navigator)
  ) {
    return;
  }

  if (pushSubscriptionRepairFlowAttached) return;
  pushSubscriptionRepairFlowAttached = true;

  const syncCurrentPushSubscription = () => {
    syncPushSubscription().catch((error) => {
      console.warn('Could not sync push subscription', error);
    });
  };

  window.addEventListener('focus', syncCurrentPushSubscription);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncCurrentPushSubscription();
    }
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_PUSH_SUBSCRIPTION') {
      syncCurrentPushSubscription();
    }
  });

  syncCurrentPushSubscription();
};

export const applyServiceWorkerUpdate = () => {
  if (waitingServiceWorker) {
    waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
  } else if (typeof window !== 'undefined') {
    window.location.reload();
  }
};

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!isServiceWorkerSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) {
      attachServiceWorkerUpdateFlow(existing);
      existing.update().catch((error) => {
        console.warn('Service worker update check failed', error);
      });
      attachPushSubscriptionRepairFlow();
      return await navigator.serviceWorker.ready.catch(() => existing);
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    attachServiceWorkerUpdateFlow(registration);
    registration.update().catch((error) => {
      console.warn('Service worker update check failed', error);
    });
    attachPushSubscriptionRepairFlow();
    return await navigator.serviceWorker.ready.catch(() => registration);
  } catch (e) {
    console.error('Service worker registration failed', e);
    return null;
  }
};

const upsertPushSubscription = async (
  subscription: PushSubscription,
  userId: string
): Promise<{ ok: boolean; reason?: string }> => {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'Subscription missing required keys.' };
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth_key: json.keys.auth,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
    { onConflict: 'user_id,endpoint' }
  );

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
};

const upsertNativePushToken = async (
  token: string,
  userId: string,
  appVersion?: string | null
): Promise<{ ok: boolean; reason?: string }> => {
  const { error } = await supabase.from('native_push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: 'android',
      app_version: appVersion || null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_push_token' }
  );

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
};

const getNativePermissionStatus = async (): Promise<PushPermissionStatus> => {
  const { Notifications } = await getNativeNotificationModules();
  const permissions = await Notifications.getPermissionsAsync();
  nativePermissionStatusCache = permissions.status as PushPermissionStatus;
  return nativePermissionStatusCache;
};

const getCurrentNativePushToken = async (options: { requestPermission: boolean }): Promise<{
  token: string;
  appVersion?: string | null;
}> => {
  const { Notifications, Constants } = await getNativeNotificationModules();
  await ensureAndroidNotificationChannel(Notifications);

  const permissions = await Notifications.getPermissionsAsync();
  nativePermissionStatusCache = permissions.status as PushPermissionStatus;

  if (permissions.status !== 'granted') {
    if (!options.requestPermission) {
      throw new Error('Notification permission is not granted.');
    }

    const requested = await Notifications.requestPermissionsAsync();
    nativePermissionStatusCache = requested.status as PushPermissionStatus;
    if (requested.status !== 'granted') {
      throw new Error('Notification permission denied.');
    }
  }

  const projectId = getExpoProjectId(Constants);
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  return {
    token,
    appVersion: Constants.expoConfig?.version || null,
  };
};

const syncNativePushToken = async (
  options: { requestPermission: boolean } = { requestPermission: false }
): Promise<{ ok: boolean; reason?: string }> => {
  if (!isNativePushPlatform()) return { ok: false, reason: 'unsupported' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'not-signed-in' };

  try {
    const nativeToken = await getCurrentNativePushToken(options);
    return upsertNativePushToken(nativeToken.token, user.id, nativeToken.appVersion);
  } catch (error: any) {
    return { ok: false, reason: error?.message || 'Could not register this device for push notifications.' };
  }
};

export const syncPushSubscription = async (): Promise<{ ok: boolean; reason?: string }> => {
  if (isNativePushPlatform()) {
    return syncNativePushToken({ requestPermission: false });
  }

  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  if (Notification.permission !== 'granted') return { ok: false, reason: 'permission-not-granted' };

  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return { ok: false, reason: 'service-worker-missing' };

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { ok: false, reason: 'subscription-missing' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'not-signed-in' };

  return upsertPushSubscription(subscription, user.id);
};

export const enablePushNotifications = async (): Promise<{ ok: boolean; reason?: string }> => {
  if (isNativePushPlatform()) {
    return syncNativePushToken({ requestPermission: true });
  }

  if (!isPushSupported()) {
    return { ok: false, reason: 'Push notifications are not supported on this device.' };
  }

  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith('REPLACE_')) {
    return { ok: false, reason: 'VAPID key not configured. Generate one and update src/lib/pushNotifications.ts.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notification permission denied.' };
  }

  const registration = await registerServiceWorker();
  if (!registration) return { ok: false, reason: 'Service worker registration failed.' };

  try {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const unsubscribeCurrentSubscription = async () => {
      if (!subscription) return;
      try {
        await subscription.unsubscribe();
      } catch (unsubscribeError) {
        console.warn('Could not clean up failed push subscription', unsubscribeError);
      }
    };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      await unsubscribeCurrentSubscription();
      return { ok: false, reason: 'Not signed in.' };
    }

    const upsertResult = await upsertPushSubscription(subscription, user.id);
    if (!upsertResult.ok) {
      await unsubscribeCurrentSubscription();
      return upsertResult;
    }
    return { ok: true };
  } catch (e: any) {
    console.error('enablePushNotifications failed', e);
    return { ok: false, reason: e?.message || 'Subscription failed.' };
  }
};

export const disablePushNotifications = async (): Promise<void> => {
  if (isNativePushPlatform()) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const nativeToken = await getCurrentNativePushToken({ requestPermission: false });
      await supabase
        .from('native_push_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('expo_push_token', nativeToken.token);
    } catch (error) {
      console.warn('Could not disable native push notifications', error);
    }
    return;
  }

  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);
  }
};

export const isCurrentlySubscribed = async (): Promise<boolean> => {
  if (isNativePushPlatform()) {
    const permission = await getNativePermissionStatus();
    if (permission !== 'granted') return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const syncResult = await syncNativePushToken({ requestPermission: false });
    if (!syncResult.ok) return false;

    const nativeToken = await getCurrentNativePushToken({ requestPermission: false });
    const { data, error } = await supabase
      .from('native_push_tokens')
      .select('id')
      .eq('user_id', user.id)
      .eq('expo_push_token', nativeToken.token)
      .maybeSingle();

    if (error) {
      console.warn('Could not verify stored native push token', error);
      return false;
    }

    return Boolean(data);
  }

  if (!isPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const json = subscription.toJSON();
  if (!json.endpoint) return false;

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('endpoint', json.endpoint)
    .maybeSingle();

  if (error) {
    console.warn('Could not verify stored push subscription', error);
    return false;
  }

  if (data) return true;

  const syncResult = await syncPushSubscription();
  return syncResult.ok;
};
