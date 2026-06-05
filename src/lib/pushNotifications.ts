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
  Platform.OS === 'web'
  && typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
);

export const getPushSupportInfo = (): PushSupportInfo => {
  if (Platform.OS !== 'web') {
    return { supported: false, reason: 'Push notifications are only configured for the web app.' };
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

export const getPushPermissionStatus = (): 'unsupported' | NotificationPermission => {
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

export const syncPushSubscription = async (): Promise<{ ok: boolean; reason?: string }> => {
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
