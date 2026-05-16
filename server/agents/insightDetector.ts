import type {
  AttentionMetrics,
  CognitiveAssessment,
  ProductivityInsight,
  ScreenSummary,
  Telemetry,
} from '../src/types';

interface Frame {
  t: number;
  activeApp: string;
  inferredTask: string;
  workflowState: ScreenSummary['workflowState'] | 'unknown';
  contextSwitches: number;
  unreadNotifications: number;
  state: CognitiveAssessment['state'];
}

const HORIZON_MS = 4 * 60 * 1000; // 4 min rolling window

export class InsightDetector {
  private frames: Frame[] = [];
  private emittedRecently = new Map<string, number>();
  private debugTokenStreak = 0;
  private lastTaskFingerprint = '';
  private taskStuckSince = 0;

  ingest(input: {
    telemetry: Telemetry;
    assessment: CognitiveAssessment;
    attention: AttentionMetrics | null;
    screen: ScreenSummary | null;
  }): ProductivityInsight[] {
    const t = input.telemetry.timestamp;
    const activeApp = input.screen?.activeApp ?? input.telemetry.activeApp;
    const inferredTask =
      input.screen?.inferredTask ?? input.telemetry.currentTask ?? 'unknown';
    const workflowState = input.screen?.workflowState ?? 'unknown';
    const frame: Frame = {
      t,
      activeApp,
      inferredTask,
      workflowState,
      contextSwitches: input.telemetry.contextSwitches,
      unreadNotifications: input.telemetry.unreadNotifications,
      state: input.assessment.state,
    };
    this.frames.push(frame);
    const cutoff = t - HORIZON_MS;
    while (this.frames.length > 0 && this.frames[0].t < cutoff) this.frames.shift();

    // Track repeated debugging via OCR tokens (compiler / error words).
    const debugTokens = ['error', 'traceback', 'undefined', 'cannot', 'failed', 'expected', 'typeerror'];
    const tokens = input.screen?.ocrTokens ?? [];
    if (tokens.some((tk) => debugTokens.includes(tk.toLowerCase()))) {
      this.debugTokenStreak += 1;
    } else {
      this.debugTokenStreak = Math.max(0, this.debugTokenStreak - 1);
    }

    // Task stagnation tracker.
    if (inferredTask === this.lastTaskFingerprint) {
      if (this.taskStuckSince === 0) this.taskStuckSince = t;
    } else {
      this.lastTaskFingerprint = inferredTask;
      this.taskStuckSince = t;
    }

    const out: ProductivityInsight[] = [];
    const emit = (i: ProductivityInsight, cooldownMs: number) => {
      const last = this.emittedRecently.get(i.kind) ?? 0;
      if (t - last < cooldownMs) return;
      this.emittedRecently.set(i.kind, t);
      out.push(i);
    };

    // ---- Tab thrash: many app/title switches per minute ----
    const sinceMinute = this.frames.filter((f) => f.t > t - 60_000);
    if (sinceMinute.length >= 6) {
      const switches = countDistinct(sinceMinute.map((f) => f.activeApp + '::' + f.inferredTask));
      if (switches >= 14) {
        emit(
          {
            id: id(),
            timestamp: t,
            kind: 'tab_thrash',
            severity: 'warn',
            title: 'Tab / context thrash detected',
            body: `User switched ${switches} times in the last minute. Sustained switching like this destroys deep-work throughput.`,
            evidence: [
              `${switches} distinct (app, task) tuples in 60s`,
              `current cognitive load ${input.assessment.cognitiveLoadScore}`,
            ],
            recommendedTools: ['mute_slack', 'enable_focus_mode', 'close_tabs'],
          },
          90_000,
        );
      }
    }

    // ---- Debug loop: repeated error tokens for sustained period ----
    if (this.debugTokenStreak >= 18 && input.assessment.cognitiveLoadScore > 50) {
      emit(
        {
          id: id(),
          timestamp: t,
          kind: 'debug_loop',
          severity: 'warn',
          title: 'Repeated debugging pattern',
          body: 'Same error tokens have persisted on-screen across many ticks. User may be in a repeated debug loop.',
          evidence: [
            `error-related OCR tokens detected ${this.debugTokenStreak} ticks running`,
            `task fingerprint stuck for ${Math.round((t - this.taskStuckSince) / 1000)}s`,
          ],
          recommendedTools: ['ask_socratic', 'recall_memory', 'open_relevant_doc'],
        },
        120_000,
      );
    }

    // ---- Notification spike ----
    if (input.telemetry.unreadNotifications >= 22) {
      const earlier = this.frames.find((f) => f.t < t - 60_000);
      const baseline = earlier?.unreadNotifications ?? 0;
      if (baseline > 0 && input.telemetry.unreadNotifications - baseline >= 12) {
        emit(
          {
            id: id(),
            timestamp: t,
            kind: 'notification_spike',
            severity: 'warn',
            title: 'Notification surge',
            body: `Unread notifications climbed from ${baseline} to ${input.telemetry.unreadNotifications} in the last minute.`,
            evidence: [`baseline ${baseline} → now ${input.telemetry.unreadNotifications}`],
            recommendedTools: ['mute_slack'],
          },
          120_000,
        );
      }
    }

    // ---- Task paralysis: stuck on the same task for a long time at low completion ----
    if (this.taskStuckSince > 0 && t - this.taskStuckSince > 180_000 && input.assessment.state !== 'Green') {
      emit(
        {
          id: id(),
          timestamp: t,
          kind: 'task_paralysis',
          severity: 'warn',
          title: 'Possible task paralysis',
          body: `User has been on "${inferredTask}" for ${Math.round(
            (t - this.taskStuckSince) / 1000,
          )}s under non-Green load.`,
          evidence: [
            `task duration ${Math.round((t - this.taskStuckSince) / 1000)}s`,
            `cognitive state ${input.assessment.state}`,
          ],
          recommendedTools: ['ask_socratic', 'recall_memory'],
        },
        180_000,
      );
    }

    // ---- Deadline pressure ----
    if (input.telemetry.deadlineMinutes < 12 && input.assessment.state !== 'Green') {
      emit(
        {
          id: id(),
          timestamp: t,
          kind: 'deadline_pressure',
          severity: 'critical',
          title: 'Deadline pressure rising',
          body: `${input.telemetry.deadlineMinutes}m remaining and load is ${input.assessment.state}.`,
          evidence: [
            `deadline T-${input.telemetry.deadlineMinutes}m`,
            `load ${input.assessment.cognitiveLoadScore}`,
          ],
          recommendedTools: ['block_calendar_time', 'enable_focus_mode', 'mute_slack'],
        },
        90_000,
      );
    }

    // ---- Attention collapse ----
    if (
      input.attention &&
      (input.attention.offscreenRatio60s > 0.45 ||
        input.attention.interpretedState === 'Overstimulated' ||
        input.attention.focusStability < 30)
    ) {
      emit(
        {
          id: id(),
          timestamp: t,
          kind: 'attention_collapse',
          severity: 'warn',
          title: 'Attention is collapsing',
          body: `Webcam reports ${input.attention.interpretedState}. Gaze offscreen ${Math.round(
            input.attention.offscreenRatio60s * 100,
          )}% of the last minute, stability ${input.attention.focusStability}/100.`,
          evidence: [
            `interpreted=${input.attention.interpretedState}`,
            `stability=${input.attention.focusStability}`,
            `offscreen=${Math.round(input.attention.offscreenRatio60s * 100)}%`,
          ],
          recommendedTools: ['ask_socratic', 'enable_focus_mode'],
        },
        60_000,
      );
    }

    // ---- Context switch storm ----
    if (input.telemetry.contextSwitches >= 22) {
      emit(
        {
          id: id(),
          timestamp: t,
          kind: 'context_switch_storm',
          severity: 'critical',
          title: 'Context-switch storm',
          body: `${input.telemetry.contextSwitches} app switches per minute. Deep work is impossible at this rate.`,
          evidence: [`switches/min=${input.telemetry.contextSwitches}`],
          recommendedTools: ['mute_slack', 'enable_focus_mode', 'close_tabs', 'dim_secondary_monitor'],
        },
        90_000,
      );
    }

    // ---- Flow protected (positive insight) ----
    if (
      input.assessment.state === 'Green' &&
      input.telemetry.contextSwitches <= 4 &&
      (input.attention?.interpretedState === 'Focused' || !input.attention)
    ) {
      emit(
        {
          id: id(),
          timestamp: t,
          kind: 'flow_protected',
          severity: 'info',
          title: 'Flow state holding',
          body: 'Low context switches, steady biometrics, focused attention. Cortex will hold position.',
          evidence: [`switches=${input.telemetry.contextSwitches}/min`, `state=Green`],
        },
        300_000,
      );
    }

    return out;
  }
}

function countDistinct<T>(arr: T[]): number {
  return new Set(arr).size;
}

function id(): string {
  return `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
