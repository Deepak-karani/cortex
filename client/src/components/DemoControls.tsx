import { useState } from 'react';
import type { CognitiveState, DemoSpeed } from '../types';

interface Props {
  onStart: () => void;
  onReset: () => void;
  onSpeed: (s: DemoSpeed) => void;
  onManualState: (s: CognitiveState | null) => void;
}

const SPEEDS: DemoSpeed[] = [1, 2, 4];
const STATES: { state: CognitiveState; color: string }[] = [
  { state: 'Green', color: 'text-cortex-green border-cortex-green/40 hover:bg-cortex-green/10' },
  { state: 'Yellow', color: 'text-cortex-yellow border-cortex-yellow/40 hover:bg-cortex-yellow/10' },
  { state: 'Red', color: 'text-cortex-red border-cortex-red/40 hover:bg-cortex-red/10' },
  { state: 'Intervention', color: 'text-cortex-violet border-cortex-violet/40 hover:bg-cortex-violet/10' },
  { state: 'Recovery', color: 'text-cortex-accent border-cortex-accent/40 hover:bg-cortex-accent/10' },
];

export default function DemoControls({ onStart, onReset, onSpeed, onManualState }: Props) {
  const [speed, setSpeed] = useState<DemoSpeed>(1);
  return (
    <div className="panel">
      <div className="panel-header">
        <span>demo controls</span>
        <span className="text-cortex-accent">judge mode</span>
      </div>
      <div className="panel-body flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onStart}
            className="flex-1 px-3 py-1.5 rounded-md bg-cortex-accent/10 border border-cortex-accent/50 text-cortex-accent font-mono text-xs uppercase tracking-widest hover:bg-cortex-accent/20 transition shadow-glow"
          >
            ▶ start demo
          </button>
          <button
            onClick={onReset}
            className="px-3 py-1.5 rounded-md bg-cortex-bg/60 border border-cortex-border text-cortex-dim hover:text-cortex-red hover:border-cortex-red/40 font-mono text-xs uppercase tracking-widest transition"
          >
            reset
          </button>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1.5">speed</div>
          <div className="flex gap-1.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSpeed(s);
                  onSpeed(s);
                }}
                className={`flex-1 py-1.5 rounded-md border font-mono text-xs transition ${
                  speed === s
                    ? 'bg-cortex-accent/20 border-cortex-accent text-cortex-accent'
                    : 'bg-cortex-bg/40 border-cortex-border text-cortex-dim hover:text-cortex-ink'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1.5">
            manual override
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {STATES.map(({ state, color }) => (
              <button
                key={state}
                onClick={() => onManualState(state)}
                className={`py-1.5 rounded-md bg-cortex-bg/40 border font-mono text-[11px] uppercase tracking-wider transition ${color}`}
              >
                {state}
              </button>
            ))}
            <button
              onClick={() => onManualState(null)}
              className="py-1.5 rounded-md bg-cortex-bg/40 border border-cortex-border text-cortex-dim hover:text-cortex-ink font-mono text-[11px] uppercase tracking-wider transition col-span-3"
            >
              clear override · resume script
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
