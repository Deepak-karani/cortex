// MediaPipe FaceMesh landmark indices we care about.
// Reference: https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
// We intentionally only use a handful — full mesh is not needed for gaze + blink + pose.

export const LANDMARKS = {
  // Eyes — outer corner, inner corner, top lid, bottom lid (one pair per eye).
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,

  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,

  // Iris (FaceMesh "refine_landmarks" mode adds these — indices 468-477).
  LEFT_IRIS_CENTER: 468,
  RIGHT_IRIS_CENTER: 473,

  // Head pose anchors.
  NOSE_TIP: 1,
  CHIN: 152,
  FOREHEAD: 10,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
} as const;

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
