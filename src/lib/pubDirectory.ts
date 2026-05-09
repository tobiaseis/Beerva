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

export type OsmPubCandidate = {
  name: string;
  city?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source_id: string;
  source_tags: Record<string, string>;
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

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_RADIUS_METERS = 10000;
const MAX_OSM_PUBS_TO_CACHE = 120;

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

export const fetchAndCacheNearbyPubs = async (
  location: UserLocation,
  query = ''
): Promise<PubRecord[]> => {
  const { data, error } = await supabase.functions.invoke('nearby-pubs', {
    body: {
      latitude: location.latitude,
      longitude: location.longitude,
      query,
    },
  });

  if (error) {
    throw new Error(error.message || 'Nearby pub lookup failed.');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return ((data?.pubs || []) as PubRecord[]);
};

const toAddress = (tags: Record<string, string>) => {
  const street = tags['addr:street'];
  const houseNumber = tags['addr:housenumber'];
  const postcode = tags['addr:postcode'];

  const streetLine = [street, houseNumber].filter(Boolean).join(' ');
  return [streetLine, postcode].filter(Boolean).join(', ') || null;
};

const buildOverpassQuery = (location: UserLocation) => {
  const lat = location.latitude.toFixed(6);
  const lon = location.longitude.toFixed(6);
  const radius = OVERPASS_RADIUS_METERS;

  return `
[out:json][timeout:18];
(
  node(around:${radius},${lat},${lon})["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"];
  way(around:${radius},${lat},${lon})["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"];
  relation(around:${radius},${lat},${lon})["amenity"~"^(pub|bar|biergarten|nightclub)$"]["name"];
  node(around:${radius},${lat},${lon})["craft"="brewery"]["name"];
  way(around:${radius},${lat},${lon})["craft"="brewery"]["name"];
  relation(around:${radius},${lat},${lon})["craft"="brewery"]["name"];
  node(around:${radius},${lat},${lon})["microbrewery"="yes"]["name"];
  way(around:${radius},${lat},${lon})["microbrewery"="yes"]["name"];
  relation(around:${radius},${lat},${lon})["microbrewery"="yes"]["name"];
  node(around:${radius},${lat},${lon})["bar"="yes"]["name"];
  way(around:${radius},${lat},${lon})["bar"="yes"]["name"];
  relation(around:${radius},${lat},${lon})["bar"="yes"]["name"];
);
out center tags ${MAX_OSM_PUBS_TO_CACHE};
`.trim();
};

const pubMatchesQuery = (pub: OsmPubCandidate, query: string) => {
  const cleanQuery = normalize(query);
  if (cleanQuery.length < 2) return true;

  return [pub.name, pub.city || '', pub.address || '']
    .some((value) => normalize(value).includes(cleanQuery));
};

const distanceBetween = (a: UserLocation, b: UserLocation) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(x));
};

export const fetchOsmPubsNear = async (
  location: UserLocation,
  query = '',
  signal?: AbortSignal
): Promise<OsmPubCandidate[]> => {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: `data=${encodeURIComponent(buildOverpassQuery(location))}`,
    signal,
  });

  if (!response.ok) {
    throw new Error(`OpenStreetMap pub lookup failed (${response.status})`);
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
      city: tags['addr:city'] || tags['is_in:city'] || tags['addr:municipality'] || null,
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

  return Array.from(pubsBySource.values())
    .sort((a, b) => {
      const aDistance = a.latitude && a.longitude
        ? distanceBetween(location, { latitude: a.latitude, longitude: a.longitude })
        : Number.POSITIVE_INFINITY;
      const bDistance = b.latitude && b.longitude
        ? distanceBetween(location, { latitude: b.latitude, longitude: b.longitude })
        : Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    })
    .slice(0, MAX_OSM_PUBS_TO_CACHE);
};

export const cacheOsmPubs = async (pubs: OsmPubCandidate[], userId: string) => {
  if (pubs.length === 0) return;

  const { error } = await supabase
    .from('pubs')
    .upsert(
      pubs.map((pub) => ({
        name: pub.name,
        city: pub.city || null,
        address: pub.address || null,
        latitude: pub.latitude ?? null,
        longitude: pub.longitude ?? null,
        source: 'osm',
        source_id: pub.source_id,
        source_tags: pub.source_tags,
        status: 'active',
        created_by: userId,
      })),
      { onConflict: 'source,source_id', ignoreDuplicates: true }
    );

  if (error) throw error;
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
