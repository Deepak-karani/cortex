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

export type AttentionInterpretedState =
  | 'Focused'
  | 'Distracted'
  | 'Fatigued'
  | 'Searching'
  | 'Overstimulated';

export interface AttentionMetrics {
  timestamp: number;
  attentionScore: number; // 0-100
  gazeDirection: GazeDirection;
  distractionDurationSeconds: number;
  offscreenRatio60s: number; // fraction of last 60s gaze was offscreen
  blinkRate: number; // blinks per minute
  focusStability: number; // 0-100, higher = more stable gaze
  gazeSwitchRate: number; // gaze direction changes per minute
  faceDetected: boolean;
  interpretedState: AttentionInterpretedState;
  source: 'webcam' | 'simulated';
}
