import { Platform } from 'react-native';

import {
  analyzeChugContactFrames,
  ChugDetectionFrame,
  getAverageLandmarkVisibility,
  getFaceAnchorFromLandmarks,
  getFaceBoxFromLandmarks,
  getLowerFaceBoxFromFaceBox,
  getMouthBoxFromLandmarks,
} from './chugDetection';

const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';
const OBJECT_MODEL_URL = 'https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite';
const MEDIAPIPE_VERSION = '0.10.35';
const MEDIAPIPE_MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const WASM_URL = `${MEDIAPIPE_MODULE_URL}/wasm`;
const FRAME_STEP_MS = 100;
const CHUG_MODEL_LOAD_TIMEOUT_MS = 20000;
const CHUG_MODEL_CREATE_TIMEOUT_MS = 20000;
const CHUG_VIDEO_LOAD_TIMEOUT_MS = 10000;
const CHUG_VIDEO_SEEK_TIMEOUT_MS = 5000;
const CHUG_ANALYSIS_TIMEOUT_MS = 45000;
const CHUG_ANALYSIS_TIMEOUT_MESSAGE = 'Automatic chug timing took too long. Send it to a mate for manual timing.';
const MOUTH_LANDMARK_IDS = [13, 14, 61, 291, 78, 308];
const BOTTLE_LABELS = new Set(['bottle', 'cup', 'wine glass']);

export type ChugVideoAnalysisInput = {
  uri: string;
  blob?: Blob;
};

type MediaPipeVisionModule = {
  FilesetResolver: any;
  FaceLandmarker: any;
  ObjectDetector: any;
};

type MediaPipeDetectionCategory = {
  categoryName?: string;
  score?: number;
};

type MediaPipeDetection = {
  categories?: MediaPipeDetectionCategory[];
  boundingBox?: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
};

type MediaPipeNormalizedLandmark = {
  x: number;
  y: number;
  visibility?: number;
};

let mediaPipeVisionPromise: Promise<MediaPipeVisionModule> | null = null;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getBottleDetectionScore = (detection: MediaPipeDetection) => (
  Math.max(
    0,
    ...(detection.categories || [])
      .filter((category) => BOTTLE_LABELS.has((category.categoryName || '').toLowerCase()))
      .map((category) => category.score || 0)
  )
);

const loadMediaPipeVision = () => {
  if (!mediaPipeVisionPromise) {
    const browserImport = new Function('moduleUrl', 'return import(moduleUrl)') as (
      moduleUrl: string
    ) => Promise<MediaPipeVisionModule>;
    mediaPipeVisionPromise = withTimeout(
      browserImport(MEDIAPIPE_MODULE_URL),
      CHUG_MODEL_LOAD_TIMEOUT_MS,
      CHUG_ANALYSIS_TIMEOUT_MESSAGE
    ).catch((error) => {
      mediaPipeVisionPromise = null;
      throw error;
    });
  }
  return mediaPipeVisionPromise;
};

const waitForVideoEvent = (
  video: HTMLVideoElement,
  eventName: keyof HTMLMediaElementEventMap,
  timeoutMs: number,
  message: string
) => withTimeout(
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener('error', handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(video.error?.message || message));
    };

    video.addEventListener(eventName, handleEvent);
    video.addEventListener('error', handleError);
  }),
  timeoutMs,
  message
);

const waitForVideoMetadata = (video: HTMLVideoElement) => {
  if (video.readyState >= 1 && Number.isFinite(video.duration)) return Promise.resolve();
  return waitForVideoEvent(video, 'loadedmetadata', CHUG_VIDEO_LOAD_TIMEOUT_MS, 'Could not load chug video for analysis.');
};

const waitForVideoFrame = (video: HTMLVideoElement) => {
  if (video.readyState >= 2) return Promise.resolve();
  return waitForVideoEvent(video, 'loadeddata', CHUG_VIDEO_LOAD_TIMEOUT_MS, 'Could not prepare chug video for analysis.');
};

const seekVideoTo = async (video: HTMLVideoElement, timeSeconds: number) => {
  const finiteDuration = Number.isFinite(video.duration) ? video.duration : null;
  const maxSeekSeconds = finiteDuration && finiteDuration > 0 ? Math.max(0, finiteDuration - 0.001) : timeSeconds;
  const targetSeconds = Math.max(0, Math.min(timeSeconds, maxSeekSeconds));
  if (Math.abs(video.currentTime - targetSeconds) < 0.001) {
    await waitForVideoFrame(video);
    return;
  }

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('error', handleError);
      };
      const handleSeeked = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error(video.error?.message || CHUG_ANALYSIS_TIMEOUT_MESSAGE));
      };

      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('error', handleError);
      try {
        video.currentTime = targetSeconds;
      } catch (error) {
        cleanup();
        reject(error);
      }
    }),
    CHUG_VIDEO_SEEK_TIMEOUT_MS,
    CHUG_ANALYSIS_TIMEOUT_MESSAGE
  );
  await waitForVideoFrame(video);
};

export const analyzeChugVideo = async (input: ChugVideoAnalysisInput) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('Chug timing is available in the web app for this version.');
  }

  const analysisStartedAt = Date.now();
  const throwIfAnalysisTimedOut = () => {
    if (Date.now() - analysisStartedAt > CHUG_ANALYSIS_TIMEOUT_MS) {
      throw new Error(CHUG_ANALYSIS_TIMEOUT_MESSAGE);
    }
  };

  const {
    FilesetResolver,
    FaceLandmarker,
    ObjectDetector,
  } = await loadMediaPipeVision();

  const objectUrl = input.blob ? URL.createObjectURL(input.blob) : input.uri;

  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;
    video.load();

    await waitForVideoMetadata(video);
    await waitForVideoFrame(video);
    throwIfAnalysisTimedOut();

    const vision = await withTimeout(
      FilesetResolver.forVisionTasks(WASM_URL),
      CHUG_MODEL_CREATE_TIMEOUT_MS,
      CHUG_ANALYSIS_TIMEOUT_MESSAGE
    );
    let faceLandmarker: any | null = null;
    let objectDetector: any | null = null;

    try {
      [faceLandmarker, objectDetector] = await withTimeout(
        Promise.all([
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: FACE_MODEL_URL },
            runningMode: 'VIDEO',
            numFaces: 1,
          }),
          ObjectDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: OBJECT_MODEL_URL },
            runningMode: 'VIDEO',
            scoreThreshold: 0.35,
            maxResults: 5,
          }),
        ]),
        CHUG_MODEL_CREATE_TIMEOUT_MS,
        CHUG_ANALYSIS_TIMEOUT_MESSAGE
      );

      const frames: ChugDetectionFrame[] = [];
      const videoDurationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
      const durationMs = Math.min(Math.round(videoDurationSeconds * 1000), 15000);

      for (let timeMs = 0; timeMs <= durationMs; timeMs += FRAME_STEP_MS) {
        throwIfAnalysisTimedOut();
        await seekVideoTo(video, timeMs / 1000);

        const faceResult = faceLandmarker.detectForVideo(video, timeMs);
        const objectResult = objectDetector.detectForVideo(video, timeMs);
        const faceLandmarks = (faceResult.faceLandmarks?.[0] || []) as MediaPipeNormalizedLandmark[];
        const normalizedFaceLandmarks = faceLandmarks
          .filter(Boolean)
          .map((landmark) => ({ x: landmark.x, y: landmark.y, visibility: landmark.visibility }));
        const mouthLandmarks = MOUTH_LANDMARK_IDS
          .map((index) => faceLandmarks[index])
          .filter(Boolean)
          .map((landmark) => ({ x: landmark.x, y: landmark.y, visibility: landmark.visibility }));

        const mouthBox = getMouthBoxFromLandmarks(mouthLandmarks, video.videoWidth, video.videoHeight);
        const faceBox = getFaceBoxFromLandmarks(normalizedFaceLandmarks, video.videoWidth, video.videoHeight);
        const lowerFaceBox = getLowerFaceBoxFromFaceBox(faceBox);
        const faceAnchor = getFaceAnchorFromLandmarks(normalizedFaceLandmarks, video.videoWidth, video.videoHeight);
        const mouthVisibility = getAverageLandmarkVisibility(mouthLandmarks);
        const bottle = (objectResult.detections as MediaPipeDetection[] | undefined)
          ?.filter((detection) => getBottleDetectionScore(detection) > 0)
          .sort((a, b) => getBottleDetectionScore(b) - getBottleDetectionScore(a))[0];
        const box = bottle?.boundingBox;
        const bottleBox = box
          ? { x: box.originX, y: box.originY, width: box.width, height: box.height }
          : null;
        const bottleScore = bottle ? getBottleDetectionScore(bottle) : null;

        frames.push({ timeMs, mouthBox, bottleBox, lowerFaceBox, faceAnchor, mouthVisibility, bottleScore });
      }

      return analyzeChugContactFrames(frames);
    } finally {
      faceLandmarker?.close?.();
      objectDetector?.close?.();
    }
  } finally {
    if (input.blob) URL.revokeObjectURL(objectUrl);
  }
};
