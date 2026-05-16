import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  AgentReport,
  AgentTraceEntry,
  AttentionMetrics,
  CognitiveAssessment,
  CognitiveState,
  ComputeTelemetry,
  DemoSpeed,
  FallbackStatus,
  FutureTimelines,
  MemoryRecord,
  ProductivityInsight,
  ScreenSummary,
  SocraticPrompt,
  Telemetry,
  ToolResult,
} from '../types';

const SERVER_URL =
  (import.meta as unknown as { env: { VITE_SERVER_URL?: string } }).env.VITE_SERVER_URL ??
  'http://localhost:4000';

const MAX_TRACE = 250;
const MAX_ACTIONS = 80;
const MAX_INSIGHTS = 30;
const MAX_REPORTS = 60;

export interface CortexState {
  connected: boolean;
  telemetry: Telemetry | null;
  assessment: CognitiveAssessment | null;
  timelines: FutureTimelines | null;
  trace: AgentTraceEntry[];
  actions: ToolResult[];
  memory: MemoryRecord[];
  fallback: FallbackStatus;
  socratic: SocraticPrompt | null;
  remoteAttention: AttentionMetrics | null;
  remoteScreen: ScreenSummary | null;
  reports: AgentReport[];
  insights: ProductivityInsight[];
  compute: ComputeTelemetry | null;
}

export interface CortexControls {
  startDemo: () => void;
  resetDemo: () => void;
  setSpeed: (s: DemoSpeed) => void;
  setManualState: (s: CognitiveState | null) => void;
  clearMemory: () => Promise<void>;
  pushAttention: (m: AttentionMetrics) => void;
  pushScreen: (s: ScreenSummary) => void;
  runAgent: () => Promise<void>;
}

export function useCortexSocket(): CortexState & CortexControls {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [assessment, setAssessment] = useState<CognitiveAssessment | null>(null);
  const [timelines, setTimelines] = useState<FutureTimelines | null>(null);
  const [trace, setTrace] = useState<AgentTraceEntry[]>([]);
  const [actions, setActions] = useState<ToolResult[]>([]);
  const [memory, setMemory] = useState<MemoryRecord[]>([]);
  const [fallback, setFallback] = useState<FallbackStatus>({
    active: false,
    reason: 'Booting...',
    lastChecked: Date.now(),
  });
  const [socratic, setSocratic] = useState<SocraticPrompt | null>(null);
  const [remoteAttention, setRemoteAttention] = useState<AttentionMetrics | null>(null);
  const [remoteScreen, setRemoteScreen] = useState<ScreenSummary | null>(null);
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [insights, setInsights] = useState<ProductivityInsight[]>([]);
  const [compute, setCompute] = useState<ComputeTelemetry | null>(null);

  useEffect(() => {
    const s = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });
    socketRef.current = s;

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('telemetry:update', (t: Telemetry) => setTelemetry(t));
    s.on('cognitive:update', (a: CognitiveAssessment) => setAssessment(a));
    s.on('timeline:update', (tl: FutureTimelines) => setTimelines(tl));
    s.on('agent:trace', (entry: AgentTraceEntry) => {
      setTrace((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_TRACE ? next.slice(-MAX_TRACE) : next;
      });
    });
    s.on('agent:trace:reset', () => {
      setTrace([]);
      setActions([]);
      setInsights([]);
      setSocratic(null);
      setTimelines(null);
      setReports([]);
    });
    s.on('action:log', (action: ToolResult) => {
      setActions((prev) => {
        const next = [action, ...prev];
        return next.length > MAX_ACTIONS ? next.slice(0, MAX_ACTIONS) : next;
      });
    });
    s.on('memory:update', (list: MemoryRecord[]) => setMemory(list));
    s.on('fallback:update', (f: FallbackStatus) => setFallback(f));
    s.on('socratic:update', (p: SocraticPrompt) => setSocratic(p));
    s.on('attention:update', (m: AttentionMetrics) => setRemoteAttention(m));
    s.on('screen:update', (sc: ScreenSummary) => setRemoteScreen(sc));
    s.on('agent:report', (r: AgentReport) =>
      setReports((prev) => {
        const next = [r, ...prev];
        return next.length > MAX_REPORTS ? next.slice(0, MAX_REPORTS) : next;
      }),
    );
    s.on('insight:new', (i: ProductivityInsight) =>
      setInsights((prev) => {
        const next = [i, ...prev];
        return next.length > MAX_INSIGHTS ? next.slice(0, MAX_INSIGHTS) : next;
      }),
    );
    s.on('compute:update', (c: ComputeTelemetry) => setCompute(c));

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  const controls = useMemo<CortexControls>(
    () => ({
      startDemo: () => socketRef.current?.emit('demo:start'),
      resetDemo: () => {
        socketRef.current?.emit('demo:reset');
        setTrace([]);
        setActions([]);
        setInsights([]);
        setReports([]);
        setSocratic(null);
        setTimelines(null);
      },
      setSpeed: (speed) => socketRef.current?.emit('demo:setSpeed', { speed }),
      setManualState: (state) => socketRef.current?.emit('demo:setManualState', { state }),
      clearMemory: async () => {
        await fetch(`${SERVER_URL}/memory/clear`, { method: 'POST' });
      },
      pushAttention: (m: AttentionMetrics) => socketRef.current?.emit('attention:push', m),
      pushScreen: (s: ScreenSummary) => socketRef.current?.emit('screen:push', s),
      runAgent: async () => {
        await fetch(`${SERVER_URL}/agent/run`, { method: 'POST' });
      },
    }),
    [],
  );

  return {
    connected,
    telemetry,
    assessment,
    timelines,
    trace,
    actions,
    memory,
    fallback,
    socratic,
    remoteAttention,
    remoteScreen,
    reports,
    insights,
    compute,
    ...controls,
  };
}
