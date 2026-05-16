import { motion } from 'framer-motion';
import { Database, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type { CognitiveAssessment, MemoryRecord } from '../types';
import { Panel } from './Panel';

interface Props {
  memory: MemoryRecord[];
  assessment: CognitiveAssessment | null;
  onClear: () => Promise<void>;
}

export function MemoryTile({ memory, assessment, onClear }: Props) {
  const sorted = useMemo(() => [...memory].sort((a, b) => b.timestamp - a.timestamp), [memory]);
  const closest = useMemo(() => {
    if (!assessment) return sorted[0];
    return sorted.find((m) => m.cognitiveState === assessment.state) ?? sorted[0];
  }, [sorted, assessment]);

  return (
    <Panel
      title="persistent memory · /server/data/memory.json"
      hint={
        <span className="flex items-center gap-2">
          <span className="text-cortex-accent">{sorted.length} episodes</span>
          <button
            onClick={() => void onClear()}
            className="text-cortex-dim hover:text-cortex-red transition"
            title="clear memory"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </span>
      }
      glow="violet"
      corners
    >
      <div className="px-4 py-3 grid grid-cols-12 gap-3">
        <div className="col-span-5">
          <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono mb-1">
            recommendation for current state
          </div>
          {closest ? (
            <motion.div
              key={closest.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-md bg-cortex-bg/60 border border-cortex-accent/30 font-mono text-[12px] leading-relaxed"
            >
              <div className="flex items-center gap-1.5 text-cortex-accent text-[11px] mb-1">
                <Database className="w-3 h-3" />
                similar · {closest.cognitiveState} ·{' '}
                {new Date(closest.timestamp).toLocaleString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="text-cortex-ink/90">
                Last time,{' '}
                <span className="text-cortex-violet">
                  {closest.interventions.length > 0 ? closest.interventions.join(', ') : 'no interventions'}
                </span>{' '}
                {closest.hrvRecovered ? 'restored HRV' : 'partially restored HRV'} in{' '}
                <span className="text-nv-green">
                  {Math.max(1, Math.round(closest.recoveryTimeSeconds / 60))}m {closest.recoveryTimeSeconds % 60}s
                </span>
                .
              </div>
            </motion.div>
          ) : (
            <div className="p-3 rounded-md bg-cortex-bg/60 border border-cortex-border/60 text-[11px] text-cortex-dim font-mono italic">
              No episodes yet. memory.json is auto-created when the first overload arc resolves.
            </div>
          )}
        </div>

        <div className="col-span-7">
          <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono mb-1">
            replay log
          </div>
          <div className="max-h-36 overflow-y-auto scrollbar-thin space-y-1 pr-1">
            {sorted.length === 0 && (
              <div className="text-cortex-dim text-[11px] font-mono italic">
                Empty. Will populate when the first non-Green episode resolves.
              </div>
            )}
            {sorted.map((m) => (
              <motion.div
                key={m.id}
                layout
                className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 px-2.5 py-1.5 flex items-center gap-3"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      m.cognitiveState === 'Red' ? '#ff5c7c' : m.cognitiveState === 'Yellow' ? '#ffd86b' : '#76B900',
                    boxShadow: `0 0 8px ${
                      m.cognitiveState === 'Red' ? '#ff5c7c' : m.cognitiveState === 'Yellow' ? '#ffd86b' : '#76B900'
                    }`,
                  }}
                />
                <span className="font-mono text-[11px] text-cortex-ink/90 truncate flex-1">{m.patternSummary}</span>
                <span className="font-mono text-[10px] text-cortex-dim shrink-0">
                  {m.hrvRecovered ? '✓' : '~'} {m.recoveryTimeSeconds}s
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
