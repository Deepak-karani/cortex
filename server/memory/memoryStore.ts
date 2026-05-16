import { promises as fs } from 'fs';
import path from 'path';
import type { CognitiveState, MemoryRecord, Telemetry } from '../src/types';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

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
    return parsed;
  } catch {
    return { memories: [] };
  }
}

async function writeFile(data: MemoryFile): Promise<void> {
  await ensureFile();
  await fs.writeFile(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export async function loadMemories(): Promise<MemoryRecord[]> {
  const data = await readFile();
  return [...data.memories].sort((a, b) => b.timestamp - a.timestamp);
}

export async function saveMemory(memory: MemoryRecord): Promise<MemoryRecord> {
  const data = await readFile();
  data.memories.push(memory);
  // Cap retained memories to keep file demo-friendly.
  if (data.memories.length > 50) {
    data.memories = data.memories.slice(-50);
  }
  await writeFile(data);
  return memory;
}

export async function clearMemories(): Promise<void> {
  await writeFile({ memories: [] });
}

interface CurrentStateProbe {
  state: CognitiveState;
  telemetry?: Telemetry;
  cognitiveLoadScore?: number;
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
  const all = await loadMemories();
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
