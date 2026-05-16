export type CognitiveState = 'Green' | 'Yellow' | 'Red' | 'Intervention' | 'Recovery';

export interface Telemetry {
  timestamp: number;
  heartRate: number;
  hrv: number;
  activeApp: string;
  contextSwitches: number;
  unreadNotifications: number;
  typingSpeed: number;
  errorRate: number;
  deadlineMinutes: number;
  currentTask: string;
  screenState: string;
}

export interface CognitiveAssessment {
  timestamp: number;
  cognitiveLoadScore: number;
  state: CognitiveState;
  explanation: string;
}

export interface FutureTimelinePoint {
  t: number;
  heartRate: number;
  hrv: number;
  contextSwitches: number;
  completionChance: number;
  overloadRisk: number;
}

export interface FutureTimelines {
  timestamp: number;
  noIntervention: {
    label: string;
    summary: string;
    points: FutureTimelinePoint[];
  };
  intervention: {
    label: string;
    summary: string;
    points: FutureTimelinePoint[];
  };
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  reason: string;
  expectedBenefit: string;
  timestamp: number;
  payload?: Record<string, unknown>;
}

export type AgentTraceKind =
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'decision'
  | 'final_action';

export interface AgentTraceEntry {
  id: string;
  timestamp: number;
  kind: AgentTraceKind;
  content: string;
  toolName?: string;
  payload?: Record<string, unknown>;
}

export interface MemoryRecord {
  id: string;
  timestamp: number;
  cognitiveState: CognitiveState;
  patternSummary: string;
  interventions: string[];
  outcome: string;
  hrvRecovered: boolean;
  recoveryTimeSeconds: number;
  socraticQuestion?: string;
}

export type DemoSpeed = 1 | 2 | 4;

export interface FallbackStatus {
  active: boolean;
  reason: string;
  lastChecked: number;
}

export interface SocraticPrompt {
  timestamp: number;
  question: string;
  rationale: string;
}

export type GazeDirection = 'center' | 'left' | 'right' | 'down' | 'offscreen';

export type HeadPose = 'centered' | 'turned_left' | 'turned_right' | 'down' | 'away';

export type AttentionInterpretedState =
  | 'Focused'
  | 'Distracted'
  | 'Fatigued'
  | 'Searching'
  | 'Overstimulated'
  | 'Unknown';

export interface AttentionMetrics {
  timestamp: number;
  attentionScore: number; // 0-100
  gazeDirection: GazeDirection;
  headPose: HeadPose;
  distractionDurationSeconds: number;
  offscreenRatio60s: number; // fraction of last 60s gaze was offscreen
  blinkRate: number; // blinks per minute
  focusStability: number; // 0-100, higher = more stable gaze
  gazeSwitchRate: number; // gaze direction changes per minute
  faceDetected: boolean;
  confidence: number; // 0-1, how trustworthy this reading is
  interpretedState: AttentionInterpretedState;
  source: 'webcam' | 'simulated';
}

// ============================================================
// Screen Understanding pipeline — never raw frames, summary only.
// ============================================================

export interface ScreenWindow {
  app: string;
  title: string;
  category: string;
  active: boolean;
}

export interface ScreenSummary {
  timestamp: number;
  activeApp: string;
  activeTitle: string;
  windows: ScreenWindow[];
  tabCount: number;
  textSampleHash?: string;
  ocrTokens: string[];
  inferredTask: string;
  inferredProject: string;
  inferredIntent: string;
  workflowState: 'flow' | 'searching' | 'switching' | 'debugging' | 'communicating' | 'idle';
  confidence: number;
  source: 'capture' | 'simulated';
}

export type InsightSeverity = 'info' | 'warn' | 'critical';
export type InsightKind =
  | 'tab_thrash'
  | 'debug_loop'
  | 'notification_spike'
  | 'task_paralysis'
  | 'deadline_pressure'
  | 'context_switch_storm'
  | 'flow_protected'
  | 'attention_collapse'
  | 'recovery';

export interface ProductivityInsight {
  id: string;
  timestamp: number;
  kind: InsightKind;
  severity: InsightSeverity;
  title: string;
  body: string;
  evidence: string[];
  recommendedTools?: string[];
}

export type AgentRole =
  | 'orchestrator'
  | 'workflow'
  | 'context_memory'
  | 'productivity'
  | 'interruption'
  | 'prioritization'
  | 'cognitive_load'
  | 'screen_understanding';

export interface AgentReport {
  agent: AgentRole;
  timestamp: number;
  summary: string;
  signals: Record<string, string | number | boolean>;
  durationMs: number;
}

export interface ComputeTelemetry {
  timestamp: number;
  agentRunsLast60s: number;
  toolCallsLast60s: number;
  nemotronCallsLast60s: number;
  avgLatencyMs: number;
  fallbackRatio: number;
  inflight: number;
  device: string;
  model: string;
}
