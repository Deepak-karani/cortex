import { useMemo } from 'react';
import type { CognitiveAssessment, MemoryRecord } from '../types';
import { PersonalizationPill } from './dashboard/PersonalizationPill';

interface Props {
  memory: MemoryRecord[];
  assessment: CognitiveAssessment | null;
  onClear: () => Promise<void>;
}

export default function MemoryReplayPanel({ memory, assessment, onClear }: Props) {
  const sorted = useMemo(() => [...memory].sort((a, b) => b.timestamp - a.timestamp), [memory]);
  const closest = useMemo(() => {
    if (!assessment) return sorted[0];
    return (
      sorted.find((m) => m.cognitiveState === assessment.state) ??
      sorted[0]
    );
  }, [sorted, assessment]);

  return (
    <div className="panel">
      <div className="panel-header">
        <span>persistent memory · /server/data/memory.json</span>
        <div className="flex items-center gap-2">
          <PersonalizationPill compact />
          <span className="text-cortex-accent">{sorted.length} episodes</span>
          <button
            className="text-cortex-dim hover:text-cortex-red text-[10px] uppercase tracking-widest font-mono"
            onClick={() => void onClear()}
          >
            clear
          </button>
        </div>
      </div>
      <div className="panel-body grid grid-cols-12 gap-3">
        <div className="col-span-5">
          <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1">
            recommendation for current state
          </div>
          {closest ? (
            <div className="p-3 rounded-md bg-cortex-bg/60 border border-cortex-accent/30 text-[12px] leading-relaxed font-mono">
              <div className="text-cortex-accent text-[11px] mb-1">
                similar pattern · {closest.cognitiveState} ·{' '}
                {new Date(closest.timestamp).toLocaleString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="text-cortex-ink/90">
                Last time, <span className="text-cortex-violet">{closest.interventions.length > 0 ? closest.interventions.join(', ') : 'no interventions'}</span>{' '}
                {closest.hrvRecovered ? 'restored HRV' : 'partially restored HRV'} in{' '}
                <span className="text-cortex-green">
                  {Math.max(1, Math.round(closest.recoveryTimeSeconds / 60))}m {closest.recoveryTimeSeconds % 60}s
                </span>
                .
              </div>
              <div className="text-cortex-dim mt-1 text-[11px]">→ recommend rerunning this bundle</div>
            </div>
          ) : (
            <div className="p-3 rounded-md bg-cortex-bg/60 border border-cortex-border/60 text-[12px] text-cortex-dim font-mono italic">
              No episodes recorded yet. Run the demo through a full Yellow→Red→Recovery arc to populate memory.
            </div>
          )}
        </div>

        <div className="col-span-7">
          <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1">
            replay log
          </div>
          <div className="max-h-40 overflow-y-auto scrollbar-thin space-y-1.5 pr-2">
            {sorted.length === 0 && (
              <div className="text-cortex-dim text-xs font-mono italic">
                Empty. memory.json is auto-created when the first overload episode resolves.
              </div>
            )}
            {sorted.map((m) => (
              <div
                key={m.id}
                className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 px-2.5 py-1.5 flex items-center gap-3"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background:
                      m.cognitiveState === 'Red'
                        ? '#ff5c7c'
                        : m.cognitiveState === 'Yellow'
                        ? '#ffd86b'
                        : '#3ee892',
                    boxShadow:
                      '0 0 8px ' +
                      (m.cognitiveState === 'Red'
                        ? '#ff5c7c'
                        : m.cognitiveState === 'Yellow'
                        ? '#ffd86b'
                        : '#3ee892'),
                  }}
                />
                <span className="font-mono text-[11px] text-cortex-ink/90 truncate flex-1">
                  {m.patternSummary}
                </span>
                <span className="font-mono text-[10px] text-cortex-dim shrink-0">
                  {m.hrvRecovered ? '✓ recovered' : '~ partial'} · {m.recoveryTimeSeconds}s
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
