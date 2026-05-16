import type { AttentionMetrics, CognitiveAssessment, CognitiveState, Telemetry } from '../src/types';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function scoreCognitiveLoad(t: Telemetry, attention?: AttentionMetrics | null): CognitiveAssessment {
  // HRV: lower HRV → higher load. Normal range roughly 20-90ms.
  const hrvFactor = clamp((70 - t.hrv) / 50, 0, 1); // 1 when HRV=20, 0 when HRV>=70

  // Heart rate: rising above resting 70 → higher load.
  const hrFactor = clamp((t.heartRate - 70) / 50, 0, 1); // 1 when HR=120

  // Context switching pressure.
  const switchFactor = clamp(t.contextSwitches / 25, 0, 1);

  // Notification pressure.
  const notifFactor = clamp(t.unreadNotifications / 30, 0, 1);

  // Deadline proximity (closer → more load). 60 min away = 0, 0 min = 1.
  const deadlineFactor = clamp((60 - t.deadlineMinutes) / 60, 0, 1);

  // Typing error rate.
  const errorFactor = clamp(t.errorRate / 0.15, 0, 1);

  // ---- Attention factor ----
  // attentionScore is 0-100 where higher = better focus. We want a 0-1 factor
  // where higher = more load (i.e., worse attention).
  let attentionFactor = 0;
  if (attention) {
    const inverseFocus = clamp((70 - attention.attentionScore) / 70, 0, 1);
    const offscreenContribution = clamp(attention.offscreenRatio60s, 0, 1);
    const instabilityContribution = clamp((70 - attention.focusStability) / 70, 0, 1);
    attentionFactor = clamp(
      inverseFocus * 0.5 + offscreenContribution * 0.3 + instabilityContribution * 0.2,
      0,
      1,
    );
  }

  // Weighted blend. If attention is present, redistribute weights so it
  // contributes meaningfully without dwarfing biometrics.
  let raw: number;
  if (attention) {
    raw =
      hrvFactor * 0.2 +
      hrFactor * 0.15 +
      switchFactor * 0.12 +
      notifFactor * 0.12 +
      deadlineFactor * 0.12 +
      errorFactor * 0.09 +
      attentionFactor * 0.2;
  } else {
    raw =
      hrvFactor * 0.25 +
      hrFactor * 0.2 +
      switchFactor * 0.15 +
      notifFactor * 0.15 +
      deadlineFactor * 0.15 +
      errorFactor * 0.1;
  }

  const cognitiveLoadScore = Math.round(clamp(raw * 100, 0, 100));

  let state: CognitiveState;
  if (cognitiveLoadScore < 40) state = 'Green';
  else if (cognitiveLoadScore <= 70) state = 'Yellow';
  else state = 'Red';

  const drivers: string[] = [];
  if (hrvFactor > 0.5) drivers.push(`HRV dropped to ${t.hrv}ms`);
  if (hrFactor > 0.5) drivers.push(`heart rate climbing to ${t.heartRate}bpm`);
  if (switchFactor > 0.5) drivers.push(`${t.contextSwitches} context switches/min`);
  if (notifFactor > 0.5) drivers.push(`${t.unreadNotifications} unread notifications`);
  if (deadlineFactor > 0.6) drivers.push(`deadline ${t.deadlineMinutes}m away`);
  if (errorFactor > 0.5) drivers.push(`typing error rate at ${(t.errorRate * 100).toFixed(0)}%`);

  if (attention) {
    if (attention.offscreenRatio60s > 0.3)
      drivers.push(`gaze offscreen ${Math.round(attention.offscreenRatio60s * 100)}% of last minute`);
    if (attention.focusStability < 40)
      drivers.push(`focus stability ${attention.focusStability}/100`);
    if (attention.gazeSwitchRate > 25)
      drivers.push(`rapid gaze switching (${Math.round(attention.gazeSwitchRate)}/min)`);
    if (!attention.faceDetected)
      drivers.push('face not detected at camera');
    if (attention.interpretedState === 'Fatigued')
      drivers.push(`fatigue signs (blink rate ${attention.blinkRate.toFixed(1)}/min)`);
    if (attention.interpretedState === 'Overstimulated')
      drivers.push('overstimulated gaze pattern');
  }

  const explanation =
    drivers.length > 0
      ? `Load ${cognitiveLoadScore} (${state}) driven by ${drivers.join(', ')}.`
      : `Load ${cognitiveLoadScore} (${state}) — steady state.`;

  return {
    timestamp: t.timestamp,
    cognitiveLoadScore,
    state,
    explanation,
  };
}
