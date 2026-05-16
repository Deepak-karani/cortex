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

// UI chrome / OCR noise. Tesseract reliably hallucinates these from menu
// bars, icons, dotted borders, and small unicode glyphs. Dropping them keeps
// the Current Task panel readable.
const UI_NOISE = new Set([
  'file', 'edit', 'view', 'go', 'help', 'window', 'tools', 'run', 'debug',
  'terminal', 'menu', 'home', 'back', 'forward', 'reload', 'refresh',
  'close', 'minimize', 'maximize', 'search', 'settings', 'preferences',
  'cancel', 'ok', 'okay', 'yes', 'no', 'done', 'save', 'open',
  'untitled', 'document', 'page', 'pages', 'tab', 'tabs', 'item', 'items',
  'lll', 'iii', 'ooo', 'xxx', 'aaa', 'nnn', 'mmm',
  'am', 'pm', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
]);

// A token is "wordlike" if it looks like a real word a human wrote, not OCR
// confetti. We allow letters, digits, dots, slashes, hyphens, underscores;
// reject anything else, anything mostly-digits, or anything with too few
// vowels (Tesseract's classic "consonant soup" failure mode).
function isWordlike(t: string): boolean {
  if (!/^[a-z0-9._/\-]+$/.test(t)) return false;
  if (/^[\d.]+$/.test(t)) return false; // pure numbers / versions
  if (/^[0-9]/.test(t) && !/[a-z]/.test(t)) return false; // starts numeric, no letters
  const letters = t.replace(/[^a-z]/g, '');
  if (letters.length < 3) return false; // need at least 3 letters
  // Vowel check — but spare known programming tokens (e.g. "fn", "rx") via
  // the length floor above. Allow tokens with letters that contain at least
  // one vowel OR look like a known code construct (.ts / src/ etc).
  const hasVowel = /[aeiouy]/.test(letters);
  const looksCode = /[._/]/.test(t);
  if (!hasVowel && !looksCode) return false;
  // Reject anything where one letter repeats > 60% (e.g. "llllo", "aaabb").
  const counts: Record<string, number> = {};
  for (const ch of letters) counts[ch] = (counts[ch] ?? 0) + 1;
  const maxRepeat = Math.max(...Object.values(counts));
  if (maxRepeat / letters.length > 0.6) return false;
  return true;
}

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
    const t = piece.toLowerCase().trim().replace(/^[.\-_/]+|[.\-_/]+$/g, '');
    if (t.length < 3 || t.length > 24) continue;
    if (STOPWORDS.has(t)) continue;
    if (UI_NOISE.has(t)) continue;
    if (!isWordlike(t)) continue;
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
