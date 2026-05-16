import type { AttentionInterpretedState, AttentionMetrics, GazeDirection } from '../types';
import { LANDMARKS, dist, type NormalizedLandmark } from './landmarks';

const HISTORY_WINDOW_MS = 60_000;
const BLINK_WINDOW_MS = 30_000;
const SWITCH_WINDOW_MS = 60_000;

interface GazeSample {
  t: number;
  direction: GazeDirection;
  offscreen: boolean;
}

interface BlinkSample {
  t: number;
}

export interface FrameAnalysis {
  metrics: AttentionMetrics;
  heat: { x: number; y: number; weight: number } | null;
  rawGazeX: number; // -1..1 from face center
  rawGazeY: number;
}

export class AttentionAnalyzer {
  private gazeHistory: GazeSample[] = [];
  private blinkHistory: BlinkSample[] = [];
  private lastEyeOpenRatio = 1;
  private lastDirection: GazeDirection = 'center';
  private lastDirectionChangeAt = Date.now();
  private offscreenStartAt: number | null = null;
  private lastTickAt = Date.now();
  private stabilityEma = 80; // exponential moving average

  /**
   * Build metrics directly from one frame of FaceMesh landmarks.
   * If `landmarks` is null, treat as face-not-detected.
   */
  ingest(landmarks: NormalizedLandmark[] | null, now: number = Date.now()): FrameAnalysis {
    const dtSec = Math.max(0.001, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

    if (!landmarks || landmarks.length < 478) {
      // Face not detected — treat as offscreen sample.
      this.pushGaze('offscreen', true, now);
      if (this.offscreenStartAt === null) this.offscreenStartAt = now;
      const metrics = this.buildMetrics(now, false);
      return { metrics, heat: null, rawGazeX: 0, rawGazeY: 0 };
    }

    // ---- Eye aspect ratio for blink detection ----
    const leftEye = eyeAspectRatio(
      landmarks[LANDMARKS.LEFT_EYE_OUTER],
      landmarks[LANDMARKS.LEFT_EYE_INNER],
      landmarks[LANDMARKS.LEFT_EYE_TOP],
      landmarks[LANDMARKS.LEFT_EYE_BOTTOM],
    );
    const rightEye = eyeAspectRatio(
      landmarks[LANDMARKS.RIGHT_EYE_OUTER],
      landmarks[LANDMARKS.RIGHT_EYE_INNER],
      landmarks[LANDMARKS.RIGHT_EYE_TOP],
      landmarks[LANDMARKS.RIGHT_EYE_BOTTOM],
    );
    const ear = (leftEye + rightEye) / 2;
    const eyesClosed = ear < 0.18;
    if (this.lastEyeOpenRatio >= 0.18 && eyesClosed) {
      // falling edge: registering one blink
      this.blinkHistory.push({ t: now });
    }
    this.lastEyeOpenRatio = ear;

    // ---- Iris position relative to eye corners → horizontal gaze ----
    const leftIris = landmarks[LANDMARKS.LEFT_IRIS_CENTER];
    const rightIris = landmarks[LANDMARKS.RIGHT_IRIS_CENTER];

    const leftGazeX = relativeIrisX(
      leftIris,
      landmarks[LANDMARKS.LEFT_EYE_OUTER],
      landmarks[LANDMARKS.LEFT_EYE_INNER],
    );
    const rightGazeX = relativeIrisX(
      rightIris,
      landmarks[LANDMARKS.RIGHT_EYE_INNER],
      landmarks[LANDMARKS.RIGHT_EYE_OUTER],
    );
    const gazeX = (leftGazeX + rightGazeX) / 2; // -1 (looking right of camera) .. 1 (left)

    const leftGazeY = relativeIrisY(
      leftIris,
      landmarks[LANDMARKS.LEFT_EYE_TOP],
      landmarks[LANDMARKS.LEFT_EYE_BOTTOM],
    );
    const rightGazeY = relativeIrisY(
      rightIris,
      landmarks[LANDMARKS.RIGHT_EYE_TOP],
      landmarks[LANDMARKS.RIGHT_EYE_BOTTOM],
    );
    const gazeY = (leftGazeY + rightGazeY) / 2;

    // ---- Head pose (yaw approximation) ----
    const noseTip = landmarks[LANDMARKS.NOSE_TIP];
    const leftCheek = landmarks[LANDMARKS.LEFT_CHEEK];
    const rightCheek = landmarks[LANDMARKS.RIGHT_CHEEK];
    const faceWidth = dist(leftCheek, rightCheek) || 0.0001;
    const headYaw = (noseTip.x - (leftCheek.x + rightCheek.x) / 2) / faceWidth; // -0.5..0.5

    // Blend gaze and head pose to decide direction.
    const combinedX = gazeX * 0.65 + headYaw * 4 * 0.35;
    const combinedY = gazeY;

    let direction: GazeDirection;
    let offscreen = false;
    if (eyesClosed) {
      direction = 'offscreen';
      offscreen = true;
    } else if (combinedY > 0.55) {
      direction = 'down';
    } else if (combinedX > 0.4) {
      direction = 'left';
    } else if (combinedX < -0.4) {
      direction = 'right';
    } else if (Math.abs(combinedX) > 0.75 || Math.abs(combinedY) > 0.9) {
      direction = 'offscreen';
      offscreen = true;
    } else {
      direction = 'center';
    }

    if (direction === 'offscreen') {
      if (this.offscreenStartAt === null) this.offscreenStartAt = now;
    } else {
      this.offscreenStartAt = null;
    }

    if (direction !== this.lastDirection) {
      this.lastDirection = direction;
      this.lastDirectionChangeAt = now;
    }

    this.pushGaze(direction, offscreen, now);

    // Stability EMA — fewer switches → higher stability.
    const recentSwitches = this.countSwitchesInWindow(now, 8000);
    const targetStability = Math.max(0, 100 - recentSwitches * 12);
    this.stabilityEma = this.stabilityEma * 0.85 + targetStability * 0.15;

    const heat = {
      x: clamp01((combinedX + 1) / 2),
      y: clamp01((combinedY + 0.5) / 1.5),
      weight: direction === 'offscreen' ? 0.2 : 1 - Math.abs(combinedX),
    };

    const metrics = this.buildMetrics(now, true);
    return { metrics, heat, rawGazeX: combinedX, rawGazeY: combinedY };
  }

  /**
   * Generate fully simulated metrics when webcam is unavailable. We make this
   * deterministic-ish so the panel still looks alive.
   */
  simulate(now: number = Date.now(), bias: 'focused' | 'drifting' | 'tired' = 'focused'): FrameAnalysis {
    const dt = (now - this.lastTickAt) / 1000;
    this.lastTickAt = now;
    const r = Math.random();
    let direction: GazeDirection = 'center';
    let offscreen = false;
    if (bias === 'drifting') {
      if (r < 0.35) direction = 'offscreen';
      else if (r < 0.6) direction = 'left';
      else if (r < 0.8) direction = 'right';
      offscreen = direction === 'offscreen';
    } else if (bias === 'tired') {
      if (r < 0.15) direction = 'offscreen';
      else if (r < 0.5) direction = 'down';
      offscreen = direction === 'offscreen';
    } else {
      if (r < 0.1) direction = 'left';
      else if (r < 0.18) direction = 'right';
    }
    if (direction !== this.lastDirection) {
      this.lastDirection = direction;
      this.lastDirectionChangeAt = now;
    }
    if (direction === 'offscreen' && this.offscreenStartAt === null) {
      this.offscreenStartAt = now;
    } else if (direction !== 'offscreen') {
      this.offscreenStartAt = null;
    }
    if (Math.random() < (bias === 'tired' ? 0.08 : 0.03) * Math.min(1, dt)) {
      this.blinkHistory.push({ t: now });
    }
    this.pushGaze(direction, offscreen, now);
    const recentSwitches = this.countSwitchesInWindow(now, 8000);
    const targetStability = Math.max(0, 100 - recentSwitches * 12);
    this.stabilityEma = this.stabilityEma * 0.85 + targetStability * 0.15;

    const heat = {
      x: direction === 'left' ? 0.2 : direction === 'right' ? 0.8 : direction === 'down' ? 0.5 : 0.5,
      y: direction === 'down' ? 0.85 : 0.45,
      weight: direction === 'offscreen' ? 0.15 : 0.8,
    };
    const metrics = this.buildMetrics(now, direction !== 'offscreen');
    metrics.source = 'simulated';
    return { metrics, heat, rawGazeX: 0, rawGazeY: 0 };
  }

  private pushGaze(direction: GazeDirection, offscreen: boolean, t: number) {
    this.gazeHistory.push({ t, direction, offscreen });
    const cutoff = t - HISTORY_WINDOW_MS;
    while (this.gazeHistory.length > 0 && this.gazeHistory[0].t < cutoff) {
      this.gazeHistory.shift();
    }
    const blinkCutoff = t - BLINK_WINDOW_MS;
    while (this.blinkHistory.length > 0 && this.blinkHistory[0].t < blinkCutoff) {
      this.blinkHistory.shift();
    }
  }

  private countSwitchesInWindow(now: number, windowMs: number): number {
    const cutoff = now - windowMs;
    let switches = 0;
    let prev: GazeDirection | null = null;
    for (const g of this.gazeHistory) {
      if (g.t < cutoff) continue;
      if (prev !== null && prev !== g.direction) switches += 1;
      prev = g.direction;
    }
    return switches;
  }

  private buildMetrics(now: number, faceDetected: boolean): AttentionMetrics {
    const cutoff60 = now - HISTORY_WINDOW_MS;
    const recent = this.gazeHistory.filter((g) => g.t >= cutoff60);
    const offscreenCount = recent.filter((g) => g.offscreen).length;
    const offscreenRatio60s = recent.length > 0 ? offscreenCount / recent.length : 0;
    const switchesPerMin = (this.countSwitchesInWindow(now, SWITCH_WINDOW_MS) / SWITCH_WINDOW_MS) * 60_000;
    const blinkRate = (this.blinkHistory.length / BLINK_WINDOW_MS) * 60_000;
    const distractionDurationSeconds = this.offscreenStartAt
      ? (now - this.offscreenStartAt) / 1000
      : 0;
    const focusStability = Math.round(clamp(this.stabilityEma, 0, 100));

    // attentionScore: blend of (1 - offscreenRatio), focusStability, faceDetected,
    // penalize rapid switching and abnormal blink rate.
    const onscreen = 1 - offscreenRatio60s;
    const stability01 = focusStability / 100;
    const switchPenalty = clamp(switchesPerMin / 80, 0, 1); // 80 switches/min = 0
    const blinkPenalty =
      blinkRate < 5 ? clamp((5 - blinkRate) / 5, 0, 0.4) :
      blinkRate > 30 ? clamp((blinkRate - 30) / 30, 0, 0.4) :
      0;

    const facePenalty = faceDetected ? 0 : 0.5;
    const raw = onscreen * 0.55 + stability01 * 0.35 - switchPenalty * 0.15 - blinkPenalty * 0.15 - facePenalty;
    const attentionScore = Math.round(clamp(raw * 100, 0, 100));

    const interpretedState = interpret({
      attentionScore,
      offscreenRatio60s,
      switchesPerMin,
      blinkRate,
      faceDetected,
      distractionDurationSeconds,
    });

    return {
      timestamp: now,
      attentionScore,
      gazeDirection: this.lastDirection,
      distractionDurationSeconds,
      offscreenRatio60s,
      blinkRate,
      focusStability,
      gazeSwitchRate: switchesPerMin,
      faceDetected,
      interpretedState,
      source: 'webcam',
    };
  }

  reset(): void {
    this.gazeHistory = [];
    this.blinkHistory = [];
    this.offscreenStartAt = null;
    this.lastDirection = 'center';
    this.lastDirectionChangeAt = Date.now();
    this.stabilityEma = 80;
  }
}

function eyeAspectRatio(
  outer: NormalizedLandmark,
  inner: NormalizedLandmark,
  top: NormalizedLandmark,
  bottom: NormalizedLandmark,
): number {
  const v = dist(top, bottom);
  const h = dist(outer, inner) || 0.0001;
  return v / h;
}

function relativeIrisX(
  iris: NormalizedLandmark,
  outer: NormalizedLandmark,
  inner: NormalizedLandmark,
): number {
  // Returns -1 (iris at outer edge of eye, looking outward) ..  1 (iris at inner edge)
  const w = inner.x - outer.x || 0.0001;
  const pos = (iris.x - outer.x) / w; // 0 outer → 1 inner
  return clamp(pos * 2 - 1, -1.5, 1.5);
}

function relativeIrisY(
  iris: NormalizedLandmark,
  top: NormalizedLandmark,
  bottom: NormalizedLandmark,
): number {
  const h = bottom.y - top.y || 0.0001;
  const pos = (iris.y - top.y) / h;
  return clamp(pos * 2 - 1, -1.5, 1.5);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function interpret(input: {
  attentionScore: number;
  offscreenRatio60s: number;
  switchesPerMin: number;
  blinkRate: number;
  faceDetected: boolean;
  distractionDurationSeconds: number;
}): AttentionInterpretedState {
  if (input.distractionDurationSeconds > 5 || input.offscreenRatio60s > 0.45) {
    return 'Distracted';
  }
  if (input.blinkRate > 28 || (input.attentionScore < 50 && input.blinkRate > 22)) {
    return 'Fatigued';
  }
  if (input.switchesPerMin > 40) {
    return 'Overstimulated';
  }
  if (input.switchesPerMin > 18 && input.attentionScore < 65) {
    return 'Searching';
  }
  return 'Focused';
}
