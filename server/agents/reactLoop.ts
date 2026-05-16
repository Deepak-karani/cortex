import { EventEmitter } from 'events';
import type {
  AgentTraceEntry,
  AttentionMetrics,
  CognitiveAssessment,
  FallbackStatus,
  FutureTimelines,
  MemoryRecord,
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
import { loadMemories, recallSimilarMemory } from '../memory/memoryStore';
import { simulateFutures } from '../sim/futureSimulator';
import { getLatestAttention } from '../tools/checkAttentionState';

function id(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function trace(
  kind: AgentTraceEntry['kind'],
  content: string,
  extra: Partial<AgentTraceEntry> = {},
): AgentTraceEntry {
  return {
    id: id(),
    timestamp: Date.now(),
    kind,
    content,
    ...extra,
  };
}

export interface AgentRunOutput {
  trace: AgentTraceEntry[];
  toolResults: ToolResult[];
  socratic: SocraticPrompt | null;
  timelines: FutureTimelines | null;
  similarMemory: MemoryRecord | null;
  fallback: FallbackStatus;
  chosenTools: ToolName[];
}

export interface AgentRunInput {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
}

function attentionThoughtFragment(a: AttentionMetrics | null): string {
  if (!a) return 'No attention signal yet — biometrics only.';
  const off = Math.round(a.offscreenRatio60s * 100);
  return `Webcam attention says: ${a.interpretedState}, gaze ${a.gazeDirection}, offscreen ${off}% of last minute, stability ${a.focusStability}/100, blink rate ${a.blinkRate.toFixed(1)}/min.`;
}

export class ReactAgent extends EventEmitter {
  private busy = false;

  isBusy(): boolean {
    return this.busy;
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    if (this.busy) {
      const skip = trace('thought', 'Agent already running; skipping this tick.');
      this.emit('trace', skip);
      return {
        trace: [skip],
        toolResults: [],
        socratic: null,
        timelines: null,
        similarMemory: null,
        fallback: { active: false, reason: 'busy', lastChecked: Date.now() },
        chosenTools: [],
      };
    }
    this.busy = true;
    try {
      return await this._run(input);
    } finally {
      this.busy = false;
    }
  }

  private async _run(input: AgentRunInput): Promise<AgentRunOutput> {
    const traces: AgentTraceEntry[] = [];
    const toolResults: ToolResult[] = [];
    let socratic: SocraticPrompt | null = null;
    let timelines: FutureTimelines | null = null;
    let similarMemory: MemoryRecord | null = null;
    let lastFallback: FallbackStatus = {
      active: false,
      reason: 'Not probed.',
      lastChecked: Date.now(),
    };

    const push = (entry: AgentTraceEntry) => {
      traces.push(entry);
      this.emit('trace', entry);
    };

    const attentionAtStart = getLatestAttention();

    // 1) THOUGHT — Nemotron analyzes the state (biometrics + attention).
    const analysis = await analyzeCognitiveState({
      telemetry: input.telemetry,
      assessment: input.assessment,
      attention: attentionAtStart,
    });
    lastFallback = analysis.fallback;
    push(trace('thought', analysis.data.thought));

    // 2) THOUGHT — surface available tools and current attention snapshot.
    push(
      trace(
        'thought',
        `State is ${input.assessment.state} with load ${input.assessment.cognitiveLoadScore}. ${attentionThoughtFragment(
          attentionAtStart,
        )}`,
      ),
    );

    // 3) TOOL_CALL check_attention_state — always probe attention first.
    push(
      trace('tool_call', 'Calling check_attention_state to read webcam-derived gaze metrics.', {
        toolName: 'check_attention_state',
      }),
    );
    const attentionResult = await runTool('check_attention_state', {
      telemetry: input.telemetry,
      assessment: input.assessment,
    });
    toolResults.push(attentionResult);
    const probedAttention =
      (attentionResult.payload?.attention as AttentionMetrics | null) ?? attentionAtStart;
    push(
      trace('tool_result', attentionResult.reason, {
        toolName: 'check_attention_state',
        payload: attentionResult.payload,
      }),
    );

    // 4) TOOL_CALL recall_memory.
    push(trace('tool_call', 'Calling recall_memory to pull the closest prior pattern.', { toolName: 'recall_memory' }));
    const memoryResult = await runTool('recall_memory', {
      telemetry: input.telemetry,
      assessment: input.assessment,
    });
    toolResults.push(memoryResult);
    similarMemory = (memoryResult.payload?.matched as MemoryRecord | null) ?? null;
    push(
      trace('tool_result', memoryResult.reason, {
        toolName: 'recall_memory',
        payload: { matched: similarMemory },
      }),
    );

    // 5) TOOL_CALL simulate_futures (only if not Green or attention collapsed).
    const attentionCollapse =
      probedAttention &&
      (probedAttention.offscreenRatio60s > 0.4 ||
        probedAttention.focusStability < 35 ||
        probedAttention.interpretedState === 'Overstimulated');

    if (input.assessment.state !== 'Green' || attentionCollapse) {
      push(trace('tool_call', 'Calling simulate_futures to project two near-term timelines.', { toolName: 'simulate_futures' }));
      const precomputed = simulateFutures(input.telemetry);
      const simResult = await simulateFutureTimelines({
        telemetry: input.telemetry,
        assessment: input.assessment,
        precomputed,
      });
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

    // 6) DECISION — Nemotron picks tools with attention context.
    const decision = await chooseIntervention({
      telemetry: input.telemetry,
      assessment: input.assessment,
      similarMemory,
      attention: probedAttention,
    });
    lastFallback = decision.fallback;
    push(
      trace('decision', `${decision.data.rationale} Plan: ${decision.data.tools.join(' → ')}.`, {
        payload: { tools: decision.data.tools, attention: probedAttention },
      }),
    );

    // 7) Generate Socratic question if planned.
    if (decision.data.tools.includes('ask_socratic')) {
      const socResult = await generateSocraticQuestion({
        telemetry: input.telemetry,
        assessment: input.assessment,
        attention: probedAttention,
      });
      lastFallback = socResult.fallback;
      socratic = socResult.data;
    }

    // 8) Execute each tool in plan order. recall_memory, simulate_futures, and
    // check_attention_state have already run.
    const alreadyRan = new Set<ToolName>(['recall_memory', 'check_attention_state']);
    if (input.assessment.state !== 'Green' || attentionCollapse) alreadyRan.add('simulate_futures');

    for (const toolName of decision.data.tools) {
      if (alreadyRan.has(toolName)) continue;
      push(trace('tool_call', `Calling ${toolName}.`, { toolName }));
      const result = await runTool(toolName, {
        telemetry: input.telemetry,
        assessment: input.assessment,
        socraticQuestion: socratic?.question,
      });
      toolResults.push(result);
      push(trace('tool_result', result.reason, { toolName, payload: result.payload }));
    }

    // 9) FINAL ACTION summary.
    const tookAction = decision.data.tools.some((t) => t !== 'do_nothing');
    const summary = tookAction
      ? `Executed ${decision.data.tools
          .filter((t) => t !== 'do_nothing' && t !== 'check_attention_state')
          .join(', ')}. Watching biometrics and attention for recovery.`
      : 'Held position. Load is within tolerance for this tick.';
    push(trace('final_action', summary, { payload: { tools: decision.data.tools } }));

    return {
      trace: traces,
      toolResults,
      socratic,
      timelines,
      similarMemory,
      fallback: lastFallback,
      chosenTools: decision.data.tools,
    };
  }
}

export async function listAllMemoriesForAgent(): Promise<MemoryRecord[]> {
  return loadMemories();
}

export async function findSimilarMemoryForAgent(
  state: CognitiveAssessment['state'],
): Promise<MemoryRecord | null> {
  return recallSimilarMemory({ state });
}
