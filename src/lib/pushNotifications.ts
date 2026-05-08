import { Platform } from 'react-native';
import { supabase } from './supabase';

// Replace with your VAPID public key (output of `npx web-push generate-vapid-keys`).
// Safe to ship in client code — only the private key must stay secret.
export const VAPID_PUBLIC_KEY = 'BFFNJlO-5vCdNg6M0nLgs2mTcJwy0XWoXQItXu8IvWSbI7z2l09a_lvikodkQK2q1IhjDKAxLxyuWEtdDRG-lAU';

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const isPushSupported = (): boolean => {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
};

export const getPushPermissionStatus = (): 'unsupported' | NotificationPermission => {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
};

export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!isPushSupported()) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.error('Service worker registration failed', e);
    return null;
  }
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: 'Not signed in.' };

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'Subscription missing required keys.' };
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      { onConflict: 'user_id,endpoint' }
    );

    if (error) return { ok: false, reason: error.message };
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
  const sub = await registration.pushManager.getSubscription();
  return !!sub;
};
