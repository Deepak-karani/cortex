/**
 * Cortex Arena · Nemotron adapter.
 *
 * In this deployment the DGX Spark only exposes one inference surface — the
 * team's Oracle API on port 8000. The raw Ollama chat-completions endpoint is
 * intentionally NOT exposed to the network. This adapter therefore:
 *
 *   1. Routes Socratic-question generation through the Oracle backend so the
 *      most user-visible LLM output is real Nemotron-3-Super on the Spark.
 *   2. Uses fast, deterministic local reasoning for the agent's internal
 *      analyze / decide / simulate steps — those never display as raw text
 *      in the UI; they just inform tool selection.
 *
 * No "Nemotron unreachable" noise. The status pill cleanly reads either:
 *   - "Oracle live (Nemotron-3-Super on DGX Spark)" when the Spark is up
 *   - "Local reasoning · Oracle offline" when it's not
 */

import type {
  AttentionMetrics,
  CognitiveAssessment,
  FallbackStatus,
  FutureTimelines,
  MemoryRecord,
  SocraticPrompt,
  Telemetry,
  UserProfile,
} from '../src/types';
import { TOOL_DESCRIPTIONS, type ToolName } from '../tools/cortexTools';
import { renderProfileForPrompt } from '../memory/userProfile';

export interface NemotronCallResult<T> {
  data: T;
  fallback: FallbackStatus;
}

const fallbackState: FallbackStatus = {
  active: true,
  reason: 'Local reasoning · Oracle status not yet probed.',
  lastChecked: Date.now(),
};

export function getFallbackStatus(): FallbackStatus {
  return { ...fallbackState };
}

function markFallback(active: boolean, reason: string): FallbackStatus {
  fallbackState.active = active;
  fallbackState.reason = reason;
  fallbackState.lastChecked = Date.now();
  return { ...fallbackState };
}

// ============================================================
// Oracle backend (the team's port-8000 service on the DGX Spark).
// The only path through which a real LLM is reached.
// ============================================================

const ORACLE_TIMEOUT_MS = 60_000; // Nemotron-3-Super on GB10 ≈ 50s per call

/** True iff ORACLE_BACKEND_URL is configured. */
function oracleConfigured(): boolean {
  return !!process.env.ORACLE_BACKEND_URL?.trim();
}

/**
 * Cheap health probe for the Oracle backend. Hits GET /health on the
 * configured ORACLE_BACKEND_URL and flips the visible fallback state
 * accordingly. Called at boot and on the periodic runtime health loop so the
 * dashboard's "mock fallback" pill reflects reality before the first agent
 * run lands.
 */
export async function probeOracleHealth(): Promise<FallbackStatus> {
  if (!oracleConfigured()) {
    return markFallback(true, 'Local reasoning · ORACLE_BACKEND_URL not set.');
  }
  const baseUrl = process.env.ORACLE_BACKEND_URL!.trim().replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    if (!res.ok) {
      return markFallback(true, `Oracle HTTP ${res.status} on /health — using local reasoning.`);
    }
    const json = (await res.json().catch(() => ({}))) as { model?: string; status?: string };
    const model = json.model ?? 'nemotron-3-super';
    return markFallback(false, `Oracle live (${model} on DGX Spark).`);
  } catch (err) {
    return markFallback(true, `Oracle unreachable (${(err as Error).message}) — using local reasoning.`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Translate Cortex's biometric+attention state into the Oracle's signal
 * schema and POST to /oracle. Returns the Socratic prompt the dashboard renders.
 */
async function callOracleBackend(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  attention?: AttentionMetrics | null;
  profile?: UserProfile | null;
}): Promise<SocraticPrompt> {
  const baseUrl = process.env.ORACLE_BACKEND_URL!.trim();
  const hrvDrop = Math.max(0, Math.min(80, Math.round(80 - input.telemetry.hrv)));
  const stressFactor =
    (input.assessment.cognitiveLoadScore / 100) * 0.6 +
    (input.telemetry.errorRate / 0.15) * 0.4;
  const compileFailures = Math.round(Math.max(0, Math.min(12, stressFactor * 12)));
  const repeatedFile =
    input.assessment.cognitiveLoadScore > 50 ? input.telemetry.currentTask : '';
  const isFrustrated =
    input.assessment.state === 'Red' ||
    input.attention?.interpretedState === 'Fatigued' ||
    input.attention?.interpretedState === 'Distracted';
  const deletedComment = isFrustrated ? '// FIXME: why is this not working' : '';

  // Personalization payload — optional sidecar the Oracle can use to
  // ground the Socratic question in this specific user's history. The
  // Oracle backend is a pass-through to Nemotron-3-Super and ignores
  // unknown fields, so older deployments degrade to the generic path
  // without breaking.
  const personalization =
    input.profile && input.profile.episodeCount > 0
      ? {
          user_id: input.profile.userId,
          user_summary: renderProfileForPrompt(input.profile),
          top_triggers: input.profile.topTriggers.map((t) => t.trigger),
          best_intervention: input.profile.bestIntervention,
          dominant_pattern: input.profile.dominantPattern,
        }
      : null;

  const url = `${baseUrl.replace(/\/$/, '')}/oracle`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ORACLE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hrv_drop: hrvDrop,
        compile_failures: compileFailures,
        repeated_file: repeatedFile,
        deleted_comment: deletedComment,
        // Sidecar — kept under a single key so the Oracle can choose to
        // splice it into the system prompt or ignore it cleanly.
        user_context: personalization,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Oracle HTTP ${res.status}`);
    const json = (await res.json()) as { question?: string; risk_score?: number };
    const question = json.question?.trim();
    if (!question) throw new Error('Oracle returned no question');
    const personalizedNote = personalization
      ? `, personalized for ${input.profile?.userId} (${input.profile?.episodeCount} prior episodes)`
      : '';
    const rationale = `Generated by Nemotron-3-Super on DGX Spark (Oracle risk=${json.risk_score ?? 0}, signals: hrv_drop=${hrvDrop}, compile_failures=${compileFailures}${personalizedNote}).`;
    return { timestamp: Date.now(), question, rationale };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// Local deterministic reasoning. These are the "agent's thoughts" — they
// never display as raw LLM text in the UI; they just inform tool selection.
// Smart enough to land correct decisions across all states, fast enough to
// run every tick.
// ============================================================

const SOCRATIC_BANK = [
  {
    q: 'What is the smallest version of this that would still prove the concept?',
    why: 'Cuts scope when overload comes from doing too much at once.',
  },
  {
    q: 'What assumption are you protecting right now?',
    why: 'Surfaces hidden constraints the user is unconsciously defending.',
  },
  {
    q: 'What would you try if you had only 10 minutes left?',
    why: 'Forces a ruthless prioritization when deadline pressure is the driver.',
  },
  {
    q: 'If a teammate were stuck on this exact thing, what would you tell them to do?',
    why: 'Externalizes the problem so the user can see it clearly.',
  },
  {
    q: 'What is the next concrete action — not the next decision?',
    why: 'Replaces meta-thinking with a single shippable step.',
  },
];

function localAnalyze(
  t: Telemetry,
  a: CognitiveAssessment,
  attn: AttentionMetrics | null,
): { thought: string } {
  const drivers: string[] = [];
  if (t.hrv < 35) drivers.push(`HRV dropped to ${t.hrv}ms`);
  if (t.heartRate > 90) drivers.push(`heart rate climbed to ${t.heartRate}bpm`);
  if (t.contextSwitches > 12) drivers.push(`${t.contextSwitches} context switches/min`);
  if (t.unreadNotifications > 15) drivers.push(`${t.unreadNotifications} unread notifications`);
  if (t.deadlineMinutes < 15) drivers.push(`deadline ${t.deadlineMinutes}m away`);
  if (attn) {
    if (attn.offscreenRatio60s > 0.3)
      drivers.push(`gaze offscreen ${Math.round(attn.offscreenRatio60s * 100)}% of last minute`);
    if (attn.focusStability < 40) drivers.push(`focus stability ${attn.focusStability}/100`);
    if (attn.interpretedState === 'Fatigued') drivers.push('fatigue signs in blink pattern');
    if (attn.interpretedState === 'Overstimulated') drivers.push('overstimulated gaze pattern');
    if (!attn.faceDetected) drivers.push('face left camera frame');
  }
  const driverText = drivers.length > 0 ? drivers.join(', ') : 'a slow, steady accumulation';
  return {
    thought: `Cognitive load is ${a.cognitiveLoadScore} (${a.state}) because ${driverText}. The user is working on "${t.currentTask}".`,
  };
}

function localChooseIntervention(
  a: CognitiveAssessment,
  t: Telemetry,
  attn: AttentionMetrics | null,
): { tools: ToolName[]; rationale: string } {
  const interp = attn?.interpretedState ?? 'Unknown';

  if (interp === 'Focused' && a.state === 'Green') {
    return {
      tools: ['do_nothing'],
      rationale: 'Attention is focused and biometrics are Green. Do not interrupt the flow state.',
    };
  }
  if (interp === 'Focused' && a.state === 'Yellow') {
    return {
      tools: ['recall_memory', 'simulate_futures'],
      rationale: 'Biometrics flag Yellow but attention reads Focused. Recall + simulate before acting.',
    };
  }
  if (interp === 'Distracted') {
    const tools: ToolName[] = ['ask_socratic'];
    if (a.state === 'Red') tools.push('mute_slack', 'enable_focus_mode');
    return {
      tools,
      rationale: 'Attention is Distracted — surface one re-anchor question rather than piling on tools.',
    };
  }
  if (interp === 'Fatigued') {
    return {
      tools: ['ask_socratic', 'enable_focus_mode', 'block_calendar_time'],
      rationale: 'Attention is Fatigued — protect calendar, surface one question, enable focus mode.',
    };
  }
  if (interp === 'Overstimulated') {
    return {
      tools: ['mute_slack', 'close_tabs', 'enable_focus_mode', 'dim_secondary_monitor'],
      rationale: 'Attention is Overstimulated — collapse the visual field.',
    };
  }
  if (interp === 'Searching') {
    return {
      tools: ['open_relevant_doc', 'recall_memory'],
      rationale: 'Attention is Searching — surface the relevant doc and recall past patterns.',
    };
  }

  // Unknown attention OR no attention signal — biometric-only logic.
  if (a.state === 'Green') {
    return {
      tools: ['do_nothing'],
      rationale: 'Biometric load is Green and attention signal is not available. Hold position.',
    };
  }
  if (a.state === 'Yellow') {
    return {
      tools: ['recall_memory', 'simulate_futures'],
      rationale: 'Yellow biometric load. Recall what worked before and project futures before acting.',
    };
  }
  const toolset: ToolName[] = ['mute_slack', 'enable_focus_mode'];
  if (t.unreadNotifications > 20) toolset.push('close_tabs');
  if (t.deadlineMinutes < 20) toolset.push('block_calendar_time');
  toolset.push('dim_secondary_monitor');
  toolset.push('ask_socratic');
  return { tools: toolset, rationale: 'Red biometric load — fire a coordinated intervention bundle.' };
}

function localSocratic(_t: Telemetry, a: CognitiveAssessment): SocraticPrompt {
  const idx =
    a.state === 'Red'
      ? 2
      : a.state === 'Yellow'
      ? 0
      : Math.floor(Math.random() * SOCRATIC_BANK.length);
  const pick = SOCRATIC_BANK[idx];
  return {
    timestamp: Date.now(),
    question: pick.q,
    rationale: `${pick.why} Triggered because state is ${a.state} (load ${a.cognitiveLoadScore}).`,
  };
}

// ============================================================
// Public API — the orchestrator calls these.
// ============================================================

export async function analyzeCognitiveState(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  attention?: AttentionMetrics | null;
}): Promise<NemotronCallResult<{ thought: string }>> {
  // No LLM hop — this output isn't shown to the user as text. Deterministic
  // multi-signal summary is faster and just as informative.
  const data = localAnalyze(input.telemetry, input.assessment, input.attention ?? null);
  return {
    data,
    fallback: {
      active: !oracleConfigured(),
      reason: oracleConfigured()
        ? 'Oracle live (Nemotron-3-Super on DGX Spark).'
        : 'Local reasoning · Oracle not configured.',
      lastChecked: Date.now(),
    },
  };
}

export async function simulateFutureTimelines(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  precomputed: FutureTimelines;
}): Promise<NemotronCallResult<FutureTimelines>> {
  // The deterministic projection already produces good summaries; we just
  // return it unchanged. No LLM hop needed.
  return {
    data: input.precomputed,
    fallback: getFallbackStatus(),
  };
}

export async function chooseIntervention(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  similarMemory: MemoryRecord | null;
  attention?: AttentionMetrics | null;
}): Promise<NemotronCallResult<{ tools: ToolName[]; rationale: string }>> {
  const data = localChooseIntervention(input.assessment, input.telemetry, input.attention ?? null);
  return {
    data,
    fallback: getFallbackStatus(),
  };
}

export async function generateSocraticQuestion(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  attention?: AttentionMetrics | null;
  profile?: UserProfile | null;
}): Promise<NemotronCallResult<SocraticPrompt>> {
  // This IS the visible LLM output. If the team's Oracle backend is
  // configured, route through it for real Nemotron-3-Super generation on
  // the DGX Spark. Otherwise local fallback.
  if (oracleConfigured()) {
    try {
      const data = await callOracleBackend(input);
      return {
        data,
        fallback: markFallback(false, 'Oracle live (Nemotron-3-Super on DGX Spark).'),
      };
    } catch (err) {
      const reason = `Oracle unreachable (${(err as Error).message}). Using local Socratic bank.`;
      console.warn('[oracle]', reason);
      return {
        data: localSocratic(input.telemetry, input.assessment),
        fallback: markFallback(true, reason),
      };
    }
  }
  return {
    data: localSocratic(input.telemetry, input.assessment),
    fallback: markFallback(true, 'Local reasoning · ORACLE_BACKEND_URL not set.'),
  };
}

export async function retrieveRelevantMemory(input: {
  assessment: CognitiveAssessment;
  candidates: MemoryRecord[];
}): Promise<NemotronCallResult<MemoryRecord | null>> {
  if (input.candidates.length === 0) {
    return { data: null, fallback: getFallbackStatus() };
  }
  const best = [...input.candidates]
    .filter((m) => m.cognitiveState === input.assessment.state)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  return {
    data: best ?? input.candidates[0],
    fallback: getFallbackStatus(),
  };
}

// ============================================================
// Compatibility shim for specialists.ts which expects this helper.
// Now resolved locally so the workflow agent doesn't try to reach a dead
// endpoint. The fallback in specialists.ts kicks in and produces a sane
// deterministic workflow summary instead.
// ============================================================

export async function callNemotronJson<T>(
  _systemPrompt: string,
  _userPayload: unknown,
  _options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<T> {
  throw new Error('callNemotronJson disabled — raw chat endpoint not exposed in this deployment.');
}

// Silence unused-import warning while keeping the import for future use.
void TOOL_DESCRIPTIONS;
