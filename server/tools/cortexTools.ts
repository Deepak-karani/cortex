import type {
  CognitiveAssessment,
  FutureTimelines,
  MemoryRecord,
  Telemetry,
  ToolResult,
} from '../src/types';
import { recallSimilarMemory } from '../memory/memoryStore';
import { simulateFutures } from '../sim/futureSimulator';
import { checkAttentionState } from './checkAttentionState';
import { analyzeScreenContext } from './analyzeScreenContext';
import {
  buildPolicyDeniedResult,
  evaluateToolCall,
  recordAudit,
} from './policy';

export type ToolName =
  | 'recall_memory'
  | 'simulate_futures'
  | 'mute_slack'
  | 'enable_focus_mode'
  | 'close_tabs'
  | 'open_relevant_doc'
  | 'block_calendar_time'
  | 'dim_secondary_monitor'
  | 'ask_socratic'
  | 'check_attention_state'
  | 'analyze_screen_context'
  | 'do_nothing';

interface ToolContext {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  socraticQuestion?: string;
}

function result(
  toolName: ToolName,
  success: boolean,
  reason: string,
  expectedBenefit: string,
  payload?: Record<string, unknown>,
): ToolResult {
  return {
    toolName,
    success,
    reason,
    expectedBenefit,
    timestamp: Date.now(),
    payload,
  };
}

async function recall_memory(ctx: ToolContext): Promise<ToolResult> {
  const match = await recallSimilarMemory({
    state: ctx.assessment.state,
    telemetry: ctx.telemetry,
    cognitiveLoadScore: ctx.assessment.cognitiveLoadScore,
  });
  if (!match) {
    return result(
      'recall_memory',
      true,
      'No similar past episodes on file. Treating this as a novel pattern.',
      'Avoids forcing the wrong intervention from a mismatched memory.',
      { matched: null },
    );
  }
  const recoveredStr = match.hrvRecovered
    ? `HRV recovered in ${match.recoveryTimeSeconds}s`
    : 'HRV did not fully recover';
  return result(
    'recall_memory',
    true,
    `Closest prior pattern: ${match.patternSummary}. Last time: ${match.interventions.join(', ')} (${recoveredStr}).`,
    `Reuses an intervention bundle that previously worked for this user.`,
    { matched: match },
  );
}

async function simulate_futures(ctx: ToolContext): Promise<ToolResult> {
  const tl: FutureTimelines = simulateFutures(ctx.telemetry);
  const lastA = tl.noIntervention.points.at(-1)!;
  const lastB = tl.intervention.points.at(-1)!;
  const recoveryDelta = Math.round((lastB.completionChance - lastA.completionChance) * 100);
  return result(
    'simulate_futures',
    true,
    `Projected ${tl.noIntervention.summary} vs ${tl.intervention.summary}`,
    `Intervention improves predicted task completion by ${recoveryDelta} points.`,
    { timelines: tl, recoveryDelta },
  );
}

async function mute_slack(ctx: ToolContext): Promise<ToolResult> {
  return result(
    'mute_slack',
    true,
    `Muted Slack because unread notifications hit ${ctx.telemetry.unreadNotifications} while HRV dropped to ${ctx.telemetry.hrv}ms.`,
    'Removes the strongest interrupt source for the next 25 minutes.',
    { durationMinutes: 25 },
  );
}

async function enable_focus_mode(ctx: ToolContext): Promise<ToolResult> {
  return result(
    'enable_focus_mode',
    true,
    `Enabled OS focus mode while load is ${ctx.assessment.cognitiveLoadScore} (${ctx.assessment.state}).`,
    'Silences cross-app notifications and dims dock badges.',
    { profile: 'Deep Work' },
  );
}

async function close_tabs(ctx: ToolContext): Promise<ToolResult> {
  const closed = Math.max(4, Math.min(14, Math.round(ctx.telemetry.contextSwitches / 2)));
  return result(
    'close_tabs',
    true,
    `Closed ${closed} non-essential tabs around the task "${ctx.telemetry.currentTask}".`,
    'Reduces visual + working-memory pressure from open Chrome tabs.',
    { closed },
  );
}

async function open_relevant_doc(ctx: ToolContext): Promise<ToolResult> {
  return result(
    'open_relevant_doc',
    true,
    `Opened the most relevant doc for "${ctx.telemetry.currentTask}".`,
    'Centers the screen on the artifact that completes the task.',
    { doc: `cortex://docs/${encodeURIComponent(ctx.telemetry.currentTask)}` },
  );
}

async function block_calendar_time(ctx: ToolContext): Promise<ToolResult> {
  const minutes = Math.min(45, Math.max(20, ctx.telemetry.deadlineMinutes));
  return result(
    'block_calendar_time',
    true,
    `Held the next ${minutes} minutes on calendar as protected focus block.`,
    'Prevents interrupts from meetings and ad-hoc invites during recovery.',
    { minutes },
  );
}

async function dim_secondary_monitor(_ctx: ToolContext): Promise<ToolResult> {
  return result(
    'dim_secondary_monitor',
    true,
    'Dimmed secondary monitor to 20% brightness.',
    'Narrows visual field so attention collapses to the primary task.',
  );
}

async function ask_socratic(ctx: ToolContext): Promise<ToolResult> {
  const q =
    ctx.socraticQuestion ??
    'What is the smallest version of this that would still prove the concept?';
  return result(
    'ask_socratic',
    true,
    `Surfaced one Socratic question instead of a notification.`,
    'Re-anchors attention without adding load. Used when state is Red and HRV stays low.',
    { question: q },
  );
}

async function do_nothing(_ctx: ToolContext): Promise<ToolResult> {
  return result(
    'do_nothing',
    true,
    'Decided not to intervene this tick — current load is acceptable.',
    'Avoids over-intervening; intervention itself has a cost.',
  );
}

async function check_attention_state_tool(_ctx: ToolContext): Promise<ToolResult> {
  return checkAttentionState();
}

async function analyze_screen_context_tool(_ctx: ToolContext): Promise<ToolResult> {
  return analyzeScreenContext();
}

const registry: Record<ToolName, (ctx: ToolContext) => Promise<ToolResult>> = {
  recall_memory,
  simulate_futures,
  mute_slack,
  enable_focus_mode,
  close_tabs,
  open_relevant_doc,
  block_calendar_time,
  dim_secondary_monitor,
  ask_socratic,
  check_attention_state: check_attention_state_tool,
  analyze_screen_context: analyze_screen_context_tool,
  do_nothing,
};

export const TOOL_NAMES: ToolName[] = Object.keys(registry) as ToolName[];

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  recall_memory: 'Look up the most similar past overload episode and what worked.',
  simulate_futures: 'Project two near-term futures: no-intervention vs intervention.',
  mute_slack: 'Mute Slack for 25 minutes to remove the strongest interrupt.',
  enable_focus_mode: 'Turn on OS Focus profile to silence cross-app notifications.',
  close_tabs: 'Close non-essential browser tabs to reduce visual load.',
  open_relevant_doc: 'Open the doc most relevant to the current task.',
  block_calendar_time: 'Hold calendar time as a protected focus block.',
  dim_secondary_monitor: 'Dim secondary monitor so attention collapses to primary.',
  ask_socratic: 'Surface one Socratic question instead of a notification.',
  check_attention_state:
    'Read the latest webcam-derived attention metrics (gaze, blink rate, focus stability) to confirm or refute the biometric story.',
  analyze_screen_context:
    'Read the latest screen analysis (active app, current file, task type, intent, evidence) to understand what the user is actually doing before choosing an intervention.',
  do_nothing: 'Explicitly choose not to intervene this tick.',
};

export async function runTool(
  name: ToolName,
  ctx: ToolContext,
): Promise<ToolResult> {
  const fn = registry[name];
  if (!fn) {
    return {
      toolName: name,
      success: false,
      reason: `Unknown tool "${name}".`,
      expectedBenefit: 'N/A',
      timestamp: Date.now(),
    };
  }

  // Every tool invocation passes through the policy/sandbox gate before the
  // runtime executes it. Blocked + redacted decisions short-circuit here —
  // the tool function never runs and no external side effect occurs.
  const verdict = evaluateToolCall(name, ctx.assessment);
  recordAudit(name, verdict, ctx.assessment);
  if (verdict.decision !== 'allow') {
    return buildPolicyDeniedResult(name, verdict);
  }
  return fn(ctx);
}

export interface MemoryRecallPayload {
  matched: MemoryRecord | null;
}
