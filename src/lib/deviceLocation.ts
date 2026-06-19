import { Platform } from 'react-native';

import type { UserLocation } from './pubDirectory';

const PUB_LOCATION_TIMEOUT_MS = 9000;

const getCurrentBrowserLocation = () => new Promise<UserLocation>((resolve, reject) => {
  const geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null;
  if (!geolocation) {
    reject(new Error('Location is not available on this device.'));
    return;
  }

  geolocation.getCurrentPosition(
    (position) => {
      resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    },
    (error) => {
      reject(new Error(error.message || 'Could not get your location.'));
    },
    {
      enableHighAccuracy: true,
      timeout: PUB_LOCATION_TIMEOUT_MS,
      maximumAge: 1000 * 60 * 8,
    }
  );
});

const getPreviouslyGrantedBrowserLocation = async () => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  const permissions = navigator.permissions;
  if (!permissions?.query) return null;

  try {
    const status = await permissions.query({ name: 'geolocation' as PermissionName });
    if (status.state !== 'granted') return null;
  } catch {
    return null;
  }

  try {
    return await getCurrentBrowserLocation();
  } catch {
    return null;
  }
};

const getCurrentNativeLocation = async (): Promise<UserLocation> => {
  const Location = await import('expo-location');
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location access is needed to find nearby pubs.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
};

const getPreviouslyGrantedNativeLocation = async (): Promise<UserLocation | null> => {
  const Location = await import('expo-location');
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') return null;

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
};

export const getCurrentDeviceLocation = async (): Promise<UserLocation> => {
  if (Platform.OS === 'web') return getCurrentBrowserLocation();
  return getCurrentNativeLocation();
};

export const getPreviouslyGrantedDeviceLocation = async (): Promise<UserLocation | null> => {
  if (Platform.OS === 'web') return getPreviouslyGrantedBrowserLocation();
  return getPreviouslyGrantedNativeLocation();
};
