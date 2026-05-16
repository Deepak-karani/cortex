import type { FutureTimelinePoint, FutureTimelines, Telemetry } from '../src/types';

const HORIZON = 12; // seconds projected forward

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function simulateFutures(current: Telemetry): FutureTimelines {
  const noInterventionPoints: FutureTimelinePoint[] = [];
  const interventionPoints: FutureTimelinePoint[] = [];

  let hrA = current.heartRate;
  let hrvA = current.hrv;
  let csA = current.contextSwitches;
  let completionA = 0.55;
  let overloadA = clamp((current.heartRate - 70) / 50 + (50 - current.hrv) / 50, 0.1, 0.95);

  let hrB = current.heartRate;
  let hrvB = current.hrv;
  let csB = current.contextSwitches;
  let completionB = 0.55;
  let overloadB = overloadA;

  for (let t = 0; t < HORIZON; t++) {
    // Timeline A: no intervention — degrading.
    hrA = clamp(hrA + 1.6, 60, 145);
    hrvA = clamp(hrvA - 1.4, 12, 95);
    csA = clamp(csA + 0.8, 0, 40);
    completionA = clamp(completionA - 0.035, 0.05, 1);
    overloadA = clamp(overloadA + 0.04, 0, 1);

    // Timeline B: Cortex intervenes — recovering.
    hrB = clamp(hrB - 1.2, 55, 145);
    hrvB = clamp(hrvB + 1.8, 12, 95);
    csB = clamp(csB - 1.0, 0, 40);
    completionB = clamp(completionB + 0.04, 0.05, 1);
    overloadB = clamp(overloadB - 0.06, 0, 1);

    noInterventionPoints.push({
      t,
      heartRate: Math.round(hrA),
      hrv: Math.round(hrvA),
      contextSwitches: Math.round(csA),
      completionChance: Number(completionA.toFixed(2)),
      overloadRisk: Number(overloadA.toFixed(2)),
    });
    interventionPoints.push({
      t,
      heartRate: Math.round(hrB),
      hrv: Math.round(hrvB),
      contextSwitches: Math.round(csB),
      completionChance: Number(completionB.toFixed(2)),
      overloadRisk: Number(overloadB.toFixed(2)),
    });
  }

  const deltaRecovery = Math.round(
    (interventionPoints.at(-1)!.completionChance - noInterventionPoints.at(-1)!.completionChance) * 100,
  );

  return {
    timestamp: Date.now(),
    noIntervention: {
      label: 'Timeline A — No Intervention',
      summary: `HR climbs to ${noInterventionPoints.at(-1)!.heartRate}bpm, HRV falls to ${
        noInterventionPoints.at(-1)!.hrv
      }ms, overload risk peaks at ${Math.round(noInterventionPoints.at(-1)!.overloadRisk * 100)}%.`,
      points: noInterventionPoints,
    },
    intervention: {
      label: 'Timeline B — Cortex Intervenes',
      summary: `Recovery improves completion chance by ${deltaRecovery} points; HRV recovers to ${
        interventionPoints.at(-1)!.hrv
      }ms.`,
      points: interventionPoints,
    },
  };
}
