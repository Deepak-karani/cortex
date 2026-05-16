// Stopwords aggressively filtered. We never persist or send raw OCR text —
// only a deduped, lowercased, length-bounded token list.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'have', 'has',
  'are', 'was', 'were', 'will', 'would', 'should', 'could', 'about',
  'into', 'over', 'under', 'than', 'then', 'them', 'their', 'there',
  'what', 'when', 'where', 'which', 'while', 'your', 'yours', 'you',
  'not', 'but', 'all', 'any', 'can', 'one', 'two', 'three', 'now',
  'new', 'old', 'see', 'use', 'get', 'set', 'app', 'tab',
]);

const APP_HINTS: Record<string, RegExp> = {
  'VS Code': /\b(vscode|visual\s*studio\s*code|cortex_2|src\/|\.ts|\.tsx|tsx|tsconfig)\b/i,
  'Chrome': /\b(http|https|google\.com|stackoverflow|github\.com|search|chrome)\b/i,
  'Slack': /\b(slack|huddle|workspace|channel|dm|thread)\b/i,
  'Figma': /\b(figma|frame|component|prototype|design)\b/i,
  'Terminal': /\b(npm|yarn|pnpm|bash|zsh|sudo|brew|exit code|traceback)\b/i,
  'Notion': /\b(notion|database|workspace|page|toggle)\b/i,
  'Linear': /\b(linear|cycle|backlog|priority|estimate)\b/i,
  'Gmail': /\b(inbox|unread|compose|gmail|reply all)\b/i,
};

const INTENT_HINTS: { rx: RegExp; intent: string; workflow: 'debugging' | 'searching' | 'communicating' | 'flow' | 'switching' }[] = [
  { rx: /\b(error|traceback|undefined|typeerror|cannot|failed|exception)\b/i, intent: 'Debugging an error', workflow: 'debugging' },
  { rx: /\b(how to|why does|fix|stackoverflow|google search)\b/i, intent: 'Researching a solution', workflow: 'searching' },
  { rx: /\b(unread|reply|message|@)\b/i, intent: 'Communicating with team', workflow: 'communicating' },
  { rx: /\b(function|const|return|import|export|class)\b/i, intent: 'Writing or reading code', workflow: 'flow' },
];

export interface TokenizeOutput {
  tokens: string[];
  inferredApp: string;
  inferredIntent: string;
  inferredWorkflow: 'flow' | 'searching' | 'switching' | 'debugging' | 'communicating' | 'idle';
}

export function tokenizeOcr(rawText: string): TokenizeOutput {
  // Strip obviously personal content patterns BEFORE we even consider tokens.
  // Emails, phone-like numerics, long digit strings are removed.
  const clean = rawText
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/[^A-Za-z0-9\s.\-_/]/g, ' ');

  // Token candidates.
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const piece of clean.split(/\s+/)) {
    const t = piece.toLowerCase().trim();
    if (t.length < 3 || t.length > 24) continue;
    if (STOPWORDS.has(t)) continue;
    if (/^[\d.]+$/.test(t)) continue; // pure numbers
    if (seen.has(t)) continue;
    seen.add(t);
    tokens.push(t);
    if (tokens.length >= 24) break;
  }

  // App inference from the *original* text (case-sensitive cues sometimes matter).
  let inferredApp = 'Unknown';
  let appScore = 0;
  for (const [app, rx] of Object.entries(APP_HINTS)) {
    const matches = (rawText.match(rx) ?? []).length;
    if (matches > appScore) {
      appScore = matches;
      inferredApp = app;
    }
  }

  // Intent + workflow.
  let inferredIntent = 'Working on a task';
  let inferredWorkflow: TokenizeOutput['inferredWorkflow'] = 'flow';
  for (const hint of INTENT_HINTS) {
    if (hint.rx.test(rawText)) {
      inferredIntent = hint.intent;
      inferredWorkflow = hint.workflow;
      break;
    }
  }

  return { tokens, inferredApp, inferredIntent, inferredWorkflow };
}

export function hashTokens(tokens: string[]): string {
  // Lightweight FNV-1a hash — not crypto, just a fingerprint for de-dup.
  let h = 0x811c9dc5;
  const joined = tokens.join(' ');
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
