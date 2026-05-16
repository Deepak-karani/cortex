import type { AttentionMetrics, ToolResult } from '../src/types';

/**
 * Snapshot of the latest attention metrics pushed by the browser client.
 * Kept here (not in the agent) so any tool can read it without cyclic imports.
 */
let latest: AttentionMetrics | null = null;

export function setLatestAttention(metrics: AttentionMetrics): void {
  latest = metrics;
}

export function getLatestAttention(): AttentionMetrics | null {
  return latest;
}

export function clearLatestAttention(): void {
  latest = null;
}

function summarize(m: AttentionMetrics): string {
  const offPct = Math.round(m.offscreenRatio60s * 100);
  const parts: string[] = [];
  parts.push(`interpreted=${m.interpretedState}`);
  parts.push(`gaze=${m.gazeDirection}`);
  parts.push(`headPose=${m.headPose}`);
  parts.push(`offscreen=${offPct}% last 60s`);
  parts.push(`stability=${m.focusStability}`);
  parts.push(`blinkRate=${m.blinkRate.toFixed(1)}/min`);
  if (m.distractionDurationSeconds > 1) {
    parts.push(`distracted ${m.distractionDurationSeconds.toFixed(1)}s`);
  }
  parts.push(`confidence=${m.confidence.toFixed(2)}`);
  if (!m.faceDetected) parts.push('face not detected');
  if (m.source === 'simulated') parts.push('source=simulated');
  return parts.join(' · ');
}

function expectedBenefit(m: AttentionMetrics): string {
  // Per spec section 5: each state maps to a specific intervention posture.
  switch (m.interpretedState) {
    case 'Focused':
      return 'Do not interrupt. User is in flow.';
    case 'Distracted':
      return 'Ask one short re-anchor question; avoid heavy interruption.';
    case 'Fatigued':
      return 'Suggest a short reset or Socratic question. Avoid dimming the monitor — user is tired, not hyperfocused.';
    case 'Searching':
      return 'Offer help by surfacing the relevant doc, but do not pile on more tools.';
    case 'Overstimulated':
      return 'Reduce notifications, mute Slack, and simplify the task queue.';
    case 'Unknown':
      return 'Attention signal is not trustworthy right now. Treat as biometrics-only.';
  }
}

export async function checkAttentionState(): Promise<ToolResult> {
  if (!latest) {
    return {
      toolName: 'check_attention_state',
      success: true,
      reason:
        'No attention data yet (webcam pipeline has not pushed a sample). Cannot infer gaze from biometrics alone.',
      expectedBenefit:
        'Avoids over-weighting biometrics when no attention evidence is available.',
      timestamp: Date.now(),
      payload: { attention: null },
    };
  }
  return {
    toolName: 'check_attention_state',
    success: true,
    reason: `Attention probe: ${summarize(latest)}.`,
    expectedBenefit: expectedBenefit(latest),
    timestamp: Date.now(),
    payload: { attention: latest },
  };
}
