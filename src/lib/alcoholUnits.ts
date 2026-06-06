const ALCOHOL_GRAMS_PER_ML = 0.789;
const DANISH_ALCOHOL_UNIT_GRAMS = 12;
const DEFAULT_SERVING_VOLUME_ML = 568;

export type AlcoholUnitDrink = {
  volume?: string | null;
  quantity?: number | string | null;
  abv?: number | string | null;
};

const toFiniteNumber = (value: number | string | null | undefined) => {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const parsed = typeof normalized === 'number' ? normalized : Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const getQuantity = (value: number | string | null | undefined) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return 1;
  return Math.max(0, parsed);
};

const getAbv = (value: number | string | null | undefined) => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return 0;
  return Math.max(0, parsed);
};

const roundStat = (value: number) => Math.round(value * 10) / 10;

export const getServingVolumeMl = (volume?: string | null) => {
  const normalizedVolume = volume?.trim().toLowerCase().replace(',', '.') || 'pint';
  const compactVolume = normalizedVolume.replace(/\s+/g, '');
  const numericValue = Number(compactVolume.replace(/(ml|cl|l)$/, ''));

  if (compactVolume === 'schooner') return 379;

  if (Number.isFinite(numericValue)) {
    if (compactVolume.endsWith('ml')) return numericValue;
    if (compactVolume.endsWith('cl')) return numericValue * 10;
    if (compactVolume.endsWith('l')) return numericValue * 1000;
  }

  return DEFAULT_SERVING_VOLUME_ML;
};

export const calculateAlcoholUnits = (drinks: AlcoholUnitDrink[] = []) => {
  const units = drinks.reduce((sum, drink) => {
    const volumeMl = getServingVolumeMl(drink.volume);
    const quantity = getQuantity(drink.quantity);
    const abv = getAbv(drink.abv);
    const pureAlcoholMl = volumeMl * quantity * (abv / 100);
    const pureAlcoholGrams = pureAlcoholMl * ALCOHOL_GRAMS_PER_ML;
    return sum + (pureAlcoholGrams / DANISH_ALCOHOL_UNIT_GRAMS);
  }, 0);

  return roundStat(units);
};
