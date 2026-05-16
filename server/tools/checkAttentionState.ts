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
  parts.push(`offscreen ${offPct}% of last 60s`);
  parts.push(`stability=${m.focusStability}`);
  parts.push(`blink rate=${m.blinkRate.toFixed(1)}/min`);
  parts.push(`distracted for ${m.distractionDurationSeconds.toFixed(1)}s`);
  if (!m.faceDetected) parts.push('face not detected');
  if (m.source === 'simulated') parts.push('source=simulated (webcam unavailable)');
  return parts.join(' · ');
}

function expectedBenefit(m: AttentionMetrics): string {
  switch (m.interpretedState) {
    case 'Focused':
      return 'Confirms low intervention need; agent can hold position.';
    case 'Distracted':
      return 'Provides hard evidence to justify muting interrupts and engaging focus mode.';
    case 'Fatigued':
      return 'Justifies suggesting a short reset instead of more tools.';
    case 'Searching':
      return 'Justifies surfacing the current task or relevant doc, not adding load.';
    case 'Overstimulated':
      return 'Justifies a coordinated intervention bundle to collapse visual field.';
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
