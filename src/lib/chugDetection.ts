export type ChugRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChugLandmark = {
  x: number;
  y: number;
};

export type ChugDetectionFrame = {
  timeMs: number;
  mouthBox: ChugRect | null;
  bottleBox: ChugRect | null;
};

export type ChugDetectionResult = {
  ok: boolean;
  durationMs?: number;
  detectedStartMs?: number;
  detectedEndMs?: number;
  confidenceScore?: number;
  reason?: string;
};

const CONTACT_DEBOUNCE_MS = 120;
const CONTACT_END_GRACE_MS = 300;
const MOUTH_PADDING_X = 20;
const MOUTH_PADDING_Y = 20;

export const boxesOverlap = (a: ChugRect | null, b: ChugRect | null) => {
  if (!a || !b) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
};

export const getMouthBoxFromLandmarks = (
  landmarks: ChugLandmark[] = [],
  videoWidth: number,
  videoHeight: number
): ChugRect | null => {
  if (landmarks.length === 0 || videoWidth <= 0 || videoHeight <= 0) return null;
  const xs = landmarks.map((landmark) => landmark.x * videoWidth);
  const ys = landmarks.map((landmark) => landmark.y * videoHeight);
  const minX = Math.min(...xs) - MOUTH_PADDING_X;
  const maxX = Math.max(...xs) + MOUTH_PADDING_X;
  const minY = Math.min(...ys) - MOUTH_PADDING_Y;
  const maxY = Math.max(...ys) + MOUTH_PADDING_Y;
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
};

export const analyzeChugContactFrames = (frames: ChugDetectionFrame[] = []): ChugDetectionResult => {
  const orderedFrames = [...frames].sort((a, b) => a.timeMs - b.timeMs);
  let firstContactMs: number | null = null;
  let stableStartMs: number | null = null;
  let lastContactMs: number | null = null;
  let firstNoContactAfterStartMs: number | null = null;
  let usableFrames = 0;
  let contactFrames = 0;

  for (const frame of orderedFrames) {
    const usable = Boolean(frame.mouthBox && frame.bottleBox);
    if (usable) usableFrames += 1;

    const touching = boxesOverlap(frame.mouthBox, frame.bottleBox);
    if (touching) {
      contactFrames += 1;
      firstNoContactAfterStartMs = null;
      if (firstContactMs === null) firstContactMs = frame.timeMs;
      if (stableStartMs === null && frame.timeMs - firstContactMs >= CONTACT_DEBOUNCE_MS) {
        stableStartMs = firstContactMs;
      }
      if (stableStartMs !== null) {
        lastContactMs = frame.timeMs;
      }
      continue;
    }

    firstContactMs = null;
    if (stableStartMs !== null && lastContactMs !== null) {
      if (firstNoContactAfterStartMs === null) firstNoContactAfterStartMs = frame.timeMs;
      if (frame.timeMs - firstNoContactAfterStartMs >= CONTACT_END_GRACE_MS) {
        const durationMs = firstNoContactAfterStartMs - stableStartMs;
        const usableRatio = orderedFrames.length > 0 ? usableFrames / orderedFrames.length : 0;
        const contactRatio = usableFrames > 0 ? contactFrames / usableFrames : 0;
        const confidenceScore = Math.max(0.1, Math.min(1, (usableRatio * 0.6) + (contactRatio * 0.4)));
        return {
          ok: durationMs > 0,
          detectedStartMs: stableStartMs,
          detectedEndMs: firstNoContactAfterStartMs,
          durationMs,
          confidenceScore: Number(confidenceScore.toFixed(2)),
        };
      }
    }
  }

  if (stableStartMs !== null && lastContactMs !== null && lastContactMs > stableStartMs) {
    const durationMs = lastContactMs - stableStartMs;
    return {
      ok: true,
      detectedStartMs: stableStartMs,
      detectedEndMs: lastContactMs,
      durationMs,
      confidenceScore: 0.55,
    };
  }

  return {
    ok: false,
    reason: 'No stable mouth and bottle contact detected.',
  };
};
