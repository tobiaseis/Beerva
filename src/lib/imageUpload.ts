import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from './supabase';

export type SelectedImage = {
  uri: string;
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
    file: asset.file,
    mimeType: asset.mimeType || asset.file?.type,
    fileName: asset.fileName || asset.file?.name,
  };
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
    if (image.file) {
      fileBody = image.file;
    } else {
      const response = await fetch(image.uri);
      fileBody = await response.blob();
    }

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBody, {
        contentType,
        upsert: false,
      });

    if (error) throw error;
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
