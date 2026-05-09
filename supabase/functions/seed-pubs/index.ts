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

const firstTag = (tags: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return null;
};

const toCity = (tags: Record<string, string>) => {
  const directCity = firstTag(tags, [
    'addr:city',
    'addr:town',
    'addr:village',
    'addr:hamlet',
    'addr:municipality',
    'is_in:city',
    'is_in:town',
    'is_in:village',
  ]);
  if (directCity) return directCity;

  const isIn = tags.is_in || '';
  const fallback = isIn
    .split(/[,;]/)
    .map((part) => part.trim())
    .find((part) => (
      part
      && !['denmark', 'danmark'].includes(part.toLowerCase())
      && !part.toLowerCase().endsWith(' region')
      && !part.toLowerCase().endsWith(' kommune')
      && !part.toLowerCase().endsWith(' municipality')
    ));

  return fallback || null;
};

const toAddress = (tags: Record<string, string>, city?: string | null) => {
  const fullAddress = firstTag(tags, ['addr:full']);
  if (fullAddress) return fullAddress;

  const street = firstTag(tags, ['addr:street', 'addr:place']);
  const houseNumber = firstTag(tags, ['addr:housenumber']);
  const postcode = firstTag(tags, ['addr:postcode']);
  const streetLine = [street, houseNumber].filter(Boolean).join(' ');
  const postalLine = postcode ? [postcode, city].filter(Boolean).join(' ') : null;
  return [streetLine, postalLine].filter(Boolean).join(', ') || null;
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
    const city = toCity(tags);
    rowsByKey.set(sourceId, {
      name: rawName,
      city,
      address: toAddress(tags, city),
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
    const { data: affectedRows, error: upsertError } = await admin
      .rpc('upsert_osm_pubs', { pub_rows: chunk });

    if (upsertError) {
      failedChunks.push({ index: i / UPSERT_CHUNK, error: upsertError.message });
      console.error(`Seed chunk ${i / UPSERT_CHUNK} failed:`, upsertError.message);
    } else {
      inserted += Number(affectedRows || 0);
    }
  }

  return jsonResponse({
    countryCode,
    overpass_returned: elements.length,
    candidates: rows.length,
    upserted_rows: inserted,
    failed_chunks: failedChunks,
  });
});
