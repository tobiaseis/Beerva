import { colors } from './colors';

export const feedCardColors = {
  card: colors.card,
  border: colors.border,
  metadataDivider: colors.borderSoft,
  metadataIconBackground: colors.primarySoft,
  statBackground: colors.cardMuted,
  actionActiveBackground: colors.primarySoft,
};

export const feedCardMetrics = {
  cardRadius: 14,
  mediaRadius: 0,
};

export const getCompactFeedActionCount = (count: number) => {
  if (count < 1000) return String(count);

  const compact = count < 10000
    ? (count / 1000).toFixed(1).replace(/\.0$/, '')
    : String(Math.round(count / 1000));

  return `${compact}K`;
};
