import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttentionAnalyzer } from '../attention/analyzer';
import { detectLandmarks, disposeFaceLandmarker, loadFaceLandmarker } from '../attention/faceMesh';
import type { AttentionHeatPoint, AttentionMetrics } from '../types';

export type WebcamStatus =
  | 'idle'
  | 'requesting'
  | 'loading_model'
  | 'running'
  | 'denied'
  | 'unsupported'
  | 'error_falling_back';

export interface UseAttentionResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  start: () => Promise<void>;
  stop: () => void;
  metrics: AttentionMetrics | null;
  status: WebcamStatus;
  errorMessage: string | null;
  heat: AttentionHeatPoint[];
  fps: number;
  source: 'webcam' | 'simulated' | null;
  streamActive: boolean;
}

const HEAT_MAX = 80;
const PUSH_INTERVAL_MS = 600;

const log = (...args: unknown[]) => console.log('[attention]', ...args);
const warn = (...args: unknown[]) => console.warn('[attention]', ...args);

export function useAttentionTracking(
  onMetrics: (m: AttentionMetrics) => void,
): UseAttentionResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const analyzerRef = useRef<AttentionAnalyzer>(new AttentionAnalyzer());
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const simTimerRef = useRef<number | null>(null);
  const lastPushRef = useRef<number>(0);
  const lastFrameTsRef = useRef<number>(0);
  const fpsEmaRef = useRef<number>(0);
  const statusRef = useRef<WebcamStatus>('idle');

  const [metrics, setMetrics] = useState<AttentionMetrics | null>(null);
  const [status, setStatus] = useState<WebcamStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [heat, setHeat] = useState<AttentionHeatPoint[]>([]);
  const [fps, setFps] = useState(0);
  const [source, setSource] = useState<'webcam' | 'simulated' | null>(null);
  const [streamActive, setStreamActive] = useState(false);

  const setStatusBoth = useCallback((s: WebcamStatus) => {
    statusRef.current = s;
    setStatus(s);
    log('status →', s);
  }, []);

  const onMetricsRef = useRef(onMetrics);
  useEffect(() => {
    onMetricsRef.current = onMetrics;
  }, [onMetrics]);

  const pushHeat = useCallback((point: { x: number; y: number; weight: number } | null) => {
    if (!point) return;
    setHeat((prev) => {
      const next: AttentionHeatPoint[] = [
        ...prev,
        { x: point.x, y: point.y, weight: point.weight, t: Date.now() },
      ];
      return next.length > HEAT_MAX ? next.slice(-HEAT_MAX) : next;
    });
  }, []);

  const publish = useCallback(
    (m: AttentionMetrics, heatPoint: { x: number; y: number; weight: number } | null) => {
      setMetrics(m);
      setSource(m.source);
      pushHeat(heatPoint);
      const now = Date.now();
      if (now - lastPushRef.current > PUSH_INTERVAL_MS) {
        lastPushRef.current = now;
        onMetricsRef.current(m);
      }
    },
    [pushHeat],
  );

  const teardownStreamOnly = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreamActive(false);
    void disposeFaceLandmarker();
  }, []);

  const stopAll = useCallback(() => {
    if (simTimerRef.current) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    teardownStreamOnly();
  }, [teardownStreamOnly]);

  const startSimulationFallback = useCallback(
    (reason: string) => {
      warn('falling back to simulation:', reason);
      teardownStreamOnly();
      if (simTimerRef.current) {
        window.clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
      setStatusBoth('error_falling_back');
      setErrorMessage(reason);
      const tick = () => {
        const seconds = Math.floor(Date.now() / 1000);
        const bias: 'focused' | 'drifting' | 'tired' =
          seconds % 30 < 18 ? 'focused' : seconds % 30 < 24 ? 'drifting' : 'tired';
        const result = analyzerRef.current.simulate(Date.now(), bias);
        publish(result.metrics, result.heat);
      };
      tick();
      simTimerRef.current = window.setInterval(tick, 400) as unknown as number;
    },
    [publish, setStatusBoth, teardownStreamOnly],
  );

  const start = useCallback(async () => {
    const current = statusRef.current;
    log('start() called, current status =', current);
    if (current === 'running' || current === 'requesting' || current === 'loading_model') {
      log('already in progress; ignoring');
      return;
    }
    setErrorMessage(null);

    // Stop any running simulation before requesting webcam.
    if (simTimerRef.current) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatusBoth('unsupported');
      startSimulationFallback('Webcam API not available in this browser.');
      return;
    }

    if (!window.isSecureContext) {
      setStatusBoth('unsupported');
      startSimulationFallback(
        'getUserMedia requires HTTPS or localhost. This page is on an insecure origin.',
      );
      return;
    }

    setStatusBoth('requesting');
    let stream: MediaStream;
    try {
      log('requesting camera...');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      log('got stream', stream.id);
    } catch (err) {
      const e = err as DOMException;
      const msg = `${e.name ?? 'Error'}: ${e.message ?? 'Permission denied.'}`;
      warn('getUserMedia failed:', msg);
      setStatusBoth('denied');
      startSimulationFallback(`Webcam permission denied. ${msg}`);
      return;
    }
    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) {
      warn('video element missing');
      stream.getTracks().forEach((t) => t.stop());
      startSimulationFallback('Video element not mounted.');
      return;
    }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    setStreamActive(true);
    try {
      await video.play();
      log('video playing');
    } catch (err) {
      warn('video.play() rejected:', (err as Error).message);
    }

    setStatusBoth('loading_model');
    let lm;
    try {
      log('loading FaceMesh model...');
      lm = await loadFaceLandmarker();
      log('FaceMesh model ready');
    } catch (err) {
      const msg = (err as Error).message ?? 'unknown error';
      warn('FaceMesh load failed:', msg);
      // KEEP the stream alive — user still sees themselves — but fall back to
      // simulated metrics so the demo proceeds.
      startSimulationFallback(`FaceMesh failed to load (${msg}). Showing camera with simulated metrics.`);
      // Re-attach the stream after teardownStreamOnly cleared it.
      try {
        const fresh = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        });
        streamRef.current = fresh;
        if (videoRef.current) {
          videoRef.current.srcObject = fresh;
          await videoRef.current.play().catch(() => {});
          setStreamActive(true);
        }
      } catch {
        // ignore
      }
      return;
    }

    setStatusBoth('running');
    setSource('webcam');

    const loop = () => {
      if (!videoRef.current) return;
      const v = videoRef.current;
      const now = performance.now();

      if (lastFrameTsRef.current > 0) {
        const instFps = 1000 / Math.max(1, now - lastFrameTsRef.current);
        fpsEmaRef.current = fpsEmaRef.current * 0.85 + instFps * 0.15;
        setFps(Math.round(fpsEmaRef.current));
      }
      lastFrameTsRef.current = now;

      let landmarks = null as ReturnType<typeof detectLandmarks>;
      try {
        if (v.readyState >= 2) landmarks = detectLandmarks(lm, v, now);
      } catch (err) {
        warn('detectLandmarks threw:', (err as Error).message);
        landmarks = null;
      }
      const analysis = analyzerRef.current.ingest(landmarks, Date.now());
      publish(analysis.metrics, analysis.heat);

      rafRef.current = requestAnimationFrame(loop);
    };
    loop();
  }, [publish, setStatusBoth, startSimulationFallback]);

  const stop = useCallback(() => {
    stopAll();
    setStatusBoth('idle');
    setSource(null);
    setFps(0);
  }, [setStatusBoth, stopAll]);

  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  return useMemo(
    () => ({
      videoRef: videoRef as React.RefObject<HTMLVideoElement>,
      start,
      stop,
      metrics,
      status,
      errorMessage,
      heat,
      fps,
      source,
      streamActive,
    }),
    [errorMessage, fps, heat, metrics, source, start, status, stop, streamActive],
  );
}
