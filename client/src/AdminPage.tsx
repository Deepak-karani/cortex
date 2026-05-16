import { motion } from 'framer-motion';
import { ArrowLeft, ChevronRight, Cpu, Database, Eye, FileSearch, Power, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ComputeStrip } from './hud/ComputeStrip';
import { ControlDeck } from './hud/ControlDeck';
import { MemoryTile } from './hud/MemoryTile';
import { Panel } from './hud/Panel';
import type {
  AttentionMetrics,
  ComputeTelemetry,
  FallbackStatus,
  ScreenSummary,
  Telemetry,
} from './types';
import type { AttentionDiagnostic } from './hooks/useAttentionTracking';
import type { CaptureStatus } from './screen/screenCapture';
import type { CognitiveState, DemoSpeed } from './types';
import type { MemoryRecord } from './types';
import type { CognitiveAssessment } from './types';
import type { AgentReport } from './types';

interface AdminProps {
  compute: ComputeTelemetry | null;
  fallback: FallbackStatus;
  assessment: CognitiveAssessment | null;
  telemetry: Telemetry | null;
  attention: AttentionMetrics | null;
  attentionDiagnostic: AttentionDiagnostic;
  attentionStatus: string;
  screen: ScreenSummary | null;
  screenStatus: CaptureStatus;
  memory: MemoryRecord[];
  reports: AgentReport[];
  onStartDemo: () => void;
  onResetDemo: () => void;
  onSetSpeed: (s: DemoSpeed) => void;
  onManualState: (s: CognitiveState | null) => void;
  onClearMemory: () => Promise<void>;
  onRunAgent: () => Promise<void>;
  onBack: () => void;
}

export function AdminPage(props: AdminProps) {
  const [health, setHealth] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    const fetchHealth = async () => {
      try {
        const r = await fetch('/api/health').catch(() => null);
        const r2 = r && r.ok ? r : await fetch('http://localhost:4000/health');
        const j = await r2.json();
        if (alive) setHealth(j);
      } catch {
        // ignore
      }
    };
    void fetchHealth();
    const id = setInterval(fetchHealth, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-cortex-bg text-cortex-ink overflow-hidden">
      <header className="px-6 py-3 border-b border-cortex-border/60 bg-cortex-panel/40 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={props.onBack}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-cortex-border text-cortex-dim hover:text-cortex-ink hover:border-cortex-border-hi font-mono text-[10px] uppercase tracking-widest"
            >
              <ArrowLeft className="w-3 h-3" />
              hud
            </motion.button>
            <div className="leading-tight">
              <div className="font-display tracking-[0.32em] text-sm text-cortex-ink">
                CORTEX <span className="text-cortex-violet text-glow">ADMIN</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-cortex-dim font-mono">
                diagnostics · controls · telemetry · memory
              </div>
            </div>
          </div>
          <Breadcrumb />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-screen-2xl mx-auto p-4 grid grid-cols-12 gap-3">
          <div className="col-span-12">
            <ComputeStrip compute={props.compute} />
          </div>

          <div className="col-span-6">
            <ControlDeck
              fallback={props.fallback}
              onStart={props.onStartDemo}
              onReset={props.onResetDemo}
              onSpeed={props.onSetSpeed}
              onManualState={props.onManualState}
              onRunAgent={props.onRunAgent}
            />
          </div>

          <div className="col-span-6">
            <Panel
              title="nemotron · runtime"
              hint={
                <span className={props.fallback.active ? 'text-cortex-yellow' : 'text-nv-green'}>
                  {props.fallback.active ? 'mock fallback' : 'live'}
                </span>
              }
              glow={props.fallback.active ? 'yellow' : 'green'}
              corners
            >
              <div className="px-4 py-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
                <Kv label="base url" value={(health as { nemotron?: { baseUrl?: string } } | null)?.nemotron?.baseUrl ?? '—'} />
                <Kv label="model" value={(health as { nemotron?: { model?: string } } | null)?.nemotron?.model ?? '—'} />
                <Kv label="fallback active" value={String(props.fallback.active)} bad={props.fallback.active} />
                <Kv label="last probed" value={new Date(props.fallback.lastChecked).toLocaleTimeString([], { hour12: false })} />
                <div className="col-span-2 p-2 rounded-md bg-cortex-bg/60 border border-cortex-border/60 text-cortex-ink/85">
                  <div className="text-[9px] uppercase tracking-widest text-cortex-dim mb-1">last reason</div>
                  {props.fallback.reason}
                </div>
              </div>
            </Panel>
          </div>

          <div className="col-span-12">
            <MemoryTile memory={props.memory} assessment={props.assessment} onClear={props.onClearMemory} />
          </div>

          <div className="col-span-6">
            <Panel title="attention diagnostic · webcam stack" glow="cyan" corners>
              <div className="px-4 py-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
                <Kv label="origin" value={props.attentionDiagnostic.origin} />
                <Kv label="secure context" value={String(props.attentionDiagnostic.secureContext)} bad={!props.attentionDiagnostic.secureContext} />
                <Kv label="mediaDevices" value={String(props.attentionDiagnostic.mediaDevicesAvailable)} bad={!props.attentionDiagnostic.mediaDevicesAvailable} />
                <Kv label="permission" value={props.attentionDiagnostic.permissionState} bad={props.attentionDiagnostic.permissionState === 'denied'} />
                <Kv label="cameras seen" value={String(props.attentionDiagnostic.cameraDevices)} bad={props.attentionDiagnostic.cameraDevices === 0} />
                <Kv label="status" value={props.attentionStatus} />
                <Kv label="source" value={props.attention?.source ?? '—'} />
                <Kv label="score" value={String(props.attention?.attentionScore ?? '—')} />
                <Kv label="interpreted" value={props.attention?.interpretedState ?? '—'} />
                <Kv label="gaze" value={props.attention?.gazeDirection ?? '—'} />
                <Kv label="head pose" value={props.attention?.headPose ?? '—'} />
                <Kv label="confidence" value={props.attention ? `${Math.round(props.attention.confidence * 100)}%` : '—'} />
                <Kv label="blink rate" value={props.attention ? `${props.attention.blinkRate.toFixed(2)}/min` : '—'} />
                <Kv label="stability" value={String(props.attention?.focusStability ?? '—')} />
                <Kv label="offscreen 60s" value={props.attention ? `${Math.round(props.attention.offscreenRatio60s * 100)}%` : '—'} />
                <Kv label="ua" value={props.attentionDiagnostic.userAgent.split(' ').slice(-2).join(' ')} />
              </div>
            </Panel>
          </div>

          <div className="col-span-6">
            <Panel title="screen pipeline · ocr stack" glow="violet" corners>
              <div className="px-4 py-3 grid grid-cols-2 gap-2 text-[11px] font-mono">
                <Kv label="capture status" value={props.screenStatus.kind} />
                <Kv label="source" value={props.screen?.source ?? '—'} />
                <Kv label="active app" value={props.screen?.activeApp ?? '—'} />
                <Kv label="workflow" value={props.screen?.workflowState ?? '—'} />
                <Kv label="tabs" value={String(props.screen?.tabCount ?? '—')} />
                <Kv label="confidence" value={props.screen ? `${Math.round(props.screen.confidence * 100)}%` : '—'} />
                <Kv label="fingerprint" value={props.screen?.textSampleHash ?? '—'} />
                <Kv
                  label="fps"
                  value={
                    props.screenStatus.kind === 'running'
                      ? String(props.screenStatus.fps)
                      : '—'
                  }
                />
                <div className="col-span-2 p-2 rounded-md bg-cortex-bg/60 border border-cortex-border/60">
                  <div className="text-[9px] uppercase tracking-widest text-cortex-dim mb-1">latest ocr tokens</div>
                  <div className="flex flex-wrap gap-1">
                    {(props.screen?.ocrTokens ?? []).map((t, i) => (
                      <span
                        key={`${t}-${i}`}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cortex-violet/10 text-cortex-violet border border-cortex-violet/30"
                      >
                        {t}
                      </span>
                    ))}
                    {(!props.screen || props.screen.ocrTokens.length === 0) && (
                      <span className="text-cortex-dim italic">no tokens yet</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2 p-2 rounded-md bg-cortex-bg/60 border border-cortex-border/60 text-[10px] text-cortex-dim">
                  <Eye className="w-3 h-3 inline mr-1 text-nv-green" /> frames are drawn to a 960px canvas, OCR'd, then the canvas is cleared.
                  Only deduped, length-bounded, stop-word-filtered tokens leave the browser.
                </div>
              </div>
            </Panel>
          </div>

          <div className="col-span-6">
            <Panel title="raw telemetry · current tick" glow="none" corners>
              <pre className="px-4 py-3 text-[10px] font-mono leading-snug text-cortex-ink/85 overflow-x-auto whitespace-pre-wrap max-h-72 scrollbar-thin">
{JSON.stringify(props.telemetry ?? {}, null, 2)}
              </pre>
            </Panel>
          </div>

          <div className="col-span-6">
            <Panel title="cognitive assessment" glow="none" corners>
              <pre className="px-4 py-3 text-[10px] font-mono leading-snug text-cortex-ink/85 overflow-x-auto whitespace-pre-wrap max-h-72 scrollbar-thin">
{JSON.stringify(props.assessment ?? {}, null, 2)}
              </pre>
            </Panel>
          </div>

          <div className="col-span-12">
            <Panel
              title="agent reports · last 60"
              hint={<span>{props.reports.length}</span>}
              glow="none"
              corners
            >
              <div className="px-4 py-3 max-h-80 overflow-y-auto scrollbar-thin space-y-1.5">
                {props.reports.length === 0 && (
                  <div className="text-cortex-dim text-[11px] font-mono italic">No agent reports yet.</div>
                )}
                {props.reports.map((r) => (
                  <div
                    key={`${r.agent}-${r.timestamp}`}
                    className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 px-2.5 py-1.5 grid grid-cols-12 gap-2"
                  >
                    <span className="col-span-2 text-cortex-accent text-[10px] font-mono uppercase tracking-widest">
                      {r.agent}
                    </span>
                    <span className="col-span-8 text-cortex-ink/90 text-[11px] font-mono leading-snug">{r.summary}</span>
                    <span className="col-span-2 text-right text-cortex-dim text-[10px] font-mono">
                      {r.durationMs}ms · {new Date(r.timestamp).toLocaleTimeString([], { hour12: false })}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}

function Kv({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex justify-between gap-2 truncate p-2 rounded-md bg-cortex-bg/60 border border-cortex-border/60">
      <span className="text-cortex-dim text-[10px] uppercase tracking-widest">{label}</span>
      <span className={`truncate ${bad ? 'text-cortex-red' : 'text-cortex-ink'}`} title={value}>
        {value}
      </span>
    </div>
  );
}

function Breadcrumb() {
  return (
    <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-cortex-dim">
      <Power className="w-3 h-3" />
      <span>system</span>
      <ChevronRight className="w-3 h-3" />
      <Database className="w-3 h-3" />
      <span>memory</span>
      <ChevronRight className="w-3 h-3" />
      <Eye className="w-3 h-3" />
      <span>attention</span>
      <ChevronRight className="w-3 h-3" />
      <FileSearch className="w-3 h-3" />
      <span>screen</span>
      <ChevronRight className="w-3 h-3" />
      <Terminal className="w-3 h-3" />
      <span>compute</span>
      <ChevronRight className="w-3 h-3" />
      <Cpu className="w-3 h-3" />
      <span>nemotron</span>
    </div>
  );
}
