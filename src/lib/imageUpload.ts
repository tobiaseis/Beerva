import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from './supabase';

export const UPLOAD_IMAGE_MAX_WIDTH = 720;

export type SelectedImage = {
  uri: string;
  blob?: Blob;
  file?: File;
  mimeType?: string;
  fileName?: string;
};

const getExtension = (image: SelectedImage) => {
  const typeExtension = image.mimeType?.split('/')[1];
  if (typeExtension) return typeExtension === 'jpeg' ? 'jpg' : typeExtension;

  const uriExtension = image.uri.split('?')[0].split('.').pop();
  return uriExtension && uriExtension.length <= 5 ? uriExtension : 'jpg';
};

const getContentType = (image: SelectedImage) => {
  return image.mimeType || (getExtension(image) === 'png' ? 'image/png' : 'image/jpeg');
};

export const imageFromPickerAsset = (asset: ImagePickerAsset): SelectedImage => {
  return {
    uri: asset.uri,
    blob: asset.file,
    file: asset.file,
    mimeType: asset.mimeType || asset.file?.type,
    fileName: asset.fileName || asset.file?.name,
  };
};

export const prepareWebImageFromPickerAsset = async (
  asset: ImagePickerAsset,
  maxWidth = UPLOAD_IMAGE_MAX_WIDTH,
  quality = 0.72
): Promise<SelectedImage> => {
  const source = imageFromPickerAsset(asset);
  let sourceBlob = source.blob || source.file;
  if (!sourceBlob) {
    const response = await fetch(source.uri);
    if (!response.ok) {
      throw new Error('Could not read the selected image.');
    }
    sourceBlob = await response.blob();
  }
  const sourceType = sourceBlob.type || source.mimeType || 'image/jpeg';

  if (typeof document === 'undefined' || !sourceType.startsWith('image/')) {
    return {
      ...source,
      blob: sourceBlob,
      mimeType: sourceType,
    };
  }

  const objectUrl = URL.createObjectURL(sourceBlob);

  try {
    const imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = document.createElement('img');
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = objectUrl;
    });

    const scale = imageElement.naturalWidth > maxWidth ? maxWidth / imageElement.naturalWidth : 1;
    const width = Math.max(1, Math.round(imageElement.naturalWidth * scale));
    const height = Math.max(1, Math.round(imageElement.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare image for upload.');

    context.drawImage(imageElement, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });

    if (!compressedBlob) throw new Error('Could not prepare image for upload.');

    const previewUri = URL.createObjectURL(compressedBlob);

    return {
      uri: previewUri,
      blob: compressedBlob,
      mimeType: 'image/jpeg',
      fileName: `${source.fileName?.replace(/\.[^.]+$/, '') || 'photo'}.jpg`,
    };
  } catch (error) {
    console.warn('Web image compression skipped:', error);
    return {
      ...source,
      blob: sourceBlob,
      mimeType: sourceType,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const uploadImageToBucket = async (
  bucket: string,
  image: SelectedImage,
  prefix: string
) => {
  const ext = getExtension(image);
  const fileName = `${prefix}_${Date.now()}.${ext}`;
  const contentType = getContentType(image);

  if (Platform.OS === 'web') {
    let fileBody: Blob;
    if (image.blob) {
      fileBody = image.blob;
    } else if (image.file) {
      fileBody = image.file;
    } else {
      const response = await fetch(image.uri);
      if (!response.ok) {
        throw new Error('Could not read the selected image.');
      }
      fileBody = await response.blob();
    }

    const uploadBody = await fileBody.arrayBuffer();

    let error;
    try {
      const result = await supabase.storage
        .from(bucket)
        .upload(fileName, uploadBody, {
          contentType,
          upsert: false,
        });
      error = result.error;
    } catch (uploadError: any) {
      if (uploadError?.message?.toLowerCase().includes('failed to fetch')) {
        throw new Error('Could not reach image storage. Try a smaller JPG/PNG, then check that the session_images bucket is available.');
      }

      throw uploadError;
    }

    if (error) {
      throw error;
    }
  } else {
    const FileSystem = await import('expo-file-system/legacy');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const response = await FileSystem.uploadAsync(
      `https://yzrfihijpusvjypypnip.supabase.co/storage/v1/object/${bucket}/${fileName}`,
      image.uri,
      {
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: 'sb_publishable_s-eJ6PwDoAIjnVlAH_ul1w_E3sgmM9v',
          'Content-Type': contentType,
        },
      }
    );

    if (response.status < 200 || response.status >= 300) {
      throw new Error('Failed to upload image: ' + response.body);
    }
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(fileName);

  return publicUrl;
};
