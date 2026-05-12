import type { PubRecord } from './pubDirectory';

export const ROULETTE_MAX_DISTANCE_METERS = 1000;
export const ROULETTE_MAX_WHEEL_PUBS = 12;

export const getRouletteNoPubsMessage = (
  maxDistanceMeters = ROULETTE_MAX_DISTANCE_METERS
) => {
  const distanceKm = maxDistanceMeters / 1000;
  const distanceLabel = Number.isInteger(distanceKm)
    ? `${distanceKm} km`
    : `${distanceKm.toFixed(1)} km`;
  return `The wheel looked within ${distanceLabel} and came back thirsty. Try Refresh or search a pub manually.`;
};

const normalizeKey = (value?: string | null) => (
  value?.trim().toLowerCase().replace(/\s+/g, ' ') || ''
);

const getRoulettePubKey = (pub: PubRecord) => (
  pub.id
  || `${pub.source || 'pub'}:${pub.source_id || `${normalizeKey(pub.name)}:${normalizeKey(pub.city)}`}`
);

const getFiniteDistance = (pub: PubRecord) => {
  const distance = pub.distance_meters;
  return typeof distance === 'number' && Number.isFinite(distance) ? distance : null;
};

export const isRoulettePubInRange = (
  pub: PubRecord,
  maxDistanceMeters = ROULETTE_MAX_DISTANCE_METERS
) => {
  const distance = getFiniteDistance(pub);
  return distance !== null && distance <= maxDistanceMeters;
};

export const prepareRoulettePubs = (
  pubs: PubRecord[],
  {
    maxDistanceMeters = ROULETTE_MAX_DISTANCE_METERS,
    maxItems = ROULETTE_MAX_WHEEL_PUBS,
  } = {}
) => {
  const merged = new Map<string, PubRecord>();

  pubs.forEach((pub) => {
    if (!isRoulettePubInRange(pub, maxDistanceMeters)) return;

    const key = getRoulettePubKey(pub);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, pub);
      return;
    }

    const currentDistance = getFiniteDistance(current) ?? Number.POSITIVE_INFINITY;
    const nextDistance = getFiniteDistance(pub) ?? Number.POSITIVE_INFINITY;
    if (nextDistance < currentDistance) {
      merged.set(key, pub);
    }
  });

  return Array.from(merged.values())
    .sort((a, b) => {
      const distanceDiff = (getFiniteDistance(a) ?? Number.POSITIVE_INFINITY)
        - (getFiniteDistance(b) ?? Number.POSITIVE_INFINITY);
      if (distanceDiff !== 0) return distanceDiff;

      const useCountDiff = (b.use_count || 0) - (a.use_count || 0);
      if (useCountDiff !== 0) return useCountDiff;

      return normalizeKey(a.name).localeCompare(normalizeKey(b.name));
    })
    .slice(0, maxItems);
};

export const pickRouletteWinner = (
  pubs: PubRecord[],
  random = Math.random
) => {
  if (pubs.length === 0) return null;
  const randomValue = Math.max(0, Math.min(0.999999, random()));
  const winnerIndex = Math.floor(randomValue * pubs.length);
  return {
    pub: pubs[winnerIndex],
    winnerIndex,
  };
};

export const getRouletteTargetRotation = (
  winnerIndex: number,
  itemCount: number,
  currentRotation = 0,
  spinTurns = 6
) => {
  if (!Number.isFinite(winnerIndex) || itemCount <= 0) return currentRotation;

  const segmentDegrees = 360 / itemCount;
  const winnerCenterDegrees = winnerIndex * segmentDegrees + segmentDegrees / 2;
  const targetNormalized = (360 - winnerCenterDegrees) % 360;
  const currentNormalized = ((currentRotation % 360) + 360) % 360;
  const extraTurns = Math.max(1, Math.round(spinTurns)) * 360;
  const delta = ((targetNormalized - currentNormalized + 360) % 360) + extraTurns;

  return currentRotation + delta;
};
