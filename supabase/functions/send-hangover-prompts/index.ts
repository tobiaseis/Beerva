// Scheduled hangover prompt delivery.
//
// Intended schedule: every 1-5 minutes via Supabase Scheduled Functions.
// Required secrets:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type HangoverPrompt = {
  id: string;
  user_id: string;
  session_id: string | null;
  pub_crawl_id: string | null;
  prompt_at: string;
};

Deno.serve(async () => {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: prompts, error: claimError } = await supabase.rpc('claim_due_hangover_prompts', {
    batch_size: 50,
  });

  if (claimError) {
    console.error('Hangover prompt claim error', claimError);
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 });
  }

  const claimedPrompts = (prompts || []) as HangoverPrompt[];
  let sent = 0;
  let failed = 0;

  await Promise.all(claimedPrompts.map(async (prompt) => {
    const targetType = prompt.pub_crawl_id ? 'pub_crawl' : 'session';
    const targetId = prompt.pub_crawl_id || prompt.session_id;

    if (!targetId) {
      failed += 1;
      await supabase
        .from('hangover_prompts')
        .update({
          processing_at: null,
          last_error: 'Hangover prompt has no target id.',
        })
        .eq('id', prompt.id);
      return;
    }

    const { data: notification, error: notificationError } = await supabase
      .from('notifications')
      .insert({
        user_id: prompt.user_id,
        actor_id: prompt.user_id,
        type: 'hangover_check',
        reference_id: targetId,
        metadata: {
          prompt_id: prompt.id,
          target_type: targetType,
        },
      })
      .select('id')
      .single();

    if (notificationError) {
      failed += 1;
      await supabase
        .from('hangover_prompts')
        .update({
          processing_at: null,
          last_error: notificationError.message,
        })
        .eq('id', prompt.id);
      return;
    }

    const { error: sentError } = await supabase
      .from('hangover_prompts')
      .update({
        notification_id: notification.id,
        sent_at: new Date().toISOString(),
        processing_at: null,
        last_error: null,
      })
      .eq('id', prompt.id);

    if (sentError) {
      failed += 1;
      console.error('Hangover prompt sent_at update error', sentError);
      return;
    }

    sent += 1;
  }));

  return new Response(JSON.stringify({
    claimed: claimedPrompts.length,
    sent,
    failed,
  }), { status: 200 });
});
