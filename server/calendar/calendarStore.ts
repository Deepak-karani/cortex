/**
 * Calendar store — local JSON-backed, demo-friendly.
 *
 * Real calendar integration (Google/iCal OAuth) is the eventual path; for
 * the hackathon we seed a deterministic event arc relative to server boot
 * so demos always have something coming up in the next few minutes.
 *
 * Events are stored in server/data/calendar.json. If the file is missing or
 * older than ~1 hour, we re-seed with a fresh arc that fires within the
 * demo window. Operators can override by editing the JSON directly.
 *
 * Event shape:
 *   - id          stable id (mem-style timestamp + entropy)
 *   - userId      owner (matches MemoryRecord.userId for filtering)
 *   - title       human-readable label
 *   - eventTag    canonical kind for cross-event correlation (design_review,
 *                 deep_work, 1_1, demo_prep, lunch, standup, focus_block)
 *   - startsAt    epoch ms
 *   - endsAt      epoch ms
 *   - attendees   optional roster — currently unused, kept for future
 *   - notes       free-text annotation
 */

import { promises as fs } from 'fs';
import path from 'path';
import { defaultUserId } from '../memory/memoryStore';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'calendar.json');
const SEED_TTL_MS = 60 * 60 * 1000; // re-seed if the file is older than 1h

export type EventTag =
  | 'design_review'
  | 'deep_work'
  | '1_1'
  | 'demo_prep'
  | 'standup'
  | 'lunch'
  | 'focus_block'
  | 'other';

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  eventTag: EventTag;
  startsAt: number;
  endsAt: number;
  attendees?: string[];
  notes?: string;
}

interface FileShape {
  seededAt: number;
  events: CalendarEvent[];
}

function id(prefix = 'evt'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

/**
 * Build a fresh arc of seeded events relative to "now". Times are demo-
 * friendly: the first event is 2 minutes out so judges see the preemptive
 * recommendation fire during the demo, then a steady cadence after.
 */
function buildSeedArc(userId: string): CalendarEvent[] {
  const now = Date.now();
  const min = 60_000;
  return [
    {
      id: id(),
      userId,
      title: 'Design review · Cortex Arena UI',
      eventTag: 'design_review',
      startsAt: now + 2 * min,
      endsAt: now + 32 * min,
      attendees: ['Priya', 'Marco', 'Ada'],
      notes: 'Stakeholder design review. Historically high-stress for this user.',
    },
    {
      id: id(),
      userId,
      title: '1:1 with Priya',
      eventTag: '1_1',
      startsAt: now + 45 * min,
      endsAt: now + 75 * min,
      attendees: ['Priya'],
      notes: 'Weekly mentor 1:1. Historically neutral / restorative.',
    },
    {
      id: id(),
      userId,
      title: 'Deep work block · Oracle wiring',
      eventTag: 'deep_work',
      startsAt: now + 90 * min,
      endsAt: now + 150 * min,
      notes: 'Protected focus. Historically restorative.',
    },
    {
      id: id(),
      userId,
      title: 'Demo dry-run with judges',
      eventTag: 'demo_prep',
      startsAt: now + 165 * min,
      endsAt: now + 195 * min,
      attendees: ['Preet', 'Judging panel'],
      notes: 'High-stakes practice run. Treat as design_review-class stressor.',
    },
  ];
}

async function load(): Promise<FileShape> {
  await ensureDir();
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as FileShape;
    if (!parsed?.events) throw new Error('bad shape');
    return parsed;
  } catch {
    const seeded: FileShape = {
      seededAt: Date.now(),
      events: buildSeedArc(defaultUserId()),
    };
    await fs.writeFile(FILE, JSON.stringify(seeded, null, 2), 'utf8');
    return seeded;
  }
}

async function persist(data: FileShape): Promise<void> {
  await ensureDir();
  await fs.writeFile(FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Public read API — returns the user's events, re-seeding if the file is
 * stale or the next future event is already in the past (so a demo that
 * runs hours after seeding still has events to surface).
 */
export async function listEvents(userId?: string): Promise<CalendarEvent[]> {
  const id = userId ?? defaultUserId();
  let data = await load();
  const now = Date.now();
  const userEvents = data.events.filter((e) => e.userId === id);
  const nextFuture = userEvents.find((e) => e.startsAt > now);
  const stale = now - data.seededAt > SEED_TTL_MS;
  if (!nextFuture || stale) {
    // Re-seed for this user. Keep events for other users untouched.
    data = {
      seededAt: now,
      events: [...data.events.filter((e) => e.userId !== id), ...buildSeedArc(id)],
    };
    await persist(data);
  }
  return data.events
    .filter((e) => e.userId === id)
    .sort((a, b) => a.startsAt - b.startsAt);
}

/**
 * The next upcoming event for this user, or null if none.
 */
export async function nextUpcoming(userId?: string): Promise<CalendarEvent | null> {
  const events = await listEvents(userId);
  const now = Date.now();
  return events.find((e) => e.endsAt > now) ?? null;
}

/**
 * Manually inject an event (useful for the future Google Calendar bridge).
 */
export async function addEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent> {
  const data = await load();
  const stamped: CalendarEvent = { ...event, id: id() };
  data.events.push(stamped);
  await persist(data);
  return stamped;
}

/**
 * Reset and re-seed (operator hook for demo prep).
 */
export async function reseed(userId?: string): Promise<CalendarEvent[]> {
  const id = userId ?? defaultUserId();
  const data = await load();
  const next: FileShape = {
    seededAt: Date.now(),
    events: [...data.events.filter((e) => e.userId !== id), ...buildSeedArc(id)],
  };
  await persist(next);
  return next.events.filter((e) => e.userId === id);
}
