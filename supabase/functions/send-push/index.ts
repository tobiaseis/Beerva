// Beerva push delivery, invoked by a Supabase Database Webhook on notifications INSERT.
//
// Required secrets:
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_EMAIL
//   WEBHOOK_SECRET (optional; if set, mirror it in Vault as beerva_push_webhook_secret)

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidEmail = Deno.env.get('VAPID_EMAIL') || 'admin@example.com';
const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || '';

const contact = vapidEmail.startsWith('mailto:') ? vapidEmail : `mailto:${vapidEmail}`;
webpush.setVapidDetails(contact, vapidPublic, vapidPrivate);

const PUSH_SEND_OPTIONS = {
  urgency: 'high' as const,
  TTL: 86400,
  timeout: 8000,
};

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';

type PushDeliveryStatus = 'accepted' | 'expired_subscription' | 'failed';
type NativePushDeliveryStatus = 'ticket_accepted' | 'stale_token' | 'failed';

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

type NativePushTokenRow = {
  id: string;
  expo_push_token: string;
};

const getEndpointHash = async (endpoint: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const getPushErrorMessage = (err: any) => {
  const message = typeof err?.body === 'string' && err.body.trim()
    ? err.body
    : err?.message;

  return typeof message === 'string' && message.trim()
    ? message.slice(0, 500)
    : null;
};

const recordPushDeliveryAttempt = async (
  supabase: ReturnType<typeof createClient>,
  params: {
    notificationId: string;
    userId: string;
    pushSubscriptionId: string;
    endpointHash: string;
    status: PushDeliveryStatus;
    httpStatus?: number | null;
    errorMessage?: string | null;
  }
) => {
  const { error } = await supabase
    .from('push_delivery_attempts')
    .insert({
      notification_id: params.notificationId,
      user_id: params.userId,
      push_subscription_id: params.pushSubscriptionId,
      endpoint_hash: params.endpointHash,
      status: params.status,
      http_status: params.httpStatus ?? null,
      error_message: params.errorMessage ?? null,
    });

  if (error) {
    console.error('Push delivery diagnostic insert error', error.message);
  }
};

const getNativeTokenHash = async (expo_push_token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expo_push_token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const recordNativePushDeliveryAttempt = async (
  supabase: ReturnType<typeof createClient>,
  params: {
    notificationId: string;
    userId: string;
    nativePushTokenId: string;
    tokenHash: string;
    status: NativePushDeliveryStatus;
    httpStatus?: number | null;
    errorMessage?: string | null;
    expoTicketId?: string | null;
  }
) => {
  const { error } = await supabase
    .from('native_push_delivery_attempts')
    .insert({
      notification_id: params.notificationId,
      user_id: params.userId,
      native_push_token_id: params.nativePushTokenId,
      token_hash: params.tokenHash,
      status: params.status,
      http_status: params.httpStatus ?? null,
      error_message: params.errorMessage ?? null,
      expo_ticket_id: params.expoTicketId ?? null,
    });

  if (error) {
    console.error('Native push delivery diagnostic insert error', error.message);
  }
};

const getExpoPushErrorMessage = (ticket: any) => {
  const message = ticket?.message;
  return typeof message === 'string' && message.trim()
    ? message.slice(0, 500)
    : null;
};

const isDeviceNotRegistered = (ticket: any) => (
  ticket?.details?.error === 'DeviceNotRegistered'
);

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: 'cheer' | 'invite' | 'session_started' | 'comment' | 'mention' | 'invite_response' | 'pub_crawl_started' | 'hangover_check' | 'follow' | 'chug_verification' | 'drinking_buddy_added' | 'official_post';
  reference_id: string | null;
  metadata?: {
    pub_name?: string | null;
    prompt_id?: string | null;
    target_type?: 'session' | 'pub_crawl' | 'chug_attempt' | string | null;
    session_id?: string | null;
    beer_name?: string | null;
    duration_ms?: number | string | null;
    session_status?: string | null;
    push_enabled?: boolean | null;
    push_title?: string | null;
    push_body?: string | null;
    challenge_slug?: string | null;
    surface?: 'post' | 'comment' | string | null;
    mention_id?: string | null;
    source_id?: string | null;
  } | null;
};

Deno.serve(async (req) => {
  if (webhookSecret) {
    const customSecret = req.headers.get('x-beerva-webhook-secret') || '';
    const legacyAuth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const legacyBearerSecret = legacyAuth.startsWith('Bearer ') ? legacyAuth.slice('Bearer '.length) : '';
    if (customSecret !== webhookSecret && legacyBearerSecret !== webhookSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  let record: NotificationRow | undefined = body?.record;
  if (!record?.id) {
    return new Response(JSON.stringify({ error: 'No record in payload' }), { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: storedNotification, error: notificationError } = await supabase
    .from('notifications')
    .select('id, user_id, actor_id, type, reference_id, metadata')
    .eq('id', record.id)
    .maybeSingle();

  if (notificationError) {
    console.error('Notification lookup error', notificationError.message);
    return new Response(JSON.stringify({ error: 'Notification lookup failed' }), { status: 500 });
  }

  if (!storedNotification) {
    return new Response(JSON.stringify({ error: 'Notification not found' }), { status: 404 });
  }

  record = storedNotification as NotificationRow;

  if (record.type === 'official_post' && record.metadata?.push_enabled !== true) {
    return new Response(JSON.stringify({ sent: 0, reason: 'push disabled' }), { status: 200 });
  }

  const [
    { data: actor },
    { data: subscriptions },
    { data: nativeTokens },
    { data: referencedSession },
    { data: referencedCrawlStop },
    { data: referencedInvite },
    { data: referencedBuddySession },
  ] = await Promise.all([
    record.actor_id
      ? supabase.from('profiles').select('username').eq('id', record.actor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('user_id', record.user_id),
    supabase
      .from('native_push_tokens')
      .select('id, expo_push_token')
      .eq('user_id', record.user_id),
    record.type === 'session_started' && record.reference_id
      ? supabase.from('sessions').select('pub_name').eq('id', record.reference_id).maybeSingle()
      : Promise.resolve({ data: null }),
    record.type === 'pub_crawl_started' && record.reference_id
      ? supabase
          .from('sessions')
          .select('pub_name')
          .eq('pub_crawl_id', record.reference_id)
          .eq('crawl_stop_order', 1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (record.type === 'invite' || record.type === 'invite_response') && record.reference_id
      ? supabase.from('drinking_invites').select('status').eq('id', record.reference_id).maybeSingle()
      : Promise.resolve({ data: null }),
    record.type === 'drinking_buddy_added' && record.reference_id
      ? supabase
          .from('session_buddies')
          .select('session_id, sessions!inner(pub_name, status)')
          .eq('id', record.reference_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const webPushSubscriptions = (subscriptions || []) as PushSubscriptionRow[];
  const nativePushTokens = (nativeTokens || []) as NativePushTokenRow[];

  if (webPushSubscriptions.length === 0 && nativePushTokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), { status: 200 });
  }

  const actorName = actor?.username || 'Someone';
  const metadataPubName = typeof record.metadata?.pub_name === 'string'
    ? record.metadata.pub_name.trim()
    : '';
  const notificationPubName = metadataPubName || referencedSession?.pub_name || referencedCrawlStop?.pub_name || null;
  const postTargetType = record.metadata?.target_type === 'pub_crawl' ? 'pub_crawl' : 'session';
  const buddySessionId = typeof record.metadata?.session_id === 'string'
    ? record.metadata.session_id.trim()
    : (referencedBuddySession as any)?.session_id || '';
  const buddySessionStatus = typeof record.metadata?.session_status === 'string'
    ? record.metadata.session_status
    : (referencedBuddySession as any)?.sessions?.status || '';

  let title = 'Beerva';
  let bodyText = '';
  if (record.type === 'official_post') {
    title = record.metadata?.push_title?.trim() || 'Official Beerva';
    bodyText = record.metadata?.push_body?.trim() || 'There is a new official Beerva announcement.';
  } else if (record.type === 'cheer') {
    title = 'Cheers received!';
    bodyText = `${actorName} cheered your beer session`;
  } else if (record.type === 'comment') {
    title = 'New comment';
    bodyText = `${actorName} commented on your beer session`;
  } else if (record.type === 'mention') {
    title = 'New mention';
    bodyText = record.metadata?.surface === 'post'
      ? `${actorName} mentioned you in a post`
      : `${actorName} mentioned you in a comment`;
  } else if (record.type === 'follow') {
    title = 'New follower';
    bodyText = `${actorName} started following you`;
  } else if (record.type === 'chug_verification') {
    title = 'Chug verification';
    bodyText = `${actorName} wants you to verify a 33cl bottle chug`;
  } else if (record.type === 'drinking_buddy_added') {
    title = 'Drinking buddy';
    bodyText = `${actorName} added you as a drinking buddy`;
  } else if (record.type === 'invite') {
    title = 'Invitation to drink';
    bodyText = `${actorName} wants to grab a beer with you`;
  } else if (record.type === 'invite_response') {
    title = 'Invite response';
    bodyText = referencedInvite?.status === 'accepted'
      ? `${actorName} will be there`
      : `${actorName} cannot make it`;
  } else if (record.type === 'session_started') {
    title = 'Drinking session started';
    bodyText = notificationPubName
      ? `${actorName} started a session at ${notificationPubName}`
      : `${actorName} started a drinking session`;
  } else if (record.type === 'pub_crawl_started') {
    title = 'Pub crawl started';
    bodyText = notificationPubName
      ? `${actorName} started a pub crawl at ${notificationPubName}`
      : `${actorName} started a pub crawl`;
  } else if (record.type === 'hangover_check') {
    title = 'Morning-after damage report';
    bodyText = 'Did last night win? Tap to rate the hangover before your liver files a bug report.';
  }

  const hangoverTargetType = record.metadata?.target_type === 'pub_crawl' ? 'pub_crawl' : 'session';
  let url: string;
  if (record.type === 'official_post' && record.metadata?.challenge_slug) {
    url = `/?challenge=${encodeURIComponent(record.metadata.challenge_slug)}&notificationId=${encodeURIComponent(record.id)}`;
  } else if (record.type === 'official_post') {
    url = `/?notifications=1&notificationId=${encodeURIComponent(record.id)}`;
  } else if (record.type === 'chug_verification' && record.reference_id) {
    url = `/?chug_verification=1&attempt_id=${encodeURIComponent(record.reference_id)}&notificationId=${encodeURIComponent(record.id)}`;
  } else if (record.type === 'hangover_check' && record.reference_id) {
    url = `/?hangover=1&target_type=${encodeURIComponent(hangoverTargetType)}&target_id=${encodeURIComponent(record.reference_id)}&notificationId=${encodeURIComponent(record.id)}`;
  } else if (record.type === 'drinking_buddy_added' && buddySessionId && buddySessionStatus === 'published') {
    url = `/?post=${encodeURIComponent(buddySessionId)}&post_type=session&notificationId=${encodeURIComponent(record.id)}`;
  } else if (record.type === 'drinking_buddy_added') {
    url = `/?notifications=1&notificationId=${encodeURIComponent(record.id)}`;
  } else if ((record.type === 'cheer' || record.type === 'comment' || record.type === 'mention') && record.reference_id) {
    // Deep-link straight to the post that was cheered, commented on, or mentioned the user.
    url = `/?post=${encodeURIComponent(record.reference_id)}&post_type=${encodeURIComponent(postTargetType)}&notificationId=${encodeURIComponent(record.id)}`;
  } else {
    url = `/?notifications=1&notificationId=${encodeURIComponent(record.id)}`;
  }

  const payload = JSON.stringify({
    title,
    body: bodyText,
    url,
    tag: `beerva-${record.type}-${record.id}`,
  });
  const nativeUrl = url.startsWith('/')
    ? `beerva://open${url}`
    : `beerva://open/${url}`;

  let sent = 0;
  await Promise.all(
    webPushSubscriptions.map(async (sub: PushSubscriptionRow) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
      };
      const endpointHash = await getEndpointHash(sub.endpoint);

      try {
        await webpush.sendNotification(pushSub, payload, PUSH_SEND_OPTIONS);
        sent += 1;
        await recordPushDeliveryAttempt(supabase, {
          notificationId: record.id,
          userId: record.user_id,
          pushSubscriptionId: sub.id,
          endpointHash,
          status: 'accepted',
        });
      } catch (err: any) {
        const status = err?.statusCode;
        const httpStatus = typeof status === 'number' ? status : null;
        const errorMessage = getPushErrorMessage(err);

        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          await recordPushDeliveryAttempt(supabase, {
            notificationId: record.id,
            userId: record.user_id,
            pushSubscriptionId: sub.id,
            endpointHash,
            status: 'expired_subscription',
            httpStatus,
            errorMessage,
          });
        } else {
          console.error('Push send error', status, err?.body || err?.message);
          await recordPushDeliveryAttempt(supabase, {
            notificationId: record.id,
            userId: record.user_id,
            pushSubscriptionId: sub.id,
            endpointHash,
            status: 'failed',
            httpStatus,
            errorMessage,
          });
        }
      }
    })
  );

  let nativeSent = 0;
  await Promise.all(
    nativePushTokens.map(async (nativeToken) => {
      const tokenHash = await getNativeTokenHash(nativeToken.expo_push_token);
      const nativePayload = {
        to: nativeToken.expo_push_token,
        title,
        body: bodyText || 'You have a new notification',
        sound: 'default',
        channelId: 'default',
        priority: 'high',
        data: {
          url: nativeUrl,
          notificationId: record.id,
          type: record.type,
        },
      };

      try {
        const response = await fetch(EXPO_PUSH_SEND_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nativePayload),
        });

        const responseBody = await response.json().catch(() => null);
        const ticket = Array.isArray(responseBody?.data) ? responseBody.data[0] : responseBody?.data;

        if (!response.ok || ticket?.status === 'error') {
          const errorMessage = getExpoPushErrorMessage(ticket) || response.statusText || 'Expo push send failed.';

          if (isDeviceNotRegistered(ticket)) {
            await supabase
              .from('native_push_tokens')
              .delete()
              .eq('expo_push_token', nativeToken.expo_push_token);
            await recordNativePushDeliveryAttempt(supabase, {
              notificationId: record.id,
              userId: record.user_id,
              nativePushTokenId: nativeToken.id,
              tokenHash,
              status: 'stale_token',
              httpStatus: response.status,
              errorMessage,
            });
            return;
          }

          await recordNativePushDeliveryAttempt(supabase, {
            notificationId: record.id,
            userId: record.user_id,
            nativePushTokenId: nativeToken.id,
            tokenHash,
            status: 'failed',
            httpStatus: response.status,
            errorMessage,
          });
          return;
        }

        nativeSent += 1;
        await recordNativePushDeliveryAttempt(supabase, {
          notificationId: record.id,
          userId: record.user_id,
          nativePushTokenId: nativeToken.id,
          tokenHash,
          status: 'ticket_accepted',
          httpStatus: response.status,
          expoTicketId: typeof ticket?.id === 'string' ? ticket.id : null,
        });
      } catch (error: any) {
        await recordNativePushDeliveryAttempt(supabase, {
          notificationId: record.id,
          userId: record.user_id,
          nativePushTokenId: nativeToken.id,
          tokenHash,
          status: 'failed',
          errorMessage: error?.message || 'Native push send failed.',
        });
      }
    })
  );

  return new Response(JSON.stringify({
    sent,
    nativeSent,
    total: webPushSubscriptions.length,
    nativeTotal: nativePushTokens.length,
  }), { status: 200 });
});
