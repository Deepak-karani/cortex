import { motion } from 'framer-motion';
import { Gauge, Play, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { CognitiveState, DemoSpeed, FallbackStatus } from '../types';
import { Panel } from './Panel';

interface Props {
  fallback: FallbackStatus;
  onStart: () => void;
  onReset: () => void;
  onSpeed: (s: DemoSpeed) => void;
  onManualState: (s: CognitiveState | null) => void;
  onRunAgent: () => Promise<void>;
}

const SPEEDS: DemoSpeed[] = [1, 2, 4];
const STATES: { state: CognitiveState; color: string }[] = [
  { state: 'Green', color: 'text-nv-green border-nv-green/40 hover:bg-nv-green/10' },
  { state: 'Yellow', color: 'text-cortex-yellow border-cortex-yellow/40 hover:bg-cortex-yellow/10' },
  { state: 'Red', color: 'text-cortex-red border-cortex-red/40 hover:bg-cortex-red/10' },
  { state: 'Intervention', color: 'text-cortex-violet border-cortex-violet/40 hover:bg-cortex-violet/10' },
  { state: 'Recovery', color: 'text-cortex-accent border-cortex-accent/40 hover:bg-cortex-accent/10' },
];

export function ControlDeck({ fallback, onStart, onReset, onSpeed, onManualState, onRunAgent }: Props) {
  const [speed, setSpeed] = useState<DemoSpeed>(1);
  const [running, setRunning] = useState(false);

  return (
    <Panel
      title="dgx control deck"
      hint={
        <span className={fallback.active ? 'text-cortex-yellow' : 'text-nv-green'}>
          {fallback.active ? 'mock fallback' : 'nemotron live'}
        </span>
      }
      glow={fallback.active ? 'yellow' : 'green'}
      corners
    >
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setRunning(true);
              onStart();
            }}
            className="flex-1 px-3 py-2 rounded-md bg-nv-green/10 border border-nv-green/50 text-nv-green font-display tracking-[0.2em] text-xs uppercase hover:bg-nv-green/20 transition shadow-glow-nv flex items-center justify-center gap-2"
          >
            <Play className="w-3.5 h-3.5" />
            start demo
          </button>
          <button
            onClick={() => {
              setRunning(false);
              onReset();
            }}
            className="px-3 py-2 rounded-md bg-cortex-bg/60 border border-cortex-border text-cortex-dim hover:text-cortex-red hover:border-cortex-red/40 font-mono text-[11px] uppercase tracking-widest transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={() => void onRunAgent()}
          className="w-full px-3 py-1.5 rounded-md bg-cortex-violet/10 border border-cortex-violet/40 text-cortex-violet font-mono text-[10px] uppercase tracking-widest hover:bg-cortex-violet/20 transition flex items-center justify-center gap-1.5"
        >
          <Sparkles className="w-3 h-3" />
          force agent tick
        </button>

        <div>
          <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-cortex-dim font-mono mb-1.5">
            <Gauge className="w-3 h-3" /> sim speed
          </div>
          <div className="flex gap-1.5">
            {SPEEDS.map((s) => (
              <motion.button
                key={s}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSpeed(s);
                  onSpeed(s);
                }}
                className={`flex-1 py-1.5 rounded-md border font-mono text-xs transition ${
                  speed === s
                    ? 'bg-nv-green/15 border-nv-green text-nv-green'
                    : 'bg-cortex-bg/40 border-cortex-border text-cortex-dim hover:text-cortex-ink'
                }`}
              >
                {s}x
              </motion.button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono mb-1.5">
            manual cognitive override
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {STATES.map(({ state, color }) => (
              <motion.button
                key={state}
                whileTap={{ scale: 0.95 }}
                onClick={() => onManualState(state)}
                className={`py-1.5 rounded-md bg-cortex-bg/40 border font-mono text-[10px] uppercase tracking-wider transition ${color}`}
              >
                {state}
              </motion.button>
            ))}
            <button
              onClick={() => onManualState(null)}
              className="py-1.5 rounded-md bg-cortex-bg/40 border border-cortex-border text-cortex-dim hover:text-cortex-ink font-mono text-[10px] uppercase tracking-wider transition col-span-3"
            >
              resume scripted arc
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
