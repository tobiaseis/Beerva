// Push and in-app copy for scheduled engagement notifications.
//
// Imported by the send-push Edge Function (Deno) and by the app, so push text
// and the notifications list never drift apart. Keep it free of imports so
// both runtimes can load it.

export type EngagementMetadata = {
  week_start?: string | null;
  weekly_streak?: number | string | null;
  mate_names?: unknown;
  mates_out?: number | string | null;
  nights_out?: number | string | null;
  seen_by?: number | string | null;
};

export type EngagementCopy = {
  title: string;
  body: string;
};

const toCount = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const toNames = (value: unknown) => (
  Array.isArray(value)
    ? value
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      .map((name) => name.trim())
    : []
);

export const formatMateNames = (names: string[], total: number) => {
  if (names.length === 0) return '';
  const others = Math.max(0, total - names.length);
  if (others > 0) {
    return `${names.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`;
  }
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

export const buildFridayNudgeCopy = (metadata?: EngagementMetadata | null): EngagementCopy => {
  const weeklyStreak = toCount(metadata?.weekly_streak);
  const names = toNames(metadata?.mate_names);
  const matesOut = Math.max(toCount(metadata?.mates_out), names.length);

  if (weeklyStreak >= 2) {
    return {
      title: 'Keep the streak alive 🔥',
      body: `You're on a ${weeklyStreak}-week streak. One night out this weekend keeps it going.`,
    };
  }

  if (names.length > 0) {
    return {
      title: "Weekend's here 🍻",
      body: `${formatMateNames(names, matesOut)} ${matesOut === 1 ? 'was' : 'were'} out last weekend. Plans tonight?`,
    };
  }

  return {
    title: "Weekend's here 🍻",
    body: 'Heading out tonight? Log your first round on Beerva.',
  };
};

export const buildWeeklyRecapCopy = (metadata?: EngagementMetadata | null): EngagementCopy => {
  const nightsOut = toCount(metadata?.nights_out);
  const seenBy = toCount(metadata?.seen_by);
  const matesOut = toCount(metadata?.mates_out);
  const title = 'Your week on Beerva 🍻';
  const nights = `${nightsOut} ${nightsOut === 1 ? 'night' : 'nights'}`;

  if (nightsOut > 0 && seenBy > 0) {
    return { title, body: `${nights} out, seen by ${seenBy} ${seenBy === 1 ? 'mate' : 'mates'}. Tap for your recap.` };
  }
  if (nightsOut > 0) {
    return { title, body: `${nights} out this week. Tap for your recap.` };
  }
  if (matesOut > 0) {
    return { title, body: `${matesOut} ${matesOut === 1 ? 'mate was' : 'mates were'} out this week. See what you missed.` };
  }
  return { title, body: 'Your weekly recap is ready.' };
};
