/**
 * Wellness coach — Nemotron-backed conversational health assistant.
 *
 * This is a second, lower-cadence Nemotron path that runs *only* on state
 * transitions worth coaching through:
 *
 *   - Yellow → Red          ("you're tipping into overload")
 *   - Red    → Green        ("nice landing, here's what worked")
 *   - Green  → Red          (skip-yellow spike — rare, worth coaching)
 *
 * Why a dedicated module instead of another specialist:
 *   1. Cadence is event-driven, not per-tick. The 7 specialists run every
 *      orchestrator pass; the coach runs only when state actually changes.
 *      That keeps the Nemotron latency budget bounded (~1 coach call /
 *      minute even in a turbulent demo).
 *   2. Voice is distinctly conversational vs the Socratic generator's
 *      one-line questions. Two different prompts, two different surfaces.
 *   3. Fires asynchronously — the orchestrator's tick is never blocked
 *      waiting for the coach. If Oracle is slow, the coach result just
 *      lands a few seconds later.
 *
 * Public surface: `runIfTransition()` — call on every cognitive update.
 * Internally tracks the last state and only fires when it changes
 * meaningfully + cooldown has elapsed.
 */

import { EventEmitter } from 'events';
import type {
  AttentionMetrics,
  CognitiveAssessment,
  CognitiveState,
  SocraticPrompt,
  Telemetry,
} from '../src/types';
import { generateCoachCheckin } from './nemotronAgent';
import { defaultUserId } from '../memory/memoryStore';
import { getUserProfile } from '../memory/userProfile';
import { correlateUpcomingEvent } from '../calendar/eventCorrelator';

export interface CoachMessage extends SocraticPrompt {
  /** Triggering transition, e.g. "Yellow → Red". */
  trigger: string;
  /** State at fire time. */
  cognitiveState: CognitiveState;
}

const COOLDOWN_MS = 60_000;

class WellnessCoach extends EventEmitter {
  private lastState: CognitiveState | null = null;
  private lastFiredAt = 0;
  private inflight = false;
  private latestMessage: CoachMessage | null = null;

  getLatest(): CoachMessage | null {
    return this.latestMessage;
  }

  /**
   * Public hook called from the telemetry pipeline. Decides whether to
   * fire and, if so, kicks Nemotron asynchronously. Returns immediately
   * — the orchestrator is never blocked.
   */
  runIfTransition(
    assessment: CognitiveAssessment,
    telemetry: Telemetry,
    attention: AttentionMetrics | null,
  ): void {
    const current = assessment.state;
    const prev = this.lastState;
    this.lastState = current;

    if (prev === null) return; // bootstrap tick — no transition yet
    if (prev === current) return; // same state
    if (this.inflight) return; // one in flight already
    if (Date.now() - this.lastFiredAt < COOLDOWN_MS) return; // cooldown

    // Triggers we coach on. Everything else is too quiet to be worth a
    // Nemotron call — judges don't want to see coach spam on
    // Intervention/Recovery flicker, for example.
    const shouldFire =
      (prev === 'Yellow' && current === 'Red') ||
      (prev === 'Red' && current === 'Green') ||
      (prev === 'Green' && current === 'Red') ||
      (prev === 'Green' && current === 'Yellow');
    if (!shouldFire) return;

    const trigger = `${prev} → ${current}`;
    void this.fire(trigger, assessment, telemetry, attention);
  }

  private async fire(
    trigger: string,
    assessment: CognitiveAssessment,
    telemetry: Telemetry,
    attention: AttentionMetrics | null,
  ): Promise<void> {
    this.inflight = true;
    this.lastFiredAt = Date.now();
    try {
      const userId = defaultUserId();
      const [profile, upcoming] = await Promise.all([
        getUserProfile(userId),
        correlateUpcomingEvent(userId),
      ]);
      const upcomingHint =
        upcoming.event && upcoming.correlation.signal !== 'unknown'
          ? {
              title: upcoming.event.title,
              tag: upcoming.event.eventTag,
              minutesUntil: Math.max(0, Math.round((upcoming.event.startsAt - Date.now()) / 60_000)),
              historicalSignal: upcoming.correlation.signal,
              historicalMatches: upcoming.correlation.matches,
            }
          : null;

      const result = await generateCoachCheckin({
        telemetry,
        assessment,
        attention,
        profile,
        upcomingEvent: upcomingHint,
        currentTaskHint: telemetry.currentTask,
      });

      const message: CoachMessage = {
        ...result.data,
        trigger,
        cognitiveState: assessment.state,
      };
      this.latestMessage = message;
      this.emit('message', message);
      this.emit('fallback', result.fallback);
    } catch (err) {
      console.warn('[coach] fire failed:', (err as Error).message);
    } finally {
      this.inflight = false;
    }
  }

  reset(): void {
    this.lastState = null;
    this.lastFiredAt = 0;
    this.latestMessage = null;
  }
}

export const wellnessCoach = new WellnessCoach();
