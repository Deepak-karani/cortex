import type {
  AttentionMetrics,
  CognitiveAssessment,
  FallbackStatus,
  FutureTimelines,
  MemoryRecord,
  SocraticPrompt,
  Telemetry,
} from '../src/types';
import { TOOL_DESCRIPTIONS, type ToolName } from '../tools/cortexTools';

// Read env lazily so dotenv.config() in src/index.ts has time to run before
// these are evaluated. Constants captured at import time would freeze to the
// defaults because nemotronAgent.ts is imported before dotenv loads.
function cfg() {
  return {
    BASE_URL: process.env.NEMOTRON_BASE_URL ?? 'http://localhost:8000/v1',
    API_KEY: process.env.NEMOTRON_API_KEY ?? 'local',
    MODEL: process.env.NEMOTRON_MODEL ?? 'nvidia/Nemotron-super-120b',
    // Reasoning models (Nemotron-3 family on Ollama) emit a separate
    // "thinking" stream before the final answer — that thinking eats
    // wall-clock time, so we allow up to 45s per call by default.
    TIMEOUT_MS: Number(process.env.NEMOTRON_TIMEOUT_MS ?? 45000),
  };
}

export interface NemotronCallResult<T> {
  data: T;
  fallback: FallbackStatus;
}

const fallbackState: FallbackStatus = {
  active: false,
  reason: 'Not yet probed.',
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

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function chatCompletion(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
): Promise<string> {
  const { BASE_URL, API_KEY, MODEL, TIMEOUT_MS } = cfg();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = `${BASE_URL.replace(/\/$/, '')}/chat/completions`;
  try {
    const body: Record<string, unknown> = {
      model: MODEL,
      messages,
      temperature: options.temperature ?? 0.4,
      // Reasoning models burn tokens on internal "thinking" before the final
      // answer. Give them plenty of room to think AND emit the JSON answer.
      max_tokens: options.maxTokens ?? 4096,
    };
    if (options.jsonMode) {
      // OpenAI-style JSON mode — Ollama also supports it via response_format.
      body.response_format = { type: 'json_object' };
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Nemotron HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          // Some Nemotron / reasoning model responses put the answer in
          // `reasoning` when `content` is empty, or vice versa.
          reasoning?: string;
        };
      }>;
    };
    const msg = json.choices?.[0]?.message;
    const content = msg?.content?.trim() || msg?.reasoning?.trim();
    if (!content) throw new Error('Nemotron returned empty content');
    return content;
  } catch (err) {
    console.error(`[nemotron] call to ${url} failed:`, (err as Error).name, (err as Error).message);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * High-level helper for specialist agents: send a JSON-mode request, return a
 * parsed object, throw on failure (so the caller can substitute a fallback).
 */
export async function callNemotronJson<T>(
  systemPrompt: string,
  userPayload: unknown,
  options: { maxTokens?: number; temperature?: number; timeoutMs?: number } = {},
): Promise<T> {
  const original = process.env.NEMOTRON_TIMEOUT_MS;
  if (options.timeoutMs) {
    // Temporarily narrow the per-call timeout. cfg() reads env lazily.
    process.env.NEMOTRON_TIMEOUT_MS = String(options.timeoutMs);
  }
  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      {
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens ?? 1024,
        jsonMode: true,
      },
    );
    const parsed = safeJson<T | null>(raw, null);
    if (!parsed) throw new Error('Nemotron returned unparseable JSON');
    return parsed;
  } finally {
    if (options.timeoutMs) {
      if (original === undefined) delete process.env.NEMOTRON_TIMEOUT_MS;
      else process.env.NEMOTRON_TIMEOUT_MS = original;
    }
  }
}

function safeJson<T>(text: string, fallback: T): T {
  // Strip code fences.
  const stripped = text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  // 1) Try parsing as-is.
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // continue
  }

  // 2) Reasoning models often wrap the JSON in prose, e.g.
  //    "Here is the result: {\"thought\": \"...\"}. Done."
  //    Pull out the first balanced {...} block.
  const start = stripped.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const candidate = stripped.slice(start, i + 1);
          try {
            return JSON.parse(candidate) as T;
          } catch {
            break;
          }
        }
      }
    }
  }

  return fallback;
}

// -------- Mock fallback implementations --------

function mockAnalyze(
  t: Telemetry,
  a: CognitiveAssessment,
  attn?: AttentionMetrics | null,
): { thought: string } {
  const drivers: string[] = [];
  if (t.hrv < 35) drivers.push(`HRV dropped to ${t.hrv}ms`);
  if (t.heartRate > 90) drivers.push(`heart rate climbed to ${t.heartRate}bpm`);
  if (t.contextSwitches > 12) drivers.push(`${t.contextSwitches} context switches per minute`);
  if (t.unreadNotifications > 15) drivers.push(`${t.unreadNotifications} unread Slack notifications`);
  if (t.deadlineMinutes < 15) drivers.push(`deadline only ${t.deadlineMinutes} minutes away`);
  if (attn) {
    if (attn.offscreenRatio60s > 0.3)
      drivers.push(`gaze was offscreen ${Math.round(attn.offscreenRatio60s * 100)}% of the last minute`);
    if (attn.focusStability < 40) drivers.push(`focus stability dropped to ${attn.focusStability}/100`);
    if (attn.interpretedState === 'Fatigued') drivers.push(`fatigue signs in blink pattern`);
    if (attn.interpretedState === 'Overstimulated') drivers.push(`overstimulated gaze pattern`);
    if (!attn.faceDetected) drivers.push('face left camera frame');
  }
  const driverText = drivers.length > 0 ? drivers.join(', and ') : 'a slow, steady accumulation';
  return {
    thought: `Cognitive load is ${a.cognitiveLoadScore} (${a.state}) because ${driverText}. The user is working on "${t.currentTask}". I should weigh whether intervening now beats waiting.`,
  };
}

function mockChooseIntervention(
  a: CognitiveAssessment,
  t: Telemetry,
  attn?: AttentionMetrics | null,
): { tools: ToolName[]; rationale: string } {
  // Per Face State Analyzer spec section 5 — each interpreted state has a
  // defined intervention posture. Apply that first, then layer biometric load.
  const interp = attn?.interpretedState ?? 'Unknown';

  // Focused: do not interrupt — but only honor this if biometrics agree.
  if (interp === 'Focused' && a.state === 'Green') {
    return {
      tools: ['do_nothing'],
      rationale: 'Attention is focused and biometrics are Green. Do not interrupt the flow state.',
    };
  }
  if (interp === 'Focused' && a.state === 'Yellow') {
    return {
      tools: ['recall_memory', 'simulate_futures'],
      rationale: 'Biometrics flag Yellow but attention reads Focused. Recall, simulate, and hold off on heavy tools.',
    };
  }

  // Distracted: ask one short re-anchor question.
  if (interp === 'Distracted') {
    const tools: ToolName[] = ['ask_socratic'];
    if (a.state === 'Red') tools.push('mute_slack', 'enable_focus_mode');
    return {
      tools,
      rationale: 'Attention is Distracted — surface one re-anchor question rather than piling on tools.',
    };
  }

  // Fatigued: suggest a reset, Socratic question, or focus mode.
  // Avoid dim_secondary_monitor — user is tired, not hyperfocused.
  if (interp === 'Fatigued') {
    return {
      tools: ['ask_socratic', 'enable_focus_mode', 'block_calendar_time'],
      rationale: 'Attention is Fatigued — protect calendar, surface one question, enable focus mode. Do not dim monitor.',
    };
  }

  // Overstimulated: reduce notifications, simplify task queue.
  if (interp === 'Overstimulated') {
    return {
      tools: ['mute_slack', 'close_tabs', 'enable_focus_mode', 'dim_secondary_monitor'],
      rationale: 'Attention is Overstimulated — collapse the visual field: mute Slack, close tabs, focus mode, dim monitor.',
    };
  }

  // Searching: offer help by surfacing the right doc; avoid heavy interruption.
  if (interp === 'Searching') {
    return {
      tools: ['open_relevant_doc', 'recall_memory'],
      rationale: 'Attention is Searching — surface the relevant doc and recall past patterns; do not interrupt heavily.',
    };
  }

  // Unknown attention OR no attention signal — fall back to biometric-only logic.
  if (a.state === 'Green') {
    return {
      tools: ['do_nothing'],
      rationale: 'Biometric load is Green and attention signal is not available. Hold position.',
    };
  }
  if (a.state === 'Yellow') {
    return {
      tools: ['recall_memory', 'simulate_futures'],
      rationale: 'Yellow biometric load. Recall what worked before and project the futures before acting.',
    };
  }
  // Red / Intervention without trustworthy attention.
  const toolset: ToolName[] = ['mute_slack', 'enable_focus_mode'];
  if (t.unreadNotifications > 20) toolset.push('close_tabs');
  if (t.deadlineMinutes < 20) toolset.push('block_calendar_time');
  toolset.push('dim_secondary_monitor');
  toolset.push('ask_socratic');
  return {
    tools: toolset,
    rationale: 'Red biometric load — fire a coordinated intervention bundle.',
  };
}

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

function mockSocratic(_: Telemetry, a: CognitiveAssessment): SocraticPrompt {
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

// -------- Public API --------

export async function analyzeCognitiveState(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  attention?: AttentionMetrics | null;
}): Promise<NemotronCallResult<{ thought: string }>> {
  const system =
    'You are Cortex, an autonomous cognitive operating system. Given the user\'s simulated biometrics, screen state, AND webcam-derived attention metrics, write ONE short paragraph (max 70 words) of analysis. Focus on cause-and-effect: what is rising, what is dropping, and whether the biometrics and gaze tell the same story. Output JSON: {"thought": "..."}';
  const user = JSON.stringify({
    telemetry: input.telemetry,
    assessment: input.assessment,
    attention: input.attention ?? null,
  });
  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.5, maxTokens: 4096, jsonMode: true },
    );
    const parsed = safeJson<{ thought?: string }>(raw, {});
    if (!parsed.thought) throw new Error('missing thought');
    return { data: { thought: parsed.thought }, fallback: markFallback(false, 'Nemotron live.') };
  } catch (err) {
    return {
      data: mockAnalyze(input.telemetry, input.assessment, input.attention),
      fallback: markFallback(true, `Nemotron unreachable (${(err as Error).message}). Mock fallback active.`),
    };
  }
}

export async function simulateFutureTimelines(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  precomputed: FutureTimelines;
}): Promise<NemotronCallResult<FutureTimelines>> {
  // The numerical projection is deterministic; we just ask Nemotron to enrich
  // the summary text. If anything fails, we return the precomputed object.
  const system =
    'You are Cortex. You receive two simulated futures (no-intervention vs Cortex intervenes). Rewrite each "summary" field as ONE punchy sentence. Output JSON: {"noIntervention": "...", "intervention": "..."}.';
  const payload = {
    noIntervention: input.precomputed.noIntervention,
    intervention: input.precomputed.intervention,
    state: input.assessment.state,
    telemetry: input.telemetry,
  };
  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      { temperature: 0.5, maxTokens: 4096, jsonMode: true },
    );
    const parsed = safeJson<{ noIntervention?: string; intervention?: string }>(raw, {});
    const enriched: FutureTimelines = {
      ...input.precomputed,
      noIntervention: {
        ...input.precomputed.noIntervention,
        summary: parsed.noIntervention ?? input.precomputed.noIntervention.summary,
      },
      intervention: {
        ...input.precomputed.intervention,
        summary: parsed.intervention ?? input.precomputed.intervention.summary,
      },
    };
    return { data: enriched, fallback: markFallback(false, 'Nemotron live.') };
  } catch (err) {
    return {
      data: input.precomputed,
      fallback: markFallback(true, `Nemotron unreachable (${(err as Error).message}). Mock fallback active.`),
    };
  }
}

export async function chooseIntervention(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  similarMemory: MemoryRecord | null;
  attention?: AttentionMetrics | null;
}): Promise<NemotronCallResult<{ tools: ToolName[]; rationale: string }>> {
  const system = `You are Cortex, an autonomous AI agent. Choose which tools to call to reduce cognitive overload. Available tools:\n${Object.entries(
    TOOL_DESCRIPTIONS,
  )
    .map(([name, desc]) => `- ${name}: ${desc}`)
    .join(
      '\n',
    )}\n\nWebcam-derived attention is provided. Follow this posture per interpretedState:\n- Focused: do NOT interrupt; prefer do_nothing or just observation.\n- Distracted: ask one short re-anchor question (ask_socratic); avoid heavy interruption.\n- Fatigued: suggest a short reset — ask_socratic, enable_focus_mode, block_calendar_time. Do NOT pick dim_secondary_monitor (user is tired, not hyperfocused).\n- Overstimulated: reduce notifications — mute_slack, close_tabs, enable_focus_mode, dim_secondary_monitor.\n- Searching: offer help via open_relevant_doc and recall_memory; do not interrupt heavily.\n- Unknown: fall back to biometric-only reasoning.\n\nReturn JSON of the form {"tools": ["..."], "rationale": "one sentence on why"}. Pick 1-6 tools. Use "do_nothing" alone if biometric state is Green AND attention is Focused.`;
  const user = JSON.stringify({
    telemetry: input.telemetry,
    assessment: input.assessment,
    similarMemory: input.similarMemory,
    attention: input.attention ?? null,
  });
  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.3, maxTokens: 4096, jsonMode: true },
    );
    const parsed = safeJson<{ tools?: string[]; rationale?: string }>(raw, {});
    const allowed = new Set(Object.keys(TOOL_DESCRIPTIONS));
    const tools = (parsed.tools ?? []).filter((t): t is ToolName => allowed.has(t)) as ToolName[];
    if (tools.length === 0) throw new Error('no valid tools returned');
    return {
      data: { tools, rationale: parsed.rationale ?? 'Nemotron-selected interventions.' },
      fallback: markFallback(false, 'Nemotron live.'),
    };
  } catch (err) {
    return {
      data: mockChooseIntervention(input.assessment, input.telemetry, input.attention),
      fallback: markFallback(true, `Nemotron unreachable (${(err as Error).message}). Mock fallback active.`),
    };
  }
}

export async function generateSocraticQuestion(input: {
  telemetry: Telemetry;
  assessment: CognitiveAssessment;
  attention?: AttentionMetrics | null;
}): Promise<NemotronCallResult<SocraticPrompt>> {
  const system =
    'You are Cortex. Surface ONE Socratic question to ask the overloaded user, plus a one-sentence rationale on why this question fits their current biometric + attention state. Return JSON: {"question": "...", "rationale": "..."}. The question must be answerable in under 15 seconds. Never ask more than one.';
  const user = JSON.stringify({
    telemetry: input.telemetry,
    assessment: input.assessment,
    attention: input.attention ?? null,
  });
  try {
    const raw = await chatCompletion(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { temperature: 0.7, maxTokens: 4096, jsonMode: true },
    );
    const parsed = safeJson<{ question?: string; rationale?: string }>(raw, {});
    if (!parsed.question || !parsed.rationale) throw new Error('missing fields');
    return {
      data: { timestamp: Date.now(), question: parsed.question, rationale: parsed.rationale },
      fallback: markFallback(false, 'Nemotron live.'),
    };
  } catch (err) {
    return {
      data: mockSocratic(input.telemetry, input.assessment),
      fallback: markFallback(true, `Nemotron unreachable (${(err as Error).message}). Mock fallback active.`),
    };
  }
}

export async function retrieveRelevantMemory(input: {
  assessment: CognitiveAssessment;
  candidates: MemoryRecord[];
}): Promise<NemotronCallResult<MemoryRecord | null>> {
  if (input.candidates.length === 0) {
    return { data: null, fallback: markFallback(false, 'Nemotron live.') };
  }
  // Simple lexical heuristic — Nemotron-side ranking is overkill for the demo
  // but we still expose the function so the agent loop can call it.
  const best = [...input.candidates]
    .filter((m) => m.cognitiveState === input.assessment.state)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  return {
    data: best ?? input.candidates[0],
    fallback: { ...fallbackState },
  };
}
