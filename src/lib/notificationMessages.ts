export type NotificationMetadata = {
  pub_name?: string | null;
  prompt_id?: string | null;
  target_type?: 'session' | 'pub_crawl' | 'chug_attempt' | string | null;
  target_id?: string | null;
  session_id?: string | null;
  pub_crawl_id?: string | null;
  beer_name?: string | null;
  duration_ms?: number | string | null;
  session_status?: string | null;
  official_post_id?: string | null;
  official_title?: string | null;
  notification_body?: string | null;
  push_enabled?: boolean | null;
  push_title?: string | null;
  push_body?: string | null;
  challenge_id?: string | null;
  challenge_slug?: string | null;
  beverage_name?: string | null;
  beverage_category?: string | null;
  beverage_abv?: number | string | null;
  surface?: 'post' | 'comment' | string | null;
  mention_id?: string | null;
  source_id?: string | null;
};

export type NotificationMessageInput = {
  type: string;
  metadata?: NotificationMetadata | null;
  session?: {
    pub_name?: string | null;
  } | null;
  invite?: {
    status?: string | null;
  } | null;
};

const toCleanString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getNotificationPubName = (item: NotificationMessageInput) => (
  toCleanString(item.metadata?.pub_name) || toCleanString(item.session?.pub_name)
);

export const getOfficialNotificationTitle = (item: NotificationMessageInput) => (
  toCleanString(item.metadata?.official_title) || 'Official Beerva'
);

export const getOfficialNotificationBody = (item: NotificationMessageInput) => (
  toCleanString(item.metadata?.notification_body) || 'There is a new official Beerva announcement.'
);

export const getNotificationMessage = (item: NotificationMessageInput) => {
  if (item.type === 'cheer') return ' cheered your session!';
  if (item.type === 'comment') return ' commented on your session.';
  if (item.type === 'mention') {
    return item.metadata?.surface === 'post'
      ? ' mentioned you in a post.'
      : ' mentioned you in a comment.';
  }
  if (item.type === 'follow') return ' started following you.';
  if (item.type === 'session_started') {
    const pubName = getNotificationPubName(item);
    return pubName
      ? ` started a drinking session at ${pubName}.`
      : ' started a drinking session.';
  }
  if (item.type === 'pub_crawl_started') {
    const pubName = getNotificationPubName(item);
    return pubName
      ? ` started a pub crawl at ${pubName}.`
      : ' started a pub crawl.';
  }
  if (item.type === 'hangover_check') return ' needs a morning-after damage report.';
  if (item.type === 'invite_response') {
    if (item.invite?.status === 'accepted') return ' will be there.';
    if (item.invite?.status === 'declined') return " can't make it.";
    return ' answered your drinking invite.';
  }
  if (item.type === 'chug_verification') return ' wants you to verify a 33cl bottle chug.';
  if (item.type === 'drinking_buddy_added') return ' added you as a drinking buddy.';
  if (item.type === 'beverage_submission') {
    const beverageName = toCleanString(item.metadata?.beverage_name);
    return beverageName
      ? ` submitted ${beverageName} for Beerva approval.`
      : ' submitted a beverage for Beerva approval.';
  }
  return ' invited you to drink!';
};
