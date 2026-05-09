import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const foursquareApiKey = Deno.env.get('FSQ_API_KEY') || Deno.env.get('FOURSQUARE_API_KEY') || '';
const foursquareMonthlyCallLimit = Number(Deno.env.get('FSQ_MONTHLY_CALL_LIMIT') || '450');

const FOURSQUARE_SEARCH_URL = 'https://api.foursquare.com/v3/places/search';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_RADIUS_METERS = 10000;
const MAX_RADIUS_METERS = 12000;
const MAX_OSM_PUBS_TO_CACHE = 140;
const EXTERNAL_FETCH_TIMEOUT_MS = 9000;
const FOURSQUARE_BAR_CATEGORY_ID = '4bf58dd8d48988d116941735';

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
  source_tags: Record<string, unknown>;
};

type ProviderPubCandidate = OsmPubCandidate & {
  source: 'osm' | 'foursquare';
};

type FoursquarePlace = {
  fsq_id?: string;
  name?: string;
  location?: {
    address?: string;
    locality?: string;
    postcode?: string;
    region?: string;
    country?: string;
    formatted_address?: string;
  };
  geocodes?: {
    main?: {
      latitude?: number;
      longitude?: number;
    };
  };
  categories?: Array<{
    id?: number | string;
    name?: string;
  }>;
};

type PlacesUsageReservation = {
  allowed?: boolean;
  call_count?: number;
  monthly_limit?: number;
  month_start?: string;
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

const isDrinkingPlace = (place: FoursquarePlace, query: string) => {
  const cleanQuery = normalize(query);
  const name = normalize(place.name || '');
  const categoryNames = (place.categories || []).map((category) => normalize(category.name || ''));
  const categoryText = categoryNames.join(' ');
  const drinkWords = ['bar', 'pub', 'beer', 'brew', 'brewery', 'tap', 'tavern', 'nightclub', 'night club', 'cocktail', 'wine'];

  if (drinkWords.some((word) => categoryText.includes(word) || name.includes(word))) return true;
  if (cleanQuery.length >= 3 && name.includes(cleanQuery)) return true;
  return false;
};

const fetchFoursquarePubsNear = async (
  location: UserLocation,
  query: string,
  radiusMeters: number,
): Promise<ProviderPubCandidate[]> => {
  if (!foursquareApiKey) return [];

  const params = new URLSearchParams({
    ll: `${location.latitude},${location.longitude}`,
    radius: String(radiusMeters),
    limit: '50',
    sort: 'DISTANCE',
    fields: 'fsq_id,name,location,geocodes,categories',
  });

  if (query.trim()) {
    params.set('query', query.trim());
  } else {
    params.set('categories', FOURSQUARE_BAR_CATEGORY_ID);
  }

  let response = await fetchWithTimeout(`${FOURSQUARE_SEARCH_URL}?${params.toString()}`, {
    headers: {
      Authorization: foursquareApiKey,
      'X-Places-Api-Version': '1970-01-01',
      Accept: 'application/json',
    },
  });

  if (!response.ok && !query.trim() && params.has('categories')) {
    params.delete('categories');
    params.set('query', 'bar');
    response = await fetchWithTimeout(`${FOURSQUARE_SEARCH_URL}?${params.toString()}`, {
      headers: {
        Authorization: foursquareApiKey,
        'X-Places-Api-Version': '1970-01-01',
        Accept: 'application/json',
      },
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Foursquare returned ${response.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results as FoursquarePlace[] : [];

  return results
    .filter((place) => place.fsq_id && place.name && isDrinkingPlace(place, query))
    .map((place) => {
      const latitude = place.geocodes?.main?.latitude ?? null;
      const longitude = place.geocodes?.main?.longitude ?? null;
      const city = place.location?.locality || null;
      const address = place.location?.formatted_address
        || [place.location?.address, place.location?.postcode].filter(Boolean).join(', ')
        || null;

      return {
        name: place.name!.trim(),
        city,
        address,
        latitude,
        longitude,
        source: 'foursquare' as const,
        source_id: place.fsq_id!,
        source_tags: {
          fsq_id: place.fsq_id!,
          categories: place.categories || [],
          location: place.location || {},
        },
      };
    });
};

const reserveFoursquareCall = async (admin: any) => {
  const monthlyLimit = Number.isFinite(foursquareMonthlyCallLimit)
    ? Math.max(0, Math.floor(foursquareMonthlyCallLimit))
    : 450;

  const { data, error } = await admin.rpc('reserve_places_api_call', {
    provider_name: 'foursquare',
    provider_monthly_limit: monthlyLimit,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row || {
    allowed: false,
    call_count: 0,
    monthly_limit: monthlyLimit,
  }) as PlacesUsageReservation;
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
  let usage: PlacesUsageReservation | null = null;
  let provider: 'cache' | 'foursquare' | 'osm' = 'cache';

  try {
    let providerPubs: ProviderPubCandidate[] = [];

    if (foursquareApiKey) {
      try {
        usage = await reserveFoursquareCall(admin);
      } catch (error: any) {
        lookupError = error?.message || 'Foursquare usage cap unavailable';
        console.error('Foursquare usage cap error:', lookupError);
      }

      if (usage?.allowed) {
        try {
          providerPubs = await fetchFoursquarePubsNear({ latitude, longitude }, query, radiusMeters);
          if (providerPubs.length > 0) {
            provider = 'foursquare';
          }
        } catch (error: any) {
          lookupError = error?.message || 'Foursquare lookup failed';
          console.error('Foursquare lookup error:', lookupError);
        }
      } else if (usage) {
        lookupError = `Foursquare monthly cap reached (${usage.call_count || 0}/${usage.monthly_limit || 0})`;
      }
    }

    if (providerPubs.length === 0) {
      const osmPubs = await fetchOsmPubsNear({ latitude, longitude }, query, radiusMeters);
      providerPubs = osmPubs.map((pub) => ({
        ...pub,
        source: 'osm' as const,
      }));
      if (providerPubs.length > 0) {
        provider = 'osm';
      }
    }

    cached = providerPubs.length;

    if (providerPubs.length > 0) {
      const { error: upsertError } = await admin
        .from('pubs')
        .upsert(
          providerPubs.map((pub) => ({
            name: pub.name,
            city: pub.city || null,
            address: pub.address || null,
            latitude: pub.latitude ?? null,
            longitude: pub.longitude ?? null,
            source: pub.source,
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
    provider,
    usage,
  });
});
