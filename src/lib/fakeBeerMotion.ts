export type FakeBeerMotionVector = {
  x?: number | null;
  y?: number | null;
  z?: number | null;
};

export type FakeBeerMotionReading = {
  rotation?: {
    beta?: number | null;
    gamma?: number | null;
  } | null;
  accelerationIncludingGravity?: FakeBeerMotionVector | null;
};

export type FakeBeerMotionBaseline = {
  betaRadians: number | null;
  gammaRadians: number | null;
  gravityPitchRadians: number | null;
  gravityRollRadians: number | null;
};

export type FakeBeerMotionSignal = {
  tiltDegrees: number;
  drinkPressure: number;
};

const DRINK_TILT_THRESHOLD_RADIANS = 0.52;
const SURFACE_TILT_MULTIPLIER = 34;
const MAX_SURFACE_TILT_DEGREES = 22;

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getFiniteNumber = (value: unknown) => (isFiniteNumber(value) ? value : null);

const normalizeAngleRadians = (value: number) => {
  let normalized = value;

  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;

  return normalized;
};

const getGravityPitchRadians = (gravity?: FakeBeerMotionVector | null) => {
  const y = getFiniteNumber(gravity?.y);
  const z = getFiniteNumber(gravity?.z);

  if (y === null || z === null) return null;

  return Math.atan2(z, y);
};

const getGravityRollRadians = (gravity?: FakeBeerMotionVector | null) => {
  const x = getFiniteNumber(gravity?.x);
  const y = getFiniteNumber(gravity?.y);
  const z = getFiniteNumber(gravity?.z);

  if (x === null || y === null || z === null) return null;

  return Math.atan2(x, Math.sqrt(y * y + z * z));
};

const getAngleDelta = (value: number | null, baseline: number | null) => {
  if (value === null) return null;
  if (baseline === null) return value;

  return normalizeAngleRadians(value - baseline);
};

const pickLargestMagnitude = (...values: Array<number | null>) => {
  const finiteValues = values.filter(isFiniteNumber);
  if (finiteValues.length === 0) return 0;

  return finiteValues.reduce((largest, value) => (
    Math.abs(value) > Math.abs(largest) ? value : largest
  ), 0);
};

export const createFakeBeerMotionBaseline = (
  reading: FakeBeerMotionReading
): FakeBeerMotionBaseline => ({
  betaRadians: getFiniteNumber(reading.rotation?.beta),
  gammaRadians: getFiniteNumber(reading.rotation?.gamma),
  gravityPitchRadians: getGravityPitchRadians(reading.accelerationIncludingGravity),
  gravityRollRadians: getGravityRollRadians(reading.accelerationIncludingGravity),
});

export const getFakeBeerMotionSignal = (
  reading: FakeBeerMotionReading,
  baseline: FakeBeerMotionBaseline | null
): FakeBeerMotionSignal => {
  const betaDelta = getAngleDelta(
    getFiniteNumber(reading.rotation?.beta),
    baseline?.betaRadians ?? null
  );
  const gammaDelta = getAngleDelta(
    getFiniteNumber(reading.rotation?.gamma),
    baseline?.gammaRadians ?? null
  );
  const gravityPitchDelta = getAngleDelta(
    getGravityPitchRadians(reading.accelerationIncludingGravity),
    baseline?.gravityPitchRadians ?? null
  );
  const gravityRollDelta = getAngleDelta(
    getGravityRollRadians(reading.accelerationIncludingGravity),
    baseline?.gravityRollRadians ?? null
  );
  const drinkRadians = Math.abs(pickLargestMagnitude(betaDelta, gravityPitchDelta));
  const surfaceTiltRadians = pickLargestMagnitude(gammaDelta, gravityRollDelta);

  return {
    tiltDegrees: clamp(
      surfaceTiltRadians * SURFACE_TILT_MULTIPLIER,
      -MAX_SURFACE_TILT_DEGREES,
      MAX_SURFACE_TILT_DEGREES
    ),
    drinkPressure: Math.max(0, drinkRadians - DRINK_TILT_THRESHOLD_RADIANS),
  };
};
