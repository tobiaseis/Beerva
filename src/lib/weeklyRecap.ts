import { supabase } from './supabase';
import { withTimeout } from './timeouts';

const WEEKLY_RECAP_TIMEOUT_MS = 15000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type WeeklyRecapChallenge = {
  slug: string;
  title: string;
  metricType: 'alcohol_units' | 'true_pints';
  challengeType: string;
  rank: number | null;
  progressValue: number;
  entrants: number;
};

export type WeeklyRecapMate = {
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  nightsOut: number;
};

export type WeeklyRecap = {
  weekStart: string;
  weekEnd: string;
  isCurrentWeek: boolean;
  nightsOut: number;
  units: number;
  drinks: number;
  posts: number;
  pubs: number;
  topPub: string | null;
  seenBy: number;
  cheers: number;
  comments: number;
  bestRun: number;
  weeklyStreak: number;
  challenges: WeeklyRecapChallenge[];
  matesOut: number;
  mates: WeeklyRecapMate[];
};

const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toCount = (value: unknown) => Math.max(0, Math.round(toNumber(value)));

const toText = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export const mapWeeklyRecap = (row: any): WeeklyRecap => ({
  weekStart: toText(row?.week_start) || '',
  weekEnd: toText(row?.week_end) || '',
  isCurrentWeek: row?.is_current_week === true,
  nightsOut: toCount(row?.nights_out),
  units: Math.round(toNumber(row?.units) * 10) / 10,
  drinks: toCount(row?.drinks),
  posts: toCount(row?.posts),
  pubs: toCount(row?.pubs),
  topPub: toText(row?.top_pub),
  seenBy: toCount(row?.seen_by),
  cheers: toCount(row?.cheers),
  comments: toCount(row?.comments),
  bestRun: toCount(row?.best_run),
  weeklyStreak: toCount(row?.weekly_streak),
  challenges: asArray(row?.challenges)
    .filter((challenge) => toText(challenge?.slug))
    .map((challenge) => ({
      slug: toText(challenge.slug) as string,
      title: toText(challenge.title) || 'Challenge',
      metricType: challenge.metric_type === 'alcohol_units' ? 'alcohol_units' : 'true_pints',
      challengeType: toText(challenge.challenge_type) || 'leaderboard',
      rank: challenge.rank === null || challenge.rank === undefined ? null : toCount(challenge.rank) || null,
      progressValue: toNumber(challenge.progress_value),
      entrants: toCount(challenge.entrants),
    })),
  matesOut: toCount(row?.mates_out),
  mates: asArray(row?.mates)
    .filter((mate) => toText(mate?.user_id))
    .map((mate) => ({
      userId: toText(mate.user_id) as string,
      username: toText(mate.username),
      avatarUrl: toText(mate.avatar_url),
      nightsOut: toCount(mate.nights_out),
    })),
});

export const isRecapEmpty = (recap: WeeklyRecap) => recap.nightsOut === 0 && recap.matesOut === 0;

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
};

// "23–29 Nov", "30 Nov – 6 Dec", "28 Dec – 3 Jan". Parsed by hand so device
// time zones never shift the dates.
export const formatWeekRange = (weekStart: string, weekEnd: string) => {
  const start = parseIsoDate(weekStart);
  const end = parseIsoDate(weekEnd);
  if (!start.day || !end.day) return '';
  if (start.month === end.month) {
    return `${start.day}–${end.day} ${MONTHS[end.month - 1]}`;
  }
  return `${start.day} ${MONTHS[start.month - 1]} – ${end.day} ${MONTHS[end.month - 1]}`;
};

export const shiftWeek = (weekStart: string, weeks: number) => {
  const { year, month, day } = parseIsoDate(weekStart);
  const shifted = new Date(Date.UTC(year, month - 1, day + weeks * 7));
  return shifted.toISOString().slice(0, 10);
};

export const fetchWeeklyRecap = async (weekStart: string | null): Promise<WeeklyRecap | null> => {
  const { data, error } = await withTimeout(
    supabase.rpc('get_weekly_recap', { target_week_start: weekStart || null }),
    WEEKLY_RECAP_TIMEOUT_MS,
    'Your week is taking too long to load.'
  );
  if (error) throw error;
  return data ? mapWeeklyRecap(data) : null;
};
