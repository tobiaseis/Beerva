import { CHUG_VIDEO_MAX_MS } from './chugAttempts';

export const CHUG_MANUAL_PLAYBACK_RATE = 0.75;

export const getVideoPlaybackTimestampMs = (currentTimeSeconds?: number | null) => {
  if (typeof currentTimeSeconds !== 'number' || !Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
    return null;
  }
  return Math.round(currentTimeSeconds * 1000);
};

export const calculateManualChugDuration = (
  startMs?: number | null,
  endMs?: number | null
) => {
  if (startMs === null || startMs === undefined || endMs === null || endMs === undefined) {
    return null;
  }
  const durationMs = endMs - startMs;
  if (startMs < 0 || durationMs <= 0 || durationMs > CHUG_VIDEO_MAX_MS) return null;
  return durationMs;
};
