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
  | 'calendar';

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
};

// A "drinking day" runs 6am-to-6am local time, so sessions from a long night out
// (e.g. 11pm to 2am) all bucket into the same day instead of splitting at midnight.
const DAY_ROLLOVER_HOURS = 6;

const localDateKey = (createdAt?: string | null): string | null => {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() - DAY_ROLLOVER_HOURS * 60 * 60 * 1000);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`;
};

export const getVolumeMl = (volume?: string | null) => {
  switch (volume?.toLowerCase()) {
    case '25cl':
      return 250;
    case '33cl':
      return 330;
    case 'schooner':
      return 379;
    case '40cl':
      return 400;
    case '50cl':
      return 500;
    case '1l':
    case '1 l':
    case '100cl':
      return 1000;
    case 'pint':
    default:
      return 568;
  }
};

const roundStat = (value: number) => Math.round(value * 10) / 10;

const isLateNightSession = (createdAt?: string | null) => {
  if (!createdAt) return false;

  const hour = new Date(createdAt).getHours();
  return hour >= 3 && hour < 6;
};

const getPubKey = (session: ProfileSessionStatsRow) => (
  session.pub_id || session.pub_name?.trim().toLowerCase() || null
);

export const calculateStats = (sessions: ProfileSessionStatsRow[] = []): Stats => {
  if (sessions.length === 0) {
    return emptyStats;
  }

  const uniquePubs = new Set(sessions.map(getPubKey).filter(Boolean)).size;
  const uniqueBeerSet = new Set<string>();
  const monthsLoggedSet = new Set<number>();
  const sessionsPerDay = new Map<string, Set<string>>();
  const sessionsPerPub = new Map<string, Set<string>>();
  const pubsPerDay = new Map<string, Set<string>>();
  const beersPerDay = new Map<string, Set<string>>();
  const pintsPerSession = new Map<string, number>();

  let totalMl = 0;
  let weightedAbvSum = 0;
  let maxSessionPints = 0;
  let strongestAbv = 0;
  let hasLateNightSession = false;
  let hasEarlyBirdSession = false;

  sessions.forEach((session, index) => {
    const sessionKey = session.session_id || `row-${index}`;
    const volumeMl = getVolumeMl(session.volume);
    const quantity = session.quantity || 1;
    const abv = session.abv || 0;
    const pubKey = getPubKey(session);
    const sessionVolumeMl = volumeMl * quantity;
    const sessionPints = sessionVolumeMl / 568;

    totalMl += sessionVolumeMl;
    weightedAbvSum += sessionVolumeMl * abv;
    pintsPerSession.set(sessionKey, (pintsPerSession.get(sessionKey) || 0) + sessionPints);
    strongestAbv = Math.max(strongestAbv, abv);
    hasLateNightSession = hasLateNightSession || isLateNightSession(session.created_at);

    if (session.beer_name) uniqueBeerSet.add(session.beer_name);
    if (pubKey) {
      if (!sessionsPerPub.has(pubKey)) sessionsPerPub.set(pubKey, new Set());
      sessionsPerPub.get(pubKey)!.add(sessionKey);
    }

    const dayKey = localDateKey(session.created_at);
    if (dayKey) {
      if (!sessionsPerDay.has(dayKey)) sessionsPerDay.set(dayKey, new Set());
      sessionsPerDay.get(dayKey)!.add(sessionKey);
      if (pubKey) {
        if (!pubsPerDay.has(dayKey)) pubsPerDay.set(dayKey, new Set());
        pubsPerDay.get(dayKey)!.add(pubKey);
      }
      if (session.beer_name) {
        if (!beersPerDay.has(dayKey)) beersPerDay.set(dayKey, new Set());
        beersPerDay.get(dayKey)!.add(session.beer_name);
      }
    }

    if (session.created_at) {
      const d = new Date(session.created_at);
      if (!Number.isNaN(d.getTime())) {
        const hour = d.getHours();
        if (hour >= 6 && hour < 10) hasEarlyBirdSession = true;
        monthsLoggedSet.add(d.getMonth());
      }
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

  let maxSessionsAtSamePub = 0;
  sessionsPerPub.forEach((set) => {
    if (set.size > maxSessionsAtSamePub) maxSessionsAtSamePub = set.size;
  });

  pintsPerSession.forEach((pints) => {
    if (pints > maxSessionPints) maxSessionPints = pints;
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
    monthsLogged: monthsLoggedSet.size,
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
      title: 'Beer Sommelier',
      description: '25+ unique beers tried',
      kind: 'variety',
      earned: stats.uniqueBeers >= 25,
    },
    {
      id: 'variety-pack',
      title: 'Variety Pack',
      description: '3+ different beers in one day',
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
      description: 'At least one session in all 12 months',
      kind: 'calendar',
      earned: stats.monthsLogged >= 12,
    },
  ];

  return [
    {
      id: 'first-pint',
      title: 'First Pint',
      description: 'Record your first beer session',
      kind: 'pints',
      earned: stats.totalPints > 0,
    },
    ...totalPintTrophies,
    ...pubTrophies,
    ...sessionTrophies,
    ...abvTrophies,
    ...spreeTrophies,
    ...extraTrophies,
    {
      id: 'late-night',
      title: 'Late Night Beer',
      description: 'Record a session after 3am',
      kind: 'late',
      earned: stats.hasLateNightSession,
    },
  ];
};
