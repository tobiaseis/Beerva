import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const NOMINATIM_LOOKUP_URL = 'https://nominatim.openstreetmap.org/lookup';
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const LOOKUP_BATCH_SIZE = 50;
const DEFAULT_DELAY_MS = 1100;
const MIN_DELAY_MS = 1000;
const MAX_DELAY_MS = 5000;
const FETCH_TIMEOUT_MS = 20000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PubRow = {
  id: string;
  name: string;
  source_id: string | null;
  city: string | null;
  address: string | null;
};

type NominatimLookupRow = {
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  address?: Record<string, string>;
};

type PubUpdate = {
  id: string;
  city?: string | null;
  address?: string | null;
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
  },
});

const jwtRole = (token: string): string | null => {
  try {
    return JSON.parse(atob(token.split('.')[1])).role ?? null;
  } catch {
    return null;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const sourceIdToLookupId = (sourceId?: string | null) => {
  const match = sourceId?.match(/^(node|way|relation)\/(\d+)$/i);
  if (!match) return null;

  const prefix = match[1].toLowerCase() === 'node'
    ? 'N'
    : match[1].toLowerCase() === 'way'
      ? 'W'
      : 'R';
  return `${prefix}${match[2]}`;
};

const lookupRowToSourceId = (row: NominatimLookupRow) => {
  if (!row.osm_type || typeof row.osm_id !== 'number') return null;
  return `${row.osm_type.toLowerCase()}/${row.osm_id}`;
};

const clean = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed || null;
};

const firstAddressValue = (address: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = clean(address[key]);
    if (value) return value;
  }
  return null;
};

const cityFromAddress = (address: Record<string, string>) => firstAddressValue(address, [
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'suburb',
  'county',
]);

const conciseAddressFromLookup = (row: NominatimLookupRow) => {
  const address = row.address || {};
  const city = cityFromAddress(address);
  const street = firstAddressValue(address, [
    'road',
    'pedestrian',
    'footway',
    'residential',
    'path',
    'square',
    'neighbourhood',
  ]);
  const houseNumber = firstAddressValue(address, ['house_number']);
  const postcode = firstAddressValue(address, ['postcode']);

  const streetLine = [street, houseNumber].filter(Boolean).join(' ');
  const postalLine = postcode ? [postcode, city].filter(Boolean).join(' ') : null;
  const structuredAddress = [streetLine, postalLine].filter(Boolean).join(', ');
  if (structuredAddress) return structuredAddress;

  const displayParts = (row.display_name || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return displayParts.slice(1, 4).join(', ') || null;
};

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('authorization') || '';
  const presentedToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!presentedToken || jwtRole(presentedToken) !== 'service_role') {
    return jsonResponse({ error: 'Unauthorized - service_role JWT required.' }, 401);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const limit = Math.min(Math.max(Number(body?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const delayMs = Math.min(Math.max(Number(body?.delayMs) || DEFAULT_DELAY_MS, MIN_DELAY_MS), MAX_DELAY_MS);
  const dryRun = Boolean(body?.dryRun);
  const language = typeof body?.language === 'string' && body.language.trim()
    ? body.language.trim()
    : 'da,en';

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: pubs, error: pubsError } = await admin
    .from('pubs')
    .select('id, name, source_id, city, address')
    .eq('source', 'osm')
    .eq('status', 'active')
    .not('source_id', 'is', null)
    .or('city.is.null,address.is.null')
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (pubsError) {
    return jsonResponse({ error: pubsError.message }, 500);
  }

  const lookupItems = ((pubs || []) as PubRow[])
    .map((pub) => ({
      pub,
      lookupId: sourceIdToLookupId(pub.source_id),
    }))
    .filter((item): item is { pub: PubRow; lookupId: string } => Boolean(item.lookupId));

  const pubBySourceId = new Map<string, PubRow>();
  lookupItems.forEach(({ pub }) => {
    if (pub.source_id) pubBySourceId.set(pub.source_id.toLowerCase(), pub);
  });

  const updates: PubUpdate[] = [];
  const failedBatches: { index: number; error: string }[] = [];
  const nominatimEmail = clean(Deno.env.get('NOMINATIM_EMAIL'));
  const siteUrl = clean(Deno.env.get('EXPO_PUBLIC_SITE_URL')) || 'https://beerva.vercel.app';
  const userAgent = nominatimEmail
    ? `Beerva/1.0 (${siteUrl}; ${nominatimEmail})`
    : `Beerva/1.0 (${siteUrl})`;

  const lookupChunks = chunk(lookupItems, LOOKUP_BATCH_SIZE);
  for (let index = 0; index < lookupChunks.length; index += 1) {
    if (index > 0) {
      await sleep(delayMs);
    }

    const lookupIds = lookupChunks[index].map((item) => item.lookupId).join(',');
    const params = new URLSearchParams({
      osm_ids: lookupIds,
      format: 'jsonv2',
      addressdetails: '1',
      'accept-language': language,
    });
    if (nominatimEmail) params.set('email', nominatimEmail);

    try {
      const response = await fetchWithTimeout(`${NOMINATIM_LOOKUP_URL}?${params.toString()}`, {
        headers: {
          'User-Agent': userAgent,
          Referer: siteUrl,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        failedBatches.push({
          index,
          error: `Nominatim returned ${response.status}${errorBody ? `: ${errorBody.slice(0, 180)}` : ''}`,
        });
        continue;
      }

      const payload = await response.json();
      const lookupRows = Array.isArray(payload) ? payload as NominatimLookupRow[] : [];
      for (const row of lookupRows) {
        const sourceId = lookupRowToSourceId(row);
        if (!sourceId) continue;

        const pub = pubBySourceId.get(sourceId.toLowerCase());
        if (!pub) continue;

        const rowCity = cityFromAddress(row.address || {});
        const rowAddress = conciseAddressFromLookup(row);
        const needsCity = !clean(pub.city) && rowCity;
        const needsAddress = !clean(pub.address) && rowAddress;

        if (needsCity || needsAddress) {
          updates.push({
            id: pub.id,
            city: needsCity ? rowCity : null,
            address: needsAddress ? rowAddress : null,
          });
        }
      }
    } catch (error: any) {
      failedBatches.push({
        index,
        error: error?.message || 'Nominatim lookup failed',
      });
    }
  }

  let updatedRows = 0;
  if (!dryRun && updates.length > 0) {
    const { data: affectedRows, error: updateError } = await admin.rpc('update_pub_enrichments', {
      pub_updates: updates,
    });

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 500);
    }
    updatedRows = Number(affectedRows || 0);
  }

  const { count: remainingMissing } = await admin
    .from('pubs')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'osm')
    .eq('status', 'active')
    .or('city.is.null,address.is.null');

  return jsonResponse({
    selected: (pubs || []).length,
    lookup_candidates: lookupItems.length,
    nominatim_requests: lookupChunks.length,
    enriched_candidates: updates.length,
    updated_rows: dryRun ? 0 : updatedRows,
    dry_run: dryRun,
    remaining_missing: remainingMissing ?? null,
    failed_batches: failedBatches,
  });
});
