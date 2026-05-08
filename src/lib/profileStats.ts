export type Stats = {
  totalPints: number;
  uniquePubs: number;
  avgAbv: number;
  maxSessionPints: number;
  strongestAbv: number;
  hasLateNightSession: boolean;
};

export type TrophyKind = 'pints' | 'pubs' | 'session' | 'abv' | 'late';

export type TrophyDefinition = {
  id: string;
  title: string;
  description: string;
  kind: TrophyKind;
  earned: boolean;
};

export type ProfileSessionStatsRow = {
  pub_name?: string | null;
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
};

export const getVolumeMl = (volume?: string | null) => {
  switch (volume?.toLowerCase()) {
    case '25cl':
      return 250;
    case '33cl':
      return 330;
    case 'schooner':
      return 379;
    case '50cl':
      return 500;
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

export const calculateStats = (sessions: ProfileSessionStatsRow[] = []): Stats => {
  if (sessions.length === 0) {
    return emptyStats;
  }

  const uniquePubs = new Set(sessions.map((session) => session.pub_name).filter(Boolean)).size;
  let totalMl = 0;
  let weightedAbvSum = 0;
  let maxSessionPints = 0;
  let strongestAbv = 0;
  let hasLateNightSession = false;

  sessions.forEach((session) => {
    const volumeMl = getVolumeMl(session.volume);
    const quantity = session.quantity || 1;
    const abv = session.abv || 0;
    const sessionVolumeMl = volumeMl * quantity;
    const sessionPints = sessionVolumeMl / 568;

    totalMl += sessionVolumeMl;
    weightedAbvSum += sessionVolumeMl * abv;
    maxSessionPints = Math.max(maxSessionPints, sessionPints);
    strongestAbv = Math.max(strongestAbv, abv);
    hasLateNightSession = hasLateNightSession || isLateNightSession(session.created_at);
  });

  return {
    totalPints: roundStat(totalMl / 568),
    uniquePubs,
    avgAbv: totalMl > 0 ? roundStat(weightedAbvSum / totalMl) : 0,
    maxSessionPints: roundStat(maxSessionPints),
    strongestAbv: roundStat(strongestAbv),
    hasLateNightSession,
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
    {
      id: 'late-night',
      title: 'Late Night Beer',
      description: 'Record a session after 3am',
      kind: 'late',
      earned: stats.hasLateNightSession,
    },
  ];
};
