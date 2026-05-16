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
  useEffect(() => {
    onSummaryRef.current = onSummary;
  }, [onSummary]);

  const [summary, setSummary] = useState<ScreenSummary | null>(null);
  const [status, setStatus] = useState<CaptureStatus>({ kind: 'idle' });
  const [source, setSource] = useState<'capture' | 'simulated' | null>(null);

  useEffect(() => {
    const cap = captureRef.current;
    cap.onSummary((s) => {
      setSummary(s);
      setSource(s.source);
      onSummaryRef.current(s);
    });
    cap.onStatus((s) => setStatus(s));
    return () => cap.stop();
  }, []);

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
    () => ({ summary, status, start, stop, startSimulated, source }),
    [summary, status, start, stop, startSimulated, source],
  );
}
