import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || '';
const receiptUrl = 'https://exp.host/--/api/v2/push/getReceipts';
const fifteenMinutesMs = 15 * 60 * 1000;
const twentyFourHoursMs = 24 * 60 * 60 * 1000;

type Attempt = {
  id: string;
  expo_ticket_id: string;
  native_push_token_id: string | null;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const getReceiptErrorMessage = (receipt: any) => (
  typeof receipt?.message === 'string' ? receipt.message.slice(0, 500) : null
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (webhookSecret && req.headers.get('x-beerva-webhook-secret') !== webhookSecret) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const now = Date.now();
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data, error } = await supabase
    .from('native_push_delivery_attempts')
    .select('id, expo_ticket_id, native_push_token_id')
    .eq('receipt_status', 'pending')
    .not('expo_ticket_id', 'is', null)
    .lte('created_at', new Date(now - fifteenMinutesMs).toISOString())
    .gte('created_at', new Date(now - twentyFourHoursMs).toISOString())
    .order('created_at', { ascending: true })
    .limit(1000);

  if (error) return json({ error: error.message }, 500);
  const attempts = (data || []) as Attempt[];
  if (!attempts.length) return json({ checked: 0, staleTokens: 0 });

  const response = await fetch(receiptUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: attempts.map((attempt) => attempt.expo_ticket_id) }),
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok || !responseBody?.data) {
    return json({ error: responseBody?.errors || response.statusText }, response.status || 502);
  }

  let staleTokens = 0;
  await Promise.all(attempts.map(async (attempt) => {
    const receipt = responseBody.data[attempt.expo_ticket_id];
    const providerCode = typeof receipt?.details?.error === 'string' ? receipt.details.error : null;
    const receiptStatus = !receipt ? 'missing' : receipt.status === 'ok' ? 'ok' : 'error';

    const { error: updateError } = await supabase
      .from('native_push_delivery_attempts')
      .update({
        receipt_status: receiptStatus,
        receipt_checked_at: new Date().toISOString(),
        receipt_error_code: providerCode,
        receipt_error_message: getReceiptErrorMessage(receipt),
      })
      .eq('id', attempt.id);

    if (updateError) {
      console.error('Native receipt diagnostic update error', updateError.message);
      return;
    }

    if (providerCode === 'DeviceNotRegistered' && attempt.native_push_token_id) {
      const { error: deleteError } = await supabase
        .from('native_push_tokens')
        .delete()
        .eq('id', attempt.native_push_token_id);
      if (deleteError) {
        console.error('Native stale token cleanup error', deleteError.message);
      } else {
        staleTokens += 1;
      }
    }
  }));

  return json({ checked: attempts.length, staleTokens });
});
