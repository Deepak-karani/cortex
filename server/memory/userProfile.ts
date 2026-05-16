/**
 * Per-user profile aggregation.
 *
 * A UserProfile is a pure projection of a user's MemoryRecord history into
 * the signals that matter for personalization: which drivers most often
 * push *this* user into overload, which interventions actually pulled them
 * back, and the cadence of recovery. The profile feeds the Oracle prompt as
 * context so Nemotron's Socratic question lands as "Cortex knows this
 * user" instead of "Cortex knows a generic developer".
 *
 * Nothing here is independently persisted — recompute on demand from memory.
 */

import type { MemoryRecord, UserProfile } from '../src/types';
import { defaultUserId, loadMemories } from './memoryStore';
import { getAppStressStats } from './appContextTracker';

// Interventions we count as "active" — `do_nothing`, `recall_memory`, and
// `simulate_futures` are introspection, not action, so they shouldn't
// distort the success-rate math.
const PASSIVE_INTERVENTIONS = new Set(['do_nothing', 'recall_memory', 'simulate_futures']);

function countTriggers(records: MemoryRecord[]): { trigger: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const rec of records) {
    // Drivers field is a richer signal when present (newer episodes).
    // Older records only carry the pattern summary — extract from there.
    const drivers = rec.drivers && rec.drivers.length > 0
      ? rec.drivers
      : extractDriversFromSummary(rec.patternSummary);
    for (const d of drivers) {
      const key = canonicalizeTrigger(d);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([trigger, count]) => ({ trigger, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function extractDriversFromSummary(summary: string): string[] {
  // The summary string is built like:
  //   "Red episode: HRV bottomed near 22ms, HR peaked, notifications spiked."
  // We pluck out the comma-separated driver phrases after the colon.
  const colonIdx = summary.indexOf(':');
  if (colonIdx === -1) return [];
  return summary
    .slice(colonIdx + 1)
    .split(/[,.]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function canonicalizeTrigger(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('hrv')) return 'HRV drop';
  if (s.includes('heart rate') || s.includes('hr ')) return 'Heart rate spike';
  if (s.includes('context switch')) return 'Context switching';
  if (s.includes('notification')) return 'Notification overload';
  if (s.includes('deadline')) return 'Deadline pressure';
  if (s.includes('typing')) return 'Typing stall';
  if (s.includes('error')) return 'Error churn';
  if (s.includes('gaze') || s.includes('offscreen')) return 'Gaze drift';
  if (s.includes('focus')) return 'Focus instability';
  if (s.includes('fatigue') || s.includes('blink')) return 'Fatigue';
  if (s.includes('overstimul')) return 'Overstimulation';
  return raw.slice(0, 40);
}

function computeInterventionStats(records: MemoryRecord[]): UserProfile['interventionStats'] {
  const tally = new Map<string, { tried: number; recovered: number }>();
  for (const rec of records) {
    for (const name of rec.interventions) {
      if (PASSIVE_INTERVENTIONS.has(name)) continue;
      const t = tally.get(name) ?? { tried: 0, recovered: 0 };
      t.tried += 1;
      // "Recovered" means HRV came back and the episode resolved to Green.
      if (rec.hrvRecovered) t.recovered += 1;
      tally.set(name, t);
    }
  }
  return [...tally.entries()]
    .map(([intervention, t]) => ({
      intervention,
      tried: t.tried,
      recovered: t.recovered,
      successRate: t.tried === 0 ? 0 : t.recovered / t.tried,
    }))
    .sort((a, b) => {
      // Prefer interventions with high success rate AND meaningful sample size.
      const aScore = a.successRate * Math.min(a.tried, 5);
      const bScore = b.successRate * Math.min(b.tried, 5);
      return bScore - aScore;
    });
}

function describeDominantPattern(
  triggers: UserProfile['topTriggers'],
  bestIntervention: string | null,
  avgRecovery: number | null,
): string | null {
  if (triggers.length === 0) return null;
  const top = triggers[0].trigger.toLowerCase();
  const second = triggers[1]?.trigger.toLowerCase();
  const pairing = second ? `${top} + ${second}` : top;
  const recoveryNote = avgRecovery
    ? `recovers in ~${Math.round(avgRecovery / 60)}min`
    : 'no recovery baseline yet';
  const interventionNote = bestIntervention
    ? `${bestIntervention} has been the most reliable lift`
    : 'no intervention pattern yet';
  return `Overload typically driven by ${pairing}; ${recoveryNote}; ${interventionNote}.`;
}

/**
 * Build a profile from records already in memory. Exposed for callers that
 * already have the records loaded (e.g. tests, or routes that just fetched).
 *
 * Sync version — for the legacy callers that don't have access to the
 * async app-context tracker. Returns empty app-stress data.
 */
export function buildUserProfile(userId: string, records: MemoryRecord[]): UserProfile {
  const topTriggers = countTriggers(records);
  const interventionStats = computeInterventionStats(records);
  const bestIntervention =
    interventionStats.length > 0 && interventionStats[0].tried >= 2
      ? interventionStats[0].intervention
      : null;
  const recoveryTimes = records
    .filter((r) => r.recoveryTimeSeconds > 0)
    .map((r) => r.recoveryTimeSeconds);
  const averageRecoverySeconds =
    recoveryTimes.length === 0
      ? null
      : Math.round(recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length);
  const dominantPattern = describeDominantPattern(topTriggers, bestIntervention, averageRecoverySeconds);
  const lastEpisodeAt = records.length === 0 ? null : Math.max(...records.map((r) => r.timestamp));

  return {
    userId,
    episodeCount: records.length,
    topTriggers,
    interventionStats,
    bestIntervention,
    averageRecoverySeconds,
    dominantPattern,
    lastEpisodeAt,
    appStress: [],
    riskyApps: [],
  };
}

/** Load profile straight from memory store for the requested user. */
export async function getUserProfile(userId?: string): Promise<UserProfile> {
  const id = userId ?? defaultUserId();
  const records = await loadMemories(id);
  const base = buildUserProfile(id, records);
  // Fold in per-app stress correlation — derived from the screen pipeline,
  // not from memory records, so we attach it as a separate enrichment pass.
  const appStress = await getAppStressStats(id);
  base.appStress = appStress;
  base.riskyApps = appStress.filter((a) => a.signal === 'risky').map((a) => a.app);
  return base;
}

/**
 * Compact one-paragraph rendering of a profile, suitable for inclusion in an
 * LLM prompt. Keeps it short so it doesn't dominate the Oracle's input.
 */
export function renderProfileForPrompt(profile: UserProfile): string {
  if (profile.episodeCount === 0 && profile.appStress.length === 0) {
    return 'No prior episodes or app patterns recorded for this user — no personalization signal yet.';
  }
  const triggers = profile.topTriggers
    .slice(0, 3)
    .map((t) => `${t.trigger} (${t.count}×)`)
    .join(', ');
  const best = profile.bestIntervention
    ? `${profile.bestIntervention} (${Math.round(
        (profile.interventionStats.find((i) => i.intervention === profile.bestIntervention)?.successRate ?? 0) * 100,
      )}% success)`
    : 'no clear winner yet';
  const recovery = profile.averageRecoverySeconds
    ? `${Math.round(profile.averageRecoverySeconds / 60)}min avg recovery`
    : 'no recovery baseline';
  const risky =
    profile.riskyApps.length > 0
      ? ` Risky apps for this user: ${profile.riskyApps.slice(0, 3).join(', ')}.`
      : '';
  return `User has ${profile.episodeCount} prior overload episodes. Top triggers: ${triggers || 'none yet'}. Best intervention: ${best}. ${recovery}.${risky}`;
}
