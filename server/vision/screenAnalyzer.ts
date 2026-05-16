/**
 * Screen Analyzer — VLM-backed, OCR-augmented, mock-resilient.
 *
 * Pipeline:
 *   1. Client (browser) captures the user's screen via getDisplayMedia.
 *   2. Every ~6s the client emits `screen:frame` with a base64 JPEG.
 *   3. Server hands that frame to `analyzeScreenFrame` which:
 *      a) tries an OpenAI-compatible VLM endpoint (NVIDIA VLM, FastVLM, etc.)
 *      b) falls back to a heuristic analyzer that fuses OCR tokens (from the
 *         existing client-side Tesseract pipeline) with the app/title hints
 *         the client already sends.
 *   4. Returns a structured `ScreenAnalysis` object.
 *
 * Privacy: frames are never written to disk. They live in this function's
 * locals for the duration of the analysis call and are discarded after.
 */

import type { ScreenAnalysis, ScreenSummary, TaskType } from '../src/types';

const VISION_TIMEOUT_MS = 12_000;

function cfg() {
  return {
    BASE_URL: process.env.VISION_BASE_URL ?? '',
    API_KEY: process.env.VISION_API_KEY ?? 'local',
    MODEL: process.env.VISION_MODEL ?? 'nvidia/vlm-or-fastvlm',
  };
}

interface AnalysisFallbackState {
  active: boolean;
  reason: string;
  lastChecked: number;
}
const fallbackState: AnalysisFallbackState = {
  active: true,
  reason: 'No VLM endpoint configured.',
  lastChecked: Date.now(),
};

export function getVisionFallbackStatus(): AnalysisFallbackState {
  return { ...fallbackState };
}

function markFallback(active: boolean, reason: string) {
  fallbackState.active = active;
  fallbackState.reason = reason;
  fallbackState.lastChecked = Date.now();
}

let latestAnalysis: ScreenAnalysis | null = null;
export function getLatestScreenAnalysis(): ScreenAnalysis | null {
  return latestAnalysis;
}
export function clearLatestScreenAnalysis(): void {
  latestAnalysis = null;
}

interface AnalyzeInput {
  /**
   * Base64-encoded JPEG (without the `data:image/...;base64,` prefix), captured
   * by the browser. Optional — when no VLM endpoint is reachable we operate on
   * `summaryHints` alone.
   */
  imageBase64?: string;
  /**
   * Hints already extracted by the client-side OCR pipeline. Used as the sole
   * input when VLM is unavailable, and as supplementary context when VLM is.
   */
  summaryHints?: ScreenSummary | null;
}

/** Public entry — call this with whatever you have, get structured task back. */
export async function analyzeScreenFrame(input: AnalyzeInput): Promise<ScreenAnalysis> {
  const { BASE_URL, API_KEY, MODEL } = cfg();
  if (BASE_URL && input.imageBase64) {
    try {
      const out = await callVlm(BASE_URL, API_KEY, MODEL, input.imageBase64, input.summaryHints ?? null);
      markFallback(false, 'VLM live.');
      latestAnalysis = out;
      return out;
    } catch (err) {
      console.warn('[vision] VLM call failed, falling back to heuristic:', (err as Error).message);
      markFallback(true, `VLM unreachable (${(err as Error).message}).`);
    }
  } else if (BASE_URL && !input.imageBase64) {
    markFallback(true, 'VLM configured but client did not send a frame this tick.');
  } else {
    markFallback(true, 'No VISION_BASE_URL configured. Using heuristic analyzer.');
  }

  const fallback = heuristicAnalyze(input.summaryHints ?? null);
  latestAnalysis = fallback;
  return fallback;
}

// ============================================================
// VLM path (OpenAI-compatible)
// ============================================================

async function callVlm(
  baseUrl: string,
  apiKey: string,
  model: string,
  imageBase64: string,
  hints: ScreenSummary | null,
): Promise<ScreenAnalysis> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  const system = `You are Cortex's screen-understanding agent. The user has voluntarily shared their screen with the system. Read the screenshot and return ONLY a JSON object with these keys:
{
  "activeApp": string,            // e.g. "VS Code", "Chrome", "Slack"
  "currentFile": string | null,   // filename if visible, else null
  "visibleProject": string | null,// project / repo / doc name if visible
  "userIntent": string,           // one short sentence describing what they're doing
  "taskType": "coding"|"debugging"|"reading"|"communicating"|"designing"|"browsing"|"writing"|"meeting"|"unknown",
  "confidence": number,           // 0..1
  "visibleSignals": string[],     // 2-5 short bullet-style observations from the screen
  "summary": string               // one short sentence — what the user appears to be doing right now
}

Be specific. If you see code, name the language. If you see an error, mention it. If you cannot tell, say so honestly with low confidence. Never include any text outside the JSON object.`;

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [
    {
      type: 'text',
      text: hints
        ? `Existing OCR hints (may help): active=${hints.activeApp} · title=${hints.activeTitle} · tokens=${hints.ocrTokens.slice(0, 12).join(', ')}. Now look at the screenshot.`
        : 'Analyze this screenshot.',
    },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
  ];

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`VLM HTTP ${res.status}`);
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? '';
    const parsed = safeJson<Partial<ScreenAnalysis>>(raw, {});
    return finalize(parsed, 'vlm', hints);
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Heuristic fallback — surprisingly competent given OCR hints
// ============================================================

const APP_KEYWORDS: Record<string, RegExp> = {
  'VS Code': /\bvscode|visual\s*studio|\.tsx?\b|tsconfig/i,
  Chrome: /\bchrome|http|stackoverflow|google\b/i,
  Slack: /\bslack|huddle|@channel\b/i,
  Terminal: /\bterminal|bash|zsh|npm|yarn\b/i,
  Figma: /\bfigma|frame|prototype\b/i,
  Notion: /\bnotion|database|toggle\b/i,
  Linear: /\blinear|cycle|backlog\b/i,
  Gmail: /\binbox|gmail|reply\b/i,
};

function detectTaskType(activeApp: string, tokens: string[]): TaskType {
  const blob = tokens.join(' ').toLowerCase();
  if (/error|traceback|typeerror|undefined|cannot|exception|failed/.test(blob)) return 'debugging';
  if (/function|const|return|import|export|class|tsx?\b/.test(blob)) return 'coding';
  if (/\bchapter|paragraph|article|read|stackoverflow|how to\b/.test(blob)) return 'reading';
  if (/\bslack|reply|unread|message|huddle|@\b/.test(blob)) return 'communicating';
  if (/\bfigma|frame|design|component|prototype\b/.test(blob)) return 'designing';
  if (/\bzoom|meet|teams|call\b/.test(blob)) return 'meeting';
  if (/\bdoc|write|essay|outline\b/.test(blob)) return 'writing';
  if (/code|terminal/i.test(activeApp)) return 'coding';
  if (/chrome|safari|firefox|arc|edge/i.test(activeApp)) return 'browsing';
  return 'unknown';
}

function heuristicAnalyze(hints: ScreenSummary | null): ScreenAnalysis {
  if (!hints) {
    return {
      timestamp: Date.now(),
      activeApp: 'Unknown',
      currentFile: null,
      visibleProject: null,
      userIntent: 'No screen data captured yet',
      taskType: 'unknown',
      confidence: 0.2,
      visibleSignals: ['No screen share active'],
      summary: 'Cortex cannot see the screen. Click "Start Screen Analysis" to give it visibility.',
      source: 'simulated',
    };
  }

  const tokens = hints.ocrTokens ?? [];
  let activeApp = hints.activeApp;
  if (activeApp === 'Unknown') {
    for (const [app, rx] of Object.entries(APP_KEYWORDS)) {
      if (rx.test(hints.activeTitle) || tokens.some((t) => rx.test(t))) {
        activeApp = app;
        break;
      }
    }
  }

  // currentFile: look for tokens that look like filenames.
  const fileToken = tokens.find((t) => /\.(tsx?|jsx?|py|md|swift|rs|go|java|css|html|json)$/i.test(t));
  const currentFile = fileToken ?? extractFileFromTitle(hints.activeTitle);

  // visibleProject: try the active title prefix (often "project · file") or first token.
  const projectFromTitle = hints.activeTitle.split(/[-—|·]/)[0]?.trim();
  const visibleProject = hints.inferredProject || projectFromTitle || null;

  const taskType = detectTaskType(activeApp, tokens);

  const visibleSignals: string[] = [];
  if (currentFile) visibleSignals.push(`File on screen: ${currentFile}`);
  if (activeApp !== 'Unknown') visibleSignals.push(`Active application: ${activeApp}`);
  if (taskType === 'debugging') visibleSignals.push('Error-related tokens detected (traceback / error / undefined)');
  if (taskType === 'coding') visibleSignals.push('Code constructs detected (function / const / import)');
  if (taskType === 'communicating') visibleSignals.push('Messaging interface and unread indicators');
  if (hints.tabCount > 8) visibleSignals.push(`Many tabs open (${hints.tabCount})`);
  if (hints.workflowState === 'switching') visibleSignals.push('Rapid context switching pattern');
  if (visibleSignals.length === 0) visibleSignals.push(`Workflow state: ${hints.workflowState}`);

  const userIntent =
    taskType === 'debugging'
      ? `Debugging an error in ${currentFile ?? activeApp}`
      : taskType === 'coding'
        ? `Writing or editing code${currentFile ? ` (${currentFile})` : ''}`
        : taskType === 'reading'
          ? `Reading reference material in ${activeApp}`
          : taskType === 'communicating'
            ? `Handling messages in ${activeApp}`
            : taskType === 'designing'
              ? `Working on a design in ${activeApp}`
              : taskType === 'meeting'
                ? `In a meeting via ${activeApp}`
                : `Working in ${activeApp}`;

  const summary =
    taskType === 'debugging'
      ? `User appears stuck on an error${currentFile ? ` in ${currentFile}` : ''}. Watching for repeated patterns.`
      : taskType === 'coding'
        ? `User is actively coding${currentFile ? ` in ${currentFile}` : ''}. Cortex will stay quiet to protect flow.`
        : `User is ${userIntent.toLowerCase()}.`;

  return {
    timestamp: Date.now(),
    activeApp,
    currentFile,
    visibleProject,
    userIntent,
    taskType,
    confidence: hints.confidence ?? 0.6,
    visibleSignals,
    summary,
    source: hints.source === 'simulated' ? 'simulated' : 'ocr_heuristic',
  };
}

function extractFileFromTitle(title: string): string | null {
  const m = title.match(/([A-Za-z0-9_.-]+\.(?:tsx?|jsx?|py|md|swift|rs|go|java|css|html|json))/i);
  return m ? m[1] : null;
}

// ============================================================
// Extras the spec asks us to expose, even if they wrap the same call.
// ============================================================

export async function extractCurrentTask(screen: ScreenSummary | null): Promise<ScreenAnalysis> {
  return analyzeScreenFrame({ summaryHints: screen ?? undefined });
}

export function detectActiveApp(analysis: ScreenAnalysis): string {
  return analysis.activeApp;
}

export function detectWorkContext(analysis: ScreenAnalysis): {
  taskType: TaskType;
  intent: string;
  project: string | null;
} {
  return {
    taskType: analysis.taskType,
    intent: analysis.userIntent,
    project: analysis.visibleProject,
  };
}

// ============================================================
// Helpers
// ============================================================

function finalize(
  partial: Partial<ScreenAnalysis>,
  source: ScreenAnalysis['source'],
  hints: ScreenSummary | null,
): ScreenAnalysis {
  const allowedTaskTypes: TaskType[] = [
    'coding',
    'debugging',
    'reading',
    'communicating',
    'designing',
    'browsing',
    'writing',
    'meeting',
    'unknown',
  ];
  const taskType = allowedTaskTypes.includes(partial.taskType as TaskType)
    ? (partial.taskType as TaskType)
    : 'unknown';
  return {
    timestamp: Date.now(),
    activeApp: (partial.activeApp ?? hints?.activeApp ?? 'Unknown').toString().slice(0, 64),
    currentFile: partial.currentFile ?? null,
    visibleProject: partial.visibleProject ?? hints?.inferredProject ?? null,
    userIntent: (partial.userIntent ?? 'Working on a task').toString().slice(0, 200),
    taskType,
    confidence: Math.max(0, Math.min(1, Number(partial.confidence ?? 0.5))),
    visibleSignals: Array.isArray(partial.visibleSignals)
      ? partial.visibleSignals.filter((s): s is string => typeof s === 'string').slice(0, 6)
      : [],
    summary: (partial.summary ?? '').toString().slice(0, 280),
    source,
  };
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    // Pull out the first balanced JSON object if the model wrapped it in prose.
    const start = text.indexOf('{');
    if (start === -1) return fallback;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
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
          try {
            return JSON.parse(text.slice(start, i + 1)) as T;
          } catch {
            return fallback;
          }
        }
      }
    }
    return fallback;
  }
}
