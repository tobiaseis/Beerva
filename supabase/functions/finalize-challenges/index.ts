import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('CHALLENGE_FINALIZER_CRON_SECRET') || '';

Deno.serve(async (req) => {
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'CHALLENGE_FINALIZER_CRON_SECRET is not configured' }), { status: 500 });
  }

  const customSecret = req.headers.get('x-beerva-cron-secret') || '';
  const legacyAuth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const legacyBearerSecret = legacyAuth.startsWith('Bearer ') ? legacyAuth.slice('Bearer '.length) : '';

  if (customSecret !== cronSecret && legacyBearerSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.rpc('finalize_due_challenges', {
    batch_size: 10,
  });

  if (error) {
    console.error('Challenge finalization error', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const { data: genericData, error: genericError } = await supabase.rpc('finalize_generic_due_challenges', {
    batch_size: 10,
  });

  if (genericError) {
    console.error('Generic challenge finalization error', genericError);
    return new Response(JSON.stringify({ error: genericError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({
    finalized: (Array.isArray(data) ? data.length : 0) + (Array.isArray(genericData) ? genericData.length : 0),
    results: [...(data || []), ...(genericData || [])],
  }), { status: 200 });
});
