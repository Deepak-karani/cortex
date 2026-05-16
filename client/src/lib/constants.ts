export const SERVER_URL =
  (import.meta as unknown as { env: { VITE_SERVER_URL?: string } }).env
    .VITE_SERVER_URL ?? 'http://localhost:4000';

export const COGNITIVE_STATE_LABEL: Record<string, string> = {
  in_flow: 'In Flow',
  focused: 'Focused',
  distracted: 'Distracted',
  fatigued: 'Fatigued',
  overloaded: 'Overloaded',
  unknown: 'Calibrating',
};

export const COGNITIVE_STATE_COPY: Record<string, string> = {
  in_flow: "You're in deep flow. Cortex is holding silent.",
  focused: 'Focus is steady. Nothing needs attention right now.',
  distracted: 'Your attention is drifting. Cortex is watching.',
  fatigued: 'Signs of fatigue. Consider a short reset.',
  overloaded: 'Cognitive load is high. Cortex recommends an intervention.',
  unknown: 'Bringing sensors online…',
};

export const COGNITIVE_STATE_ACCENT: Record<string, string> = {
  in_flow: '#76B900',
  focused: '#76B900',
  distracted: '#ffd86b',
  fatigued: '#a07bff',
  overloaded: '#ff5c7c',
  unknown: '#6e7aa3',
};
