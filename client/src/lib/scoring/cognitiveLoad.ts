import { clamp } from '../formatters';

export type CognitiveStateName =
  | 'in_flow'
  | 'focused'
  | 'distracted'
  | 'fatigued'
  | 'overloaded'
  | 'unknown';

export interface CognitiveInput {
  bpm: number | null;
  hrv: number | null;
  attentionScore: number | null;
  fatigueSignal: number; // 0..1, derived from blink rate / attention.interpretedState=='Fatigued'
  contextSwitchesPerMinute: number;
  repeatedErrorCount: number;
  notificationCount: number;
  timeStuckSeconds: number;
}

export interface CognitiveOutput {
  loadScore: number;
  state: CognitiveStateName;
  confidence: number;
  explanation: string;
  recommendation: string;
}

/**
 * Transparent multi-signal load scoring. Each contributing signal is bounded
 * 0..1, weighted, summed, then mapped into 0..100. The explanation enumerates
 * which signals fired the most.
 */
export function computeCognitiveLoad(input: CognitiveInput): CognitiveOutput {
  const drivers: { name: string; weight: number; value: number; tag: string }[] = [];

  // HR contribution: > 70bpm starts adding load.
  if (input.bpm != null) {
    const v = clamp((input.bpm - 70) / 50, 0, 1);
    drivers.push({ name: 'heart rate', weight: 0.15, value: v, tag: `${input.bpm} bpm` });
  }
  // HRV contribution: lower HRV → higher load.
  if (input.hrv != null) {
    const v = clamp((70 - input.hrv) / 50, 0, 1);
    drivers.push({ name: 'HRV', weight: 0.15, value: v, tag: `${input.hrv} ms` });
  }
  // Attention: inverse of focus.
  if (input.attentionScore != null) {
    const v = clamp((70 - input.attentionScore) / 70, 0, 1);
    drivers.push({ name: 'attention', weight: 0.2, value: v, tag: `${input.attentionScore}/100` });
  }
  // Fatigue signal direct.
  drivers.push({ name: 'fatigue signal', weight: 0.1, value: clamp(input.fatigueSignal, 0, 1), tag: '' });
  // Context switching pressure.
  drivers.push({
    name: 'context switching',
    weight: 0.15,
    value: clamp(input.contextSwitchesPerMinute / 22, 0, 1),
    tag: `${input.contextSwitchesPerMinute}/min`,
  });
  // Repeated error loops.
  drivers.push({
    name: 'repeated errors',
    weight: 0.1,
    value: clamp(input.repeatedErrorCount / 8, 0, 1),
    tag: `${input.repeatedErrorCount}×`,
  });
  // Notification pressure.
  drivers.push({
    name: 'notifications',
    weight: 0.1,
    value: clamp(input.notificationCount / 25, 0, 1),
    tag: `${input.notificationCount}`,
  });
  // Time stuck.
  drivers.push({
    name: 'time stuck',
    weight: 0.05,
    value: clamp(input.timeStuckSeconds / 600, 0, 1),
    tag: `${Math.round(input.timeStuckSeconds)}s`,
  });

  const totalWeight = drivers.reduce((a, d) => a + d.weight, 0);
  const raw = drivers.reduce((a, d) => a + d.value * d.weight, 0) / Math.max(0.0001, totalWeight);
  const loadScore = Math.round(clamp(raw, 0, 1) * 100);

  // Confidence: more signals contributing → higher.
  const signalsAvailable = [
    input.bpm != null,
    input.hrv != null,
    input.attentionScore != null,
    input.contextSwitchesPerMinute > 0,
  ].filter(Boolean).length;
  const confidence = clamp(0.45 + signalsAvailable * 0.13, 0.4, 0.95);

  // Map score → state, with overrides for clear single-signal cases.
  let state: CognitiveStateName;
  if (input.attentionScore != null && input.attentionScore < 50 && input.fatigueSignal > 0.6) {
    state = 'fatigued';
  } else if (input.attentionScore != null && input.attentionScore < 55 && loadScore < 70) {
    state = 'distracted';
  } else if (loadScore < 30) {
    state = 'in_flow';
  } else if (loadScore < 50) {
    state = 'focused';
  } else if (loadScore < 70) {
    state = 'distracted';
  } else if (loadScore < 85) {
    state = 'fatigued';
  } else {
    state = 'overloaded';
  }

  // Pick top three drivers for the explanation.
  const topDrivers = [...drivers]
    .filter((d) => d.value > 0.25)
    .sort((a, b) => b.value * b.weight - a.value * a.weight)
    .slice(0, 3)
    .map((d) => (d.tag ? `${d.name} (${d.tag})` : d.name));

  const explanation =
    topDrivers.length === 0
      ? 'Signals are calm. Cortex is monitoring.'
      : `Driven by ${topDrivers.join(', ')}.`;

  const recommendation = recommendFor(state, input);

  return { loadScore, state, confidence, explanation, recommendation };
}

function recommendFor(state: CognitiveStateName, input: CognitiveInput): string {
  switch (state) {
    case 'in_flow':
      return 'Keep going. Cortex will protect this focus block.';
    case 'focused':
      return 'On track. No intervention needed.';
    case 'distracted':
      return input.notificationCount > 18
        ? 'Mute Slack for the next 25 minutes.'
        : 'Re-anchor on one task with a Socratic question.';
    case 'fatigued':
      return 'Take a 5-minute reset before the next push.';
    case 'overloaded':
      return 'Start a 25-minute Focus Sprint and silence interrupts.';
    default:
      return 'Bring your sensors online to get a recommendation.';
  }
}
