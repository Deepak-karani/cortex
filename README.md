# Cortex Arena

> An autonomous cognitive operating system that predicts overload **before** it happens.

Cortex Arena is a Hack-a-Claw / Hackathon MVP demo that fuses simulated Apple Watch biometrics with simulated computer activity, runs a Nemotron-powered ReAct agent loop on top of the stream, and autonomously intervenes to keep a knowledge worker in flow.

The agent **thinks out loud**: every thought, tool call, tool result, decision, and final action is streamed to the judge dashboard in real time.

---

## What you see in the demo

1. The user is in flow. Heart rate is steady, HRV is high, focused on one task.
2. Notifications start piling up. Slack unreads climb. A deadline ticks closer.
3. Cortex sees heart rate creep up and HRV drop. State flips **Green → Yellow**.
4. Cortex simulates two futures: **no intervention** vs **Cortex intervenes**.
5. State crosses into **Red**. The autonomous agent fires:
   - `recall_memory` — pulls the closest prior overload pattern.
   - `simulate_futures` — projects recovery delta.
   - `mute_slack`, `enable_focus_mode`, `close_tabs`, `block_calendar_time`, `dim_secondary_monitor`.
   - `ask_socratic` — surfaces one question instead of a notification.
6. Biometrics recover. State returns to **Green**. The episode is written to persistent JSON memory so next time it's recognized faster.

---

## Hackathon prompt alignment

| Theme | Cortex Arena |
| --- | --- |
| **Autonomous AI agent** | Full ReAct loop with tool use, no human in the loop. |
| **NVIDIA Nemotron reasoning** | OpenAI-compatible adapter calls Nemotron for thought / decision steps. |
| **Live tool use** | 11 tools including a real-time webcam-driven `check_attention_state`. |
| **Persistent memory** | JSON store of past overload episodes, recalled at runtime. |
| **Real-time UI** | Socket.io stream of telemetry, cognitive state, agent trace, action log. |
| **Bias for shipping** | Works fully offline thanks to mock fallback — demo never breaks. |

---

## Attention Tracking (webcam)

Cortex Arena also senses where the user's mind is — not just their pulse.
A privacy-preserving webcam pipeline runs entirely in-browser using MediaPipe
FaceMesh, and pushes only summarized metrics (no frames, no identity) to the
backend.

| Signal | Source |
| --- | --- |
| `attentionScore` 0–100 | derived from gaze + stability + blink + face presence |
| `gazeDirection` | center / left / right / down / offscreen |
| `offscreenRatio60s` | rolling fraction of last 60s gaze was offscreen |
| `blinkRate` | blinks per minute (eye aspect ratio falling edge) |
| `focusStability` | EMA of recent gaze-direction switching |
| `gazeSwitchRate` | direction changes per minute |
| `interpretedState` | Focused / Distracted / Fatigued / Searching / Overstimulated |

The Nemotron agent gets a new tool, `check_attention_state`, and the
cognitive-load model blends attention signals directly into the score. The
agent reasons over both biometric and attention evidence in the trace.

**Privacy contract** — shown in the panel:
- Processed locally
- No video stored
- No facial identity recognition

If webcam access is denied or unsupported, the panel transparently switches to
**simulated attention** so the demo never breaks.

## Stack

- **Frontend:** React + TypeScript + Vite + TailwindCSS
- **Backend:** Node.js + Express + TypeScript
- **Realtime:** Socket.io
- **Persistent memory:** JSON on disk at `server/data/memory.json`
- **Reasoning:** OpenAI-compatible Nemotron endpoint (NVIDIA NeMo / NIM / vLLM / Spark)
- **Fallback:** Built-in mock reasoning agent — UI shows `Mock fallback active` when used

---

## Run locally

From the repo root:

```bash
npm install
npm --prefix server install
npm --prefix client install
npm run dev
```

That starts:

- Server on `http://localhost:4000`
- Client on `http://localhost:5173`

Open the client. Click **Start Demo**. Sit back.

### One-liner install

```bash
npm run install:all
npm run dev
```

---

## Connect to a Spark / Nemotron endpoint

Copy `.env.example` to `.env` (in repo root or `server/`) and set:

```bash
NEMOTRON_BASE_URL=https://your-endpoint/v1
NEMOTRON_API_KEY=sk-your-key
NEMOTRON_MODEL=nvidia/Nemotron-super-120b
```

Any OpenAI-compatible chat-completions endpoint works:

- NVIDIA NIM / Spark
- vLLM serving Nemotron
- A local Nemotron container at `http://localhost:8000/v1`
- OpenRouter / together.ai with a Nemotron model

Restart the server. The `Fallback` badge in the UI will flip to **Nemotron live**.

---

## Fallback behavior

If the Nemotron endpoint is unreachable, slow, or returns malformed JSON, the agent transparently falls back to a deterministic mock reasoner that produces the same shape of output. The UI shows **Mock fallback active** so judges know exactly what's happening — no silent failures.

This means the demo runs even without GPUs, even on a hotel wifi, even mid-flight.

---

## Demo script (90 seconds)

1. Open the dashboard. Point at the four quadrants:
   - **Top left:** Biometrics — HR, HRV, typing speed.
   - **Bottom left:** Screen behavior — active app, context switches, notifications.
   - **Center:** Cognitive state badge + two-future timeline.
   - **Right:** Agent trace (THOUGHT → TOOL → DECISION → ACTION).
2. Click **Start Demo**.
3. Within ~15s, state turns **Yellow**. Timelines branch.
4. State turns **Red**. Watch the agent trace fire: recall memory, simulate futures, decide, execute multiple tools.
5. Notifications drop. HRV climbs. State returns to **Green**.
6. Open the **Memory** panel — the episode is now persistent. Hit reset, run again, and recall fires faster.

Speed up with **2x / 4x** if you have less time on stage.

---

## API surface

REST:

- `GET /health`
- `GET /memory`
- `POST /memory/clear`
- `POST /demo/start`
- `POST /demo/reset`
- `POST /demo/speed` `{ "speed": 1 | 2 | 4 }`
- `POST /demo/manual-state` `{ "state": "Green" | "Yellow" | "Red" | "Intervention" | "Recovery" }`
- `POST /agent/run`

Socket.io:

Server emits:

- `telemetry:update`
- `cognitive:update`
- `timeline:update`
- `agent:trace`
- `action:log`
- `memory:update`
- `fallback:update`

Client emits:

- `demo:start`
- `demo:reset`
- `demo:setSpeed`
- `demo:setManualState`

---

## Project layout

```
cortex_2/
├── client/                React + Vite dashboard
│   └── src/components/    BiometricsPanel, AgentTracePanel, ...
└── server/
    ├── src/index.ts       Express + Socket.io entrypoint
    ├── agents/            Nemotron adapter + ReAct loop
    ├── tools/             cortexTools.ts — 10 simulated tools
    ├── sim/               telemetry simulation engine
    ├── memory/            JSON-backed memory store
    └── data/memory.json   persistent memory (auto-created)
```

---

## Built for Hack-a-Claw

Cortex Arena demonstrates a complete autonomous loop:
**Sense → Reason (Nemotron) → Recall → Simulate → Decide → Act → Learn.**
Every layer is visible to the judge.
