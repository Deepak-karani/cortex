import { EventEmitter } from 'events';
import type { CognitiveState, DemoSpeed, Telemetry } from '../src/types';

type Phase = 'Green' | 'Yellow' | 'Red' | 'Intervention' | 'Recovery';

const APPS = ['VS Code', 'Slack', 'Chrome', 'Figma', 'Linear', 'Notion'];
const TASKS = [
  'Drafting hackathon submission',
  'Implementing agent loop',
  'Pair debugging socket layer',
  'Polishing demo UI',
];

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function jitter(base: number, spread: number): number {
  return base + (Math.random() - 0.5) * spread;
}

interface PhaseProfile {
  hr: [number, number];
  hrv: [number, number];
  contextSwitches: [number, number];
  unreadNotifications: [number, number];
  typingSpeed: [number, number];
  errorRate: [number, number];
  deadlineMinutes: [number, number];
  activeApp: () => string;
  screenState: string;
}

const profiles: Record<Phase, PhaseProfile> = {
  Green: {
    hr: [62, 72],
    hrv: [60, 85],
    contextSwitches: [1, 4],
    unreadNotifications: [0, 3],
    typingSpeed: [55, 80],
    errorRate: [0.01, 0.04],
    deadlineMinutes: [55, 60],
    activeApp: () => 'VS Code',
    screenState: 'Single window, focused',
  },
  Yellow: {
    hr: [78, 92],
    hrv: [38, 55],
    contextSwitches: [8, 14],
    unreadNotifications: [8, 16],
    typingSpeed: [40, 60],
    errorRate: [0.05, 0.09],
    deadlineMinutes: [25, 40],
    activeApp: () => APPS[Math.floor(Math.random() * 3)],
    screenState: 'Split, multiple tabs',
  },
  Red: {
    hr: [98, 118],
    hrv: [18, 30],
    contextSwitches: [18, 28],
    unreadNotifications: [22, 34],
    typingSpeed: [25, 45],
    errorRate: [0.1, 0.18],
    deadlineMinutes: [3, 15],
    activeApp: () => APPS[Math.floor(Math.random() * APPS.length)],
    screenState: 'Chaotic, 11+ tabs, Slack overlay',
  },
  Intervention: {
    hr: [85, 95],
    hrv: [32, 45],
    contextSwitches: [5, 9],
    unreadNotifications: [4, 8],
    typingSpeed: [45, 60],
    errorRate: [0.05, 0.08],
    deadlineMinutes: [8, 18],
    activeApp: () => 'VS Code',
    screenState: 'Focus mode active, Slack muted',
  },
  Recovery: {
    hr: [72, 82],
    hrv: [50, 65],
    contextSwitches: [2, 5],
    unreadNotifications: [2, 5],
    typingSpeed: [55, 70],
    errorRate: [0.03, 0.06],
    deadlineMinutes: [12, 25],
    activeApp: () => 'VS Code',
    screenState: 'Single window, focused',
  },
};

interface ScriptStep {
  phase: Phase;
  durationSeconds: number;
}

const DEFAULT_SCRIPT: ScriptStep[] = [
  { phase: 'Green', durationSeconds: 10 },
  { phase: 'Yellow', durationSeconds: 12 },
  { phase: 'Red', durationSeconds: 12 },
  { phase: 'Intervention', durationSeconds: 10 },
  { phase: 'Recovery', durationSeconds: 10 },
  { phase: 'Green', durationSeconds: 999 },
];

export class SimulationEngine extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private speed: DemoSpeed = 1;
  private running = false;
  private currentPhase: Phase = 'Green';
  private manualOverride: Phase | null = null;
  private elapsedInPhase = 0;
  private scriptIndex = 0;
  private currentTask = TASKS[0];
  private taskRotation = 0;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scriptIndex = 0;
    this.elapsedInPhase = 0;
    this.currentPhase = DEFAULT_SCRIPT[0].phase;
    this.scheduleTick();
    this.emit('phase', this.currentPhase);
  }

  reset(): void {
    this.stopTimer();
    this.running = false;
    this.scriptIndex = 0;
    this.elapsedInPhase = 0;
    this.currentPhase = 'Green';
    this.manualOverride = null;
    this.taskRotation = 0;
    this.currentTask = TASKS[0];
    this.emit('phase', this.currentPhase);
  }

  setSpeed(speed: DemoSpeed): void {
    this.speed = speed;
    if (this.running) {
      this.stopTimer();
      this.scheduleTick();
    }
  }

  setManualState(state: CognitiveState | null): void {
    if (state === null) {
      this.manualOverride = null;
    } else {
      this.manualOverride = state as Phase;
      this.currentPhase = state as Phase;
      this.elapsedInPhase = 0;
      this.emit('phase', this.currentPhase);
    }
  }

  getPhase(): Phase {
    return this.manualOverride ?? this.currentPhase;
  }

  isRunning(): boolean {
    return this.running;
  }

  getSpeed(): DemoSpeed {
    return this.speed;
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleTick(): void {
    const intervalMs = Math.max(100, Math.round(1000 / this.speed));
    this.timer = setInterval(() => this.tick(), intervalMs);
  }

  private advanceScript(): void {
    if (this.manualOverride) return;
    this.elapsedInPhase += 1;
    const step = DEFAULT_SCRIPT[this.scriptIndex];
    if (this.elapsedInPhase >= step.durationSeconds) {
      this.scriptIndex = Math.min(this.scriptIndex + 1, DEFAULT_SCRIPT.length - 1);
      this.elapsedInPhase = 0;
      this.currentPhase = DEFAULT_SCRIPT[this.scriptIndex].phase;
      this.emit('phase', this.currentPhase);
    }
  }

  private tick(): void {
    if (!this.running) return;
    this.advanceScript();
    const phase = this.getPhase();
    const profile = profiles[phase];

    // Rotate the current task occasionally.
    this.taskRotation += 1;
    if (this.taskRotation % 8 === 0) {
      this.currentTask = TASKS[Math.floor(Math.random() * TASKS.length)];
    }

    const telemetry: Telemetry = {
      timestamp: Date.now(),
      heartRate: Math.round(jitter(rand(profile.hr[0], profile.hr[1]), 4)),
      hrv: Math.round(jitter(rand(profile.hrv[0], profile.hrv[1]), 3)),
      activeApp: profile.activeApp(),
      contextSwitches: Math.round(jitter(rand(profile.contextSwitches[0], profile.contextSwitches[1]), 2)),
      unreadNotifications: Math.round(rand(profile.unreadNotifications[0], profile.unreadNotifications[1])),
      typingSpeed: Math.round(jitter(rand(profile.typingSpeed[0], profile.typingSpeed[1]), 5)),
      errorRate: Number(jitter(rand(profile.errorRate[0], profile.errorRate[1]), 0.01).toFixed(3)),
      deadlineMinutes: Math.round(rand(profile.deadlineMinutes[0], profile.deadlineMinutes[1])),
      currentTask: this.currentTask,
      screenState: profile.screenState,
    };

    this.emit('telemetry', telemetry);
  }
}
