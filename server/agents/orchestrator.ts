import { EventEmitter } from 'events';
import type {
  AgentReport,
  AgentTraceEntry,
  AttentionMetrics,
  CognitiveAssessment,
  ComputeTelemetry,
  FallbackStatus,
  FutureTimelines,
  MemoryRecord,
  ProductivityInsight,
  ScreenSummary,
  SocraticPrompt,
  Telemetry,
  ToolResult,
} from '../src/types';
import {
  analyzeCognitiveState,
  chooseIntervention,
  generateSocraticQuestion,
  simulateFutureTimelines,
} from './nemotronAgent';
import { runTool, type ToolName } from '../tools/cortexTools';
import { recallSimilarMemory } from '../memory/memoryStore';
import { simulateFutures } from '../sim/futureSimulator';
import { getLatestAttention } from '../tools/checkAttentionState';
import { getLatestScreen } from '../sim/screenStore';
import { runSpecialistsInParallel } from './specialists';
import { InsightDetector } from './insightDetector';

let traceCounter = 0;
function id(prefix = 'tr'): string {
  traceCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${traceCounter.toString(36)}`;
}

function trace(
  kind: AgentTraceEntry['kind'],
  content: string,
  extra: Partial<AgentTraceEntry> = {},
): AgentTraceEntry {
  return { id: id('tr'), timestamp: Date.now(), kind, content, ...extra };
}

export interface OrchestratorRunInput {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
}

export interface OrchestratorRunOutput {
  trace: AgentTraceEntry[];
  toolResults: ToolResult[];
  socratic: SocraticPrompt | null;
  timelines: FutureTimelines | null;
  similarMemory: MemoryRecord | null;
  fallback: FallbackStatus;
  chosenTools: ToolName[];
  reports: AgentReport[];
  insights: ProductivityInsight[];
}

export class Orchestrator extends EventEmitter {
  private busy = false;
  private latencySamples: number[] = [];
  private nemotronCalls: number[] = [];
  private agentRuns: number[] = [];
  private toolCalls: number[] = [];
  private fallbackHits: number[] = [];
  private inflight = 0;
  private insightDetector = new InsightDetector();

  isBusy(): boolean {
    return this.busy;
  }

  getComputeTelemetry(): ComputeTelemetry {
    const cutoff = Date.now() - 60_000;
    const recentFallbacks = this.fallbackHits.filter((t) => t > cutoff).length;
    const recentAgent = this.agentRuns.filter((t) => t > cutoff).length;
    const recentNem = this.nemotronCalls.filter((t) => t > cutoff).length;
    const recentTools = this.toolCalls.filter((t) => t > cutoff).length;
    const avgLatency =
      this.latencySamples.length === 0
        ? 0
        : Math.round(
            this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length,
          );
    return {
      timestamp: Date.now(),
      agentRunsLast60s: recentAgent,
      toolCallsLast60s: recentTools,
      nemotronCallsLast60s: recentNem,
      avgLatencyMs: avgLatency,
      fallbackRatio: recentNem === 0 ? 0 : recentFallbacks / recentNem,
      inflight: this.inflight,
      device: 'NVIDIA DGX Spark (GB10) · Tailscale',
      model: process.env.NEMOTRON_MODEL ?? 'nvidia/Nemotron-super-120b',
    };
  }

  async run(input: OrchestratorRunInput): Promise<OrchestratorRunOutput> {
    if (this.busy) {
      const skip = trace('thought', 'Orchestrator busy; this tick is skipped.', { payload: { agent: 'orchestrator' } });
      this.emit('trace', skip);
      return {
        trace: [skip],
        toolResults: [],
        socratic: null,
        timelines: null,
        similarMemory: null,
        fallback: { active: false, reason: 'busy', lastChecked: Date.now() },
        chosenTools: [],
        reports: [],
        insights: [],
      };
    }
    this.busy = true;
    this.inflight = 1;
    try {
      return await this._run(input);
    } finally {
      this.busy = false;
      this.inflight = 0;
    }
  }

  private trackNemotron(durationMs: number, didFallback: boolean): void {
    const now = Date.now();
    this.nemotronCalls.push(now);
    this.latencySamples.push(durationMs);
    if (didFallback) this.fallbackHits.push(now);
    const cutoff = now - 60_000;
    this.nemotronCalls = this.nemotronCalls.filter((t) => t > cutoff);
    this.fallbackHits = this.fallbackHits.filter((t) => t > cutoff);
    if (this.latencySamples.length > 40) this.latencySamples = this.latencySamples.slice(-40);
  }

  private async _run(input: OrchestratorRunInput): Promise<OrchestratorRunOutput> {
    const runStart = Date.now();
    this.agentRuns.push(runStart);
    const cutoff = runStart - 60_000;
    this.agentRuns = this.agentRuns.filter((t) => t > cutoff);

    const traces: AgentTraceEntry[] = [];
    const toolResults: ToolResult[] = [];
    let socratic: SocraticPrompt | null = null;
    let timelines: FutureTimelines | null = null;
    let lastFallback: FallbackStatus = {
      active: false,
      reason: 'orchestrator boot',
      lastChecked: Date.now(),
    };

    const push = (entry: AgentTraceEntry) => {
      traces.push(entry);
      this.emit('trace', entry);
    };

    const attention = getLatestAttention();
    const screen = getLatestScreen();

    // 1) Detect productivity insights cheaply (heuristic).
    const insights = this.insightDetector.ingest({
      telemetry: input.telemetry,
      assessment: input.assessment,
      attention,
      screen,
    });
    for (const ins of insights) this.emit('insight', ins);

    // 2) Recall memory in parallel (cheap, deterministic).
    const memory = await recallSimilarMemory({
      state: input.assessment.state,
      telemetry: input.telemetry,
      cognitiveLoadScore: input.assessment.cognitiveLoadScore,
    });

    push(
      trace(
        'thought',
        `Orchestrator dispatch: telemetry+attention+screen+memory captured. ${insights.length} insight(s) detected.`,
        { payload: { agent: 'orchestrator', insights } },
      ),
    );

    // 3) Run 7 specialist agents in parallel.
    const reports = await runSpecialistsInParallel({
      telemetry: input.telemetry,
      assessment: input.assessment,
      attention,
      screen,
      similarMemory: memory,
      insights,
    });
    for (const report of reports) {
      this.emit('agent_report', report);
      push(
        trace('thought', `[${report.agent}] ${report.summary}`, {
          payload: { agent: report.agent, signals: report.signals, durationMs: report.durationMs },
        }),
      );
    }

    // 4) Nemotron — analyze cognitive state with all the context.
    const analyzeStart = Date.now();
    const analysis = await analyzeCognitiveState({
      telemetry: input.telemetry,
      assessment: input.assessment,
      attention,
    });
    this.trackNemotron(Date.now() - analyzeStart, analysis.fallback.active);
    lastFallback = analysis.fallback;
    push(trace('thought', `[nemotron] ${analysis.data.thought}`, { payload: { agent: 'orchestrator' } }));

    // 5) Always probe attention as the canonical tool call.
    push(trace('tool_call', 'Calling check_attention_state.', { toolName: 'check_attention_state' }));
    const attentionResult = await runTool('check_attention_state', {
      telemetry: input.telemetry,
      assessment: input.assessment,
    });
    this.toolCalls.push(Date.now());
    toolResults.push(attentionResult);
    push(
      trace('tool_result', attentionResult.reason, {
        toolName: 'check_attention_state',
        payload: attentionResult.payload,
      }),
    );

    // 6) Simulate futures when state is non-Green OR critical insight present.
    const criticalInsight = insights.find((i) => i.severity === 'critical');
    if (input.assessment.state !== 'Green' || criticalInsight) {
      push(trace('tool_call', 'Calling simulate_futures.', { toolName: 'simulate_futures' }));
      const precomputed = simulateFutures(input.telemetry);
      const simStart = Date.now();
      const simResult = await simulateFutureTimelines({
        telemetry: input.telemetry,
        assessment: input.assessment,
        precomputed,
      });
      this.trackNemotron(Date.now() - simStart, simResult.fallback.active);
      lastFallback = simResult.fallback;
      timelines = simResult.data;
      const recoveryDelta = Math.round(
        (timelines.intervention.points.at(-1)!.completionChance -
          timelines.noIntervention.points.at(-1)!.completionChance) *
          100,
      );
      push(
        trace(
          'tool_result',
          `Projection: intervention improves predicted recovery by ${recoveryDelta} points. ${timelines.intervention.summary}`,
          {
            toolName: 'simulate_futures',
            payload: { timelines, recoveryDelta },
          },
        ),
      );
    }

    // 7) Nemotron decision.
    const decisionStart = Date.now();
    const decision = await chooseIntervention({
      telemetry: input.telemetry,
      assessment: input.assessment,
      similarMemory: memory,
      attention,
    });
    this.trackNemotron(Date.now() - decisionStart, decision.fallback.active);
    lastFallback = decision.fallback;
    push(
      trace('decision', `${decision.data.rationale} Plan: ${decision.data.tools.join(' → ')}.`, {
        payload: { tools: decision.data.tools, attention, screen },
      }),
    );

    // 8) Socratic if planned.
    if (decision.data.tools.includes('ask_socratic')) {
      const socStart = Date.now();
      const socResult = await generateSocraticQuestion({
        telemetry: input.telemetry,
        assessment: input.assessment,
        attention,
      });
      this.trackNemotron(Date.now() - socStart, socResult.fallback.active);
      lastFallback = socResult.fallback;
      socratic = socResult.data;
    }

    // 9) Execute remaining tools.
    const alreadyRan = new Set<ToolName>(['check_attention_state']);
    if (input.assessment.state !== 'Green' || criticalInsight) alreadyRan.add('simulate_futures');

    for (const toolName of decision.data.tools) {
      if (alreadyRan.has(toolName)) continue;
      push(trace('tool_call', `Calling ${toolName}.`, { toolName }));
      const result = await runTool(toolName, {
        telemetry: input.telemetry,
        assessment: input.assessment,
        socraticQuestion: socratic?.question,
      });
      this.toolCalls.push(Date.now());
      toolResults.push(result);
      push(trace('tool_result', result.reason, { toolName, payload: result.payload }));
    }

    // 10) Final action.
    const tookAction = decision.data.tools.some((t) => t !== 'do_nothing');
    const summary = tookAction
      ? `Executed ${decision.data.tools.filter((t) => t !== 'do_nothing' && t !== 'check_attention_state').join(', ')}.`
      : 'Held position. Conditions are within tolerance.';
    push(trace('final_action', summary, { payload: { tools: decision.data.tools } }));

    this.toolCalls = this.toolCalls.filter((t) => t > Date.now() - 60_000);

    return {
      trace: traces,
      toolResults,
      socratic,
      timelines,
      similarMemory: memory,
      fallback: lastFallback,
      chosenTools: decision.data.tools,
      reports,
      insights,
    };
  }
}
