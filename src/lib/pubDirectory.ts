import { supabase } from './supabase';

export type UserLocation = {
  latitude: number;
  longitude: number;
};

export type PubRecord = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
  source_id?: string | null;
  use_count?: number | null;
  distance_meters?: number | null;
};

const NEARBY_PUB_LOOKUP_TIMEOUT_MS = 12000;

const normalize = (value: string) => value.trim().toLowerCase();

export const formatPubLabel = (pub: Pick<PubRecord, 'name' | 'city'>) => {
  const city = pub.city?.trim();
  if (!city || normalize(pub.name).includes(normalize(city))) return pub.name;
  return `${pub.name}, ${city}`;
};

export const formatPubDetail = (pub: Pick<PubRecord, 'address' | 'distance_meters' | 'source'>) => {
  const details: string[] = [];

  if (typeof pub.distance_meters === 'number') {
    if (pub.distance_meters < 1000) {
      details.push(`${Math.max(10, Math.round(pub.distance_meters / 10) * 10)} m`);
    } else {
      details.push(`${(pub.distance_meters / 1000).toFixed(1)} km`);
    }
  }

  if (pub.address) details.push(pub.address);
  if (pub.source === 'user') details.push('Added by Beerva');

  return details.join(' / ');
};

export const labelsMatchPub = (label: string, pub: PubRecord) => {
  const cleanLabel = normalize(label);
  return cleanLabel === normalize(pub.name) || cleanLabel === normalize(formatPubLabel(pub));
};

export const searchCachedPubs = async (
  query: string,
  location?: UserLocation | null,
  limit = 20
): Promise<PubRecord[]> => {
  const { data, error } = await supabase.rpc('search_pubs', {
    search_query: query,
    user_lat: location?.latitude ?? null,
    user_lon: location?.longitude ?? null,
    result_limit: limit,
  });

  if (error) throw error;
  return (data || []) as PubRecord[];
};

export type NearbyPubDiagnostics = {
  osm_returned: number;
  osm_validated: number;
  upsert_ok: boolean;
  pubs_matched: number;
};

export type NearbyPubLookup = {
  pubs: PubRecord[];
  lookupError: string | null;
  diagnostics: NearbyPubDiagnostics | null;
};

export const fetchAndCacheNearbyPubs = async (
  location: UserLocation,
  query = ''
): Promise<NearbyPubLookup> => {
  let timeoutRef: ReturnType<typeof setTimeout> | null = null;
  const lookup = supabase.functions.invoke('nearby-pubs', {
    body: {
      latitude: location.latitude,
      longitude: location.longitude,
      query,
    },
  });

  const timeout = new Promise<never>((_, reject) => {
    timeoutRef = setTimeout(() => {
      reject(new Error('Pub lookup timed out. Try again in a moment.'));
    }, NEARBY_PUB_LOOKUP_TIMEOUT_MS);
  });

  const { data, error } = await Promise.race([lookup, timeout]).finally(() => {
    if (timeoutRef) clearTimeout(timeoutRef);
  });

  if (error) {
    let detail: string | null = null;
    const context = (error as any)?.context;
    if (context && typeof context.clone === 'function') {
      try {
        const body = await context.clone().json();
        detail = body?.error || body?.message || null;
      } catch {
        try {
          detail = await context.clone().text();
        } catch {
          detail = null;
        }
      }
    }
    throw new Error(detail || error.message || 'Nearby pub lookup failed.');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return {
    pubs: (data?.pubs || []) as PubRecord[],
    lookupError: typeof data?.lookupError === 'string' ? data.lookupError : null,
    diagnostics: (data?.diagnostics ?? null) as NearbyPubDiagnostics | null,
  };
};

export const createUserPub = async (
  name: string,
  location?: UserLocation | null
): Promise<PubRecord> => {
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error('Pub name is too short.');

  const existingPubs = await searchCachedPubs(cleanName, location, 8).catch(() => []);
  const exactMatch = existingPubs.find((pub) => labelsMatchPub(cleanName, pub));
  if (exactMatch) return exactMatch;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not logged in!');

  const { data, error } = await supabase
    .from('pubs')
    .insert({
      name: cleanName,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      source: 'user',
      status: 'active',
      created_by: user.id,
    })
    .select('id, name, city, address, latitude, longitude, source, source_id, use_count')
    .single();

  if (error) throw error;
  return data as PubRecord;
};

export const incrementPubUseCount = async (pubId?: string | null) => {
  if (!pubId) return;

  const { error } = await supabase.rpc('increment_pub_use_count', {
    target_pub_id: pubId,
  });

  if (error) {
    console.warn('Could not update pub use count:', error.message);
  }
};
