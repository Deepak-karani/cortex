import type { CognitiveAssessment, Telemetry } from '../types';

interface Props {
  assessment: CognitiveAssessment | null;
  telemetry: Telemetry | null;
}

const palette: Record<string, { ring: string; glow: string; text: string; bg: string; label: string }> = {
  Green: {
    ring: 'ring-cortex-green/60',
    glow: 'shadow-glow-green',
    text: 'text-cortex-green',
    bg: 'from-cortex-green/20 via-cortex-green/5 to-transparent',
    label: 'in flow',
  },
  Yellow: {
    ring: 'ring-cortex-yellow/60',
    glow: 'shadow-glow-yellow',
    text: 'text-cortex-yellow',
    bg: 'from-cortex-yellow/25 via-cortex-yellow/5 to-transparent',
    label: 'load rising',
  },
  Red: {
    ring: 'ring-cortex-red/70',
    glow: 'shadow-glow-red',
    text: 'text-cortex-red',
    bg: 'from-cortex-red/30 via-cortex-red/5 to-transparent',
    label: 'overload detected',
  },
  Intervention: {
    ring: 'ring-cortex-violet/60',
    glow: 'shadow-glow',
    text: 'text-cortex-violet',
    bg: 'from-cortex-violet/25 via-cortex-violet/5 to-transparent',
    label: 'cortex intervening',
  },
  Recovery: {
    ring: 'ring-cortex-accent/60',
    glow: 'shadow-glow',
    text: 'text-cortex-accent',
    bg: 'from-cortex-accent/20 via-cortex-accent/5 to-transparent',
    label: 'recovering',
  },
};

export default function CognitiveStateBadge({ assessment, telemetry }: Props) {
  const state = assessment?.state ?? 'Green';
  const p = palette[state];
  const score = assessment?.cognitiveLoadScore ?? 0;
  const pct = Math.min(100, Math.max(0, score));

  return (
    <div className={`panel relative overflow-hidden ${p.glow}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${p.bg} pointer-events-none`} />
      <div className="absolute inset-0 grid-lines opacity-20 pointer-events-none" />
      <div className="panel-header relative">
        <span>cognitive state · live model</span>
        <span className={p.text}>{p.label}</span>
      </div>
      <div className="panel-body relative grid grid-cols-3 gap-6 items-center">
        <div className="flex items-center gap-5 col-span-1">
          <div
            className={`relative w-28 h-28 rounded-full ring-4 ${p.ring} flex items-center justify-center bg-cortex-bg/70`}
          >
            <div className={`absolute inset-2 rounded-full bg-current/5 animate-pulse-slow ${p.text}`} />
            <div className={`text-center ${p.text}`}>
              <div className="font-mono text-3xl leading-none">{score}</div>
              <div className="text-[10px] uppercase tracking-widest mt-1 opacity-80">load</div>
            </div>
          </div>
          <div>
            <div className={`text-[10px] uppercase tracking-widest font-mono ${p.text}`}>state</div>
            <div className={`font-mono text-3xl ${p.text}`}>{state}</div>
            <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono mt-1">
              task · {telemetry?.currentTask ?? '—'}
            </div>
          </div>
        </div>

        <div className="col-span-2 flex flex-col gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">load meter</span>
              <span className="font-mono text-[11px] text-cortex-dim">0 → 100</span>
            </div>
            <div className="relative h-3 rounded-full bg-cortex-bg/80 border border-cortex-border/60 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 bg-gradient-to-r from-cortex-green via-cortex-yellow to-cortex-red`}
                style={{ width: `${pct}%` }}
              />
              <div className="absolute inset-y-0 left-[40%] w-px bg-cortex-yellow/40" title="Yellow threshold" />
              <div className="absolute inset-y-0 left-[70%] w-px bg-cortex-red/50" title="Red threshold" />
            </div>
            <div className="flex justify-between text-[9px] font-mono text-cortex-dim mt-1">
              <span>green &lt; 40</span>
              <span>yellow 40–70</span>
              <span>red &gt; 70</span>
            </div>
          </div>

          <div className="p-3 rounded-md bg-cortex-bg/60 border border-cortex-border/60 text-[12px] leading-relaxed text-cortex-ink/90 font-mono">
            <span className={`pill mr-2 ${p.text} border border-current/40 bg-current/10`}>analysis</span>
            {assessment?.explanation ?? 'Awaiting telemetry stream...'}
          </div>
        </div>
      </div>
    </div>
  );
}
