import { supabase } from './supabase';
import { mapOfficialFeedPostRow, OfficialFeedPost, OfficialFeedPostRow } from './officialFeedPosts';
import { getErrorMessage, TimeoutError, withRetryableTimeout, withTimeout } from './timeouts';

const ADMIN_TIMEOUT_MS = 15000;

export type AdminBeverageCategory = 'beer' | 'wine' | 'drink';

export type AdminBeverageRow = {
  id?: string | null;
  name?: string | null;
  abv?: number | string | null;
  category?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AdminBeverage = {
  id: string;
  name: string;
  abv: number;
  category: AdminBeverageCategory;
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
  archived_at?: string | null;
  archived_by?: string | null;
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
  archivedAt: string | null;
  archivedBy: string | null;
};

export type AdminModerationDrinkRow = {
  session_beer_id?: string | null;
  session_id?: string | null;
  user_id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  beer_name?: string | null;
  volume?: string | null;
  quantity?: number | string | null;
  abv?: number | string | null;
  beverage_category?: string | null;
  pub_name?: string | null;
  consumed_at?: string | null;
  session_started_at?: string | null;
  session_created_at?: string | null;
  excluded_from_stats?: boolean | null;
  excluded_from_stats_at?: string | null;
  excluded_from_stats_by?: string | null;
  excluded_from_stats_reason?: string | null;
};

export type AdminModerationDrink = {
  sessionBeerId: string;
  sessionId: string;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  beerName: string;
  volume: string | null;
  quantity: number;
  abv: number | null;
  beverageCategory: AdminBeverageCategory;
  pubName: string | null;
  consumedAt: string | null;
  sessionStartedAt: string | null;
  sessionCreatedAt: string | null;
  excludedFromStats: boolean;
  excludedFromStatsAt: string | null;
  excludedFromStatsBy: string | null;
  excludedFromStatsReason: string | null;
};

export type AdminBeverageSubmissionRow = {
  id?: string | null;
  session_beer_id?: string | null;
  session_id?: string | null;
  submitted_by?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  name?: string | null;
  abv?: number | string | null;
  category?: string | null;
  status?: string | null;
  resolved_admin_beverage_id?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  pub_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AdminBeverageSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type AdminBeverageSubmission = {
  id: string;
  sessionBeerId: string | null;
  sessionId: string | null;
  submittedBy: string;
  username: string | null;
  avatarUrl: string | null;
  name: string;
  abv: number;
  category: AdminBeverageCategory;
  status: AdminBeverageSubmissionStatus;
  resolvedAdminBeverageId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  pubName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveAdminBeverageInput = {
  id?: string;
  name: string;
  abv: number;
  category: AdminBeverageCategory;
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

export type PublishAdminOfficialPostInput = {
  requestKey: string;
  title: string;
  body: string;
  imageUrl: string | null;
  linkedChallengeId: string | null;
  sendInAppNotification: boolean;
  notificationBody: string | null;
  sendPushNotification: boolean;
  pushTitle: string | null;
  pushBody: string | null;
};

const toString = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const toStringOrNull = (value: unknown) => toString(value) || null;
const toNumber = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
export const mapAdminBeverageCategory = (value: unknown): AdminBeverageCategory => (
  value === 'wine' || value === 'drink' ? value : 'beer'
);
const firstRow = <T,>(value: T | T[] | null | undefined) => Array.isArray(value) ? value[0] : value;
export const createAdminRequestKey = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export class AdminOfficialPostPublishError extends Error {
  uncertain: boolean;

  constructor(message: string, uncertain: boolean) {
    super(message);
    this.name = 'AdminOfficialPostPublishError';
    this.uncertain = uncertain;
  }
}

const isUncertainOfficialPostPublishError = (error: unknown) => {
  const message = typeof (error as { message?: unknown })?.message === 'string'
    ? (error as { message: string }).message
    : '';
  return error instanceof TimeoutError || /failed to fetch|network request failed|abort/i.test(message);
};

export const mapAdminBeverageRow = (row: AdminBeverageRow): AdminBeverage => ({
  id: toString(row.id),
  name: toString(row.name),
  abv: toNumber(row.abv),
  category: mapAdminBeverageCategory(row.category),
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
  archivedAt: toStringOrNull(row.archived_at),
  archivedBy: toStringOrNull(row.archived_by),
});

export const mapAdminModerationDrinkRow = (row: AdminModerationDrinkRow): AdminModerationDrink => ({
  sessionBeerId: toString(row.session_beer_id),
  sessionId: toString(row.session_id),
  userId: toString(row.user_id),
  username: toStringOrNull(row.username),
  avatarUrl: toStringOrNull(row.avatar_url),
  beerName: toString(row.beer_name) || 'Unknown drink',
  volume: toStringOrNull(row.volume),
  quantity: Math.max(1, Math.trunc(toNumber(row.quantity) || 1)),
  abv: row.abv === null || row.abv === undefined ? null : toNumber(row.abv),
  beverageCategory: mapAdminBeverageCategory(row.beverage_category),
  pubName: toStringOrNull(row.pub_name),
  consumedAt: toStringOrNull(row.consumed_at),
  sessionStartedAt: toStringOrNull(row.session_started_at),
  sessionCreatedAt: toStringOrNull(row.session_created_at),
  excludedFromStats: row.excluded_from_stats === true,
  excludedFromStatsAt: toStringOrNull(row.excluded_from_stats_at),
  excludedFromStatsBy: toStringOrNull(row.excluded_from_stats_by),
  excludedFromStatsReason: toStringOrNull(row.excluded_from_stats_reason),
});

const mapAdminBeverageSubmissionStatus = (value: unknown): AdminBeverageSubmissionStatus => (
  value === 'approved' || value === 'rejected' ? value : 'pending'
);

export const mapAdminBeverageSubmissionRow = (
  row: AdminBeverageSubmissionRow
): AdminBeverageSubmission => ({
  id: toString(row.id),
  sessionBeerId: toStringOrNull(row.session_beer_id),
  sessionId: toStringOrNull(row.session_id),
  submittedBy: toString(row.submitted_by),
  username: toStringOrNull(row.username),
  avatarUrl: toStringOrNull(row.avatar_url),
  name: toString(row.name) || 'Unknown beverage',
  abv: toNumber(row.abv),
  category: mapAdminBeverageCategory(row.category),
  status: mapAdminBeverageSubmissionStatus(row.status),
  resolvedAdminBeverageId: toStringOrNull(row.resolved_admin_beverage_id),
  reviewedBy: toStringOrNull(row.reviewed_by),
  reviewedAt: toStringOrNull(row.reviewed_at),
  rejectionReason: toStringOrNull(row.rejection_reason),
  pubName: toStringOrNull(row.pub_name),
  createdAt: toString(row.created_at),
  updatedAt: toString(row.updated_at),
});

export const fetchAdminBeverages = async (): Promise<AdminBeverage[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_admin_beverages'),
      ADMIN_TIMEOUT_MS,
      'Beverages are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as AdminBeverageRow[]).map(mapAdminBeverageRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load admin-added beverages.'));
  }
};

export const saveAdminBeverage = async (input: SaveAdminBeverageInput): Promise<AdminBeverage> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_save_beverage', {
        target_beverage_id: input.id || null,
        beverage_name: input.name,
        beverage_abv: input.abv,
        beverage_category: input.category,
      }),
      ADMIN_TIMEOUT_MS,
      'Saving the beverage is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminBeverageRow | AdminBeverageRow[] | null);
    if (!row) throw new Error('The saved beverage was not returned.');
    return mapAdminBeverageRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not save beverage.'));
  }
};

export const fetchAdminModerationDrinks = async (options?: {
  searchQuery?: string;
  targetUserId?: string;
  limit?: number;
}): Promise<AdminModerationDrink[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_get_moderation_drinks', {
        search_query: options?.searchQuery?.trim() || null,
        target_user_id: options?.targetUserId || null,
        result_limit: options?.limit ?? 100,
      }),
      ADMIN_TIMEOUT_MS,
      'Moderation drinks are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as AdminModerationDrinkRow[]).map(mapAdminModerationDrinkRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load moderation drinks.'));
  }
};

export const setAdminDrinkExcluded = async (
  sessionBeerId: string,
  excluded: boolean,
  reason?: string | null
): Promise<void> => {
  try {
    const { error } = await withTimeout(
      supabase.rpc('admin_set_session_beer_excluded', {
        target_session_beer_id: sessionBeerId,
        should_exclude: excluded,
        exclusion_reason: reason ?? null,
      }),
      ADMIN_TIMEOUT_MS,
      'Updating the drink is taking too long.'
    );

    if (error) throw error;
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not update drink moderation.'));
  }
};

export const fetchAdminBeverageSubmissions = async (options?: {
  status?: AdminBeverageSubmissionStatus | 'all';
  limit?: number;
}): Promise<AdminBeverageSubmission[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_get_beverage_submissions', {
        status_filter: options?.status || 'pending',
        result_limit: options?.limit ?? 100,
      }),
      ADMIN_TIMEOUT_MS,
      'Beverage submissions are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as AdminBeverageSubmissionRow[]).map(mapAdminBeverageSubmissionRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load beverage submissions.'));
  }
};

export const approveAdminBeverageSubmission = async (
  submissionId: string
): Promise<AdminBeverageSubmission> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_approve_beverage_submission', {
        target_submission_id: submissionId,
      }),
      ADMIN_TIMEOUT_MS,
      'Approving the beverage is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminBeverageSubmissionRow | AdminBeverageSubmissionRow[] | null);
    if (!row) throw new Error('The reviewed submission was not returned.');
    return mapAdminBeverageSubmissionRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not approve beverage submission.'));
  }
};

export const rejectAdminBeverageSubmission = async (
  submissionId: string,
  reason?: string | null
): Promise<AdminBeverageSubmission> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_reject_beverage_submission', {
        target_submission_id: submissionId,
        rejection_reason: reason ?? null,
      }),
      ADMIN_TIMEOUT_MS,
      'Rejecting the beverage is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminBeverageSubmissionRow | AdminBeverageSubmissionRow[] | null);
    if (!row) throw new Error('The reviewed submission was not returned.');
    return mapAdminBeverageSubmissionRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not reject beverage submission.'));
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

export const archiveAdminChallenge = async (challengeId: string): Promise<AdminChallenge> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_archive_challenge', { target_challenge_id: challengeId }),
      ADMIN_TIMEOUT_MS,
      'Archiving the challenge is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminChallengeRow | AdminChallengeRow[] | null);
    if (!row) throw new Error('The updated challenge was not returned.');
    return mapAdminChallengeRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not archive challenge.'));
  }
};

export const restoreAdminChallenge = async (challengeId: string): Promise<AdminChallenge> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_restore_challenge', { target_challenge_id: challengeId }),
      ADMIN_TIMEOUT_MS,
      'Restoring the challenge is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as AdminChallengeRow | AdminChallengeRow[] | null);
    if (!row) throw new Error('The updated challenge was not returned.');
    return mapAdminChallengeRow(row);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not restore challenge.'));
  }
};

export const saveAdminChallenge = async (input: SaveAdminChallengeInput): Promise<AdminChallenge> => {
  try {
    const requestKey = createAdminRequestKey();
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

export const fetchAdminOfficialPosts = async (): Promise<OfficialFeedPost[]> => {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('admin_get_official_posts'),
      ADMIN_TIMEOUT_MS,
      'Official posts are taking too long to load.'
    );

    if (error) throw error;
    return ((data || []) as OfficialFeedPostRow[]).map(mapOfficialFeedPostRow);
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Could not load official posts.'));
  }
};

export const publishAdminOfficialPost = async (
  input: PublishAdminOfficialPostInput
): Promise<OfficialFeedPost> => {
  try {
    const payload = {
      post_title: input.title,
      post_body: input.body,
      post_image_url: input.imageUrl,
      linked_challenge_id: input.linkedChallengeId,
      send_in_app_notification: input.sendInAppNotification,
      notification_body: input.notificationBody,
      send_push_notification: input.sendPushNotification,
      push_title: input.pushTitle,
      push_body: input.pushBody,
      post_request_key: input.requestKey,
    };
    const { data, error } = await withRetryableTimeout(
      (signal) => supabase.rpc('admin_publish_official_post', payload).abortSignal(signal),
      ADMIN_TIMEOUT_MS,
      'Publishing the official post is taking too long.'
    );

    if (error) throw error;
    const row = firstRow(data as OfficialFeedPostRow | OfficialFeedPostRow[] | null);
    if (!row) throw new Error('The published official post was not returned.');
    return mapOfficialFeedPostRow(row);
  } catch (error) {
    throw new AdminOfficialPostPublishError(
      getErrorMessage(error, 'Could not publish official post.'),
      isUncertainOfficialPostPublishError(error)
    );
  }
};
