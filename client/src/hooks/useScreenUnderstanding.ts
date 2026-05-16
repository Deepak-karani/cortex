import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CaptureStatus,
  createScreenCapture,
} from '../screen/screenCapture';
import type { ScreenSummary } from '../types';

export interface UseScreenResult {
  summary: ScreenSummary | null;
  status: CaptureStatus;
  start: () => Promise<void>;
  stop: () => void;
  startSimulated: () => void;
  source: 'capture' | 'simulated' | null;
  /** Internal video element so a small preview can be attached to the dashboard. */
  videoElement: HTMLVideoElement | null;
  /** Subscribe to JPEG frames (base64, ~one per 6s). For VLM uplink. */
  onFrame: (cb: (jpegBase64: string) => void) => void;
}

const SIMULATED_ARCS = [
  // A 6-step scripted "day" so the panel feels alive even without permission.
  {
    activeApp: 'VS Code',
    activeTitle: 'cortex_2 — server/agents/orchestrator.ts',
    workflowState: 'flow' as const,
    inferredTask: 'Implementing multi-agent orchestrator',
    inferredProject: 'cortex_2',
    inferredIntent: 'Writing or reading code',
    ocrTokens: ['orchestrator', 'react', 'agent', 'specialist', 'nemotron', 'typescript', 'parallel'],
    tabCount: 4,
    windows: [{ app: 'VS Code', title: 'orchestrator.ts', category: 'ide', active: true }],
  },
  {
    activeApp: 'Chrome',
    activeTitle: 'stackoverflow.com — react useeffect cleanup race condition',
    workflowState: 'searching' as const,
    inferredTask: 'Researching async cleanup pattern',
    inferredProject: 'cortex_2',
    inferredIntent: 'Researching a solution',
    ocrTokens: ['stackoverflow', 'useeffect', 'cleanup', 'race', 'condition', 'async', 'cancelled', 'unmount'],
    tabCount: 11,
    windows: [{ app: 'Chrome', title: 'Stack Overflow', category: 'browser', active: true }],
  },
  {
    activeApp: 'Slack',
    activeTitle: '#design-review · 14 unread',
    workflowState: 'communicating' as const,
    inferredTask: 'Triaging design review thread',
    inferredProject: 'cortex_2',
    inferredIntent: 'Communicating with team',
    ocrTokens: ['slack', 'unread', 'thread', 'design', 'review', 'mention', 'reply'],
    tabCount: 18,
    windows: [{ app: 'Slack', title: '#design-review', category: 'chat', active: true }],
  },
  {
    activeApp: 'Terminal',
    activeTitle: 'tsc --watch · TypeError: Cannot read properties of undefined',
    workflowState: 'debugging' as const,
    inferredTask: 'Resolving TypeError in agent loop',
    inferredProject: 'cortex_2',
    inferredIntent: 'Debugging an error',
    ocrTokens: ['typeerror', 'cannot', 'read', 'properties', 'undefined', 'agent', 'reactloop'],
    tabCount: 12,
    windows: [{ app: 'Terminal', title: 'tsc --watch', category: 'ide', active: true }],
  },
  {
    activeApp: 'VS Code',
    activeTitle: 'cortex_2 — fix applied; running tests',
    workflowState: 'flow' as const,
    inferredTask: 'Fix verified, returning to feature work',
    inferredProject: 'cortex_2',
    inferredIntent: 'Writing or reading code',
    ocrTokens: ['cortex', 'test', 'passed', 'agent', 'orchestrator', 'merged', 'green'],
    tabCount: 6,
    windows: [{ app: 'VS Code', title: 'orchestrator.ts', category: 'ide', active: true }],
  },
];

export function useScreenUnderstanding(
  onSummary: (s: ScreenSummary) => void,
): UseScreenResult {
  const captureRef = useRef(createScreenCapture());
  const simTimerRef = useRef<number | null>(null);
  const onSummaryRef = useRef(onSummary);
  const onFrameSubsRef = useRef<((b64: string) => void)[]>([]);
  useEffect(() => {
    onSummaryRef.current = onSummary;
  }, [onSummary]);

  const [summary, setSummary] = useState<ScreenSummary | null>(null);
  const [status, setStatus] = useState<CaptureStatus>({ kind: 'idle' });
  const [source, setSource] = useState<'capture' | 'simulated' | null>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    const cap = captureRef.current;
    cap.onSummary((s) => {
      setSummary(s);
      setSource(s.source);
      onSummaryRef.current(s);
      // Update the cached video ref each tick (the capture pipeline lazily
      // creates the video element on start).
      const v = cap.getVideoElement();
      if (v !== videoElement) setVideoElement(v);
    });
    cap.onStatus((s) => setStatus(s));
    cap.onFrame((b64) => {
      onFrameSubsRef.current.forEach((cb) => cb(b64));
    });
    return () => cap.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFrame = (cb: (b64: string) => void) => {
    onFrameSubsRef.current.push(cb);
  };

  const stopSim = useCallback(() => {
    if (simTimerRef.current) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  }, []);

  const startSimulated = useCallback(() => {
    stopSim();
    captureRef.current.stop();
    let i = 0;
    const tick = () => {
      const tpl = SIMULATED_ARCS[i % SIMULATED_ARCS.length];
      i += 1;
      const s: ScreenSummary = {
        timestamp: Date.now(),
        ...tpl,
        textSampleHash: Math.random().toString(16).slice(2, 10),
        confidence: 0.75,
        source: 'simulated',
      };
      setSummary(s);
      setSource('simulated');
      onSummaryRef.current(s);
    };
    tick();
    simTimerRef.current = window.setInterval(tick, 4500) as unknown as number;
    setStatus({ kind: 'running', fps: 0, lastHash: 'sim' });
  }, [stopSim]);

  const start = useCallback(async () => {
    stopSim();
    const r = await captureRef.current.start();
    if (!r.ok) {
      // Gracefully fall back to the simulated arc so the demo never breaks.
      startSimulated();
    }
  }, [startSimulated, stopSim]);

  const stop = useCallback(() => {
    captureRef.current.stop();
    stopSim();
    setStatus({ kind: 'idle' });
    setSource(null);
  }, [stopSim]);

  return useMemo(
    () => ({ summary, status, start, stop, startSimulated, source, videoElement, onFrame }),
    // onFrame is referentially stable across renders (closure over ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary, status, start, stop, startSimulated, source, videoElement],
  );
}
