import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from './supabase';

export const CHUG_VIDEO_BUCKET = 'chug_videos';

export type SelectedChugVideo = {
  uri: string;
  blob?: Blob;
  file?: File;
  mimeType?: string;
  fileName?: string;
};

const cleanPathSegment = (segment: string) => segment.replace(/[^a-zA-Z0-9_-]/g, '');

const getExtension = (video: SelectedChugVideo) => {
  const typeExtension = video.mimeType?.split('/')[1];
  if (typeExtension) return typeExtension === 'quicktime' ? 'mov' : typeExtension;
  const uriExtension = video.uri.split('?')[0].split('.').pop();
  return uriExtension && uriExtension.length <= 5 ? uriExtension : 'mp4';
};

const getContentType = (video: SelectedChugVideo) => (
  video.mimeType || (getExtension(video) === 'webm' ? 'video/webm' : 'video/mp4')
);

export const chugVideoFromPickerAsset = async (asset: ImagePickerAsset): Promise<SelectedChugVideo> => {
  if (Platform.OS === 'web') {
    let blob = asset.file;
    if (!blob) {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('Could not read the recorded chug video.');
      blob = await response.blob() as File;
    }
    return {
      uri: asset.uri,
      blob,
      file: asset.file,
      mimeType: asset.mimeType || blob.type || 'video/mp4',
      fileName: asset.fileName || asset.file?.name,
    };
  }

  return {
    uri: asset.uri,
    mimeType: asset.mimeType || 'video/mp4',
    fileName: asset.fileName || 'chug.mp4',
  };
};

export const uploadChugProofVideo = async (video: SelectedChugVideo, userId: string) => {
  const extension = getExtension(video);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const storagePath = `users/${cleanPathSegment(userId)}/chugs/${fileName}`;
  const contentType = getContentType(video);

  if (Platform.OS === 'web') {
    let body = video.blob || video.file;
    if (!body) {
      const response = await fetch(video.uri);
      if (!response.ok) throw new Error('Could not read the recorded chug video.');
      body = await response.blob();
    }
    const { error } = await supabase.storage
      .from(CHUG_VIDEO_BUCKET)
      .upload(storagePath, await body.arrayBuffer(), {
        contentType,
        upsert: false,
      });
    if (error) throw error;
    return storagePath;
  }

  const FileSystem = await import('expo-file-system/legacy');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session');

  const response = await FileSystem.uploadAsync(
    `https://yzrfihijpusvjypypnip.supabase.co/storage/v1/object/${CHUG_VIDEO_BUCKET}/${storagePath}`,
    video.uri,
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
    throw new Error('Failed to upload chug proof video: ' + response.body);
  }

  return storagePath;
};

export const createChugProofSignedUrl = async (path?: string | null) => {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(CHUG_VIDEO_BUCKET)
    .createSignedUrl(path, 60 * 15);
  if (error) throw error;
  return data.signedUrl;
};
