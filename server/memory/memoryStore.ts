import { promises as fs } from 'fs';
import path from 'path';
import type { CognitiveState, MemoryRecord, Telemetry } from '../src/types';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

/**
 * The default userId for any MemoryRecord without an explicit owner. Single-
 * machine deployments are the common case — the operator can override via
 * CORTEX_USER_ID to demo per-user adaptation cleanly.
 */
export function defaultUserId(): string {
  return process.env.CORTEX_USER_ID?.trim() || 'local';
}

async function ensureFile(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
  try {
    await fs.access(MEMORY_FILE);
  } catch {
    await fs.writeFile(MEMORY_FILE, JSON.stringify({ memories: [] }, null, 2), 'utf8');
  }
}

interface MemoryFile {
  memories: MemoryRecord[];
}

async function readFile(): Promise<MemoryFile> {
  await ensureFile();
  const raw = await fs.readFile(MEMORY_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw) as MemoryFile;
    if (!parsed.memories) return { memories: [] };
    // Backfill userId on legacy records so downstream filters don't need to
    // special-case the missing field.
    parsed.memories = parsed.memories.map((m) => ({
      ...m,
      userId: m.userId ?? defaultUserId(),
    }));
    return parsed;
  } catch {
    return { memories: [] };
  }
}

async function writeFile(data: MemoryFile): Promise<void> {
  await ensureFile();
  await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Load all memories. When `userId` is provided, returns only that user's
 * records; otherwise returns everything (used by admin/debug routes).
 */
export async function loadMemories(userId?: string): Promise<MemoryRecord[]> {
  const data = await readFile();
  const all = [...data.memories].sort((a, b) => b.timestamp - a.timestamp);
  if (!userId) return all;
  return all.filter((m) => (m.userId ?? defaultUserId()) === userId);
}

export async function saveMemory(memory: MemoryRecord): Promise<MemoryRecord> {
  const data = await readFile();
  const stamped: MemoryRecord = {
    ...memory,
    userId: memory.userId ?? defaultUserId(),
  };
  data.memories.push(stamped);
  // Cap retained memories *per user* so a single noisy account can't crowd
  // others out of the demo file. 50 per user, capped 200 globally.
  const perUser = new Map<string, MemoryRecord[]>();
  for (const rec of data.memories) {
    const key = rec.userId ?? defaultUserId();
    const list = perUser.get(key) ?? [];
    list.push(rec);
    perUser.set(key, list);
  }
  const trimmed: MemoryRecord[] = [];
  for (const [, list] of perUser) {
    trimmed.push(...list.slice(-50));
  }
  data.memories = trimmed.slice(-200);
  await writeFile(data);
  return stamped;
}

export async function clearMemories(userId?: string): Promise<void> {
  if (!userId) {
    await writeFile({ memories: [] });
    return;
  }
  const data = await readFile();
  data.memories = data.memories.filter(
    (m) => (m.userId ?? defaultUserId()) !== userId,
  );
  await writeFile(data);
}

interface CurrentStateProbe {
  state: CognitiveState;
  telemetry?: Telemetry;
  cognitiveLoadScore?: number;
  userId?: string;
}

function scoreSimilarity(record: MemoryRecord, probe: CurrentStateProbe): number {
  let score = 0;
  if (record.cognitiveState === probe.state) score += 50;
  if (probe.state === 'Yellow' && record.cognitiveState === 'Red') score += 20;
  if (probe.state === 'Red' && record.cognitiveState === 'Yellow') score += 15;
  // More recent memories are slightly preferred.
  const ageHours = (Date.now() - record.timestamp) / (1000 * 60 * 60);
  score += Math.max(0, 10 - ageHours);
  if (record.hrvRecovered) score += 5;
  return score;
}

export async function recallSimilarMemory(probe: CurrentStateProbe): Promise<MemoryRecord | null> {
  const all = await loadMemories(probe.userId ?? defaultUserId());
  if (all.length === 0) return null;
  const ranked = all
    .map((m) => ({ memory: m, score: scoreSimilarity(m, probe) }))
    .sort((a, b) => b.score - a.score);
  if (ranked[0].score <= 0) return null;
  return ranked[0].memory;
}

export function makeMemoryId(): string {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
