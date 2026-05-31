import { supabase } from './supabase';
import { getErrorMessage, withRetryableTimeout, withTimeout } from './timeouts';

const ADMIN_TIMEOUT_MS = 15000;

export type AdminBeverageRow = {
  id?: string | null;
  name?: string | null;
  abv?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AdminBeverage = {
  id: string;
  name: string;
  abv: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminChallengeType = 'target' | 'leaderboard';

export type AdminChallengeRow = {
  id?: string | null;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  challenge_type?: string | null;
  target_value?: number | string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  join_closes_at?: string | null;
  winner_trophy_enabled?: boolean | null;
  winner_trophy_title?: string | null;
  winner_trophy_description?: string | null;
  finalized_at?: string | null;
};

export type AdminChallenge = {
  id: string;
  slug: string;
  title: string;
  description: string;
  challengeType: AdminChallengeType;
  targetValue: number | null;
  startsAt: string;
  endsAt: string;
  joinClosesAt: string;
  winnerTrophyEnabled: boolean;
  winnerTrophyTitle: string | null;
  winnerTrophyDescription: string | null;
  finalizedAt: string | null;
};

export type SaveAdminBeverageInput = {
  id?: string;
  name: string;
  abv: number;
};

export type SaveAdminChallengeInput = {
  id?: string;
  title: string;
  description: string;
  challengeType: AdminChallengeType;
  targetValue: number | null;
  startsAt: string;
  endsAt: string;
  joinClosesAt: string;
  winnerTrophyEnabled: boolean;
  winnerTrophyTitle: string | null;
  winnerTrophyDescription: string | null;
};

const toString = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const toStringOrNull = (value: unknown) => toString(value) || null;
const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const firstRow = <T,>(value: T | T[] | null | undefined) => Array.isArray(value) ? value[0] : value;
const createRequestKey = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const mapAdminBeverageRow = (row: AdminBeverageRow): AdminBeverage => ({
  id: toString(row.id),
  name: toString(row.name),
  abv: toNumber(row.abv),
  createdAt: toString(row.created_at),
  updatedAt: toString(row.updated_at),
});

export const mapAdminChallengeRow = (row: AdminChallengeRow): AdminChallenge => ({
  id: toString(row.id),
  slug: toString(row.slug),
  title: toString(row.title),
  description: toString(row.description),
  challengeType: row.challenge_type === 'leaderboard' ? 'leaderboard' : 'target',
  targetValue: row.challenge_type === 'leaderboard' ? null : toNumber(row.target_value),
  startsAt: toString(row.starts_at),
  endsAt: toString(row.ends_at),
  joinClosesAt: toString(row.join_closes_at),
  winnerTrophyEnabled: row.winner_trophy_enabled === true,
  winnerTrophyTitle: toStringOrNull(row.winner_trophy_title),
  winnerTrophyDescription: toStringOrNull(row.winner_trophy_description),
  finalizedAt: toStringOrNull(row.finalized_at),
});

export const fetchAdminBeverages = async (): Promise<AdminBeverage[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_admin_beverages'),
      ADMIN_TIMEOUT_MS,
      'Drinks are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as AdminBeverageRow[]).map(mapAdminBeverageRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load admin-added beers.'));
  }
};

export const saveAdminBeverage = async (input: SaveAdminBeverageInput): Promise<AdminBeverage> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_save_beverage', {
        target_beverage_id: input.id || null,
        beverage_name: input.name,
        beverage_abv: input.abv,
      }),
      ADMIN_TIMEOUT_MS,
      'Saving the beer is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminBeverageRow | AdminBeverageRow[] | null);
    if (!row) throw new Error('The saved beer was not returned.');
    return mapAdminBeverageRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not save beer.'));
  }
};

export const fetchAdminChallenges = async (): Promise<AdminChallenge[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_get_challenges'),
      ADMIN_TIMEOUT_MS,
      'Challenges are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as AdminChallengeRow[]).map(mapAdminChallengeRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load admin challenges.'));
  }
};

export const saveAdminChallenge = async (input: SaveAdminChallengeInput): Promise<AdminChallenge> => {
  try {
    const requestKey = createRequestKey();
    const payload = {
        target_challenge_id: input.id || null,
        challenge_title: input.title,
        challenge_description: input.description,
        target_challenge_type: input.challengeType,
        challenge_target_value: input.targetValue,
        challenge_starts_at: input.startsAt,
        challenge_ends_at: input.endsAt,
        challenge_join_closes_at: input.joinClosesAt,
        challenge_winner_trophy_enabled: input.winnerTrophyEnabled,
        challenge_winner_trophy_title: input.winnerTrophyTitle,
        challenge_winner_trophy_description: input.winnerTrophyDescription,
        challenge_request_key: requestKey,
    };
    const { data, error } = await withRetryableTimeout(
      (signal) => supabase.rpc('admin_save_challenge', payload).abortSignal(signal),
      ADMIN_TIMEOUT_MS,
      'Saving the challenge is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminChallengeRow | AdminChallengeRow[] | null);
    if (!row) throw new Error('The saved challenge was not returned.');
    return mapAdminChallengeRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not save challenge.'));
  }
};
