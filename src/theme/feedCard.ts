export const feedCardColors = {
  card: 'rgba(15, 23, 42, 0.82)',
  border: 'rgba(148, 163, 184, 0.12)',
  metadataDivider: 'rgba(148, 163, 184, 0.10)',
  metadataIconBackground: 'rgba(247, 181, 58, 0.12)',
  statBackground: 'rgba(15, 23, 42, 0.56)',
  actionActiveBackground: 'rgba(247, 181, 58, 0.12)',
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
