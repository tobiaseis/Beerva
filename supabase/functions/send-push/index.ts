// Beerva push delivery, invoked by a Supabase Database Webhook on notifications INSERT.
//
// Required secrets:
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_EMAIL
//   WEBHOOK_SECRET

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

type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string;
  type: 'cheer' | 'invite' | 'session_started';
  reference_id: string | null;
};

Deno.serve(async (req) => {
  if (webhookSecret) {
    const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (auth !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const record: NotificationRow | undefined = body?.record;
  if (!record) {
    return new Response(JSON.stringify({ error: 'No record in payload' }), { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const [{ data: actor }, { data: subscriptions }, { data: referencedSession }] = await Promise.all([
    supabase.from('profiles').select('username').eq('id', record.actor_id).maybeSingle(),
    supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key')
      .eq('user_id', record.user_id),
    record.type === 'session_started' && record.reference_id
      ? supabase.from('sessions').select('pub_name').eq('id', record.reference_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!subscriptions || subscriptions.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), { status: 200 });
  }

  const actorName = actor?.username || 'Someone';

  let title = 'Beerva';
  let bodyText = '';
  if (record.type === 'cheer') {
    title = 'Cheers received!';
    bodyText = `${actorName} cheered your beer session`;
  } else if (record.type === 'invite') {
    title = 'Invitation to drink';
    bodyText = `${actorName} wants to grab a beer with you`;
  } else if (record.type === 'session_started') {
    title = 'Drinking session started';
    bodyText = referencedSession?.pub_name
      ? `${actorName} started a session at ${referencedSession.pub_name}`
      : `${actorName} started a drinking session`;
  }

  const payload = JSON.stringify({
    title,
    body: bodyText,
    url: '/',
    tag: `beerva-${record.type}-${record.id}`,
  });

  let sent = 0;
  await Promise.all(
    subscriptions.map(async (sub: any) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_key },
      };
      try {
        await webpush.sendNotification(pushSub, payload);
        sent += 1;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else {
          console.error('Push send error', status, err?.body || err?.message);
        }
      }
    })
  );

  return new Response(JSON.stringify({ sent, total: subscriptions.length }), { status: 200 });
});
