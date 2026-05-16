import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketServer } from 'socket.io';

import { SimulationEngine } from '../sim/simulationEngine';
import { scoreCognitiveLoad } from '../sim/cognitiveModel';
import { Orchestrator } from '../agents/orchestrator';
import {
  clearMemories,
  loadMemories,
  makeMemoryId,
  saveMemory,
} from '../memory/memoryStore';
import { getFallbackStatus } from '../agents/nemotronAgent';
import { getRuntimeHealth, probeRuntime, startRuntimeHealthLoop } from '../agents/openclawRuntime';
import {
  clearLatestAttention,
  getLatestAttention,
  setLatestAttention,
} from '../tools/checkAttentionState';
import {
  clearLatestScreen,
  getLatestScreen,
  setLatestScreen,
} from '../sim/screenStore';
import type {
  AgentReport,
  AgentTraceEntry,
  AttentionMetrics,
  CognitiveAssessment,
  CognitiveState,
  DemoSpeed,
  MemoryRecord,
  ProductivityInsight,
  ScreenSummary,
  Telemetry,
  ToolResult,
} from './types';

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const BIOMETRICS_TOKEN = process.env.BIOMETRICS_TOKEN ?? '';
const REAL_HR_TTL_MS = 90_000; // how long a real sample suppresses the sim

// In-memory store of the latest HealthKit sample. Polled by the sim loop so
// the simulated stream can yield to a real device when one is present.
interface LatestHeartRate {
  bpm: number;
  hrv: number | null;
  source: string;
  timestamp: number;
}
let latestRealHeartRate: LatestHeartRate | null = null;

function isRealHrFresh(): boolean {
  return !!latestRealHeartRate && Date.now() - latestRealHeartRate.timestamp < REAL_HR_TTL_MS;
}

function getLatestRealHeartRate(): LatestHeartRate | null {
  return isRealHrFresh() ? latestRealHeartRate : null;
}

const app = express();
app.use(cors({ origin: '*' }));
// Bigger body limit for Health Auto Export real-time pushes — they can bundle
// many samples at once.
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const sim = new SimulationEngine();
const orchestrator = new Orchestrator();

// Sanitize and clamp attention metrics coming from the browser.
// Returns null if the payload is unusable (so we never trust raw client data).
function sanitizeAttention(input: unknown): AttentionMetrics | null {
  if (!input || typeof input !== 'object') return null;
  const m = input as Partial<AttentionMetrics>;
  if (typeof m.attentionScore !== 'number') return null;
  const allowedGaze: AttentionMetrics['gazeDirection'][] = [
    'center',
    'left',
    'right',
    'down',
    'offscreen',
  ];
  const allowedPose: AttentionMetrics['headPose'][] = [
    'centered',
    'turned_left',
    'turned_right',
    'down',
    'away',
  ];
  const allowedState: AttentionMetrics['interpretedState'][] = [
    'Focused',
    'Distracted',
    'Fatigued',
    'Searching',
    'Overstimulated',
    'Unknown',
  ];
  return {
    timestamp: Date.now(),
    attentionScore: Math.max(0, Math.min(100, Math.round(m.attentionScore))),
    gazeDirection: allowedGaze.includes(m.gazeDirection as never) ? (m.gazeDirection as AttentionMetrics['gazeDirection']) : 'center',
    headPose: allowedPose.includes(m.headPose as never) ? (m.headPose as AttentionMetrics['headPose']) : 'centered',
    distractionDurationSeconds: Math.max(0, m.distractionDurationSeconds || 0),
    offscreenRatio60s: Math.max(0, Math.min(1, m.offscreenRatio60s || 0)),
    blinkRate: Math.max(0, m.blinkRate || 0),
    focusStability: Math.max(0, Math.min(100, Math.round(m.focusStability || 0))),
    gazeSwitchRate: Math.max(0, m.gazeSwitchRate || 0),
    faceDetected: !!m.faceDetected,
    confidence: Math.max(0, Math.min(1, Number((m.confidence ?? 0.5).toFixed(2)))),
    interpretedState: allowedState.includes(m.interpretedState as never)
      ? (m.interpretedState as AttentionMetrics['interpretedState'])
      : 'Unknown',
    source: m.source === 'simulated' ? 'simulated' : 'webcam',
  };
}

// Sanitize screen-summary payload. Critically: we drop anything that looks
// like raw OCR text — only short tokens are retained.
function sanitizeScreen(input: unknown): ScreenSummary | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Partial<ScreenSummary>;
  if (typeof s.activeApp !== 'string') return null;
  const allowedFlow: ScreenSummary['workflowState'][] = [
    'flow',
    'searching',
    'switching',
    'debugging',
    'communicating',
    'idle',
  ];
  const tokens = Array.isArray(s.ocrTokens)
    ? s.ocrTokens
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2 && t.length <= 24)
        .slice(0, 24)
    : [];
  return {
    timestamp: Date.now(),
    activeApp: s.activeApp.slice(0, 64),
    activeTitle: (s.activeTitle ?? '').slice(0, 160),
    windows: Array.isArray(s.windows)
      ? s.windows
          .filter((w) => w && typeof (w as { app?: unknown }).app === 'string')
          .slice(0, 10)
          .map((w) => ({
            app: (w as { app: string }).app.slice(0, 48),
            title: ((w as { title?: string }).title ?? '').slice(0, 80),
            category: (w as { category?: string }).category ?? 'other',
            active: !!(w as { active?: boolean }).active,
          }))
      : [],
    tabCount: Math.max(0, Math.min(99, Math.round(s.tabCount ?? 0))),
    textSampleHash: typeof s.textSampleHash === 'string' ? s.textSampleHash.slice(0, 16) : undefined,
    ocrTokens: tokens,
    inferredTask: (s.inferredTask ?? '').slice(0, 80),
    inferredProject: (s.inferredProject ?? '').slice(0, 80),
    inferredIntent: (s.inferredIntent ?? '').slice(0, 120),
    workflowState: allowedFlow.includes(s.workflowState as never)
      ? (s.workflowState as ScreenSummary['workflowState'])
      : 'idle',
    confidence: Math.max(0, Math.min(1, Number((s.confidence ?? 0.5).toFixed(2)))),
    source: s.source === 'simulated' ? 'simulated' : 'capture',
  };
}

// Track current state to gate agent runs.
let lastAssessment: CognitiveAssessment | null = null;
let lastTelemetry: Telemetry | null = null;
let lastNonGreenState: CognitiveState | null = null;
let episodeStartTime: number | null = null;
let episodeInterventions: string[] = [];
let lastAgentRunAt = 0;
const AGENT_RUN_INTERVAL_MS = 4000;

// Stream agent trace + per-agent reports + productivity insights live.
orchestrator.on('trace', (entry: AgentTraceEntry) => {
  io.emit('agent:trace', entry);
});
orchestrator.on('agent_report', (report: AgentReport) => {
  io.emit('agent:report', report);
});
orchestrator.on('insight', (insight: ProductivityInsight) => {
  io.emit('insight:new', insight);
});

// DGX compute telemetry — emit every 2s so the HUD pulse is always alive.
setInterval(() => {
  io.emit('compute:update', orchestrator.getComputeTelemetry());
  io.emit('runtime:update', getRuntimeHealth());
}, 2000);

// EMA-glided displayed BPM. HealthKit only commits new samples every 30-90s
// even during a workout, so the underlying real bpm steps in chunks. We glide
// the *displayed* value smoothly toward each new target so the dashboard never
// looks frozen, and add a tiny natural ±1 wobble (real heart rate has HRV).
// The agent + cognitive model still see the real underlying value for reasoning.
let displayedHr: number | null = null;

function glideHr(targetBpm: number, hasRealSample: boolean): number {
  if (displayedHr == null) {
    displayedHr = targetBpm;
    return targetBpm;
  }
  // When a real Apple Watch sample is present, glide tightly toward it with a
  // small natural wobble. When using sim only, let the sim's own variation
  // come through more (smaller glide influence).
  const glideRate = hasRealSample ? 0.18 : 0.6;
  displayedHr = displayedHr * (1 - glideRate) + targetBpm * glideRate;
  // ±1.2 bpm natural wobble — matches real beat-to-beat HRV.
  const wobbleAmplitude = hasRealSample ? 1.4 : 0.6;
  const wobble = (Math.random() - 0.5) * wobbleAmplitude * 2;
  return Math.round(displayedHr + wobble);
}

// Sim → cognitive scoring → broadcast.
sim.on('telemetry', async (rawTelemetry: Telemetry) => {
  // If a fresh real HealthKit sample is present, override HR/HRV so the rest
  // of the system (cognitive model, agents, UI) sees the real device's data.
  const real = getLatestRealHeartRate();
  const realBpm = real ? real.bpm : rawTelemetry.heartRate;
  const displayedBpm = glideHr(realBpm, !!real);
  const telemetry: Telemetry = real
    ? { ...rawTelemetry, heartRate: displayedBpm, hrv: real.hrv ?? rawTelemetry.hrv }
    : rawTelemetry;
  lastTelemetry = telemetry;
  io.emit('telemetry:update', telemetry);

  // For the cognitive model and agent reasoning, use the actual real value
  // (not the glided displayed one) so decisions are based on truth.
  const telemetryForReasoning: Telemetry = real
    ? { ...telemetry, heartRate: realBpm }
    : telemetry;
  const assessment = scoreCognitiveLoad(telemetryForReasoning, getLatestAttention());
  lastAssessment = assessment;
  io.emit('cognitive:update', assessment);

  // Track overload episodes for memory persistence.
  if (assessment.state === 'Yellow' || assessment.state === 'Red') {
    if (lastNonGreenState === null) {
      episodeStartTime = Date.now();
      episodeInterventions = [];
    }
    lastNonGreenState = assessment.state;
  } else if (assessment.state === 'Green' && lastNonGreenState !== null) {
    // Episode just ended — write it to memory.
    const recoveryTimeSeconds = episodeStartTime
      ? Math.round((Date.now() - episodeStartTime) / 1000)
      : 0;
    const record: MemoryRecord = {
      id: makeMemoryId(),
      timestamp: Date.now(),
      cognitiveState: lastNonGreenState,
      patternSummary: `${lastNonGreenState} episode: HRV bottomed near ${telemetry.hrv}ms, HR peaked, notifications spiked.`,
      interventions: [...new Set(episodeInterventions)],
      outcome: 'Recovered to Green.',
      hrvRecovered: telemetry.hrv > 50,
      recoveryTimeSeconds,
    };
    try {
      await saveMemory(record);
      const all = await loadMemories();
      io.emit('memory:update', all);
    } catch (err) {
      console.error('Failed to persist memory record', err);
    }
    lastNonGreenState = null;
    episodeStartTime = null;
    episodeInterventions = [];
  }

  // Run the agent on a cadence when state is non-Green, and periodically on Green for thought updates.
  const now = Date.now();
  const shouldRun =
    now - lastAgentRunAt > AGENT_RUN_INTERVAL_MS &&
    (assessment.state !== 'Green' || now - lastAgentRunAt > AGENT_RUN_INTERVAL_MS * 3);

  if (shouldRun && !orchestrator.isBusy()) {
    lastAgentRunAt = now;
    try {
      const output = await orchestrator.run({ telemetry, assessment });

      // Track interventions for the episode record.
      for (const t of output.chosenTools) {
        if (t !== 'do_nothing' && t !== 'recall_memory' && t !== 'simulate_futures') {
          episodeInterventions.push(t);
        }
      }

      if (output.timelines) {
        io.emit('timeline:update', output.timelines);
      }
      for (const tr of output.toolResults) {
        io.emit('action:log', tr);
      }
      if (output.socratic) {
        io.emit('socratic:update', output.socratic);
      }
      io.emit('fallback:update', output.fallback);
    } catch (err) {
      console.error('Agent run failed', err);
    }
  }
});

sim.on('phase', (phase: string) => {
  io.emit('phase:update', { phase });
});

// REST routes -----------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    nemotron: {
      baseUrl: process.env.NEMOTRON_BASE_URL ?? 'http://localhost:8000/v1',
      model: process.env.NEMOTRON_MODEL ?? 'nvidia/Nemotron-super-120b',
    },
    fallback: getFallbackStatus(),
    simRunning: sim.isRunning(),
    speed: sim.getSpeed(),
  });
});

// ---- HealthKit bridge -------------------------------------------------------
// POST a single heart-rate sample (typically from an iOS Shortcut that reads
// HealthKit on the watch's behalf). The bridge accepts the smallest possible
// payload to make the Shortcut trivial to set up.
//
// Body shape:
//   { "bpm": 64, "hrv": 78, "timestamp": 1700000000000, "source": "Apple Watch" }
// Only `bpm` is required.
//
// Auth (optional): set BIOMETRICS_TOKEN in server/.env to require
//   Authorization: Bearer <token>
app.post('/api/biometrics/heart-rate', (req, res) => {
  console.log(
    `[biometrics] HR POST from ${req.ip} raw body=${JSON.stringify(req.body)}`,
  );
  if (BIOMETRICS_TOKEN) {
    const auth = req.header('authorization') ?? '';
    const presented = auth.replace(/^Bearer\s+/i, '');
    if (presented !== BIOMETRICS_TOKEN) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }
  const body = req.body as Partial<LatestHeartRate>;
  const bpmRaw = Number(body.bpm);
  if (!Number.isFinite(bpmRaw) || bpmRaw < 30) {
    console.warn(`[biometrics] rejected bpm=${body.bpm} (parsed=${bpmRaw})`);
    return res.status(400).json({
      ok: false,
      error: `bpm must be a number ≥ 30; received ${JSON.stringify(body.bpm)}`,
      hint: 'Check the Dictionary action — the bpm value should be wired to a number variable that contains your heart rate, not to the Health Sample itself or to a unit string.',
    });
  }
  const bpm = Math.max(30, Math.min(220, Math.round(bpmRaw)));
  const hrvRaw = body.hrv == null ? null : Number(body.hrv);
  const hrv =
    hrvRaw != null && Number.isFinite(hrvRaw) ? Math.max(0, Math.min(250, Math.round(hrvRaw))) : null;
  const ts = Number(body.timestamp);
  const sample: LatestHeartRate = {
    bpm,
    hrv,
    source: (body.source || 'Apple Watch · HealthKit').toString().slice(0, 48),
    timestamp: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
  };
  latestRealHeartRate = sample;
  io.emit('biometrics:hr', sample);
  return res.json({ ok: true, accepted: sample });
});

app.get('/api/biometrics/heart-rate', (_req, res) => {
  res.json({ ok: true, sample: getLatestRealHeartRate() });
});

// ---- Health Auto Export bridge ---------------------------------------------
// Health Auto Export (iOS app, https://www.healthexportapp.com) can push
// HealthKit samples to a REST endpoint in real time. Its payload shape differs
// from our simple bridge — this endpoint accepts the native shape and forwards
// each sample through the same code path. Set the iOS app's "REST API
// Automation" URL to:
//   http://<this-mac>:4000/api/biometrics/health-auto-export
// and check `Heart Rate` + optionally `Heart Rate Variability` in the data
// types to send.

interface HaeMetric {
  name?: string;
  units?: string;
  data?: Array<{
    qty?: number;
    Avg?: number;
    avg?: number;
    Min?: number;
    Max?: number;
    date?: string;
    source?: string;
  }>;
}
interface HaePayload {
  data?: { metrics?: HaeMetric[] };
}

function pickLatest(samples: HaeMetric['data'] | undefined): { qty: number; date: number; source: string } | null {
  if (!samples || samples.length === 0) return null;
  // Health Auto Export usually sorts oldest-first; we want the latest.
  const latest = [...samples]
    .map((s) => {
      const qty = s.qty ?? s.Avg ?? s.avg ?? null;
      if (qty == null || !Number.isFinite(qty)) return null;
      const ts = s.date ? Date.parse(s.date) : Date.now();
      return { qty, date: Number.isFinite(ts) ? ts : Date.now(), source: s.source ?? '' };
    })
    .filter((s): s is { qty: number; date: number; source: string } => !!s)
    .sort((a, b) => b.date - a.date)[0];
  return latest ?? null;
}

app.post('/api/biometrics/health-auto-export', (req, res) => {
  console.log(`[biometrics] HAE POST from ${req.ip} metric count=${(req.body?.data?.metrics ?? []).length}`);
  if (BIOMETRICS_TOKEN) {
    const auth = req.header('authorization') ?? '';
    const presented = auth.replace(/^Bearer\s+/i, '');
    if (presented !== BIOMETRICS_TOKEN) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
  }
  const body = req.body as HaePayload;
  const metrics = body?.data?.metrics ?? [];
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return res.status(400).json({ ok: false, error: 'expected body.data.metrics array' });
  }

  const hrMetric = metrics.find((m) => /^heart[_ ]?rate$/i.test(m.name ?? ''));
  const hrvMetric = metrics.find((m) =>
    /heart[_ ]?rate[_ ]?variability/i.test(m.name ?? ''),
  );
  const latestHr = pickLatest(hrMetric?.data);
  const latestHrv = pickLatest(hrvMetric?.data);

  if (!latestHr) {
    return res.status(400).json({
      ok: false,
      error: 'no heart_rate metric found in payload',
      metricsSeen: metrics.map((m) => m.name),
    });
  }

  const bpm = Math.max(30, Math.min(220, Math.round(latestHr.qty)));
  const hrv =
    latestHrv && Number.isFinite(latestHrv.qty)
      ? Math.max(0, Math.min(250, Math.round(latestHrv.qty)))
      : null;

  const sample: LatestHeartRate = {
    bpm,
    hrv,
    source: (latestHr.source || 'Apple Watch · Health Auto Export').slice(0, 48),
    timestamp: latestHr.date,
  };
  latestRealHeartRate = sample;
  io.emit('biometrics:hr', sample);
  return res.json({
    ok: true,
    accepted: sample,
    derivedFrom: {
      heart_rate_samples: hrMetric?.data?.length ?? 0,
      heart_rate_variability_samples: hrvMetric?.data?.length ?? 0,
    },
  });
});

// Discovery endpoint — Shortcut configures its POST URL from here.
app.get('/api/biometrics/heart-rate/endpoint', (req, res) => {
  const host = req.header('host') ?? `localhost:${PORT}`;
  const proto = (req.header('x-forwarded-proto') ?? req.protocol ?? 'http').split(',')[0];
  res.json({
    ok: true,
    url: `${proto}://${host}/api/biometrics/heart-rate`,
    authRequired: !!BIOMETRICS_TOKEN,
    payload: { bpm: 'number (30–220)', hrv: 'number, optional', timestamp: 'epoch ms, optional', source: 'string, optional' },
  });
});

app.get('/api/runtime', async (req, res) => {
  if (req.query.refresh === '1') await probeRuntime();
  res.json({ ok: true, runtime: getRuntimeHealth() });
});

app.get('/memory', async (_req, res) => {
  const memories = await loadMemories();
  res.json({ memories });
});

app.post('/memory/clear', async (_req, res) => {
  await clearMemories();
  io.emit('memory:update', []);
  res.json({ ok: true });
});

app.post('/demo/start', (_req, res) => {
  sim.start();
  res.json({ ok: true, running: sim.isRunning() });
});

app.post('/demo/reset', async (_req, res) => {
  sim.reset();
  lastNonGreenState = null;
  episodeStartTime = null;
  episodeInterventions = [];
  clearLatestAttention();
  clearLatestScreen();
  io.emit('agent:trace:reset', { timestamp: Date.now() });
  res.json({ ok: true });
});

app.post('/demo/speed', (req, res) => {
  const speed = Number(req.body?.speed);
  if (![1, 2, 4].includes(speed)) {
    return res.status(400).json({ ok: false, error: 'speed must be 1, 2, or 4' });
  }
  sim.setSpeed(speed as DemoSpeed);
  res.json({ ok: true, speed });
});

app.post('/demo/manual-state', (req, res) => {
  const state = req.body?.state as CognitiveState | null;
  const allowed: CognitiveState[] = ['Green', 'Yellow', 'Red', 'Intervention', 'Recovery'];
  if (state !== null && !allowed.includes(state)) {
    return res.status(400).json({ ok: false, error: 'invalid state' });
  }
  sim.setManualState(state ?? null);
  res.json({ ok: true, state });
});

// Face State Analyzer REST endpoint — spec section 4.
// Browser-side pipeline can use the socket OR this POST. Either way, only
// summarized metrics are accepted. Raw frames are never received here.
// Screen Understanding REST endpoint.
app.post('/api/screen-state', (req, res) => {
  const sanitized = sanitizeScreen(req.body);
  if (!sanitized) {
    return res.status(400).json({ ok: false, error: 'invalid screen payload' });
  }
  setLatestScreen(sanitized);
  io.emit('screen:update', sanitized);
  return res.json({ ok: true, screen: sanitized });
});

app.get('/api/screen-state', (_req, res) => {
  res.json({ ok: true, screen: getLatestScreen() });
});

app.get('/api/compute', (_req, res) => {
  res.json({ ok: true, telemetry: orchestrator.getComputeTelemetry() });
});

app.post('/api/attention-state', (req, res) => {
  const sanitized = sanitizeAttention(req.body);
  if (!sanitized) {
    return res.status(400).json({ ok: false, error: 'invalid attention payload' });
  }
  setLatestAttention(sanitized);
  io.emit('attention:update', sanitized);
  return res.json({ ok: true, attention: sanitized });
});

app.get('/api/attention-state', (_req, res) => {
  res.json({ ok: true, attention: getLatestAttention() });
});

app.post('/agent/run', async (_req, res) => {
  if (!lastTelemetry || !lastAssessment) {
    return res.status(409).json({ ok: false, error: 'simulation not started' });
  }
  const output = await orchestrator.run({ telemetry: lastTelemetry, assessment: lastAssessment });
  if (output.timelines) io.emit('timeline:update', output.timelines);
  for (const tr of output.toolResults) io.emit('action:log', tr);
  if (output.socratic) io.emit('socratic:update', output.socratic);
  io.emit('fallback:update', output.fallback);
  io.emit('compute:update', orchestrator.getComputeTelemetry());
  res.json({
    ok: true,
    trace: output.trace,
    toolResults: output.toolResults,
    chosenTools: output.chosenTools,
    fallback: output.fallback,
    reports: output.reports,
    insights: output.insights,
  });
});

// Socket.io -------------------------------------------------------------------

io.on('connection', async (socket) => {
  console.log(`socket connected: ${socket.id}`);

  // Bootstrap snapshot.
  if (lastTelemetry) socket.emit('telemetry:update', lastTelemetry);
  if (lastAssessment) socket.emit('cognitive:update', lastAssessment);
  socket.emit('fallback:update', getFallbackStatus());
  socket.emit('memory:update', await loadMemories());
  const attentionSnapshot = getLatestAttention();
  if (attentionSnapshot) socket.emit('attention:update', attentionSnapshot);
  const screenSnapshot = getLatestScreen();
  if (screenSnapshot) socket.emit('screen:update', screenSnapshot);
  socket.emit('compute:update', orchestrator.getComputeTelemetry());

  socket.on('demo:start', () => sim.start());
  socket.on('demo:reset', () => sim.reset());
  socket.on('demo:setSpeed', (payload: { speed: DemoSpeed }) => {
    if ([1, 2, 4].includes(payload.speed)) sim.setSpeed(payload.speed);
  });
  socket.on('demo:setManualState', (payload: { state: CognitiveState | null }) => {
    sim.setManualState(payload.state ?? null);
  });
  socket.on('attention:push', (metrics: AttentionMetrics) => {
    const sanitized = sanitizeAttention(metrics);
    if (!sanitized) return;
    setLatestAttention(sanitized);
    socket.broadcast.emit('attention:update', sanitized);
  });
  socket.on('screen:push', (summary: ScreenSummary) => {
    const sanitized = sanitizeScreen(summary);
    if (!sanitized) return;
    setLatestScreen(sanitized);
    socket.broadcast.emit('screen:update', sanitized);
  });

  socket.on('disconnect', () => {
    console.log(`socket disconnected: ${socket.id}`);
  });
});

const PORT_TO_USE = PORT;
startRuntimeHealthLoop(15_000);
server.listen(PORT_TO_USE, () => {
  console.log(`Cortex Arena server running on http://localhost:${PORT_TO_USE}`);
  console.log(`Allowed client origin: ${CLIENT_ORIGIN}`);
  console.log(`Nemotron endpoint: ${process.env.NEMOTRON_BASE_URL ?? 'http://localhost:8000/v1'}`);
});
