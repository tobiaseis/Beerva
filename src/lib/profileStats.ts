export type Stats = {
  totalPints: number;
  uniquePubs: number;
  avgAbv: number;
  maxSessionPints: number;
  strongestAbv: number;
  hasLateNightSession: boolean;
  maxSessionsInOneDay: number;
  maxPubsInOneDay: number;
  maxSessionsAtSamePub: number;
  longestDayStreak: number;
  uniqueBeers: number;
  maxBeersInOneDay: number;
  hasEarlyBirdSession: boolean;
  monthsLogged: number;
  rtdCount: number;
  uniqueRtds: number;
  maxRtdsInOneDay: number;
  jagerbombCount: number;
  maxJagerbombsInOneDay: number;
  sambucaCount: number;
  maxSambucasInOneDay: number;
};

export type TrophyKind =
  | 'pints'
  | 'pubs'
  | 'session'
  | 'abv'
  | 'late'
  | 'spree'
  | 'streak'
  | 'variety'
  | 'morning'
  | 'calendar'
  | 'rtd'
  | 'jager'
  | 'sambuca';

export type TrophyDefinition = {
  id: string;
  title: string;
  description: string;
  kind: TrophyKind;
  earned: boolean;
};

export type ProfileSessionStatsRow = {
  session_id?: string | null;
  pub_id?: string | null;
  pub_name?: string | null;
  beer_name?: string | null;
  volume?: string | null;
  quantity?: number | null;
  abv?: number | null;
  created_at?: string | null;
  session_started_at?: string | null;
};

export const emptyStats: Stats = {
  totalPints: 0,
  uniquePubs: 0,
  avgAbv: 0,
  maxSessionPints: 0,
  strongestAbv: 0,
  hasLateNightSession: false,
  maxSessionsInOneDay: 0,
  maxPubsInOneDay: 0,
  maxSessionsAtSamePub: 0,
  longestDayStreak: 0,
  uniqueBeers: 0,
  maxBeersInOneDay: 0,
  hasEarlyBirdSession: false,
  monthsLogged: 0,
  rtdCount: 0,
  uniqueRtds: 0,
  maxRtdsInOneDay: 0,
  jagerbombCount: 0,
  maxJagerbombsInOneDay: 0,
  sambucaCount: 0,
  maxSambucasInOneDay: 0,
};

// A "drinking day" runs 6am-to-6am local time, so sessions from a long night out
// (e.g. 11pm to 2am) all bucket into the same day instead of splitting at midnight.
const DAY_ROLLOVER_HOURS = 6;
const COPENHAGEN_TIME_ZONE = 'Europe/Copenhagen';

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

const getCopenhagenParts = (createdAt?: string | null, shiftHours = 0): LocalDateParts | null => {
  if (!createdAt) return null;

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;

  const shiftedDate = shiftHours === 0
    ? date
    : new Date(date.getTime() - shiftHours * 60 * 60 * 1000);

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: COPENHAGEN_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(shiftedDate);

    const values = parts.reduce<Record<string, number>>((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = Number(part.value);
      }
      return acc;
    }, {});

    if (
      !Number.isFinite(values.year)
      || !Number.isFinite(values.month)
      || !Number.isFinite(values.day)
      || !Number.isFinite(values.hour)
    ) {
      return null;
    }

    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
    };
  } catch {
    const fallbackDate = shiftedDate;
    return {
      year: fallbackDate.getFullYear(),
      month: fallbackDate.getMonth() + 1,
      day: fallbackDate.getDate(),
      hour: fallbackDate.getHours(),
    };
  }
};

const dateKeyFromParts = (parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>) => (
  `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
);

const localDateKey = (createdAt?: string | null): string | null => {
  const parts = getCopenhagenParts(createdAt, DAY_ROLLOVER_HOURS);
  return parts ? dateKeyFromParts(parts) : null;
};

export const getVolumeMl = (volume?: string | null) => {
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

const roundStat = (value: number) => Math.round(value * 10) / 10;

const isLateNightSession = (createdAt?: string | null) => {
  const parts = getCopenhagenParts(createdAt);
  return parts ? parts.hour >= 3 && parts.hour < 6 : false;
};

const getPubKey = (session: ProfileSessionStatsRow) => (
  session.pub_id || session.pub_name?.trim().toLowerCase() || null
);

const getBeerKey = (beerName?: string | null) => {
  const normalized = beerName?.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized || null;
};

const getBeverageStatKey = (beerName?: string | null) => {
  const normalized = beerName
    ?.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[øö]/g, 'o')
    .replace(/[æä]/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return normalized || null;
};

const RTD_BEVERAGE_KEYS = new Set([
  'Breezer Lime',
  'Breezer Mango',
  'Breezer Orange',
  'Breezer Pineapple',
  'Breezer Watermelon',
  'Breezer Passion Fruit',
  'Breezer Strawberry',
  'Breezer Blueberry',
  'Smirnoff Ice Original',
  'Smirnoff Ice Raspberry',
  'Smirnoff Ice Tropical',
  'Smirnoff Ice Green Apple',
  'Shaker Original',
  'Shaker Orange',
  'Shaker Passion',
  'Shaker Sport',
  'Shaker Sport Pink',
  'Cult Mokai',
  'Mokaï Hyldeblomst',
  'Mokaï Pop Pink',
  'Mokaï Pink Apple',
  'Mokaï Peach',
  'Mokaï Blueberry',
  'Somersby Apple Cider',
  'Somersby Blackberry',
  'Somersby Elderflower Lime',
  'Somersby Sparkling Rosé',
  'Somersby Mango Lime',
  'Tempt Cider No. 7',
  'Tempt Cider No. 9',
  'Rekorderlig Strawberry-Lime',
  'Rekorderlig Wild Berries',
  'Garage Hard Lemon',
  'Garage Hard Lemonade',
  "Gordon's Gin & Tonic",
  "Gordon's Pink Gin & Tonic",
  'Captain Morgan & Cola',
  "Jack Daniel's & Cola",
  'Bacardi Mojito RTD',
  'Absolut Vodka Soda Raspberry',
].map((name) => getBeverageStatKey(name)!));

const JAGERBOMB_KEYS = new Set(['jagerbomb', 'jager bomb', 'jaegerbomb', 'jaeger bomb']);
const SAMBUCA_KEYS = new Set(['sambuca shot', 'sambuca', 'sambuca shots', 'black sambuca', 'sambucca', 'sambucca shot']);

const isRtdBeverage = (beerName?: string | null) => {
  const key = getBeverageStatKey(beerName);
  return key ? RTD_BEVERAGE_KEYS.has(key) : false;
};

const isJagerbomb = (beerName?: string | null) => {
  const key = getBeverageStatKey(beerName);
  return key ? JAGERBOMB_KEYS.has(key) : false;
};

const isSambuca = (beerName?: string | null) => {
  const key = getBeverageStatKey(beerName);
  return key ? SAMBUCA_KEYS.has(key) : false;
};

const getSessionCreatedAt = (session: ProfileSessionStatsRow) => (
  session.session_started_at || session.created_at
);

export const calculateStats = (sessions: ProfileSessionStatsRow[] = []): Stats => {
  if (sessions.length === 0) {
    return emptyStats;
  }

  const uniquePubs = new Set(sessions.map(getPubKey).filter(Boolean)).size;
  const uniqueBeerSet = new Set<string>();
  const monthsPerYear = new Map<number, Set<number>>();
  const sessionsPerDay = new Map<string, Set<string>>();
  const sessionsPerPub = new Map<string, Set<string>>();
  const pubsPerDay = new Map<string, Set<string>>();
  const beersPerDay = new Map<string, Set<string>>();
  const rtdsPerDay = new Map<string, number>();
  const jagerbombsPerDay = new Map<string, number>();
  const sambucasPerDay = new Map<string, number>();
  const pintsPerSession = new Map<string, number>();

  let totalMl = 0;
  let weightedAbvSum = 0;
  let maxSessionPints = 0;
  let strongestAbv = 0;
  let hasLateNightSession = false;
  let hasEarlyBirdSession = false;
  let rtdCount = 0;
  let jagerbombCount = 0;
  let sambucaCount = 0;
  const uniqueRtdSet = new Set<string>();

  sessions.forEach((session, index) => {
    const sessionKey = session.session_id || `row-${index}`;
    const volumeMl = getVolumeMl(session.volume);
    const quantity = session.quantity || 1;
    const abv = session.abv || 0;
    const pubKey = getPubKey(session);
    const beerKey = getBeerKey(session.beer_name);
    const sessionCreatedAt = getSessionCreatedAt(session);
    const sessionVolumeMl = volumeMl * quantity;
    const sessionPints = sessionVolumeMl / 568;
    const beverageStatKey = getBeverageStatKey(session.beer_name);
    const isRtd = isRtdBeverage(session.beer_name);
    const isJager = isJagerbomb(session.beer_name);
    const isSambu = isSambuca(session.beer_name);

    totalMl += sessionVolumeMl;
    weightedAbvSum += sessionVolumeMl * abv;
    pintsPerSession.set(sessionKey, (pintsPerSession.get(sessionKey) || 0) + sessionPints);
    if (!isRtd && !isJager && !isSambu) {
      strongestAbv = Math.max(strongestAbv, abv);
    }
    hasLateNightSession = hasLateNightSession || isLateNightSession(sessionCreatedAt);
    if (isRtd) {
      rtdCount += quantity;
      if (beverageStatKey) uniqueRtdSet.add(beverageStatKey);
    }
    if (isJager) {
      jagerbombCount += quantity;
    }
    if (isSambu) {
      sambucaCount += quantity;
    }

    if (beerKey) uniqueBeerSet.add(beerKey);
    if (pubKey) {
      if (!sessionsPerPub.has(pubKey)) sessionsPerPub.set(pubKey, new Set());
      sessionsPerPub.get(pubKey)!.add(sessionKey);
    }

    const dayKey = localDateKey(sessionCreatedAt);
    if (dayKey) {
      if (!sessionsPerDay.has(dayKey)) sessionsPerDay.set(dayKey, new Set());
      sessionsPerDay.get(dayKey)!.add(sessionKey);
      if (pubKey) {
        if (!pubsPerDay.has(dayKey)) pubsPerDay.set(dayKey, new Set());
        pubsPerDay.get(dayKey)!.add(pubKey);
      }
      if (beerKey) {
        if (!beersPerDay.has(dayKey)) beersPerDay.set(dayKey, new Set());
        beersPerDay.get(dayKey)!.add(beerKey);
      }
      if (isRtd) {
        rtdsPerDay.set(dayKey, (rtdsPerDay.get(dayKey) || 0) + quantity);
      }
      if (isJager) {
        jagerbombsPerDay.set(dayKey, (jagerbombsPerDay.get(dayKey) || 0) + quantity);
      }
      if (isSambu) {
        sambucasPerDay.set(dayKey, (sambucasPerDay.get(dayKey) || 0) + quantity);
      }
    }

    const localSessionParts = getCopenhagenParts(sessionCreatedAt);
    if (localSessionParts) {
      if (localSessionParts.hour >= 6 && localSessionParts.hour < 10) {
        hasEarlyBirdSession = true;
      }

      if (!monthsPerYear.has(localSessionParts.year)) {
        monthsPerYear.set(localSessionParts.year, new Set());
      }
      monthsPerYear.get(localSessionParts.year)!.add(localSessionParts.month);
    }
  });

  let maxSessionsInOneDay = 0;
  sessionsPerDay.forEach((set) => {
    if (set.size > maxSessionsInOneDay) maxSessionsInOneDay = set.size;
  });

  let maxPubsInOneDay = 0;
  pubsPerDay.forEach((set) => {
    if (set.size > maxPubsInOneDay) maxPubsInOneDay = set.size;
  });

  let maxBeersInOneDay = 0;
  beersPerDay.forEach((set) => {
    if (set.size > maxBeersInOneDay) maxBeersInOneDay = set.size;
  });

  let maxRtdsInOneDay = 0;
  rtdsPerDay.forEach((count) => {
    if (count > maxRtdsInOneDay) maxRtdsInOneDay = count;
  });

  let maxJagerbombsInOneDay = 0;
  jagerbombsPerDay.forEach((count) => {
    if (count > maxJagerbombsInOneDay) maxJagerbombsInOneDay = count;
  });

  let maxSambucasInOneDay = 0;
  sambucasPerDay.forEach((count) => {
    if (count > maxSambucasInOneDay) maxSambucasInOneDay = count;
  });

  let maxSessionsAtSamePub = 0;
  sessionsPerPub.forEach((set) => {
    if (set.size > maxSessionsAtSamePub) maxSessionsAtSamePub = set.size;
  });

  pintsPerSession.forEach((pints) => {
    if (pints > maxSessionPints) maxSessionPints = pints;
  });

  let monthsLogged = 0;
  monthsPerYear.forEach((months) => {
    if (months.size > monthsLogged) monthsLogged = months.size;
  });

  // Longest consecutive-day streak
  const sortedDays = Array.from(sessionsPerDay.keys()).sort();
  let longestDayStreak = 0;
  let currentStreak = 0;
  let prevTime = -Infinity;
  const ONE_DAY_MS = 86400000;
  for (const key of sortedDays) {
    const [y, m, d] = key.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    if (currentStreak === 0) {
      currentStreak = 1;
    } else if (Math.round((t - prevTime) / ONE_DAY_MS) === 1) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }
    if (currentStreak > longestDayStreak) longestDayStreak = currentStreak;
    prevTime = t;
  }

  return {
    totalPints: roundStat(totalMl / 568),
    uniquePubs,
    avgAbv: totalMl > 0 ? roundStat(weightedAbvSum / totalMl) : 0,
    maxSessionPints: roundStat(maxSessionPints),
    strongestAbv: roundStat(strongestAbv),
    hasLateNightSession,
    maxSessionsInOneDay,
    maxPubsInOneDay,
    maxSessionsAtSamePub,
    longestDayStreak,
    uniqueBeers: uniqueBeerSet.size,
    maxBeersInOneDay,
    hasEarlyBirdSession,
    monthsLogged,
    rtdCount,
    uniqueRtds: uniqueRtdSet.size,
    maxRtdsInOneDay,
    jagerbombCount,
    maxJagerbombsInOneDay,
    sambucaCount,
    maxSambucasInOneDay,
  };
};

export const getTrophies = (stats: Stats): TrophyDefinition[] => {
  const totalPintTrophies = [10, 50, 100, 200, 500, 1000].map((threshold) => ({
    id: `total-${threshold}`,
    title: `${threshold} Pint Club`,
    description: `${threshold}+ true pints recorded`,
    kind: 'pints' as const,
    earned: stats.totalPints >= threshold,
  }));

  const pubTrophies = [5, 10, 20, 50, 100].map((threshold) => ({
    id: `pubs-${threshold}`,
    title: `${threshold} Pub Tour`,
    description: `${threshold}+ unique pubs visited`,
    kind: 'pubs' as const,
    earned: stats.uniquePubs >= threshold,
  }));

  const sessionTrophies = [5, 10, 15, 20, 25].map((threshold) => ({
    id: `session-${threshold}`,
    title: `${threshold} Pint Session`,
    description: `${threshold}+ true pints in one session`,
    kind: 'session' as const,
    earned: stats.maxSessionPints >= threshold,
  }));

  const abvTrophies = [6, 7, 8, 9, 10, 11].map((threshold) => ({
    id: `abv-${threshold}`,
    title: `Over ${threshold}% ABV`,
    description: `Logged a beer above ${threshold}%`,
    kind: 'abv' as const,
    earned: stats.strongestAbv > threshold,
  }));

  const spreeTrophies: TrophyDefinition[] = [
    {
      id: 'spree-3',
      title: 'Triple Round',
      description: '3+ sessions logged in one day',
      kind: 'spree',
      earned: stats.maxSessionsInOneDay >= 3,
    },
    {
      id: 'spree-5',
      title: 'High Five',
      description: '5+ sessions logged in one day',
      kind: 'spree',
      earned: stats.maxSessionsInOneDay >= 5,
    },
    {
      id: 'spree-7',
      title: 'Lucky Seven',
      description: '7+ sessions logged in one day',
      kind: 'spree',
      earned: stats.maxSessionsInOneDay >= 7,
    },
  ];

  const extraTrophies: TrophyDefinition[] = [
    {
      id: 'pub-crawler',
      title: 'Pub Crawler',
      description: '3+ different pubs in one day',
      kind: 'pubs',
      earned: stats.maxPubsInOneDay >= 3,
    },
    {
      id: 'local-legend',
      title: 'Local Legend',
      description: '10+ sessions at the same pub',
      kind: 'pubs',
      earned: stats.maxSessionsAtSamePub >= 10,
    },
    {
      id: 'streak-3',
      title: 'Hat Trick',
      description: 'Sessions on 3 days in a row',
      kind: 'streak',
      earned: stats.longestDayStreak >= 3,
    },
    {
      id: 'streak-7',
      title: 'Week-long Tour',
      description: 'Sessions on 7 days in a row',
      kind: 'streak',
      earned: stats.longestDayStreak >= 7,
    },
    {
      id: 'sommelier',
      title: 'Beverage Sommelier',
      description: '25+ unique drinks tried',
      kind: 'variety',
      earned: stats.uniqueBeers >= 25,
    },
    {
      id: 'variety-pack',
      title: 'Variety Pack',
      description: '3+ different drinks in one day',
      kind: 'variety',
      earned: stats.maxBeersInOneDay >= 3,
    },
    {
      id: 'early-bird',
      title: 'Early Bird',
      description: 'Logged a session between 6–10am',
      kind: 'morning',
      earned: stats.hasEarlyBirdSession,
    },
    {
      id: 'all-year-round',
      title: 'All Year Round',
      description: 'At least one session in every month of one year',
      kind: 'calendar',
      earned: stats.monthsLogged >= 12,
    },
  ];

  const beverageTrophies: TrophyDefinition[] = [
    {
      id: 'rtd-first',
      title: 'Ready To Drink',
      description: 'Logged your first RTD',
      kind: 'rtd',
      earned: stats.rtdCount >= 1,
    },
    {
      id: 'rtd-10',
      title: 'Premix Regular',
      description: '10+ RTDs logged',
      kind: 'rtd',
      earned: stats.rtdCount >= 10,
    },
    {
      id: 'rtd-variety',
      title: 'Cooler Rainbow',
      description: '5+ different RTDs tried',
      kind: 'rtd',
      earned: stats.uniqueRtds >= 5,
    },
    {
      id: 'rtd-day-3',
      title: 'Shaker Round',
      description: '3+ RTDs in one drinking day',
      kind: 'rtd',
      earned: stats.maxRtdsInOneDay >= 3,
    },
    {
      id: 'jager-first',
      title: 'No Longer a Yogameister',
      description: 'Congratulations with your first Jägerbomb. You are no longer a Yogameister.',
      kind: 'jager',
      earned: stats.jagerbombCount >= 1,
    },
    {
      id: 'jagermeister',
      title: 'JägerMeister',
      description: '20+ Jägerbombs logged',
      kind: 'jager',
      earned: stats.jagerbombCount >= 20,
    },
    {
      id: 'jager-100',
      title: 'More bombs than WW2',
      description: '100+ Jägerbombs logged',
      kind: 'jager',
      earned: stats.jagerbombCount >= 100,
    },
    {
      id: 'jager-day-10',
      title: 'Bombs Away',
      description: '10+ Jägerbombs in one drinking day',
      kind: 'jager',
      earned: stats.maxJagerbombsInOneDay >= 10,
    },
    {
      id: 'sambuca-first',
      title: 'Liquid Fire',
      description: 'Logged your first Sambuca shot. Feel the burn.',
      kind: 'sambuca',
      earned: stats.sambucaCount >= 1,
    },
    {
      id: 'sambuca-50',
      title: 'Sambuca Veteran',
      description: '50+ Sambuca shots logged',
      kind: 'sambuca',
      earned: stats.sambucaCount >= 50,
    },
    {
      id: 'sambuca-day-3',
      title: 'Flaming Trio',
      description: '3+ Sambuca shots in one drinking day',
      kind: 'sambuca',
      earned: stats.maxSambucasInOneDay >= 3,
    },
    {
      id: 'sambuca-day-10',
      title: 'Flaming Inferno',
      description: '10+ Sambuca shots in one drinking day',
      kind: 'sambuca',
      earned: stats.maxSambucasInOneDay >= 10,
    },
  ];

  return [
    {
      id: 'first-pint',
      title: 'First Pint',
      description: 'Record your first drink session',
      kind: 'pints',
      earned: stats.totalPints > 0,
    },
    ...totalPintTrophies,
    ...pubTrophies,
    ...sessionTrophies,
    ...abvTrophies,
    ...spreeTrophies,
    ...extraTrophies,
    ...beverageTrophies,
    {
      id: 'late-night',
      title: 'Late Night Beer',
      description: 'Record a session after 3am',
      kind: 'late',
      earned: stats.hasLateNightSession,
    },
  ];
};
