export type PostTargetType = 'session' | 'pub_crawl';

export type PostTarget = {
  targetType: PostTargetType;
  targetId: string;
};

export type PostLaunchParams = PostTarget & {
  notificationId: string | null;
};

type NotificationTargetInput = {
  reference_id?: string | null;
  metadata?: {
    target_type?: unknown;
    session_id?: unknown;
  } | null;
};

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizePostTargetType = (value: unknown): PostTargetType => (
  value === 'pub_crawl' ? 'pub_crawl' : 'session'
);

export const getPostLaunchParamsFromSearch = (search: string): PostLaunchParams | null => {
  const params = new URLSearchParams(search);
  const targetId = toCleanString(params.get('post'));
  if (!targetId) return null;

  return {
    targetType: normalizePostTargetType(params.get('post_type') || params.get('target_type')),
    targetId,
    notificationId: toCleanString(params.get('notificationId')),
  };
};

export const getNotificationPostTarget = (item: NotificationTargetInput): PostTarget | null => {
  const targetId = toCleanString(item.metadata?.session_id) || toCleanString(item.reference_id);
  if (!targetId) return null;

  return {
    targetType: normalizePostTargetType(item.metadata?.target_type),
    targetId,
  };
};
