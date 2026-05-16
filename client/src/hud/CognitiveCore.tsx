import { motion } from 'framer-motion';
import type { CognitiveAssessment, Telemetry } from '../types';
import { Panel } from './Panel';

interface Props {
  assessment: CognitiveAssessment | null;
  telemetry: Telemetry | null;
}

const STATE_META: Record<
  string,
  { label: string; color: string; ring: string; glow: 'green' | 'yellow' | 'red' | 'violet' | 'cyan' }
> = {
  Green: { label: 'in flow', color: 'text-nv-green', ring: 'rgba(118,185,0,0.7)', glow: 'green' },
  Yellow: { label: 'load rising', color: 'text-cortex-yellow', ring: 'rgba(255,216,107,0.7)', glow: 'yellow' },
  Red: { label: 'overload', color: 'text-cortex-red', ring: 'rgba(255,92,124,0.8)', glow: 'red' },
  Intervention: { label: 'intervening', color: 'text-cortex-violet', ring: 'rgba(160,123,255,0.7)', glow: 'violet' },
  Recovery: { label: 'recovering', color: 'text-cortex-accent', ring: 'rgba(124,243,255,0.7)', glow: 'cyan' },
};

export function CognitiveCore({ assessment, telemetry }: Props) {
  const state = assessment?.state ?? 'Green';
  const meta = STATE_META[state];
  const score = assessment?.cognitiveLoadScore ?? 0;
  const radius = 76;
  const stroke = 8;
  const C = 2 * Math.PI * radius;
  const dash = (score / 100) * C;

  return (
    <Panel
      title="cognitive core · load synthesis"
      hint={<span className={meta.color}>{meta.label}</span>}
      glow={meta.glow}
      corners
    >
      <div className="px-4 py-3 grid grid-cols-12 gap-4 items-center">
        <div className="col-span-4 flex items-center justify-center">
          <div className="relative" style={{ width: 180, height: 180 }}>
            <svg width={180} height={180} viewBox="0 0 180 180" className="-rotate-90">
              <defs>
                <linearGradient id="loadGrad" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#76B900" />
                  <stop offset="60%" stopColor="#ffd86b" />
                  <stop offset="100%" stopColor="#ff5c7c" />
                </linearGradient>
              </defs>
              <circle cx={90} cy={90} r={radius} stroke="rgba(124,243,255,0.08)" strokeWidth={stroke} fill="none" />
              <motion.circle
                cx={90}
                cy={90}
                r={radius}
                stroke="url(#loadGrad)"
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${dash} ${C}`}
                initial={false}
                animate={{ strokeDasharray: `${dash} ${C}` }}
                transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
                style={{ filter: 'drop-shadow(0 0 10px rgba(124,243,255,0.3))' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={`text-[10px] uppercase tracking-[0.3em] font-mono ${meta.color}`}>load</div>
              <motion.div
                key={score}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`font-display text-5xl leading-none ${meta.color} text-glow`}
              >
                {score}
              </motion.div>
              <div className={`text-[10px] uppercase tracking-[0.3em] font-mono mt-1 ${meta.color}`}>{state}</div>
            </div>
          </div>
        </div>

        <div className="col-span-8 space-y-3">
          <div className="relative h-2 rounded-full bg-cortex-bg/80 overflow-hidden border border-cortex-border/60">
            <div className="absolute inset-y-0 left-[40%] w-px bg-cortex-yellow/50" />
            <div className="absolute inset-y-0 left-[70%] w-px bg-cortex-red/60" />
            <motion.div
              className="h-full bg-gradient-to-r from-nv-green via-cortex-yellow to-cortex-red"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, score)}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
          <div className="flex justify-between text-[9px] font-mono text-cortex-dim">
            <span>green &lt; 40</span>
            <span>yellow 40-70</span>
            <span>red &gt; 70</span>
          </div>

          <div className="p-3 rounded-md bg-cortex-bg/60 border border-cortex-border/60 font-mono text-[12px] leading-snug text-cortex-ink/90">
            <span className={`pill mr-2 ${meta.color} border border-current/40 bg-current/10`}>analysis</span>
            {assessment?.explanation ?? 'Awaiting telemetry stream...'}
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Micro label="HR" value={telemetry?.heartRate ?? '—'} unit="bpm" />
            <Micro label="HRV" value={telemetry?.hrv ?? '—'} unit="ms" />
            <Micro label="ctx/min" value={telemetry?.contextSwitches ?? '—'} />
            <Micro label="T-deadline" value={telemetry?.deadlineMinutes ?? '—'} unit="m" />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Micro({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="p-2 rounded-md bg-cortex-bg/60 border border-cortex-border/60">
      <div className="text-[8px] uppercase tracking-widest text-cortex-dim font-mono">{label}</div>
      <div className="font-mono text-base text-cortex-ink">
        {value}
        {unit && <span className="text-[9px] text-cortex-dim ml-0.5">{unit}</span>}
      </div>
    </div>
  );
}
