import { useEffect, useRef } from 'react';
import type { AgentTraceEntry } from '../types';

interface Props {
  trace: AgentTraceEntry[];
}

const KIND_META: Record<
  AgentTraceEntry['kind'],
  { label: string; color: string; bg: string; icon: string }
> = {
  thought: {
    label: 'THOUGHT',
    color: 'text-cortex-accent',
    bg: 'border-cortex-accent/40 bg-cortex-accent/5',
    icon: '◎',
  },
  tool_call: {
    label: 'TOOL CALL',
    color: 'text-cortex-violet',
    bg: 'border-cortex-violet/40 bg-cortex-violet/5',
    icon: '▶',
  },
  tool_result: {
    label: 'TOOL RESULT',
    color: 'text-cortex-green',
    bg: 'border-cortex-green/40 bg-cortex-green/5',
    icon: '◀',
  },
  decision: {
    label: 'DECISION',
    color: 'text-cortex-yellow',
    bg: 'border-cortex-yellow/40 bg-cortex-yellow/5',
    icon: '◆',
  },
  final_action: {
    label: 'FINAL ACTION',
    color: 'text-cortex-red',
    bg: 'border-cortex-red/40 bg-cortex-red/5',
    icon: '✦',
  },
};

export default function AgentTracePanel({ trace }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [trace]);

  return (
    <div className="panel flex-shrink-0 flex flex-col" style={{ minHeight: '20rem', maxHeight: '32rem' }}>
      <div className="panel-header">
        <span>agent trace · nemotron react loop</span>
        <span className="text-cortex-accent">{trace.length} steps</span>
      </div>
      <div
        ref={scrollRef}
        className="panel-body flex-1 min-h-0 overflow-y-auto scrollbar-thin space-y-2 pr-2"
      >
        {trace.length === 0 && (
          <div className="text-cortex-dim text-xs font-mono italic">
            No trace yet. Start the demo to watch Cortex reason in real time.
          </div>
        )}
        {trace.map((t) => {
          const meta = KIND_META[t.kind];
          return (
            <div
              key={t.id}
              className={`rounded-md border ${meta.bg} px-2.5 py-2 animate-slide-up`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-mono text-[10px] tracking-widest ${meta.color}`}>
                  <span className="mr-1">{meta.icon}</span>
                  {meta.label}
                  {t.toolName && <span className="text-cortex-dim ml-1.5">· {t.toolName}</span>}
                </span>
                <span className="font-mono text-[9px] text-cortex-dim">
                  {new Date(t.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
              </div>
              <div className="text-[12px] leading-snug text-cortex-ink/95 font-mono">{t.content}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
