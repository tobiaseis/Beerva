export type NotificationMetadata = {
  pub_name?: string | null;
  prompt_id?: string | null;
  target_type?: 'session' | 'pub_crawl' | 'chug_attempt' | string | null;
  session_id?: string | null;
  beer_name?: string | null;
  duration_ms?: number | string | null;
  session_status?: string | null;
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

export const getNotificationMessage = (item: NotificationMessageInput) => {
  if (item.type === 'cheer') return ' cheered your session!';
  if (item.type === 'comment') return ' commented on your session.';
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
  return ' invited you to drink!';
};
