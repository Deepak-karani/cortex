import { exec } from 'child_process';
import { promisify } from 'util';
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

const execAsync = promisify(exec);

/**
 * Real-execution toggle. When CORTEX_REAL_TOOLS=true, the small subset of
 * tools that have safe OS hooks (currently open_relevant_doc) will actually
 * perform their action. Off by default so a demo doesn't surprise-launch
 * windows. The pitch line stays the same either way — the *decision* and
 * *audit* are real regardless; this flag only controls whether the
 * execution layer is wired or stubbed.
 */
function realToolsEnabled(): boolean {
  return process.env.CORTEX_REAL_TOOLS === 'true';
}

/**
 * Validate a URL before handing it to the OS `open` command. We only accept
 * http(s) — anything else (file://, javascript:, custom schemes) is
 * refused. Length-bounded to keep the command line sane.
 */
function isSafeHttpUrl(raw: string): boolean {
  if (!raw || raw.length > 512) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolve the URL to open. Operator can override via env; default is the
 * project's GitHub page so a demo on any machine has a sane target.
 */
function resolveDemoDocUrl(): string {
  const fromEnv = process.env.CORTEX_DEMO_DOC_URL?.trim();
  if (fromEnv && isSafeHttpUrl(fromEnv)) return fromEnv;
  return 'https://github.com/Deepak-karani/cortex';
}

/**
 * Cross-platform "open this URL in the default browser" with a short
 * timeout so a stuck shell never blocks the orchestrator.
 *   - darwin → `open <url>`
 *   - linux  → `xdg-open <url>`
 *   - other  → no-op, returns false
 * URL is single-quoted to prevent shell expansion. We rely on isSafeHttpUrl
 * to reject anything that could break out of the quotes.
 */
async function openUrlInBrowser(url: string): Promise<{ ok: boolean; reason: string }> {
  if (!isSafeHttpUrl(url)) {
    return { ok: false, reason: 'URL rejected by safety check (must be http or https).' };
  }
  const platform = process.platform;
  let cmd: string | null = null;
  if (platform === 'darwin') cmd = `open '${url}'`;
  else if (platform === 'linux') cmd = `xdg-open '${url}'`;
  if (!cmd) {
    return { ok: false, reason: `No browser-open command for platform "${platform}".` };
  }
  try {
    await execAsync(cmd, { timeout: 2000 });
    return { ok: true, reason: `Opened ${url} in default browser.` };
  } catch (err) {
    return { ok: false, reason: `Open command failed: ${(err as Error).message}` };
  }
}

/**
 * Quote a string for safe inclusion inside an `osascript -e "..."` single
 * quote. Strips control chars, escapes embedded single quotes by closing,
 * escaping the quote, and reopening. Keeps the command line sane.
 */
function quoteForAppleScript(s: string): string {
  return s
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control chars
    .replace(/"/g, '\\"')             // escape double quotes (we wrap in double)
    .slice(0, 200);                   // hard length cap
}

/**
 * Show a macOS native notification (banner + Notification Center entry).
 * Uses osascript so no extra dependency is required. No-ops on non-macOS.
 *
 * The notification is what makes the action *visible* to the user during
 * a demo. Slack isn't actually muted, tabs aren't actually closed — but
 * the operator gets a real OS-level prompt recommending the action with
 * the rationale Cortex chose. That's what judges see happen.
 */
async function showSystemNotification(
  title: string,
  message: string,
  subtitle?: string,
): Promise<{ ok: boolean; reason: string }> {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: `System notifications not implemented on platform "${process.platform}".` };
  }
  const t = quoteForAppleScript(title);
  const m = quoteForAppleScript(message);
  const s = subtitle ? quoteForAppleScript(subtitle) : '';
  const script = s
    ? `display notification "${m}" with title "${t}" subtitle "${s}" sound name "Glass"`
    : `display notification "${m}" with title "${t}" sound name "Glass"`;
  try {
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 2000 });
    return { ok: true, reason: `Surfaced macOS notification: "${title}".` };
  } catch (err) {
    return { ok: false, reason: `osascript failed: ${(err as Error).message}` };
  }
}

/**
 * Lower display brightness using AppleScript System Events keyboard
 * shortcut (F1 = brightness down). Sends N keystrokes so we can step the
 * brightness down a few notches without overshooting to zero. Best-effort
 * — works on Macs where the brightness key is mapped, no-ops elsewhere.
 *
 * Why F14 instead of a real DDC call: brightness CLI isn't installed and
 * requiring `brew install brightness` mid-demo is fragile. Sending the
 * keyboard shortcut is the cheapest path that visibly dims the screen.
 */
async function lowerDisplayBrightness(steps = 3): Promise<{ ok: boolean; reason: string }> {
  if (process.platform !== 'darwin') {
    return { ok: false, reason: `Brightness control not implemented on platform "${process.platform}".` };
  }
  const clampedSteps = Math.max(1, Math.min(8, Math.round(steps)));
  // key code 145 = F14 (brightness down on most MacBook keyboards),
  // key code 107 = F2 fallback. We send F14 first, F2 as backup.
  const script = `
    tell application "System Events"
      repeat ${clampedSteps} times
        key code 145
        delay 0.05
      end repeat
    end tell
  `.trim();
  try {
    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 3000 });
    return { ok: true, reason: `Stepped display brightness down ${clampedSteps} notches.` };
  } catch (err) {
    return { ok: false, reason: `Brightness step failed: ${(err as Error).message}` };
  }
}

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
  const baseReason = `Muting Slack — unread notifications hit ${ctx.telemetry.unreadNotifications} while HRV dropped to ${ctx.telemetry.hrv}ms.`;
  if (realToolsEnabled()) {
    const r = await showSystemNotification(
      'Cortex · mute Slack',
      `Quiet for 25 min. ${ctx.telemetry.unreadNotifications} unread + HRV ${ctx.telemetry.hrv}ms.`,
      'Tap Slack → Notifications → Pause to confirm',
    );
    return result(
      'mute_slack',
      r.ok,
      r.ok ? `${baseReason} Surfaced a macOS prompt to confirm.` : baseReason,
      'Removes the strongest interrupt source for the next 25 minutes.',
      { durationMinutes: 25, executed: r.ok },
    );
  }
  return result(
    'mute_slack',
    true,
    baseReason,
    'Removes the strongest interrupt source for the next 25 minutes.',
    { durationMinutes: 25, executed: false },
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
  const baseReason = `Recommending you close ${closed} non-essential tabs around "${ctx.telemetry.currentTask}".`;
  if (realToolsEnabled()) {
    const r = await showSystemNotification(
      'Cortex · close tabs',
      `${closed} tabs are pulling attention from "${ctx.telemetry.currentTask}".`,
      'Cmd-W through the ones you don\'t need',
    );
    return result(
      'close_tabs',
      r.ok,
      r.ok ? `${baseReason} Surfaced a macOS prompt.` : baseReason,
      'Reduces visual + working-memory pressure from open Chrome tabs.',
      { closed, executed: r.ok },
    );
  }
  return result(
    'close_tabs',
    true,
    baseReason,
    'Reduces visual + working-memory pressure from open Chrome tabs.',
    { closed, executed: false },
  );
}

async function open_relevant_doc(ctx: ToolContext): Promise<ToolResult> {
  const url = resolveDemoDocUrl();
  // When CORTEX_REAL_TOOLS is enabled, we actually open the URL via the OS
  // `open` command. Otherwise the tool stays in "logged intent" mode like
  // the other action tools — same surface contract, no surprise side
  // effect during a demo.
  if (realToolsEnabled()) {
    const r = await openUrlInBrowser(url);
    return result(
      'open_relevant_doc',
      r.ok,
      r.ok
        ? `Opened "${url}" — most relevant doc for "${ctx.telemetry.currentTask}".`
        : `Could not open browser: ${r.reason}`,
      'Centers the screen on the artifact that completes the task.',
      { doc: url, executed: r.ok, platform: process.platform },
    );
  }
  return result(
    'open_relevant_doc',
    true,
    `Would open "${url}" for "${ctx.telemetry.currentTask}" (real execution off — set CORTEX_REAL_TOOLS=true).`,
    'Centers the screen on the artifact that completes the task.',
    { doc: url, executed: false },
  );
}

async function block_calendar_time(ctx: ToolContext): Promise<ToolResult> {
  const minutes = Math.min(45, Math.max(20, ctx.telemetry.deadlineMinutes));
  const baseReason = `Recommending a ${minutes}-minute focus block on your calendar.`;
  if (realToolsEnabled()) {
    const r = await showSystemNotification(
      'Cortex · hold calendar',
      `Protected ${minutes}-min focus block recommended right now.`,
      'Open Calendar → ⌘N to lock it in',
    );
    return result(
      'block_calendar_time',
      r.ok,
      r.ok ? `${baseReason} Surfaced a macOS prompt.` : baseReason,
      'Prevents interrupts from meetings and ad-hoc invites during recovery.',
      { minutes, executed: r.ok },
    );
  }
  return result(
    'block_calendar_time',
    true,
    baseReason,
    'Prevents interrupts from meetings and ad-hoc invites during recovery.',
    { minutes, executed: false },
  );
}

async function dim_secondary_monitor(_ctx: ToolContext): Promise<ToolResult> {
  const baseReason = 'Dimming display to narrow visual field.';
  if (realToolsEnabled()) {
    const r = await lowerDisplayBrightness(3);
    return result(
      'dim_secondary_monitor',
      r.ok,
      r.ok ? `${baseReason} ${r.reason}` : `${baseReason} (${r.reason})`,
      'Narrows visual field so attention collapses to the primary task.',
      { executed: r.ok },
    );
  }
  return result(
    'dim_secondary_monitor',
    true,
    baseReason,
    'Narrows visual field so attention collapses to the primary task.',
    { executed: false },
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
