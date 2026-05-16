import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type {
  AgentReport,
  AgentTraceEntry,
  AttentionMetrics,
  CognitiveAssessment,
  ComputeTelemetry,
  DemoSpeed,
  FallbackStatus,
  MemoryRecord,
  ProductivityInsight,
  RuntimeHealth,
  ScreenAnalysis,
  ScreenSummary,
  SocraticPrompt,
  Telemetry,
  ToolResult,
} from '../types';
import { SERVER_URL } from '../lib/constants';
import { getHeartRateSource, type HeartRateTrend } from '../lib/biometrics/heartRateSource';

const MAX_TRACE = 240;
const MAX_ACTIONS = 80;
const MAX_INSIGHTS = 30;
const MAX_REPORTS = 60;
const MAX_TIMELINE = 60;
const MAX_HR_HISTORY = 90;
const MAX_ATTENTION_HISTORY = 90;
const MAX_SWITCH_HISTORY = 90;

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'error';

export type CognitiveStateName =
  | 'in_flow'
  | 'focused'
  | 'distracted'
  | 'fatigued'
  | 'overloaded'
  | 'unknown';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  kind:
    | 'hr_spike'
    | 'tab_burst'
    | 'attention_drop'
    | 'debug_loop'
    | 'intervention'
    | 'focus_sprint'
    | 'insight'
    | 'note';
  title: string;
  detail?: string;
  severity: 'info' | 'warn' | 'critical';
}

export interface CortexStore {
  // ----- subsystems -----
  system: {
    socketConnected: boolean;
    dgxConnected: boolean;
    openclawRunning: boolean;
    nemotronModel: string;
    fallbackActive: boolean;
    fallbackReason: string;
    latencyMs: number;
    device: string;
  };
  cognitive: {
    loadScore: number;
    rawState: CognitiveAssessment['state'] | null;
    state: CognitiveStateName;
    confidence: number;
    explanation: string;
    recommendation: string;
  };
  heartRate: {
    connected: boolean;
    bpm: number | null;
    hrv: number | null;
    trend: HeartRateTrend;
    stressEstimate: number;
    lastUpdated: number | null;
    source: string;
    history: { t: number; bpm: number; hrv: number }[];
  };
  webcam: {
    enabled: boolean;
    faceDetected: boolean;
    attentionScore: number | null;
    gazeDirection: string;
    blinkRate: number | null;
    state: 'focused' | 'distracted' | 'fatigued' | 'searching' | 'overstimulated' | 'unknown';
    lastUpdated: number | null;
    source: 'webcam' | 'simulated' | null;
    history: { t: number; score: number }[];
  };
  screen: {
    enabled: boolean;
    activeApp: string;
    activeContext: string;
    inferredTask: string;
    project: string;
    blocker: string | null;
    contextSwitchesPerMinute: number;
    workflowState: string;
    notificationCount: number;
    lastUpdated: number | null;
    source: 'capture' | 'simulated' | null;
    switchHistory: { t: number; switches: number }[];
    /** Rich structured task context derived from the VLM/heuristic analyzer. */
    analysis: ScreenAnalysis | null;
  };
  agent: {
    status: AgentStatus;
    latestThought: string;
    latestDecision: string;
    latestRecommendation: string;
    trace: AgentTraceEntry[];
    reports: AgentReport[];
    insights: ProductivityInsight[];
    actions: ToolResult[];
    socratic: SocraticPrompt | null;
  };
  memory: MemoryRecord[];
  telemetry: Telemetry | null;
  timeline: TimelineEvent[];

  // ----- demo mode toggle -----
  demoMode: boolean;

  // ----- actions -----
  setWebcamEnabled: (b: boolean) => void;
  setScreenEnabled: (b: boolean) => void;
  setDemoMode: (b: boolean) => void;
  pushTimeline: (e: Omit<TimelineEvent, 'id'>) => void;

  pushAttentionToServer: (m: AttentionMetrics) => void;
  pushScreenToServer: (s: ScreenSummary) => void;
  pushScreenFrame: (jpegBase64: string, hints: ScreenSummary | null) => void;
  signalScreenStart: () => void;
  signalScreenStop: () => void;
  applyLocalAttention: (m: AttentionMetrics) => void;
  applyLocalScreen: (s: ScreenSummary) => void;

  startDemo: () => void;
  resetDemo: () => void;
  setSpeed: (s: DemoSpeed) => void;
  setManualState: (s: CognitiveAssessment['state'] | null) => void;
  clearMemory: () => Promise<void>;
  runAgent: () => Promise<void>;
  startFocusSprint: () => void;

  // Internal init.
  _init: () => () => void;
}

function id(): string {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function mapAssessmentToState(
  a: CognitiveAssessment | null,
  attention: { state: string; score: number | null },
): CognitiveStateName {
  if (!a) return 'unknown';
  // Attention overrides for low-load fatigue / distraction signals.
  if (attention.state === 'Fatigued') return 'fatigued';
  if (attention.state === 'Distracted') return 'distracted';
  if (attention.state === 'Overstimulated') return 'distracted';
  if (a.cognitiveLoadScore < 30) return 'in_flow';
  if (a.cognitiveLoadScore < 50) return 'focused';
  if (a.cognitiveLoadScore < 70) return 'distracted';
  if (a.cognitiveLoadScore < 85) return 'fatigued';
  return 'overloaded';
}

function recommendation(state: CognitiveStateName, notifications: number): string {
  switch (state) {
    case 'in_flow':
      return 'Hold this focus block. Cortex is silent.';
    case 'focused':
      return 'On track — nothing needed.';
    case 'distracted':
      return notifications > 15
        ? 'Mute notifications for 25 minutes.'
        : 'Re-anchor with one Socratic question.';
    case 'fatigued':
      return 'Take a 5-minute reset before the next push.';
    case 'overloaded':
      return 'Start a 25-minute Focus Sprint to recover.';
    default:
      return 'Bring sensors online to get a recommendation.';
  }
}

export const useCortexStore = create<CortexStore>((set, get) => ({
  system: {
    socketConnected: false,
    dgxConnected: false,
    openclawRunning: false,
    nemotronModel: '—',
    fallbackActive: false,
    fallbackReason: 'Booting…',
    latencyMs: 0,
    device: 'NVIDIA DGX Spark',
  },
  cognitive: {
    loadScore: 0,
    rawState: null,
    state: 'unknown',
    confidence: 0.5,
    explanation: 'Bringing sensors online…',
    recommendation: 'Connect heart rate, webcam, and screen to begin.',
  },
  heartRate: {
    connected: false,
    bpm: null,
    hrv: null,
    trend: 'unknown',
    stressEstimate: 0,
    lastUpdated: null,
    source: 'Apple Watch Sim',
    history: [],
  },
  webcam: {
    enabled: false,
    faceDetected: false,
    attentionScore: null,
    gazeDirection: 'unknown',
    blinkRate: null,
    state: 'unknown',
    lastUpdated: null,
    source: null,
    history: [],
  },
  screen: {
    enabled: false,
    activeApp: '—',
    activeContext: '—',
    inferredTask: 'No task detected yet',
    project: '—',
    blocker: null,
    contextSwitchesPerMinute: 0,
    workflowState: 'idle',
    notificationCount: 0,
    lastUpdated: null,
    source: null,
    switchHistory: [],
    analysis: null,
  },
  agent: {
    status: 'idle',
    latestThought: 'Cortex is waiting for sensors.',
    latestDecision: '',
    latestRecommendation: '',
    trace: [],
    reports: [],
    insights: [],
    actions: [],
    socratic: null,
  },
  memory: [],
  telemetry: null,
  timeline: [],
  demoMode: false,

  setWebcamEnabled: (b) => set((s) => ({ webcam: { ...s.webcam, enabled: b } })),
  setScreenEnabled: (b) => set((s) => ({ screen: { ...s.screen, enabled: b } })),
  setDemoMode: (b) => set({ demoMode: b }),

  pushTimeline: (e) =>
    set((s) => {
      const next: TimelineEvent[] = [{ id: id(), ...e }, ...s.timeline].slice(0, MAX_TIMELINE);
      return { timeline: next };
    }),

  pushAttentionToServer: (m) => {
    socketRef.current?.emit('attention:push', m);
    get().applyLocalAttention(m);
  },
  pushScreenToServer: (s) => {
    socketRef.current?.emit('screen:push', s);
    get().applyLocalScreen(s);
  },
  pushScreenFrame: (jpegBase64, hints) => {
    socketRef.current?.emit('screen:frame', {
      imageBase64: jpegBase64,
      summaryHints: hints ?? undefined,
    });
  },
  signalScreenStart: () => {
    socketRef.current?.emit('screen:start');
  },
  signalScreenStop: () => {
    socketRef.current?.emit('screen:stop');
    set((state) => ({ screen: { ...state.screen, analysis: null } }));
  },
  applyLocalAttention: (m) =>
    set((s) => {
      const mappedState = mapAttentionState(m.interpretedState);
      const history = [...s.webcam.history, { t: m.timestamp, score: m.attentionScore }].slice(-MAX_ATTENTION_HISTORY);
      // Surface attention drops in the timeline.
      const events = [...s.timeline];
      if (
        s.webcam.attentionScore != null &&
        s.webcam.attentionScore > 70 &&
        m.attentionScore < 50
      ) {
        events.unshift({
          id: id(),
          timestamp: m.timestamp,
          kind: 'attention_drop',
          title: 'Attention dropped',
          detail: `Attention fell to ${m.attentionScore}.`,
          severity: 'warn',
        });
      }
      return {
        webcam: {
          ...s.webcam,
          enabled: true,
          faceDetected: m.faceDetected,
          attentionScore: m.attentionScore,
          gazeDirection: m.gazeDirection,
          blinkRate: m.blinkRate,
          state: mappedState,
          lastUpdated: m.timestamp,
          source: m.source,
          history,
        },
        timeline: events.slice(0, MAX_TIMELINE),
      };
    }),
  applyLocalScreen: (sc) =>
    set((s) => {
      const blocker =
        sc.workflowState === 'debugging' && sc.ocrTokens.some((t) => t.includes('error') || t.includes('typeerror'))
          ? `Repeated error in ${sc.activeApp}`
          : null;
      return {
        screen: {
          ...s.screen,
          enabled: true,
          activeApp: sc.activeApp,
          activeContext: sc.activeTitle,
          inferredTask: sc.inferredTask || 'Working on a task',
          project: sc.inferredProject || s.screen.project,
          blocker,
          contextSwitchesPerMinute: s.telemetry?.contextSwitches ?? s.screen.contextSwitchesPerMinute,
          workflowState: sc.workflowState,
          lastUpdated: sc.timestamp,
          source: sc.source,
        },
      };
    }),

  startDemo: () => {
    socketRef.current?.emit('demo:start');
    set({ demoMode: true });
    get().pushTimeline({
      timestamp: Date.now(),
      kind: 'note',
      title: 'Demo mode started',
      detail: 'Cortex is generating a scripted cognitive arc.',
      severity: 'info',
    });
  },
  resetDemo: () => {
    socketRef.current?.emit('demo:reset');
    set((s) => ({
      timeline: [],
      demoMode: false,
      agent: {
        ...s.agent,
        trace: [],
        reports: [],
        insights: [],
        actions: [],
        socratic: null,
        status: 'idle',
        latestThought: 'Cortex reset.',
        latestDecision: '',
        latestRecommendation: '',
      },
    }));
  },
  setSpeed: (sp) => socketRef.current?.emit('demo:setSpeed', { speed: sp }),
  setManualState: (st) => socketRef.current?.emit('demo:setManualState', { state: st ?? null }),
  clearMemory: async () => {
    await fetch(`${SERVER_URL}/memory/clear`, { method: 'POST' });
  },
  runAgent: async () => {
    set((s) => ({ agent: { ...s.agent, status: 'thinking' } }));
    try {
      await fetch(`${SERVER_URL}/agent/run`, { method: 'POST' });
    } finally {
      set((s) => ({ agent: { ...s.agent, status: 'idle' } }));
    }
  },
  startFocusSprint: () => {
    get().pushTimeline({
      timestamp: Date.now(),
      kind: 'focus_sprint',
      title: 'Focus Sprint started',
      detail: '25-minute protected block. Slack muted, calendar held.',
      severity: 'info',
    });
    // Fire intervention via existing tool path by forcing manual state.
    socketRef.current?.emit('demo:setManualState', { state: 'Intervention' });
  },

  _init: () => {
    if (socketRef.current) return () => {};
    const s = io(SERVER_URL, { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = s;
    const heartRate = getHeartRateSource();
    heartRate.start();
    const unsubscribeHeart = heartRate.subscribe((sample) => {
      set((state) => {
        const history = [...state.heartRate.history, { t: sample.timestamp, bpm: sample.bpm, hrv: sample.hrv ?? 0 }].slice(-MAX_HR_HISTORY);
        const events = [...state.timeline];
        if (state.heartRate.bpm != null && sample.bpm - state.heartRate.bpm > 14) {
          events.unshift({
            id: id(),
            timestamp: sample.timestamp,
            kind: 'hr_spike',
            title: 'Heart rate spike',
            detail: `${state.heartRate.bpm} → ${sample.bpm} bpm`,
            severity: 'warn',
          });
        }
        return {
          heartRate: {
            ...state.heartRate,
            connected: true,
            bpm: sample.bpm,
            hrv: sample.hrv,
            trend: sample.trend,
            stressEstimate: sample.stressEstimate,
            lastUpdated: sample.timestamp,
            source: heartRate.name,
            history,
          },
          timeline: events.slice(0, MAX_TIMELINE),
        };
      });
    });

    s.on('connect', () => set((st) => ({ system: { ...st.system, socketConnected: true } })));
    s.on('disconnect', () => set((st) => ({ system: { ...st.system, socketConnected: false } })));

    // Real Apple Watch / HealthKit sample arrived via the bridge endpoint.
    // Mark the source as real so the UI flips its label, then surface a
    // timeline note the FIRST time it happens so judges see "connected".
    s.on('biometrics:hr', (sample: { bpm: number; hrv: number | null; source: string; timestamp: number }) => {
      const prevName = heartRate.name;
      heartRate.markRealSample(sample.source);
      set((state) => {
        const events = [...state.timeline];
        if (prevName === 'Apple Watch Sim' && heartRate.name !== prevName) {
          events.unshift({
            id: id(),
            timestamp: sample.timestamp,
            kind: 'note',
            title: 'Apple Watch connected',
            detail: `Live HealthKit stream from ${sample.source}`,
            severity: 'info',
          });
        }
        return {
          heartRate: { ...state.heartRate, source: heartRate.name },
          timeline: events.slice(0, MAX_TIMELINE),
        };
      });
    });

    s.on('telemetry:update', (t: Telemetry) => {
      heartRate.feedFromServer(t);
      set((state) => {
        const switchHistory = [...state.screen.switchHistory, { t: t.timestamp, switches: t.contextSwitches }].slice(-MAX_SWITCH_HISTORY);
        return {
          telemetry: t,
          screen: {
            ...state.screen,
            contextSwitchesPerMinute: t.contextSwitches,
            notificationCount: t.unreadNotifications,
            activeApp: state.screen.source ? state.screen.activeApp : t.activeApp,
            activeContext: state.screen.source ? state.screen.activeContext : t.screenState,
            inferredTask: state.screen.source ? state.screen.inferredTask : t.currentTask,
            switchHistory,
          },
        };
      });
    });
    s.on('cognitive:update', (a: CognitiveAssessment) => {
      set((state) => {
        const cognitiveState = mapAssessmentToState(a, {
          state: state.webcam.state,
          score: state.webcam.attentionScore,
        });
        return {
          cognitive: {
            ...state.cognitive,
            loadScore: a.cognitiveLoadScore,
            rawState: a.state,
            state: cognitiveState,
            confidence: 0.6 + (state.heartRate.connected ? 0.15 : 0) + (state.webcam.enabled ? 0.15 : 0),
            explanation: a.explanation,
            recommendation: recommendation(cognitiveState, state.screen.notificationCount),
          },
        };
      });
    });
    s.on('attention:update', (m: AttentionMetrics) => {
      // Remote (from another tab) — apply but do not push.
      set((state) => {
        const mappedState = mapAttentionState(m.interpretedState);
        const history = [...state.webcam.history, { t: m.timestamp, score: m.attentionScore }].slice(-MAX_ATTENTION_HISTORY);
        return {
          webcam: {
            ...state.webcam,
            faceDetected: m.faceDetected,
            attentionScore: m.attentionScore,
            gazeDirection: m.gazeDirection,
            blinkRate: m.blinkRate,
            state: mappedState,
            lastUpdated: m.timestamp,
            source: m.source,
            history,
          },
        };
      });
    });
    s.on('task:update', (a: ScreenAnalysis | null) => {
      set((state) => ({
        screen: { ...state.screen, analysis: a },
      }));
    });
    s.on('screen:update', (sc: ScreenSummary) => {
      set((state) => ({
        screen: {
          ...state.screen,
          activeApp: sc.activeApp,
          activeContext: sc.activeTitle,
          inferredTask: sc.inferredTask || state.screen.inferredTask,
          project: sc.inferredProject || state.screen.project,
          workflowState: sc.workflowState,
          lastUpdated: sc.timestamp,
          source: sc.source,
        },
      }));
    });
    s.on('agent:trace', (entry: AgentTraceEntry) => {
      set((state) => {
        const trace = [...state.agent.trace, entry].slice(-MAX_TRACE);
        let { latestThought, latestDecision, latestRecommendation, status } = state.agent;
        if (entry.kind === 'thought') latestThought = entry.content;
        if (entry.kind === 'decision') {
          latestDecision = entry.content;
          status = 'acting';
        }
        if (entry.kind === 'final_action') {
          latestRecommendation = entry.content;
          status = 'idle';
        }
        if (entry.kind === 'tool_call') status = 'acting';
        return { agent: { ...state.agent, trace, latestThought, latestDecision, latestRecommendation, status } };
      });
    });
    s.on('agent:report', (r: AgentReport) =>
      set((state) => ({
        agent: { ...state.agent, reports: [r, ...state.agent.reports].slice(0, MAX_REPORTS) },
      })),
    );
    s.on('insight:new', (i: ProductivityInsight) =>
      set((state) => {
        const next = [i, ...state.agent.insights].slice(0, MAX_INSIGHTS);
        const events = [...state.timeline];
        if (i.severity !== 'info') {
          events.unshift({
            id: id(),
            timestamp: i.timestamp,
            kind: i.kind.includes('debug')
              ? 'debug_loop'
              : i.kind.includes('tab')
                ? 'tab_burst'
                : i.kind.includes('attention')
                  ? 'attention_drop'
                  : 'insight',
            title: i.title,
            detail: i.body,
            severity: i.severity,
          });
        }
        return { agent: { ...state.agent, insights: next }, timeline: events.slice(0, MAX_TIMELINE) };
      }),
    );
    s.on('action:log', (a: ToolResult) =>
      set((state) => ({
        agent: { ...state.agent, actions: [a, ...state.agent.actions].slice(0, MAX_ACTIONS) },
        timeline:
          a.toolName === 'do_nothing' || a.toolName === 'check_attention_state' || a.toolName === 'recall_memory'
            ? state.timeline
            : [
                {
                  id: id(),
                  timestamp: a.timestamp,
                  kind: 'intervention' as const,
                  title: `Cortex acted: ${a.toolName}`,
                  detail: a.reason,
                  severity: 'info' as const,
                },
                ...state.timeline,
              ].slice(0, MAX_TIMELINE),
      })),
    );
    s.on('socratic:update', (p: SocraticPrompt) =>
      set((state) => ({ agent: { ...state.agent, socratic: p } })),
    );
    s.on('memory:update', (mem: MemoryRecord[]) => set({ memory: mem }));
    s.on('fallback:update', (f: FallbackStatus) =>
      set((state) => ({
        system: {
          ...state.system,
          fallbackActive: f.active,
          fallbackReason: f.reason,
        },
      })),
    );
    s.on('compute:update', (c: ComputeTelemetry) =>
      set((state) => ({
        system: {
          ...state.system,
          dgxConnected: c.fallbackRatio < 1 || c.nemotronCallsLast60s > 0,
          openclawRunning: !state.system.fallbackActive,
          nemotronModel: c.model,
          latencyMs: c.avgLatencyMs,
          device: c.device,
        },
      })),
    );
    s.on('runtime:update', (r: RuntimeHealth) =>
      set((state) => ({
        system: {
          ...state.system,
          dgxConnected: r.reachable,
          openclawRunning: r.ok,
          nemotronModel: r.servedModel ?? r.configuredModel,
          fallbackActive: r.fallbackActive,
          fallbackReason: r.fallbackReason,
        },
      })),
    );
    s.on('agent:trace:reset', () => {
      set((state) => ({
        agent: { ...state.agent, trace: [], actions: [], insights: [], reports: [], socratic: null },
        timeline: [],
      }));
    });

    return () => {
      s.disconnect();
      unsubscribeHeart();
      heartRate.stop();
      socketRef.current = null;
    };
  },
}));

function mapAttentionState(
  s: AttentionMetrics['interpretedState'],
): CortexStore['webcam']['state'] {
  if (s === 'Focused') return 'focused';
  if (s === 'Distracted') return 'distracted';
  if (s === 'Fatigued') return 'fatigued';
  if (s === 'Searching') return 'searching';
  if (s === 'Overstimulated') return 'overstimulated';
  return 'unknown';
}

const socketRef: { current: Socket | null } = { current: null };
