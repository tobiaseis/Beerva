export const MAX_SESSION_PHOTOS = 5;
export const TEMP_SESSION_PHOTO_LIFETIME_MS = 24 * 60 * 60 * 1000;

export type SessionPhoto = {
  id: string;
  session_id?: string | null;
  image_url: string;
  is_keeper?: boolean | null;
  expires_at?: string | null;
  created_at?: string | null;
};

export type NewSessionPhotoRecord = {
  session_id: string;
  image_url: string;
  is_keeper: boolean;
  expires_at: string | null;
};

const getTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const uniqueUrls = (urls: string[]) => {
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
};

export const sortSessionPhotos = (photos: SessionPhoto[] = []) => (
  [...photos].sort((left, right) => {
    if (Boolean(left.is_keeper) !== Boolean(right.is_keeper)) {
      return left.is_keeper ? -1 : 1;
    }
    return getTimestamp(left.created_at) - getTimestamp(right.created_at);
  })
);

export const buildSessionPhotoRecords = (
  sessionId: string,
  imageUrls: string[],
  keeperIndex = 0,
  nowMs = Date.now()
): NewSessionPhotoRecord[] => {
  const limitedUrls = imageUrls.filter(Boolean).slice(0, MAX_SESSION_PHOTOS);
  const safeKeeperIndex = Math.min(Math.max(keeperIndex, 0), Math.max(limitedUrls.length - 1, 0));
  const expiresAt = new Date(nowMs + TEMP_SESSION_PHOTO_LIFETIME_MS).toISOString();

  return limitedUrls.map((imageUrl, index) => {
    const isKeeper = index === safeKeeperIndex;
    return {
      session_id: sessionId,
      image_url: imageUrl,
      is_keeper: isKeeper,
      expires_at: isKeeper ? null : expiresAt,
    };
  });
};

export const getVisibleSessionPhotoUrls = (
  photos: SessionPhoto[] = [],
  fallbackUrl?: string | null,
  nowMs = Date.now()
) => {
  const urls = sortSessionPhotos(photos)
    .filter((photo) => !photo.expires_at || getTimestamp(photo.expires_at) > nowMs)
    .map((photo) => photo.image_url);

  if (urls.length === 0 && fallbackUrl) {
    urls.push(fallbackUrl);
  }

  return uniqueUrls(urls);
};

export const getAllSessionPhotoUrls = (
  photos: SessionPhoto[] = [],
  fallbackUrl?: string | null
) => uniqueUrls([
  ...sortSessionPhotos(photos).map((photo) => photo.image_url),
  fallbackUrl || '',
]);
