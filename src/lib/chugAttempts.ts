import { BeerCatalogItem, getBeverageCatalogItem, SessionBeer } from './sessionBeers';

export const CHUG_REQUIRED_VOLUME = '33cl';
export const CHUG_CONTAINER_TYPE = 'bottle';
export const CHUG_VIDEO_MAX_SECONDS = 15;
export const CHUG_VIDEO_MAX_MS = CHUG_VIDEO_MAX_SECONDS * 1000;

export type ChugVerificationStatus = 'unverified' | 'verified' | 'rejected';

export type SessionChugAttempt = {
  id: string;
  sessionId: string;
  sessionBeerId: string;
  userId?: string | null;
  verifierUserId?: string | null;
  status: ChugVerificationStatus;
  durationMs: number;
  confidenceScore?: number | null;
  detectedStartMs?: number | null;
  detectedEndMs?: number | null;
  containerType?: string | null;
  requiredVolume?: string | null;
  createdAt?: string | null;
  verifiedAt?: string | null;
  beerName?: string | null;
};

export type SessionChugAttemptRow = {
  id: string;
  session_id: string;
  session_beer_id: string;
  user_id?: string | null;
  verifier_user_id?: string | null;
  status: ChugVerificationStatus | string;
  duration_ms: number;
  confidence_score?: number | null;
  detected_start_ms?: number | null;
  detected_end_ms?: number | null;
  container_type?: string | null;
  required_volume?: string | null;
  created_at?: string | null;
  verified_at?: string | null;
  beer_name?: string | null;
};

const normalizeVolume = (volume?: string | null) => (
  (volume || '').trim().toLowerCase().replace(/\s+/g, '')
);

const normalizeStatus = (status?: string | null): ChugVerificationStatus => {
  if (status === 'verified' || status === 'rejected') return status;
  return 'unverified';
};

export const isBottleChugEligibleBeer = (
  beer: Pick<SessionBeer, 'beer_name' | 'volume'>,
  catalog: BeerCatalogItem[] = []
) => {
  if (normalizeVolume(beer.volume) !== normalizeVolume(CHUG_REQUIRED_VOLUME)) return false;
  const beverage = getBeverageCatalogItem(beer.beer_name || '', catalog);
  return !beverage?.kind || beverage.kind === 'beer';
};

export const formatChugDuration = (durationMs?: number | null) => {
  const safeMs = Math.max(0, Math.round(Number(durationMs) || 0));
  const seconds = safeMs / 1000;
  const decimals = safeMs % 1000 === 0 ? 0 : safeMs % 100 === 0 ? 1 : 2;
  return `${seconds.toFixed(decimals)}s`;
};

export const formatChugStatusLabel = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'verified') return 'Verified';
  if (normalized === 'rejected') return 'Rejected';
  return 'Unverified';
};

export const getChugStatSubtitle = (attempt: Pick<SessionChugAttempt, 'status' | 'requiredVolume' | 'containerType'>) => {
  const volume = attempt.requiredVolume || CHUG_REQUIRED_VOLUME;
  const container = attempt.containerType || CHUG_CONTAINER_TYPE;
  return `${volume} ${container} - ${formatChugStatusLabel(attempt.status)}`;
};

export const getFastestVisibleChugAttempt = <T extends Pick<SessionChugAttempt, 'status' | 'durationMs'>>(
  attempts: T[] = []
) => {
  return attempts
    .filter((attempt) => attempt.status !== 'rejected' && attempt.durationMs > 0)
    .sort((a, b) => a.durationMs - b.durationMs)[0] || null;
};

export const mapChugAttemptRow = (row: SessionChugAttemptRow): SessionChugAttempt => ({
  id: row.id,
  sessionId: row.session_id,
  sessionBeerId: row.session_beer_id,
  userId: row.user_id ?? null,
  verifierUserId: row.verifier_user_id ?? null,
  status: normalizeStatus(row.status),
  durationMs: Math.round(Number(row.duration_ms) || 0),
  confidenceScore: row.confidence_score ?? null,
  detectedStartMs: row.detected_start_ms ?? null,
  detectedEndMs: row.detected_end_ms ?? null,
  containerType: row.container_type ?? CHUG_CONTAINER_TYPE,
  requiredVolume: row.required_volume ?? CHUG_REQUIRED_VOLUME,
  createdAt: row.created_at ?? null,
  verifiedAt: row.verified_at ?? null,
  beerName: row.beer_name ?? null,
});
