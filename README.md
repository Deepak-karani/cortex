# Cortex Arena

> Jarvis for productivity, running entirely on an NVIDIA DGX Spark.

Cortex Arena is an autonomous cognitive operating system. It senses biometrics,
gaze, and on-screen activity, then runs a 7-agent reasoning constellation on a
locally-hosted **Nemotron** model to detect cognitive overload **before** the
user feels it — and intervene calmly.

Built for Hack-a-Claw. Runs entirely on-device. Nothing leaves your machine
that isn't a structured summary.

---

## What it senses

| Channel | Source | Frequency |
| --- | --- | --- |
| **Biometrics** | Simulated Apple Watch (HR, HRV, typing speed, error rate, notifications, deadline) | 1 Hz |
| **Face state** | MediaPipe FaceMesh — gaze, head pose, blink rate, focus stability (browser-local; no frames stored) | ~30 Hz |
| **Screen state** | `getDisplayMedia` + Tesseract.js OCR running in browser. Tokens leave the browser; frames don't. | every 3 s |
| **Memory** | JSON-on-disk episodic memory of past overload arcs | persistent |

## What it reasons with

A **7-agent Orchestrator** running on a single **Nemotron** brain hosted on
your DGX Spark over Tailscale:

| Agent | Role |
| --- | --- |
| Orchestrator | Master loop. Spawns specialists in parallel, calls Nemotron for analyze / decide / Socratic, dispatches tools. |
| Workflow | What is the user doing right now? Which workflow state are they in (flow / searching / switching / debugging / communicating / idle)? |
| Context Memory | Closest prior overload episode, what worked, what didn't. |
| Productivity | Detects anti-patterns: tab thrash, debug loops, notification spikes, paralysis, deadline pressure, attention collapse, recovery. |
| Interruption | External pressure budget — Slack, switches, fragmentation. |
| Prioritization | Next 25-minute work queue. |
| Cognitive Load | 0–100 load score with explanation. |
| Screen Understanding | Active app, tab count, inferred task / project / intent from OCR tokens. |

All specialists run in **parallel** (`Promise.allSettled`) every orchestrator
tick. Their reports flow into Nemotron as context for the decision phase.

## What it does

11 simulated environment tools, picked per state by Nemotron:

`recall_memory` · `simulate_futures` · `check_attention_state` ·
`mute_slack` · `enable_focus_mode` · `close_tabs` · `open_relevant_doc` ·
`block_calendar_time` · `dim_secondary_monitor` · `ask_socratic` ·
`do_nothing`

The per-state posture is enforced both in the Nemotron prompt and in the mock
fallback:

- **Focused** → `do_nothing`
- **Distracted** → `ask_socratic`
- **Fatigued** → `ask_socratic + enable_focus_mode + block_calendar_time` (deliberately NO dim_secondary_monitor — user is tired, not hyperfocused)
- **Overstimulated** → `mute_slack + close_tabs + enable_focus_mode + dim_secondary_monitor`
- **Searching** → `open_relevant_doc + recall_memory`
- **Unknown** → biometric-only fallback

## What the UI shows

A cinematic HUD inspired by NVIDIA's design language and Iron Man's interface:

- **Top bar** — DGX Spark identity, model name, live state pills (load, attention, screen, Nemotron status, socket)
- **Compute strip** — `nemotron calls/min`, `avg latency`, `fallback ratio`, parallel agent throughput
- **Cognitive Core** — conic-gradient load dial 0–100 with three-zone meter and Nemotron's plain-English analysis
- **Agent Constellation** — orbital visualization of the 7 specialists, each lighting up as it reports
- **Live Reasoning Stream** — every THOUGHT / TOOL CALL / TOOL RESULT / DECISION / FINAL ACTION streamed live with the responsible agent's chip
- **Screen Understanding tile** — active context, inferred task, animated OCR token stream, privacy notice
- **Face State Analyzer** — webcam preview (mirrored), heat overlay of recent gaze, attention score ring, six live cells (gaze / off-screen / blink / pose / stability / confidence)
- **Productivity Insights** — color-coded anti-pattern feed (`tab_thrash`, `debug_loop`, `attention_collapse`, etc.) with recommended tools
- **Intervention Queue** — every executed tool with reason + expected benefit
- **Memory tile** — closest prior episode + replay log
- **Socratic tile** — the one re-anchor question Cortex chose to surface
- **DGX Control Deck** — start, reset, speed (1x/2x/4x), manual cognitive override, force agent tick

Stack: **React + TS + Vite + Tailwind + Framer Motion + lucide-react** on the
frontend; **Express + Socket.io** on the backend.

## Privacy contract

- Webcam frames live in memory for one tick (~33ms) then are overwritten. Never persisted, never sent.
- Screen frames are OCR'd on a 960px canvas locally, then the canvas is cleared immediately. Only filtered, deduped, length-bounded tokens are uplinked.
- Emails, phone numbers, and long digit strings are stripped before tokens are even considered.
- The agent's identity-recognition surface area is zero — no face descriptors, no embeddings.
- Memory store is a local JSON file under `server/data/memory.json` — auto-created on first run.

## Run it

```bash
npm run install:all      # install root + server + client
npm run dev              # starts server on :4000, client on :5173
```

Open http://localhost:5173. Click **Start Demo** to begin the Green → Yellow → Red → Intervention → Recovery arc.

### Point at your DGX Spark

Create `server/.env`:

```bash
NEMOTRON_BASE_URL=http://<spark>:11434/v1
NEMOTRON_API_KEY=ollama
NEMOTRON_MODEL=nemotron3:33b
NEMOTRON_TIMEOUT_MS=45000
```

`NEMOTRON_BASE_URL` can be any OpenAI-compatible endpoint: NIM, Ollama, vLLM,
NVIDIA build.nvidia.com, OpenRouter. The system auto-detects when Spark is
reachable; if it's not, every Nemotron call seamlessly falls back to a
deterministic mock so the demo never breaks.

### Acceptable values for `NEMOTRON_MODEL`

Anything the OpenAI-compatible endpoint advertises at `/v1/models`. We use
`nemotron3:33b` by default; `nemotron-3-super`, `gemma4:26b`, `qwen3.6:35b`
also tested and work.

## API surface

REST:

- `GET /health` — overall status + fallback state
- `GET /memory` · `POST /memory/clear`
- `POST /demo/start` · `POST /demo/reset`
- `POST /demo/speed` `{speed: 1 | 2 | 4}`
- `POST /demo/manual-state` `{state: Green | Yellow | Red | Intervention | Recovery}`
- `POST /agent/run` — force an orchestrator tick
- `POST /api/attention-state` · `GET /api/attention-state` — face metrics
- `POST /api/screen-state` · `GET /api/screen-state` — screen summaries
- `GET /api/compute` — DGX telemetry snapshot

Socket.io (server → client):

`telemetry:update` · `cognitive:update` · `timeline:update` · `agent:trace` ·
`agent:report` · `insight:new` · `action:log` · `memory:update` ·
`attention:update` · `screen:update` · `socratic:update` · `compute:update` ·
`fallback:update`

## Project layout

```
cortex_2/
├── client/
│   └── src/
│       ├── App.tsx                 # 3-column HUD layout
│       ├── hooks/
│       │   ├── useCortexSocket.ts        # all server events
│       │   ├── useAttentionTracking.ts   # FaceMesh pipeline
│       │   └── useScreenUnderstanding.ts # OCR pipeline
│       ├── attention/                    # gaze/blink/head-pose analyzer
│       ├── screen/                       # screen capture + OCR + tokenizer
│       └── hud/                          # 13 cinematic panels
└── server/
    ├── src/index.ts                # Express + Socket.io
    ├── agents/
    │   ├── orchestrator.ts         # 7-agent parallel runner
    │   ├── specialists.ts          # the 7 specialized agents
    │   ├── nemotronAgent.ts        # OpenAI-compatible adapter w/ mock fallback
    │   ├── insightDetector.ts      # productivity anti-pattern detector
    │   └── reactLoop.ts            # legacy ReAct loop (kept for back-compat)
    ├── tools/                      # 11 tools, including check_attention_state
    ├── sim/                        # simulation engine + future projector
    ├── memory/                     # JSON-backed episodic memory
    └── data/memory.json            # auto-created
```

## Demo script (90 s)

1. Click **Start Demo**.
2. The cognitive load dial ticks up. The Agent Constellation lights up agent-by-agent as each specialist reports.
3. The Reasoning Stream shows every thought, tool call, result, and decision in real time — labeled by which agent owns each step.
4. The Productivity Insights stack starts flagging anti-patterns as they emerge: notif spike, context-switch storm, attention collapse, deadline pressure.
5. State turns **Yellow**. Future Timelines branch.
6. State turns **Red**. Nemotron fires a coordinated intervention — `mute_slack`, `enable_focus_mode`, `close_tabs`, `block_calendar_time`, `dim_secondary_monitor` — and surfaces one Socratic question.
7. State returns to **Green**. The episode is written to persistent memory; next time Cortex sees this pattern it recognizes it faster.

Speed up with 2× / 4× for stage time. Use **Force Agent Tick** to trigger reasoning on demand.

---

Built for **Hack-a-Claw** on the **NVIDIA DGX Spark**.
