import type {
  AgentReport,
  AgentRole,
  AttentionMetrics,
  CognitiveAssessment,
  MemoryRecord,
  ProductivityInsight,
  ScreenSummary,
  Telemetry,
} from '../src/types';
import { callNemotronJson } from './nemotronAgent';

export interface SpecialistInput {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  attention: AttentionMetrics | null;
  screen: ScreenSummary | null;
  similarMemory: MemoryRecord | null;
  insights: ProductivityInsight[];
}

interface Specialist {
  role: AgentRole;
  run(input: SpecialistInput): Promise<AgentReport>;
}

function ms() {
  return Date.now();
}

// All specialists share a tight latency budget. If Nemotron can't answer in
// time, each one degrades to a deterministic local summary so the dashboard
// never stalls.

export const workflowAgent: Specialist = {
  role: 'workflow',
  async run(input) {
    const t0 = ms();
    const fallback = (): AgentReport => ({
      agent: 'workflow',
      timestamp: ms(),
      summary: input.screen
        ? `User is in ${input.screen.workflowState} mode on "${input.screen.activeApp}" working on "${input.screen.inferredTask}".`
        : `Working in ${input.telemetry.activeApp} on "${input.telemetry.currentTask}".`,
      signals: {
        workflowState: input.screen?.workflowState ?? 'unknown',
        app: input.screen?.activeApp ?? input.telemetry.activeApp,
        task: input.screen?.inferredTask ?? input.telemetry.currentTask,
        contextSwitches: input.telemetry.contextSwitches,
      },
      durationMs: ms() - t0,
    });
    try {
      const data = await callNemotronJson<{ summary: string; workflowState?: string }>(
        'You are the Workflow Agent inside Cortex. In ONE sentence (max 25 words) describe what the user is currently doing and which workflow state they are in (flow, searching, switching, debugging, communicating, idle). Return JSON: {"summary":"...","workflowState":"..."}.',
        {
          activeApp: input.screen?.activeApp ?? input.telemetry.activeApp,
          activeTitle: input.screen?.activeTitle ?? '',
          inferredTask: input.screen?.inferredTask ?? input.telemetry.currentTask,
          tokens: input.screen?.ocrTokens?.slice(0, 12) ?? [],
          contextSwitches: input.telemetry.contextSwitches,
        },
        { maxTokens: 700, timeoutMs: 18_000 },
      );
      return {
        agent: 'workflow',
        timestamp: ms(),
        summary: data.summary ?? fallback().summary,
        signals: {
          workflowState: data.workflowState ?? input.screen?.workflowState ?? 'unknown',
          app: input.screen?.activeApp ?? input.telemetry.activeApp,
        },
        durationMs: ms() - t0,
      };
    } catch {
      return fallback();
    }
  },
};

export const contextMemoryAgent: Specialist = {
  role: 'context_memory',
  async run(input) {
    const t0 = ms();
    const fallback = (): AgentReport => ({
      agent: 'context_memory',
      timestamp: ms(),
      summary: input.similarMemory
        ? `Closest prior pattern: ${input.similarMemory.patternSummary}. Last time: ${input.similarMemory.interventions.join(', ') || 'no interventions'}.`
        : 'No prior matching episodes on file. Treating this as novel.',
      signals: { matched: !!input.similarMemory },
      durationMs: ms() - t0,
    });
    return fallback();
  },
};

export const productivityAgent: Specialist = {
  role: 'productivity',
  async run(input) {
    const t0 = ms();
    const criticalInsight = input.insights.find((i) => i.severity === 'critical');
    const warnInsight = input.insights.find((i) => i.severity === 'warn');
    const headline = criticalInsight ?? warnInsight ?? input.insights[0];
    const summary = headline
      ? `${headline.title} — ${headline.body}`
      : 'Productivity profile: stable. No anti-patterns detected this tick.';
    return {
      agent: 'productivity',
      timestamp: ms(),
      summary,
      signals: {
        insightCount: input.insights.length,
        topKind: headline?.kind ?? 'none',
        severity: headline?.severity ?? 'info',
      },
      durationMs: ms() - t0,
    };
  },
};

export const interruptionAgent: Specialist = {
  role: 'interruption',
  async run(input) {
    const t0 = ms();
    const notif = input.telemetry.unreadNotifications;
    const switches = input.telemetry.contextSwitches;
    const summary =
      notif >= 20 || switches >= 18
        ? `Interrupt pressure is HIGH — ${notif} unread, ${switches} switches/min. External attention budget is depleted.`
        : notif >= 10
          ? `Interrupt pressure moderate — ${notif} unread; manageable for now.`
          : `Interrupt pressure low — ${notif} unread, ${switches} switches/min.`;
    return {
      agent: 'interruption',
      timestamp: ms(),
      summary,
      signals: { unread: notif, switches, riskHigh: notif >= 20 || switches >= 18 },
      durationMs: ms() - t0,
    };
  },
};

export const prioritizationAgent: Specialist = {
  role: 'prioritization',
  async run(input) {
    const t0 = ms();
    const deadline = input.telemetry.deadlineMinutes;
    const task = input.screen?.inferredTask ?? input.telemetry.currentTask;
    const queue: string[] = [];
    if (deadline < 15) queue.push(`Ship "${task}" — T-${deadline}m`);
    if (input.telemetry.unreadNotifications > 18) queue.push('Triage Slack after deadline');
    if (input.assessment.state !== 'Green') queue.push('Run focus-mode block (25m)');
    if (queue.length === 0) queue.push(`Continue "${task}"`);
    return {
      agent: 'prioritization',
      timestamp: ms(),
      summary: `Next 25 minutes: ${queue.join(' → ')}.`,
      signals: { queueDepth: queue.length, deadline },
      durationMs: ms() - t0,
    };
  },
};

export const cognitiveLoadAgent: Specialist = {
  role: 'cognitive_load',
  async run(input) {
    const t0 = ms();
    return {
      agent: 'cognitive_load',
      timestamp: ms(),
      summary: input.assessment.explanation,
      signals: {
        load: input.assessment.cognitiveLoadScore,
        state: input.assessment.state,
      },
      durationMs: ms() - t0,
    };
  },
};

export const screenUnderstandingAgent: Specialist = {
  role: 'screen_understanding',
  async run(input) {
    const t0 = ms();
    if (!input.screen) {
      const sig: Record<string, string | number | boolean> = { hasScreen: false };
      return {
        agent: 'screen_understanding',
        timestamp: ms(),
        summary: 'No screen capture active. Inferring from simulated activity stream only.',
        signals: sig,
        durationMs: ms() - t0,
      };
    }
    const sig: Record<string, string | number | boolean> = {
      app: input.screen.activeApp,
      tabs: input.screen.tabCount,
      intent: input.screen.inferredIntent,
      project: input.screen.inferredProject,
      confidence: input.screen.confidence,
    };
    return {
      agent: 'screen_understanding',
      timestamp: ms(),
      summary: `${input.screen.activeApp} · "${input.screen.activeTitle}" · ${input.screen.tabCount} tabs · inferred intent: ${input.screen.inferredIntent}.`,
      signals: sig,
      durationMs: ms() - t0,
    };
  },
};

export const specialists: Specialist[] = [
  workflowAgent,
  contextMemoryAgent,
  productivityAgent,
  interruptionAgent,
  prioritizationAgent,
  cognitiveLoadAgent,
  screenUnderstandingAgent,
];

export async function runSpecialistsInParallel(
  input: SpecialistInput,
): Promise<AgentReport[]> {
  const settled = await Promise.allSettled(specialists.map((s) => s.run(input)));
  return settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      agent: specialists[i].role,
      timestamp: ms(),
      summary: `Agent crashed: ${(r.reason as Error)?.message ?? 'unknown'}.`,
      signals: { failed: true },
      durationMs: 0,
    };
  });
}
