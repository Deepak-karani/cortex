/**
 * OpenClaw / NemoClaw runtime adapter.
 *
 * Cortex Arena does not embed an OpenClaw binary directly. Instead, it talks
 * to an OpenAI-compatible inference endpoint hosted by NemoClaw / NIM / vLLM /
 * Ollama on the user's NVIDIA DGX Spark.
 *
 * This module performs a periodic health probe so the UI's DGX status card
 * always reflects:
 *   - whether the endpoint is reachable (TCP + HTTP)
 *   - which model is actually being served
 *   - measured round-trip latency
 *   - whether we are currently using the mock fallback inside nemotronAgent
 *
 * If the endpoint is unreachable, we surface a clear "mock fallback" status —
 * we do not silently mask the failure.
 */

import { getFallbackStatus } from './nemotronAgent';

export interface RuntimeHealth {
  ok: boolean;
  reachable: boolean;
  baseUrl: string;
  servedModel: string | null;
  configuredModel: string;
  latencyMs: number | null;
  fallbackActive: boolean;
  fallbackReason: string;
  lastCheckedAt: number;
  notes: string[];
}

let cached: RuntimeHealth = {
  ok: false,
  reachable: false,
  baseUrl: process.env.NEMOTRON_BASE_URL ?? 'http://localhost:8000/v1',
  servedModel: null,
  configuredModel: process.env.NEMOTRON_MODEL ?? 'nvidia/Nemotron-super-120b',
  latencyMs: null,
  fallbackActive: false,
  fallbackReason: 'not yet probed',
  lastCheckedAt: 0,
  notes: [],
};

function cfg() {
  return {
    baseUrl: process.env.NEMOTRON_BASE_URL ?? 'http://localhost:8000/v1',
    configuredModel: process.env.NEMOTRON_MODEL ?? 'nvidia/Nemotron-super-120b',
    apiKey: process.env.NEMOTRON_API_KEY ?? 'local',
  };
}

/**
 * One health probe: hits /v1/models on the configured endpoint with a short
 * timeout and surfaces what comes back.
 */
export async function probeRuntime(): Promise<RuntimeHealth> {
  const { baseUrl, configuredModel, apiKey } = cfg();
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const notes: string[] = [];
  const t0 = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 4500);
  let reachable = false;
  let servedModel: string | null = null;
  let latencyMs: number | null = null;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    latencyMs = Date.now() - t0;
    if (!res.ok) {
      notes.push(`HTTP ${res.status} from ${url}`);
    } else {
      reachable = true;
      try {
        const json = (await res.json()) as { data?: Array<{ id?: string }> };
        const ids = (json.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
        if (ids.length === 0) {
          notes.push('endpoint responded but advertised zero models');
        } else if (ids.includes(configuredModel)) {
          servedModel = configuredModel;
        } else {
          servedModel = ids[0];
          notes.push(
            `configured model "${configuredModel}" not advertised; first available is "${servedModel}"`,
          );
        }
      } catch {
        notes.push('model list returned non-JSON');
      }
    }
  } catch (err) {
    notes.push(`unreachable — ${(err as Error).message}`);
  } finally {
    clearTimeout(t);
  }

  const fb = getFallbackStatus();
  cached = {
    ok: reachable && !fb.active,
    reachable,
    baseUrl,
    servedModel,
    configuredModel,
    latencyMs,
    fallbackActive: fb.active,
    fallbackReason: fb.reason,
    lastCheckedAt: Date.now(),
    notes,
  };
  return cached;
}

export function getRuntimeHealth(): RuntimeHealth {
  return cached;
}

/**
 * Kick off a background probe loop. Called from src/index.ts at boot.
 */
export function startRuntimeHealthLoop(intervalMs = 15_000): () => void {
  void probeRuntime();
  const id = setInterval(() => {
    void probeRuntime();
  }, intervalMs);
  return () => clearInterval(id);
}
