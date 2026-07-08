import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

export const PHOTO_SAVE_ERROR = 'Could not save photo.';
export const PHOTO_LIBRARY_PERMISSION_ERROR = 'Photo library access needed.';
export const PHOTO_SAVE_UNSUPPORTED_ERROR = 'Saving photos is available in the iPhone and Android app.';
export const PHOTO_PREPARE_ERROR = 'Could not prepare this photo for saving.';

type FileSystemLegacy = typeof import('expo-file-system/legacy');

const REMOTE_IMAGE_PATTERN = /^https?:\/\//i;

const getImageExtension = (uri: string) => {
  const cleanPath = uri.split('?')[0].split('#')[0];
  const extension = cleanPath.split('.').pop()?.toLowerCase();

  if (extension && /^[a-z0-9]+$/.test(extension) && extension.length <= 5) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }

  return 'jpg';
};

const getCacheBaseDirectory = (FileSystem: FileSystemLegacy) => {
  const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!directory) throw new Error(PHOTO_PREPARE_ERROR);
  return directory.endsWith('/') ? directory : `${directory}/`;
};

const downloadImageToCache = async (cleanUri: string) => {
  const FileSystem = await import('expo-file-system/legacy');
  const extension = getImageExtension(cleanUri);
  const targetUri = `${getCacheBaseDirectory(FileSystem)}beerva-session-photo-${Date.now()}.${extension}`;
  const result = await FileSystem.downloadAsync(cleanUri, targetUri);

  if (result.status && (result.status < 200 || result.status >= 300)) {
    throw new Error(PHOTO_PREPARE_ERROR);
  }

  return result.uri;
};

const ensureCanSavePhotos = async () => {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) {
    throw new Error(PHOTO_LIBRARY_PERMISSION_ERROR);
  }
};

export const saveImageToDeviceLibrary = async (imageUri: string): Promise<void> => {
  const cleanUri = imageUri.trim();
  if (!cleanUri) {
    throw new Error(PHOTO_SAVE_ERROR);
  }

  if (Platform.OS === 'web') {
    throw new Error(PHOTO_SAVE_UNSUPPORTED_ERROR);
  }

  await ensureCanSavePhotos();

  let localUri = cleanUri;
  if (REMOTE_IMAGE_PATTERN.test(cleanUri)) {
    try {
      localUri = await downloadImageToCache(cleanUri);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : PHOTO_PREPARE_ERROR);
    }
  }

  try {
    await MediaLibrary.saveToLibraryAsync(localUri);
  } catch {
    throw new Error(PHOTO_SAVE_ERROR);
  }
};
