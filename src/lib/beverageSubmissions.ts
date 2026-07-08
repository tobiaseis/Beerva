import { supabase } from './supabase';
import type { BeerCatalogItem, BeerDraft, SessionBeer } from './sessionBeers';
import { getBeverageCatalogItem, getBeveragePayloadCategory } from './sessionBeers';
import { getErrorMessage, withTimeout } from './timeouts';

const SUBMISSION_TIMEOUT_MS = 15000;

export type BeverageSubmissionCategory = 'beer' | 'wine' | 'drink';
export type BeverageSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type SubmitSessionBeverageInput = {
  sessionId: string;
  draft: BeerDraft;
  category: BeverageSubmissionCategory;
  abv: number;
  consumedAt?: string | null;
};

export const mapBeverageSubmissionCategory = (value: unknown): BeverageSubmissionCategory => (
  value === 'wine' || value === 'drink' ? value : 'beer'
);

export const mapBeverageSubmissionStatus = (value: unknown): BeverageSubmissionStatus | null => (
  value === 'pending' || value === 'approved' || value === 'rejected' ? value : null
);

export const getBeverageSubmissionFallbackAbv = (category: unknown) => (
  mapBeverageSubmissionCategory(category) === 'wine' ? 12 : 5
);

export const getBeverageSubmissionStatusLabel = (status: unknown) => {
  const mapped = mapBeverageSubmissionStatus(status);
  if (mapped === 'pending') return 'Pending approval';
  if (mapped === 'approved') return 'Approved';
  if (mapped === 'rejected') return 'ABV reset';
  return null;
};

export const isUnknownBeverageName = (
  beverageName: string,
  catalog: BeerCatalogItem[]
) => {
  const cleanName = beverageName.trim();
  if (!cleanName) return false;
  return !getBeverageCatalogItem(cleanName, catalog);
};

export const parseBeverageSubmissionAbv = (value: string) => {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const validateBeverageSubmissionDraft = (input: {
  name: string;
  abv: string;
  category: BeverageSubmissionCategory;
}) => {
  if (!input.name.trim()) return 'Beverage name is required.';
  if (!['beer', 'wine', 'drink'].includes(input.category)) return 'Choose a beverage category.';
  const abv = parseBeverageSubmissionAbv(input.abv);
  if (abv === null || abv < 0 || abv > 100) return 'ABV must be between 0 and 100.';
  return null;
};

export const submitSessionBeverage = async ({
  sessionId,
  draft,
  category,
  abv,
  consumedAt,
}: SubmitSessionBeverageInput): Promise<SessionBeer> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('submit_session_beverage', {
        target_session_id: sessionId,
        beverage_name: draft.beerName.trim(),
        beverage_abv: abv,
        beverage_category: category,
        beverage_volume: draft.volume,
        beverage_quantity: draft.quantity,
        consumed_at: consumedAt || new Date().toISOString(),
      }),
      SUBMISSION_TIMEOUT_MS,
      'Submitting this beverage is taking too long.'
    );

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('The submitted drink was not returned.');
    return row as SessionBeer;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not submit beverage.'));
  }
};

export const getDraftCategoryFromCatalog = (
  beverageName: string,
  catalog: BeerCatalogItem[]
): BeverageSubmissionCategory => (
  getBeveragePayloadCategory(getBeverageCatalogItem(beverageName, catalog))
);
