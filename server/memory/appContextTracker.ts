/**
 * Per-user app-context stress correlation.
 *
 * Records a tiny event each time the active app changes plus a snapshot of
 * the user's cognitive state at that moment. Aggregates over time into
 * "this app, while you visit it, your cognitive load tends to climb by N
 * points" — which the personalization callout uses to surface things like
 * "last time you opened Slack in Yellow, you were Red within 4 minutes."
 *
 * Storage shape:
 *   {
 *     [userId]: {
 *       events: AppContextEvent[],         // ring buffer, ~500 events
 *       summary: Record<app, AppStressStats>, // recomputed on demand
 *     }
 *   }
 *
 * Events are persisted to a small JSON file so correlations survive server
 * restarts. Bounded so the file stays demo-friendly.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { CognitiveState } from '../src/types';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'app-context.json');

export interface AppContextEvent {
  userId: string;
  timestamp: number;
  app: string;
  contextHint: string | null;
  cognitiveState: CognitiveState;
  cognitiveLoadScore: number;
}

interface FileShape {
  events: AppContextEvent[];
}

export interface AppStressStats {
  app: string;
  visits: number;
  averageLoadOnArrival: number;
  averageLoadDelta5min: number;   // load score 5min after arrival - on arrival
  redEpisodesTriggered: number;   // visits where state escalated to Red within 5min
  lastContextHints: string[];     // up to 3 most-recent context strings
  signal: 'safe' | 'mild' | 'risky'; // bucketed correlation
}

const MAX_EVENTS = 500;
const memCache: Map<string, AppContextEvent[]> = new Map();
let loaded = false;

async function load(): Promise<void> {
  if (loaded) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as FileShape;
    for (const e of parsed.events ?? []) {
      const list = memCache.get(e.userId) ?? [];
      list.push(e);
      memCache.set(e.userId, list);
    }
  } catch {
    // file may not exist yet — start clean
  }
  loaded = true;
}

async function persist(): Promise<void> {
  const all: AppContextEvent[] = [];
  for (const list of memCache.values()) all.push(...list);
  all.sort((a, b) => a.timestamp - b.timestamp);
  const trimmed = all.slice(-MAX_EVENTS);
  try {
    await fs.writeFile(FILE, JSON.stringify({ events: trimmed }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[appContextTracker] persist failed:', (err as Error).message);
  }
}

/**
 * Record an app-context observation. De-dupes: if the most recent event for
 * this user has the same app within 10 seconds, we update its timestamp
 * instead of inserting — so tab-switch noise doesn't flood the buffer.
 */
export async function recordAppContext(event: AppContextEvent): Promise<void> {
  await load();
  const list = memCache.get(event.userId) ?? [];
  const last = list[list.length - 1];
  if (
    last &&
    last.app === event.app &&
    event.timestamp - last.timestamp < 10_000
  ) {
    last.timestamp = event.timestamp;
    last.cognitiveLoadScore = event.cognitiveLoadScore;
    last.cognitiveState = event.cognitiveState;
    last.contextHint = event.contextHint ?? last.contextHint;
  } else {
    list.push(event);
    if (list.length > 80) list.splice(0, list.length - 80); // per-user cap
  }
  memCache.set(event.userId, list);
  // Fire-and-forget persistence — losing the latest tick is fine, this is
  // a demo aid not a banking ledger.
  void persist();
}

/**
 * Aggregate this user's events into per-app stress statistics.
 *
 * For each (userId, app) pair:
 *   - visits = number of distinct arrivals
 *   - averageLoadOnArrival = mean of cognitiveLoadScore at arrival events
 *   - averageLoadDelta5min = mean of (max load within 5min) - (arrival load)
 *   - redEpisodesTriggered = arrivals where state hit Red within 5min
 */
export async function getAppStressStats(userId: string): Promise<AppStressStats[]> {
  await load();
  const events = memCache.get(userId) ?? [];
  if (events.length === 0) return [];

  const byApp = new Map<string, AppContextEvent[]>();
  for (const e of events) {
    const list = byApp.get(e.app) ?? [];
    list.push(e);
    byApp.set(e.app, list);
  }

  const out: AppStressStats[] = [];
  for (const [app, list] of byApp.entries()) {
    if (app === 'Unknown') continue;
    let arrivals = 0;
    let arrivalLoadSum = 0;
    let deltaSum = 0;
    let deltaCount = 0;
    let redTriggers = 0;
    const lastHints: string[] = [];
    for (const arrival of list) {
      arrivals += 1;
      arrivalLoadSum += arrival.cognitiveLoadScore;
      if (arrival.contextHint && !lastHints.includes(arrival.contextHint)) {
        lastHints.unshift(arrival.contextHint);
      }
      // Find the peak load score within 5 minutes after this arrival,
      // looking across *all* events (not just same-app), because the user
      // typically moves through several apps in that window.
      const cutoff = arrival.timestamp + 5 * 60_000;
      let peak = arrival.cognitiveLoadScore;
      let hitRed = false;
      for (const future of events) {
        if (future.timestamp <= arrival.timestamp) continue;
        if (future.timestamp > cutoff) break;
        if (future.cognitiveLoadScore > peak) peak = future.cognitiveLoadScore;
        if (future.cognitiveState === 'Red') hitRed = true;
      }
      if (peak > arrival.cognitiveLoadScore) {
        deltaSum += peak - arrival.cognitiveLoadScore;
        deltaCount += 1;
      }
      if (hitRed) redTriggers += 1;
    }
    const averageDelta = deltaCount === 0 ? 0 : deltaSum / deltaCount;
    const signal: AppStressStats['signal'] =
      averageDelta < 8 ? 'safe' : averageDelta < 18 ? 'mild' : 'risky';
    out.push({
      app,
      visits: arrivals,
      averageLoadOnArrival: Math.round(arrivalLoadSum / arrivals),
      averageLoadDelta5min: Math.round(averageDelta),
      redEpisodesTriggered: redTriggers,
      lastContextHints: lastHints.slice(0, 3),
      signal,
    });
  }

  // Sort by risk — most stressful apps first.
  out.sort((a, b) => b.averageLoadDelta5min - a.averageLoadDelta5min);
  return out;
}

export async function clearAppContext(userId?: string): Promise<void> {
  await load();
  if (userId) {
    memCache.delete(userId);
  } else {
    memCache.clear();
  }
  await persist();
}
