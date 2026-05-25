import { Platform } from 'react-native';

type WebMotionPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';
type WebPermissionDiagnostic = PermissionState | 'unsupported' | 'unknown';

export type WebMotionPermissionDiagnostics = {
  accelerometer: WebPermissionDiagnostic;
  gyroscope: WebPermissionDiagnostic;
};

const requestSensorPermission = (eventName: 'DeviceMotionEvent' | 'DeviceOrientationEvent') => {
  if (Platform.OS !== 'web' || typeof globalThis === 'undefined') {
    return Promise.resolve<WebMotionPermissionState>('unsupported');
  }

  const eventConstructor = (globalThis as Record<string, any>)[eventName];
  const requestPermission = eventConstructor?.requestPermission;

  if (typeof requestPermission !== 'function') {
    return Promise.resolve<WebMotionPermissionState>('granted');
  }

  try {
    return requestPermission.call(eventConstructor) as Promise<WebMotionPermissionState>;
  } catch {
    return Promise.resolve<WebMotionPermissionState>('denied');
  }
};

export const requestWebMotionPermission = async () => {
  if (Platform.OS !== 'web') {
    return 'unsupported';
  }

  const motionPermission = requestSensorPermission('DeviceMotionEvent');
  const orientationPermission = requestSensorPermission('DeviceOrientationEvent');
  const results = await Promise.all([motionPermission, orientationPermission]);

  if (results.includes('granted')) return 'granted';
  if (results.includes('prompt')) return 'prompt';
  if (results.includes('denied')) return 'denied';
  return 'unsupported';
};

const queryBrowserPermission = async (name: 'accelerometer' | 'gyroscope') => {
  if (
    Platform.OS !== 'web'
    || typeof navigator === 'undefined'
    || !navigator.permissions?.query
  ) {
    return 'unsupported' as const;
  }

  try {
    const result = await navigator.permissions.query({ name } as unknown as PermissionDescriptor);
    return result.state;
  } catch {
    return 'unknown' as const;
  }
};

export const queryWebMotionPermissionState = async (): Promise<WebMotionPermissionDiagnostics> => {
  if (Platform.OS !== 'web') {
    return {
      accelerometer: 'unsupported',
      gyroscope: 'unsupported',
    };
  }

  const [accelerometer, gyroscope] = await Promise.all([
    queryBrowserPermission('accelerometer'),
    queryBrowserPermission('gyroscope'),
  ]);

  return { accelerometer, gyroscope };
};
