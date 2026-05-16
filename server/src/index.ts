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
import { ReactAgent } from '../agents/reactLoop';
import {
  clearMemories,
  loadMemories,
  makeMemoryId,
  saveMemory,
} from '../memory/memoryStore';
import { getFallbackStatus } from '../agents/nemotronAgent';
import {
  clearLatestAttention,
  getLatestAttention,
  setLatestAttention,
} from '../tools/checkAttentionState';
import type {
  AgentTraceEntry,
  AttentionMetrics,
  CognitiveAssessment,
  CognitiveState,
  DemoSpeed,
  MemoryRecord,
  Telemetry,
  ToolResult,
} from './types';

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const sim = new SimulationEngine();
const agent = new ReactAgent();

// Track current state to gate agent runs.
let lastAssessment: CognitiveAssessment | null = null;
let lastTelemetry: Telemetry | null = null;
let lastNonGreenState: CognitiveState | null = null;
let episodeStartTime: number | null = null;
let episodeInterventions: string[] = [];
let lastAgentRunAt = 0;
const AGENT_RUN_INTERVAL_MS = 4000;

// Stream agent trace as it happens.
agent.on('trace', (entry: AgentTraceEntry) => {
  io.emit('agent:trace', entry);
});

// Sim → cognitive scoring → broadcast.
sim.on('telemetry', async (telemetry: Telemetry) => {
  lastTelemetry = telemetry;
  io.emit('telemetry:update', telemetry);

  const assessment = scoreCognitiveLoad(telemetry, getLatestAttention());
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

  if (shouldRun && !agent.isBusy()) {
    lastAgentRunAt = now;
    try {
      const output = await agent.run({ telemetry, assessment });

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

app.post('/agent/run', async (_req, res) => {
  if (!lastTelemetry || !lastAssessment) {
    return res.status(409).json({ ok: false, error: 'simulation not started' });
  }
  const output = await agent.run({ telemetry: lastTelemetry, assessment: lastAssessment });
  if (output.timelines) io.emit('timeline:update', output.timelines);
  for (const tr of output.toolResults) io.emit('action:log', tr);
  if (output.socratic) io.emit('socratic:update', output.socratic);
  io.emit('fallback:update', output.fallback);
  res.json({
    ok: true,
    trace: output.trace,
    toolResults: output.toolResults,
    chosenTools: output.chosenTools,
    fallback: output.fallback,
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

  socket.on('demo:start', () => sim.start());
  socket.on('demo:reset', () => sim.reset());
  socket.on('demo:setSpeed', (payload: { speed: DemoSpeed }) => {
    if ([1, 2, 4].includes(payload.speed)) sim.setSpeed(payload.speed);
  });
  socket.on('demo:setManualState', (payload: { state: CognitiveState | null }) => {
    sim.setManualState(payload.state ?? null);
  });
  socket.on('attention:push', (metrics: AttentionMetrics) => {
    if (!metrics || typeof metrics.attentionScore !== 'number') return;
    // Store summarized metrics only — never any frame data.
    const sanitized: AttentionMetrics = {
      timestamp: Date.now(),
      attentionScore: Math.max(0, Math.min(100, Math.round(metrics.attentionScore))),
      gazeDirection: metrics.gazeDirection,
      distractionDurationSeconds: Math.max(0, metrics.distractionDurationSeconds || 0),
      offscreenRatio60s: Math.max(0, Math.min(1, metrics.offscreenRatio60s || 0)),
      blinkRate: Math.max(0, metrics.blinkRate || 0),
      focusStability: Math.max(0, Math.min(100, Math.round(metrics.focusStability))),
      gazeSwitchRate: Math.max(0, metrics.gazeSwitchRate || 0),
      faceDetected: !!metrics.faceDetected,
      interpretedState: metrics.interpretedState,
      source: metrics.source === 'simulated' ? 'simulated' : 'webcam',
    };
    setLatestAttention(sanitized);
    socket.broadcast.emit('attention:update', sanitized);
  });

  socket.on('disconnect', () => {
    console.log(`socket disconnected: ${socket.id}`);
  });
});

const PORT_TO_USE = PORT;
server.listen(PORT_TO_USE, () => {
  console.log(`Cortex Arena server running on http://localhost:${PORT_TO_USE}`);
  console.log(`Allowed client origin: ${CLIENT_ORIGIN}`);
  console.log(`Nemotron endpoint: ${process.env.NEMOTRON_BASE_URL ?? 'http://localhost:8000/v1'}`);
});
