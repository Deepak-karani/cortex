import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from './landmarks';

/**
 * Thin wrapper around MediaPipe Tasks Vision FaceLandmarker.
 * - Loads the WASM + model once
 * - Runs in VIDEO mode against a <video> stream
 * - Returns one face's landmarks (or null if no face)
 *
 * We never store frames or landmarks beyond the current tick.
 */

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let landmarker: FaceLandmarker | null = null;
let loadingPromise: Promise<FaceLandmarker> | null = null;

export async function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarker) return landmarker;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const lm = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
    landmarker = lm;
    return lm;
  })();

  return loadingPromise;
}

export function detectLandmarks(
  lm: FaceLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): NormalizedLandmark[] | null {
  const result = lm.detectForVideo(video, timestampMs);
  if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) return null;
  // Return only the first face. Each landmark is {x,y,z} already normalized to 0..1.
  return result.faceLandmarks[0] as NormalizedLandmark[];
}

export async function disposeFaceLandmarker(): Promise<void> {
  if (landmarker) {
    landmarker.close();
    landmarker = null;
  }
  loadingPromise = null;
}
