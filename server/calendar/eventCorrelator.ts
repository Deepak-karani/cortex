/**
 * Event correlation — "what happened last time this kind of event ran?"
 *
 * Pure projection from memory + calendar. Given a target event (typically
 * the next upcoming one), find prior MemoryRecords tagged with the same
 * eventTag and compute the aggregate signals that should drive a
 * preemptive recommendation:
 *
 *   - matches:           how many past episodes match this event kind
 *   - redCount:          how many of those went Red
 *   - bestIntervention:  which intervention resolved them most often
 *   - averageRecoveryS:  mean recovery time across matches
 *   - confidence:        sample-size-aware 0..1 (1.0 once we've seen 5+ matches)
 *   - recommendation:    one-line action string for the UI/Oracle prompt
 *
 * If memory has zero matching tags, returns a "no prior signal" verdict
 * so the UI degrades cleanly — we never invent personalization that
 * isn't earned.
 */

import type { MemoryRecord } from '../src/types';
import { defaultUserId, loadMemories } from '../memory/memoryStore';
import type { CalendarEvent, EventTag } from './calendarStore';
import { nextUpcoming } from './calendarStore';

export interface EventCorrelation {
  eventTag: EventTag | null;
  matches: number;
  redCount: number;
  yellowCount: number;
  recoveredCount: number;
  bestIntervention: string | null;
  averageRecoverySeconds: number | null;
  confidence: number;            // 0..1
  signal: 'safe' | 'mild' | 'risky' | 'unknown';
  recommendation: string;        // human-readable
}

const PASSIVE = new Set(['do_nothing', 'recall_memory', 'simulate_futures']);

/**
 * Score a memory record's similarity to a target event. Same eventTag is
 * the strongest match. We also boost records from the *same* userId
 * (already filtered upstream, but the typing keeps it honest).
 */
function isMatch(record: MemoryRecord, tag: EventTag): boolean {
  return record.eventTag === tag;
}

function pickBestIntervention(matches: MemoryRecord[]): string | null {
  const tally = new Map<string, { tried: number; recovered: number }>();
  for (const m of matches) {
    for (const name of m.interventions) {
      if (PASSIVE.has(name)) continue;
      const t = tally.get(name) ?? { tried: 0, recovered: 0 };
      t.tried += 1;
      if (m.hrvRecovered) t.recovered += 1;
      tally.set(name, t);
    }
  }
  let best: string | null = null;
  let bestScore = -1;
  for (const [name, t] of tally) {
    if (t.tried < 1) continue;
    // Weight: success rate * (sample size capped at 5) — same shape as the
    // per-user profile aggregator so behavior stays consistent.
    const score = (t.recovered / t.tried) * Math.min(t.tried, 5);
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return best;
}

export async function correlateUpcomingEvent(
  userId?: string,
): Promise<{ event: CalendarEvent | null; correlation: EventCorrelation }> {
  const id = userId ?? defaultUserId();
  const event = await nextUpcoming(id);
  if (!event) {
    return {
      event: null,
      correlation: {
        eventTag: null,
        matches: 0,
        redCount: 0,
        yellowCount: 0,
        recoveredCount: 0,
        bestIntervention: null,
        averageRecoverySeconds: null,
        confidence: 0,
        signal: 'unknown',
        recommendation: 'No upcoming events scheduled.',
      },
    };
  }

  const records = await loadMemories(id);
  const matches = records.filter((r) => isMatch(r, event.eventTag));
  if (matches.length === 0) {
    return {
      event,
      correlation: {
        eventTag: event.eventTag,
        matches: 0,
        redCount: 0,
        yellowCount: 0,
        recoveredCount: 0,
        bestIntervention: null,
        averageRecoverySeconds: null,
        confidence: 0,
        signal: 'unknown',
        recommendation: `No prior data for "${event.eventTag.replace(/_/g, ' ')}" events yet. Cortex will learn from this one.`,
      },
    };
  }

  const redCount = matches.filter((m) => m.cognitiveState === 'Red').length;
  const yellowCount = matches.filter((m) => m.cognitiveState === 'Yellow').length;
  const recoveredCount = matches.filter((m) => m.hrvRecovered).length;
  const bestIntervention = pickBestIntervention(matches);
  const recoveryTimes = matches
    .filter((m) => m.recoveryTimeSeconds > 0)
    .map((m) => m.recoveryTimeSeconds);
  const averageRecoverySeconds =
    recoveryTimes.length === 0
      ? null
      : Math.round(recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length);

  // Confidence rises with sample size and plateaus at 5 matches.
  const confidence = Math.min(1, matches.length / 5);

  // Bucket the signal. Red-rate is the strongest predictor; recovered-rate
  // softens it when the user has historically bounced back fast.
  const redRate = redCount / matches.length;
  const recoveryRate = recoveredCount / matches.length;
  let signal: EventCorrelation['signal'];
  if (redRate >= 0.5 && recoveryRate < 0.6) signal = 'risky';
  else if (redRate >= 0.3 || recoveryRate < 0.5) signal = 'mild';
  else signal = 'safe';

  const interventionPhrase = bestIntervention
    ? `${bestIntervention.replace(/_/g, ' ')} resolved ${recoveredCount}/${matches.length}`
    : 'no intervention has been tried yet';
  const recoveryPhrase = averageRecoverySeconds
    ? ` · ~${Math.max(1, Math.round(averageRecoverySeconds / 60))}min avg recovery`
    : '';
  const headline =
    signal === 'risky'
      ? `Heads up — ${matches.length} prior "${event.eventTag.replace(/_/g, ' ')}" events have triggered overload. ${interventionPhrase}${recoveryPhrase}.`
      : signal === 'mild'
        ? `${matches.length} prior "${event.eventTag.replace(/_/g, ' ')}" events were mildly stressful. ${interventionPhrase}${recoveryPhrase}.`
        : `${matches.length} prior "${event.eventTag.replace(/_/g, ' ')}" events have been steady. No preemptive action needed.`;

  return {
    event,
    correlation: {
      eventTag: event.eventTag,
      matches: matches.length,
      redCount,
      yellowCount,
      recoveredCount,
      bestIntervention,
      averageRecoverySeconds,
      confidence,
      signal,
      recommendation: headline,
    },
  };
}
