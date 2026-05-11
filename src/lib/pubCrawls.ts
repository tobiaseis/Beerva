export type PubCrawlBeerRow = {
  id?: string | null;
  session_id?: string | null;
  beer_name?: string | null;
  volume?: string | null;
  quantity?: number | string | null;
  abv?: number | string | null;
  consumed_at?: string | null;
  created_at?: string | null;
};

export type PubCrawlStopRow = {
  id?: string | null;
  pub_crawl_id?: string | null;
  crawl_stop_order?: number | string | null;
  pub_id?: string | null;
  pub_name?: string | null;
  image_url?: string | null;
  comment?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  published_at?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  pubs?: {
    latitude?: number | string | null;
    longitude?: number | string | null;
    city?: string | null;
    address?: string | null;
  } | null;
  session_beers?: PubCrawlBeerRow[] | null;
};

export type PubCrawlRow = {
  id?: string | null;
  user_id?: string | null;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  profiles?: {
    username?: string | null;
    avatar_url?: string | null;
  } | null;
  pub_crawl_cheers?: unknown[] | null;
  pub_crawl_comments?: unknown[] | null;
  stops?: PubCrawlStopRow[] | null;
};

export type PubCrawlBeer = {
  id: string | null;
  sessionId: string | null;
  beerName: string;
  volume: string | null;
  quantity: number;
  abv: number | null;
  consumedAt: string | null;
};

export type PubCrawlStop = {
  id: string;
  crawlId: string | null;
  stopOrder: number;
  pubId: string | null;
  pubName: string;
  imageUrl: string | null;
  comment: string | null;
  startedAt: string | null;
  endedAt: string | null;
  publishedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  address: string | null;
  beers: PubCrawlBeer[];
};

export type PubCrawl = {
  id: string;
  userId: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  username: string | null;
  avatarUrl: string | null;
  cheersCount: number;
  commentsCount: number;
  cheerProfiles: PubCrawlProfile[];
  comments: PubCrawlComment[];
  stops: PubCrawlStop[];
};

export type PubCrawlProfile = {
  id: string;
  username: string | null;
  avatarUrl: string | null;
};

export type PubCrawlComment = {
  id: string;
  crawlId: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  profile: PubCrawlProfile | null;
};

export type PubCrawlSummary = {
  barCount: number;
  drinkCount: number;
  truePints: number;
  averageAbv: number | null;
  routeLabel: string;
};

export type PubCrawlMediaSlide =
  | { id: 'map'; type: 'map' }
  | { id: string; type: 'photo'; stopId: string; stopOrder: number; pubName: string; imageUrl: string };

const toNumber = (value: number | string | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNullableNumber = (value: number | string | null | undefined) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toStringOrNull = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const roundStat = (value: number) => Math.round(value * 10) / 10;

const getServingVolumeMl = (volume?: string | null) => {
  const normalizedVolume = volume?.trim().toLowerCase().replace(',', '.') || 'pint';
  const compactVolume = normalizedVolume.replace(/\s+/g, '');
  const numericValue = Number(compactVolume.replace(/(ml|cl|l)$/, ''));

  if (compactVolume === 'schooner') return 379;

  if (Number.isFinite(numericValue)) {
    if (compactVolume.endsWith('ml')) return numericValue;
    if (compactVolume.endsWith('cl')) return numericValue * 10;
    if (compactVolume.endsWith('l')) return numericValue * 1000;
  }

  return 568;
};

const mapBeerRow = (row: PubCrawlBeerRow): PubCrawlBeer => ({
  id: toStringOrNull(row.id),
  sessionId: toStringOrNull(row.session_id),
  beerName: toStringOrNull(row.beer_name) || 'Drink',
  volume: toStringOrNull(row.volume),
  quantity: Math.max(1, Math.round(toNumber(row.quantity) || 1)),
  abv: row.abv === null || row.abv === undefined ? null : toNumber(row.abv),
  consumedAt: toStringOrNull(row.consumed_at) || toStringOrNull(row.created_at),
});

export const mapPubCrawlStopRow = (row: PubCrawlStopRow): PubCrawlStop => ({
  id: toStringOrNull(row.id) || 'unknown',
  crawlId: toStringOrNull(row.pub_crawl_id),
  stopOrder: Math.max(1, Math.round(toNumber(row.crawl_stop_order) || 1)),
  pubId: toStringOrNull(row.pub_id),
  pubName: toStringOrNull(row.pub_name) || 'Unknown pub',
  imageUrl: toStringOrNull(row.image_url),
  comment: toStringOrNull(row.comment),
  startedAt: toStringOrNull(row.started_at),
  endedAt: toStringOrNull(row.ended_at),
  publishedAt: toStringOrNull(row.published_at),
  latitude: toNullableNumber(row.pubs?.latitude ?? row.latitude),
  longitude: toNullableNumber(row.pubs?.longitude ?? row.longitude),
  city: toStringOrNull(row.pubs?.city),
  address: toStringOrNull(row.pubs?.address),
  beers: (row.session_beers || []).map(mapBeerRow),
});

export const mapPubCrawlRow = (row: PubCrawlRow): PubCrawl => ({
  id: toStringOrNull(row.id) || 'unknown',
  userId: toStringOrNull(row.user_id) || 'unknown',
  status: toStringOrNull(row.status) || 'published',
  startedAt: toStringOrNull(row.started_at),
  endedAt: toStringOrNull(row.ended_at),
  publishedAt: toStringOrNull(row.published_at),
  createdAt: toStringOrNull(row.created_at),
  username: toStringOrNull(row.profiles?.username),
  avatarUrl: toStringOrNull(row.profiles?.avatar_url),
  cheersCount: row.pub_crawl_cheers?.length || 0,
  commentsCount: row.pub_crawl_comments?.length || 0,
  cheerProfiles: [],
  comments: [],
  stops: (row.stops || [])
    .map(mapPubCrawlStopRow)
    .sort((a, b) => a.stopOrder - b.stopOrder),
});

export const calculatePubCrawlSummary = (stops: PubCrawlStop[] = []): PubCrawlSummary => {
  let drinkCount = 0;
  let totalMl = 0;
  let weightedAbv = 0;
  let abvVolumeMl = 0;

  stops.forEach((stop) => {
    stop.beers.forEach((beer) => {
      const quantity = Math.max(1, beer.quantity || 1);
      const volumeMl = getServingVolumeMl(beer.volume);
      const drinkMl = volumeMl * quantity;
      drinkCount += quantity;
      totalMl += drinkMl;
      if (typeof beer.abv === 'number') {
        weightedAbv += drinkMl * beer.abv;
        abvVolumeMl += drinkMl;
      }
    });
  });

  return {
    barCount: stops.length,
    drinkCount,
    truePints: roundStat(totalMl / 568),
    averageAbv: abvVolumeMl > 0 ? roundStat(weightedAbv / abvVolumeMl) : null,
    routeLabel: stops.map((stop) => stop.pubName).join(' -> '),
  };
};

export const buildPubCrawlMediaSlides = (stops: PubCrawlStop[] = []): PubCrawlMediaSlide[] => [
  { id: 'map', type: 'map' },
  ...stops
    .filter((stop) => Boolean(stop.imageUrl))
    .map((stop) => ({
      id: `photo-${stop.id}`,
      type: 'photo' as const,
      stopId: stop.id,
      stopOrder: stop.stopOrder,
      pubName: stop.pubName,
      imageUrl: stop.imageUrl as string,
    })),
];
