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
    mediaPipeVisionPromise = browserImport(MEDIAPIPE_MODULE_URL);
  }
  return mediaPipeVisionPromise;
};

export const analyzeChugVideo = async (input: ChugVideoAnalysisInput) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('Chug timing is available in the web app for this version.');
  }

  const {
    FilesetResolver,
    FaceLandmarker,
    ObjectDetector,
  } = await loadMediaPipeVision();

  const objectUrl = input.blob ? URL.createObjectURL(input.blob) : input.uri;

  try {
    const video = document.createElement('video');
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not load chug video for analysis.'));
    });

    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const [faceLandmarker, objectDetector] = await Promise.all([
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
    ]);

    const frames: ChugDetectionFrame[] = [];
    const durationMs = Math.min(Math.round(video.duration * 1000), 15000);

    for (let timeMs = 0; timeMs <= durationMs; timeMs += FRAME_STEP_MS) {
      video.currentTime = timeMs / 1000;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

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

    faceLandmarker.close();
    objectDetector.close();

    return analyzeChugContactFrames(frames);
  } finally {
    if (input.blob) URL.revokeObjectURL(objectUrl);
  }
};
