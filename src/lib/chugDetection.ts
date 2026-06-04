export type ChugRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChugLandmark = {
  x: number;
  y: number;
  visibility?: number;
};

export type ChugPoint = {
  x: number;
  y: number;
};

export type ChugDetectionFrame = {
  timeMs: number;
  mouthBox: ChugRect | null;
  bottleBox: ChugRect | null;
  lowerFaceBox?: ChugRect | null;
  faceAnchor?: ChugPoint | null;
  mouthVisibility?: number | null;
  bottleScore?: number | null;
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
const CONTACT_START_GAP_GRACE_MS = 160;
const CONTACT_END_GRACE_MS = 300;
const MOUTH_PADDING_X = 20;
const MOUTH_PADDING_Y = 20;
const CONTACT_PROXIMITY_PX = 24;
const LOWER_FACE_PROXIMITY_PX = 24;
const CONTACT_START_SCORE = 0.58;
const CONTACT_END_SCORE = 0.42;
const MOUTH_OCCLUDED_VISIBILITY = 0.45;

export const boxesOverlap = (a: ChugRect | null, b: ChugRect | null) => {
  if (!a || !b) return false;
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
};

const expandRect = (rect: ChugRect, padding: number): ChugRect => ({
  x: rect.x - padding,
  y: rect.y - padding,
  width: rect.width + (padding * 2),
  height: rect.height + (padding * 2),
});

const boxesAreInContactRange = (mouthBox: ChugRect | null, bottleBox: ChugRect | null) => {
  if (!mouthBox || !bottleBox) return false;
  return boxesOverlap(expandRect(mouthBox, CONTACT_PROXIMITY_PX), bottleBox);
};

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const getRectCenter = (rect: ChugRect): ChugPoint => ({
  x: rect.x + (rect.width / 2),
  y: rect.y + (rect.height / 2),
});

const getPointToRectDistance = (point: ChugPoint, rect: ChugRect) => {
  const closestX = Math.min(Math.max(point.x, rect.x), rect.x + rect.width);
  const closestY = Math.min(Math.max(point.y, rect.y), rect.y + rect.height);
  return Math.hypot(point.x - closestX, point.y - closestY);
};

const hasLowMouthVisibility = (visibility?: number | null) => (
  typeof visibility === 'number' && Number.isFinite(visibility) && visibility < MOUTH_OCCLUDED_VISIBILITY
);

const getFaceAnchorRadius = (frame: ChugDetectionFrame) => {
  if (frame.lowerFaceBox) {
    return Math.max(72, Math.min(150, Math.max(frame.lowerFaceBox.width, frame.lowerFaceBox.height) * 0.72));
  }
  return 96;
};

export const getChugContactScore = (frame: ChugDetectionFrame) => {
  const bottleBox = frame.bottleBox;
  if (!bottleBox) return 0;

  let score = 0;
  const mouthContact = boxesAreInContactRange(frame.mouthBox, bottleBox);
  if (mouthContact) score = Math.max(score, 0.95);

  const lowerFaceContact = frame.lowerFaceBox
    ? boxesOverlap(expandRect(frame.lowerFaceBox, LOWER_FACE_PROXIMITY_PX), bottleBox)
    : false;
  if (lowerFaceContact) score = Math.max(score, 0.74);

  const anchorDistance = frame.faceAnchor ? getPointToRectDistance(frame.faceAnchor, bottleBox) : Number.POSITIVE_INFINITY;
  const anchorContact = anchorDistance <= getFaceAnchorRadius(frame);
  if (anchorContact) score = Math.max(score, 0.66);

  const mouthOccluded = !frame.mouthBox || hasLowMouthVisibility(frame.mouthVisibility);
  if (mouthOccluded && (lowerFaceContact || anchorContact)) {
    score = Math.max(score, 0.86);
  }

  if (!mouthContact && frame.mouthBox && frame.lowerFaceBox) {
    const mouthCenter = getRectCenter(frame.mouthBox);
    const lowerFaceCenter = getRectCenter(frame.lowerFaceBox);
    const expectedMouthY = lowerFaceCenter.y;
    if (Math.abs(mouthCenter.y - expectedMouthY) > Math.max(36, frame.lowerFaceBox.height * 0.45) && lowerFaceContact) {
      score = Math.max(score, 0.8);
    }
  }

  const objectConfidence = typeof frame.bottleScore === 'number' && Number.isFinite(frame.bottleScore)
    ? clamp(frame.bottleScore)
    : 0.7;
  return Number(clamp(score * (0.85 + (objectConfidence * 0.15))).toFixed(3));
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

export const getFaceBoxFromLandmarks = (
  landmarks: ChugLandmark[] = [],
  videoWidth: number,
  videoHeight: number
): ChugRect | null => {
  if (landmarks.length === 0 || videoWidth <= 0 || videoHeight <= 0) return null;
  const xs = landmarks.map((landmark) => landmark.x * videoWidth);
  const ys = landmarks.map((landmark) => landmark.y * videoHeight);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  };
};

export const getLowerFaceBoxFromFaceBox = (faceBox: ChugRect | null): ChugRect | null => {
  if (!faceBox) return null;
  const y = faceBox.y + (faceBox.height * 0.44);
  const height = faceBox.height * 0.62;
  const xPadding = faceBox.width * 0.16;
  return {
    x: Math.round(faceBox.x - xPadding),
    y: Math.round(y),
    width: Math.round(faceBox.width + (xPadding * 2)),
    height: Math.round(height),
  };
};

export const getFaceAnchorFromLandmarks = (
  landmarks: ChugLandmark[] = [],
  videoWidth: number,
  videoHeight: number
): ChugPoint | null => {
  const landmark = landmarks[1] || landmarks[4] || landmarks[0];
  if (!landmark || videoWidth <= 0 || videoHeight <= 0) return null;
  return {
    x: Math.round(landmark.x * videoWidth),
    y: Math.round(landmark.y * videoHeight),
  };
};

export const getAverageLandmarkVisibility = (landmarks: ChugLandmark[] = []) => {
  const visibleValues = landmarks
    .map((landmark) => landmark.visibility)
    .filter((visibility): visibility is number => typeof visibility === 'number' && Number.isFinite(visibility));
  if (visibleValues.length === 0) return null;
  return visibleValues.reduce((sum, visibility) => sum + visibility, 0) / visibleValues.length;
};

const hasUsableFrameSignal = (frame: ChugDetectionFrame) => (
  Boolean(frame.bottleBox && (frame.mouthBox || frame.lowerFaceBox || frame.faceAnchor))
);

const getConfidenceScore = (
  frames: ChugDetectionFrame[],
  usableFrames: number,
  scoreSum: number
) => {
  const usableRatio = frames.length > 0 ? usableFrames / frames.length : 0;
  const averageScore = usableFrames > 0 ? scoreSum / usableFrames : 0;
  return Number(clamp((usableRatio * 0.35) + (averageScore * 0.65), 0.1, 1).toFixed(2));
};

export const analyzeChugContactFrames = (frames: ChugDetectionFrame[] = []): ChugDetectionResult => {
  const orderedFrames = [...frames].sort((a, b) => a.timeMs - b.timeMs);
  let firstContactMs: number | null = null;
  let stableStartMs: number | null = null;
  let lastContactMs: number | null = null;
  let firstContactGapMs: number | null = null;
  let firstNoContactAfterStartMs: number | null = null;
  let usableFrames = 0;
  let scoreSum = 0;

  for (const frame of orderedFrames) {
    const contactScore = getChugContactScore(frame);
    const usable = hasUsableFrameSignal(frame);
    if (usable) usableFrames += 1;
    scoreSum += contactScore;

    const touching = stableStartMs === null
      ? contactScore >= CONTACT_START_SCORE
      : contactScore >= CONTACT_END_SCORE;
    if (touching) {
      firstContactGapMs = null;
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

    if (stableStartMs === null && firstContactMs !== null) {
      if (firstContactGapMs === null) firstContactGapMs = frame.timeMs;
      if (frame.timeMs - firstContactGapMs > CONTACT_START_GAP_GRACE_MS) {
        firstContactMs = null;
        firstContactGapMs = null;
      }
      continue;
    }

    firstContactMs = null;
    firstContactGapMs = null;
    if (stableStartMs !== null && lastContactMs !== null) {
      if (firstNoContactAfterStartMs === null) firstNoContactAfterStartMs = frame.timeMs;
      if (frame.timeMs - firstNoContactAfterStartMs >= CONTACT_END_GRACE_MS) {
        const durationMs = firstNoContactAfterStartMs - stableStartMs;
        return {
          ok: durationMs > 0,
          detectedStartMs: stableStartMs,
          detectedEndMs: firstNoContactAfterStartMs,
          durationMs,
          confidenceScore: getConfidenceScore(orderedFrames, usableFrames, scoreSum),
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
