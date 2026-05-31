export const MIN_AVATAR_CROP_ZOOM = 1;
export const MAX_AVATAR_CROP_ZOOM = 4;

export type AvatarCropInput = {
  sourceWidth: number;
  sourceHeight: number;
  frameSize: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type AvatarCropLayout = {
  sourceWidth: number;
  sourceHeight: number;
  frameSize: number;
  zoom: number;
  scale: number;
  imageWidth: number;
  imageHeight: number;
  imageLeft: number;
  imageTop: number;
  offsetX: number;
  offsetY: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

export type AvatarCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const positiveNumber = (value: number, fallback: number) => {
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const clampAvatarZoom = (zoom: number) => {
  return clamp(zoom, MIN_AVATAR_CROP_ZOOM, MAX_AVATAR_CROP_ZOOM);
};

export const getAvatarCropLayout = (input: AvatarCropInput): AvatarCropLayout => {
  const frameSize = positiveNumber(input.frameSize, 1);
  const sourceWidth = positiveNumber(input.sourceWidth, frameSize);
  const sourceHeight = positiveNumber(input.sourceHeight, frameSize);
  const zoom = clampAvatarZoom(input.zoom);
  const baseScale = Math.max(frameSize / sourceWidth, frameSize / sourceHeight);
  const scale = baseScale * zoom;
  const imageWidth = sourceWidth * scale;
  const imageHeight = sourceHeight * scale;
  const maxOffsetX = Math.max(0, (imageWidth - frameSize) / 2);
  const maxOffsetY = Math.max(0, (imageHeight - frameSize) / 2);
  const offsetX = clamp(input.offsetX, -maxOffsetX, maxOffsetX);
  const offsetY = clamp(input.offsetY, -maxOffsetY, maxOffsetY);

  return {
    sourceWidth,
    sourceHeight,
    frameSize,
    zoom,
    scale,
    imageWidth,
    imageHeight,
    imageLeft: (frameSize - imageWidth) / 2 + offsetX,
    imageTop: (frameSize - imageHeight) / 2 + offsetY,
    offsetX,
    offsetY,
    maxOffsetX,
    maxOffsetY,
  };
};

export const getAvatarCropRect = (input: AvatarCropInput): AvatarCropRect => {
  const layout = getAvatarCropLayout(input);
  const cropSize = layout.frameSize / layout.scale;
  const size = Math.max(1, Math.round(Math.min(cropSize, layout.sourceWidth, layout.sourceHeight)));
  const rawOriginX = ((layout.imageWidth - layout.frameSize) / 2 - layout.offsetX) / layout.scale;
  const rawOriginY = ((layout.imageHeight - layout.frameSize) / 2 - layout.offsetY) / layout.scale;
  const originX = Math.round(clamp(rawOriginX, 0, layout.sourceWidth - size));
  const originY = Math.round(clamp(rawOriginY, 0, layout.sourceHeight - size));

  return {
    originX,
    originY,
    width: size,
    height: size,
  };
};
