import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const jwtRole = (token: string): string | null => {
  try {
    return JSON.parse(atob(token.split('.')[1])).role ?? null;
  } catch {
    return null;
  }
};

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 120000;
const UPSERT_CHUNK = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: Record<string, string>;
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
  },
});

const buildOverpassQuery = (countryCode: string) => `
[out:json][timeout:120];
area["ISO3166-1"="${countryCode}"]->.country;
(
  node["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"](area.country);
  way["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"](area.country);
  relation["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"](area.country);
  node["craft"="brewery"]["name"](area.country);
  way["craft"="brewery"]["name"](area.country);
  relation["craft"="brewery"]["name"](area.country);
  node["microbrewery"="yes"]["name"](area.country);
  way["microbrewery"="yes"]["name"](area.country);
  relation["microbrewery"="yes"]["name"](area.country);
);
out center tags;
`.trim();

const toAddress = (tags: Record<string, string>) => {
  const street = tags['addr:street'];
  const houseNumber = tags['addr:housenumber'];
  const postcode = tags['addr:postcode'];
  const streetLine = [street, houseNumber].filter(Boolean).join(' ');
  return [streetLine, postcode].filter(Boolean).join(', ') || null;
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
    return jsonResponse({ error: 'Unauthorized — service_role JWT required.' }, 401);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const countryCode = String(body?.country || 'DK').toUpperCase().slice(0, 3);
  if (!/^[A-Z]{2,3}$/.test(countryCode)) {
    return jsonResponse({ error: 'Invalid country code (use ISO 3166-1, e.g. DK)' }, 400);
  }

  const controller = new AbortController();
  const fetchTimer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);

  let elements: OverpassElement[] = [];
  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Beerva/1.0 (https://beerva.vercel.app)',
      },
      body: new URLSearchParams({ data: buildOverpassQuery(countryCode) }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      return jsonResponse({
        error: `Overpass returned ${response.status}${errorBody ? `: ${errorBody.slice(0, 200)}` : ''}`,
      }, 502);
    }

    const payload = await response.json();
    elements = Array.isArray(payload?.elements) ? payload.elements as OverpassElement[] : [];
  } catch (err: any) {
    return jsonResponse({ error: err?.message || 'Overpass request failed' }, 502);
  } finally {
    clearTimeout(fetchTimer);
  }

  const rowsByKey = new Map<string, Record<string, unknown>>();
  for (const element of elements) {
    const tags = element.tags || {};
    const rawName = tags.name?.trim();
    if (!rawName) continue;

    const trimmedLength = rawName.length;
    if (trimmedLength < 2 || trimmedLength > 120) continue;
    if (typeof element.id !== 'number' || !element.type) continue;

    const latitude = element.lat ?? element.center?.lat ?? null;
    const longitude = element.lon ?? element.center?.lon ?? null;
    if (latitude === null || longitude === null) continue;

    const sourceId = `${element.type}/${element.id}`;
    rowsByKey.set(sourceId, {
      name: rawName,
      city: tags['addr:city'] || tags['addr:town'] || tags['is_in:city'] || tags['addr:municipality'] || null,
      address: toAddress(tags),
      latitude,
      longitude,
      source: 'osm',
      source_id: sourceId,
      source_tags: tags,
      status: 'active',
      created_by: null,
    });
  }

  const rows = Array.from(rowsByKey.values());
  const admin = createClient(supabaseUrl, supabaseServiceKey);

  let inserted = 0;
  const failedChunks: { index: number; error: string }[] = [];
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error: upsertError } = await admin
      .from('pubs')
      .upsert(chunk, { onConflict: 'source,source_id', ignoreDuplicates: true });

    if (upsertError) {
      failedChunks.push({ index: i / UPSERT_CHUNK, error: upsertError.message });
      console.error(`Seed chunk ${i / UPSERT_CHUNK} failed:`, upsertError.message);
    } else {
      inserted += chunk.length;
    }
  }

  return jsonResponse({
    countryCode,
    overpass_returned: elements.length,
    candidates: rows.length,
    upserted_chunks: inserted,
    failed_chunks: failedChunks,
  });
});
