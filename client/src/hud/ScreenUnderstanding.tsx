import { motion } from 'framer-motion';
import { AppWindow, Eye, FileText, Hash, MonitorPlay, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ScreenSummary } from '../types';
import type { CaptureStatus } from '../screen/screenCapture';
import { Panel } from './Panel';

interface Props {
  summary: ScreenSummary | null;
  status: CaptureStatus;
  source: 'capture' | 'simulated' | null;
  onStartCapture: () => Promise<void>;
  onStartSimulated: () => void;
  onStop: () => void;
  compact?: boolean;
}

const WORKFLOW_COLOR: Record<ScreenSummary['workflowState'], string> = {
  flow: 'text-nv-green',
  searching: 'text-cortex-accent',
  switching: 'text-cortex-yellow',
  debugging: 'text-cortex-orange',
  communicating: 'text-cortex-violet',
  idle: 'text-cortex-dim',
};

export function ScreenUnderstanding({
  summary,
  status,
  source,
  onStartCapture,
  onStartSimulated,
  onStop,
  compact = false,
}: Props) {
  return (
    <Panel
      title="screen understanding · local ocr pipeline"
      hint={
        <span className={source === 'capture' ? 'text-nv-green' : source === 'simulated' ? 'text-cortex-yellow' : 'text-cortex-dim'}>
          {source === 'capture' ? 'live capture' : source === 'simulated' ? 'simulated arc' : 'idle'}
        </span>
      }
      glow={source === 'capture' ? 'green' : 'none'}
      corners
    >
      <div className="px-4 py-3 grid grid-cols-12 gap-3">
        <div className="col-span-5 space-y-2">
          <div className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1.5">
              <AppWindow className="w-3.5 h-3.5 text-cortex-accent" />
              active context
            </div>
            <div className="font-mono text-base text-cortex-ink truncate">
              {summary?.activeApp ?? '—'}
            </div>
            <div className="font-mono text-[11px] text-cortex-dim-hi truncate mt-0.5">
              {summary?.activeTitle ?? 'no capture'}
            </div>
            {summary && (
              <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
                <span className={`pill border border-current/40 bg-current/10 ${WORKFLOW_COLOR[summary.workflowState]}`}>
                  {summary.workflowState}
                </span>
                <span className="text-cortex-dim">tabs: <span className="text-cortex-ink">{summary.tabCount}</span></span>
                <span className="text-cortex-dim">conf: <span className="text-cortex-ink">{Math.round(summary.confidence * 100)}%</span></span>
              </div>
            )}
          </div>

          <div className="flex gap-1.5">
            {status.kind !== 'running' ? (
              <button
                onClick={() => void onStartCapture()}
                className="flex-1 px-2 py-1.5 rounded-md bg-nv-green/10 border border-nv-green/50 text-nv-green font-mono text-[10px] uppercase tracking-widest hover:bg-nv-green/20 transition shadow-glow-nv"
              >
                <MonitorPlay className="w-3 h-3 inline mr-1" />
                share screen
              </button>
            ) : (
              <button
                onClick={onStop}
                className="flex-1 px-2 py-1.5 rounded-md bg-cortex-red/10 border border-cortex-red/40 text-cortex-red font-mono text-[10px] uppercase tracking-widest hover:bg-cortex-red/20"
              >
                stop capture
              </button>
            )}
            <button
              onClick={onStartSimulated}
              className="flex-1 px-2 py-1.5 rounded-md bg-cortex-accent/10 border border-cortex-accent/40 text-cortex-accent font-mono text-[10px] uppercase tracking-widest hover:bg-cortex-accent/20"
            >
              <Sparkles className="w-3 h-3 inline mr-1" />
              demo arc
            </button>
          </div>

          {!compact && (
            <div className="rounded-md border border-cortex-border/40 bg-cortex-bg/40 px-2 py-1.5 text-[10px] font-mono text-cortex-dim">
              <ShieldCheck className="w-3 h-3 inline text-nv-green mr-1" />
              <span className="text-cortex-ink">frames discarded after OCR</span> · only tokens leave the browser
            </div>
          )}
        </div>

        <div className="col-span-7 space-y-2 min-w-0">
          <div className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-nv-green" />
              inferred task
            </div>
            <div className="font-mono text-sm text-cortex-ink leading-snug">
              {summary?.inferredTask ?? 'no inference yet'}
            </div>
            <div className="font-mono text-[10px] text-cortex-dim-hi mt-1">
              intent: <span className="text-cortex-ink/90">{summary?.inferredIntent ?? '—'}</span>
              <span className="mx-2 text-cortex-dim">·</span>
              project: <span className="text-cortex-ink/90">{summary?.inferredProject ?? '—'}</span>
            </div>
          </div>

          {!compact && <TokenStream tokens={summary?.ocrTokens ?? []} />}

          {!compact && status.kind === 'running' && status.fps > 0 && (
            <div className="text-[9px] font-mono text-cortex-dim flex items-center gap-2">
              <Hash className="w-3 h-3" />
              ocr fingerprint <span className="text-cortex-accent">{status.lastHash}</span> · {status.fps} fps
            </div>
          )}
          {!compact && status.kind === 'requesting' && (
            <div className="text-[10px] font-mono text-cortex-yellow flex items-center gap-1">
              <Eye className="w-3 h-3 animate-pulse" /> requesting screen share permission...
            </div>
          )}
          {!compact && status.kind === 'loading_ocr' && (
            <div className="text-[10px] font-mono text-cortex-yellow flex items-center gap-1">
              <FileText className="w-3 h-3 animate-pulse" /> loading OCR engine (≈3MB WASM, first time only)...
            </div>
          )}
          {!compact && (status.kind === 'denied' || status.kind === 'error') && (
            <div className="text-[10px] font-mono text-cortex-orange">
              {status.reason} — running simulated arc instead.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function TokenStream({ tokens }: { tokens: string[] }) {
  const [revealed, setRevealed] = useState<number>(tokens.length);

  useEffect(() => {
    setRevealed(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= tokens.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [tokens]);

  return (
    <div className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 p-3 min-h-[68px]">
      <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1.5">
        ocr token stream (filtered)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tokens.slice(0, revealed).map((t, i) => (
          <motion.span
            key={`${t}-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-cortex-accent/10 text-cortex-accent border border-cortex-accent/30"
          >
            {t}
          </motion.span>
        ))}
        {tokens.length === 0 && (
          <span className="text-cortex-dim text-[11px] font-mono italic">awaiting capture...</span>
        )}
      </div>
    </div>
  );
}
