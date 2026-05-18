import { supabase } from './supabase';
import { getErrorMessage, withTimeout } from './timeouts';
import {
  PlaceCategory,
} from './pubDirectory';
import {
  mapPubKingSessionRow,
  mapPubLegendRow,
  PubKingSession,
  PubKingSessionRow,
  PubLegend,
  PubLegendRow,
} from './pubLegends';

const PUB_LEGENDS_TIMEOUT_MS = 15000;

export const fetchPubLegends = async (): Promise<PubLegend[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_pub_legends', { limit_count: 10 }),
      PUB_LEGENDS_TIMEOUT_MS,
      'Pub Legends is taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as PubLegendRow[]).map(mapPubLegendRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load Pub Legends.'));
  }
};

export const fetchKingOfThePub = async (pubKey: string): Promise<PubKingSession[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_pub_king_of_the_pub', {
        target_pub_key: pubKey,
        result_limit: 10,
      }),
      PUB_LEGENDS_TIMEOUT_MS,
      'King of the Pub is taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as PubKingSessionRow[]).map(mapPubKingSessionRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load King of the Pub.'));
  }
};

export const setPubPlaceCategory = async (
  pubId: string,
  placeCategory: PlaceCategory
): Promise<void> => {
  try {
    const { error } = await withTimeout(
      supabase.rpc('set_pub_place_category', {
        target_pub_id: pubId,
        target_place_category: placeCategory,
      }),
      PUB_LEGENDS_TIMEOUT_MS,
      'Place category update is taking too long.'
    );

    if (error) throw error;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not update place category.'));
  }
};
