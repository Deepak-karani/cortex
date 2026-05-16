import type { ToolResult } from '../src/types';
import { getLatestScreenAnalysis } from '../vision/screenAnalyzer';

export async function analyzeScreenContext(): Promise<ToolResult> {
  const a = getLatestScreenAnalysis();
  if (!a) {
    return {
      toolName: 'analyze_screen_context',
      success: true,
      reason:
        'No screen analysis available yet. User has not started Screen Analysis, or no frame has been processed.',
      expectedBenefit: 'Confirms Cortex should not assume task context.',
      timestamp: Date.now(),
      payload: { analysis: null },
    };
  }
  const file = a.currentFile ? ` (${a.currentFile})` : '';
  const project = a.visibleProject ? ` in project "${a.visibleProject}"` : '';
  return {
    toolName: 'analyze_screen_context',
    success: true,
    reason: `User is ${a.userIntent.toLowerCase()}${file}${project}. Task type: ${a.taskType}. ${a.summary}`,
    expectedBenefit: posture(a.taskType),
    timestamp: Date.now(),
    payload: { analysis: a },
  };
}

function posture(taskType: string): string {
  switch (taskType) {
    case 'debugging':
      return 'User is stuck. Prefer ask_socratic over heavy interrupts.';
    case 'coding':
      return 'User is in flow. Hold position unless biometrics demand action.';
    case 'reading':
      return 'User is gathering information. Avoid interrupting.';
    case 'communicating':
      return 'External demand is active. mute_slack may be appropriate.';
    case 'meeting':
      return 'User is in conversation. Defer all interventions.';
    case 'designing':
      return 'Creative work. Protect focus.';
    case 'writing':
      return 'Deep writing. Protect focus.';
    default:
      return 'Treat with biometric-only reasoning.';
  }
}
