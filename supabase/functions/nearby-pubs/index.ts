import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_RADIUS_METERS = 10000;
const MAX_RADIUS_METERS = 12000;
const MAX_OSM_PUBS_TO_CACHE = 140;
const EXTERNAL_FETCH_TIMEOUT_MS = 9000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type UserLocation = {
  latitude: number;
  longitude: number;
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

type OsmPubCandidate = {
  name: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source_id: string;
  source_tags: Record<string, string>;
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
  },
});

const normalize = (value: string) => value.trim().toLowerCase();

const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const toAddress = (tags: Record<string, string>) => {
  const street = tags['addr:street'];
  const houseNumber = tags['addr:housenumber'];
  const postcode = tags['addr:postcode'];

  const streetLine = [street, houseNumber].filter(Boolean).join(' ');
  return [streetLine, postcode].filter(Boolean).join(', ') || null;
};

const pubMatchesQuery = (pub: OsmPubCandidate, query: string) => {
  const cleanQuery = normalize(query);
  if (cleanQuery.length < 2) return true;

  return [pub.name, pub.city || '', pub.address || '']
    .some((value) => normalize(value).includes(cleanQuery));
};

const buildOverpassQuery = (location: UserLocation, radiusMeters: number) => {
  const lat = location.latitude.toFixed(6);
  const lon = location.longitude.toFixed(6);

  return `
[out:json][timeout:18];
(
  node(around:${radiusMeters},${lat},${lon})["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"];
  way(around:${radiusMeters},${lat},${lon})["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"];
  relation(around:${radiusMeters},${lat},${lon})["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"];
  node(around:${radiusMeters},${lat},${lon})["craft"="brewery"]["name"];
  way(around:${radiusMeters},${lat},${lon})["craft"="brewery"]["name"];
  relation(around:${radiusMeters},${lat},${lon})["craft"="brewery"]["name"];
  node(around:${radiusMeters},${lat},${lon})["microbrewery"="yes"]["name"];
  way(around:${radiusMeters},${lat},${lon})["microbrewery"="yes"]["name"];
  relation(around:${radiusMeters},${lat},${lon})["microbrewery"="yes"]["name"];
  node(around:${radiusMeters},${lat},${lon})["bar"="yes"]["name"];
  way(around:${radiusMeters},${lat},${lon})["bar"="yes"]["name"];
  relation(around:${radiusMeters},${lat},${lon})["bar"="yes"]["name"];
);
out center tags ${MAX_OSM_PUBS_TO_CACHE};
`.trim();
};

const fetchOsmPubsNear = async (
  location: UserLocation,
  query: string,
  radiusMeters: number,
): Promise<OsmPubCandidate[]> => {
  const response = await fetchWithTimeout(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'User-Agent': 'Beerva/1.0 (https://beerva.vercel.app)',
    },
    body: new URLSearchParams({
      data: buildOverpassQuery(location, radiusMeters),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenStreetMap returned ${response.status}`);
  }

  const payload = await response.json();
  const elements = Array.isArray(payload?.elements) ? payload.elements as OverpassElement[] : [];
  const pubsBySource = new Map<string, OsmPubCandidate>();

  elements.forEach((element) => {
    const tags = element.tags || {};
    const name = tags.name?.trim();
    const latitude = element.lat ?? element.center?.lat ?? null;
    const longitude = element.lon ?? element.center?.lon ?? null;

    if (!name || typeof element.id !== 'number' || !element.type || latitude === null || longitude === null) {
      return;
    }

    const sourceId = `${element.type}/${element.id}`;
    const candidate: OsmPubCandidate = {
      name,
      city: tags['addr:city'] || tags['addr:town'] || tags['is_in:city'] || tags['addr:municipality'] || null,
      address: toAddress(tags),
      latitude,
      longitude,
      source_id: sourceId,
      source_tags: tags,
    };

    if (pubMatchesQuery(candidate, query)) {
      pubsBySource.set(sourceId, candidate);
    }
  });

  return Array.from(pubsBySource.values());
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('authorization') || '';
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  const radiusMeters = Math.min(
    Math.max(Number(body?.radiusMeters) || DEFAULT_RADIUS_METERS, 1000),
    MAX_RADIUS_METERS,
  );

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return jsonResponse({ error: 'Invalid coordinates' }, 400);
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  let cached = 0;
  let lookupError: string | null = null;

  try {
    const osmPubs = await fetchOsmPubsNear({ latitude, longitude }, query, radiusMeters);
    cached = osmPubs.length;

    if (osmPubs.length > 0) {
      const { error: upsertError } = await admin
        .from('pubs')
        .upsert(
          osmPubs.map((pub) => ({
            name: pub.name,
            city: pub.city || null,
            address: pub.address || null,
            latitude: pub.latitude ?? null,
            longitude: pub.longitude ?? null,
            source: 'osm',
            source_id: pub.source_id,
            source_tags: pub.source_tags,
            status: 'active',
            created_by: user.id,
          })),
          { onConflict: 'source,source_id', ignoreDuplicates: true },
        );

      if (upsertError) throw upsertError;
    }
  } catch (error: any) {
    lookupError = error?.message || 'OpenStreetMap lookup failed';
    console.error('Nearby pubs lookup error:', lookupError);
  }

  const { data: pubs, error: searchError } = await admin.rpc('search_pubs', {
    search_query: query,
    user_lat: latitude,
    user_lon: longitude,
    result_limit: 24,
  });

  if (searchError) {
    return jsonResponse({ error: searchError.message }, 500);
  }

  if ((!pubs || pubs.length === 0) && lookupError) {
    return jsonResponse({ error: lookupError }, 502);
  }

  return jsonResponse({
    pubs: pubs || [],
    cached,
    lookupError,
  });
});
