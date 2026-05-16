import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Cog,
  Lightbulb,
  Target,
  Wrench,
} from 'lucide-react';
import type { AgentTraceEntry } from '../types';
import { Panel } from './Panel';

interface Props {
  trace: AgentTraceEntry[];
}

const KIND_META: Record<
  AgentTraceEntry['kind'],
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  thought: {
    label: 'THOUGHT',
    color: 'text-cortex-accent',
    bg: 'border-cortex-accent/40 bg-cortex-accent/[0.04]',
    icon: <Brain className="w-3 h-3" />,
  },
  tool_call: {
    label: 'TOOL CALL',
    color: 'text-cortex-violet',
    bg: 'border-cortex-violet/40 bg-cortex-violet/[0.04]',
    icon: <Wrench className="w-3 h-3" />,
  },
  tool_result: {
    label: 'TOOL RESULT',
    color: 'text-nv-green',
    bg: 'border-nv-green/40 bg-nv-green/[0.04]',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  decision: {
    label: 'DECISION',
    color: 'text-cortex-yellow',
    bg: 'border-cortex-yellow/40 bg-cortex-yellow/[0.04]',
    icon: <Target className="w-3 h-3" />,
  },
  final_action: {
    label: 'FINAL ACTION',
    color: 'text-cortex-orange',
    bg: 'border-cortex-orange/40 bg-cortex-orange/[0.04]',
    icon: <Lightbulb className="w-3 h-3" />,
  },
};

export function ReasoningStream({ trace }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [trace]);

  return (
    <Panel
      title="live reasoning stream · nemotron on dgx"
      hint={
        <span className="flex items-center gap-1.5">
          <Cog className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
          {trace.length} steps
        </span>
      }
      glow="cyan"
      corners
      className="flex-1 min-h-0 flex flex-col"
      style={{ minHeight: 0 }}
    >
      <div
        ref={scrollRef}
        className="overflow-y-auto scrollbar-thin px-3 pb-3 pt-2 space-y-1.5"
        style={{ maxHeight: '34rem' }}
      >
        {trace.length === 0 && (
          <div className="text-cortex-dim text-[11px] font-mono italic px-2 py-4">
            No trace yet — start the demo to watch Cortex reason live across 7 agents.
          </div>
        )}
        <AnimatePresence initial={false}>
          {trace.map((t) => {
            const meta = KIND_META[t.kind];
            const agent = (t.payload?.agent as string) ?? '';
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`rounded-md border ${meta.bg} px-2.5 py-1.5`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`flex items-center gap-1.5 font-mono text-[10px] tracking-widest ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                    {t.toolName && (
                      <span className="text-cortex-dim ml-1">
                        <ArrowRight className="w-3 h-3 inline" /> {t.toolName}
                      </span>
                    )}
                    {agent && agent !== 'orchestrator' && (
                      <span className="text-cortex-dim ml-1">· {agent}</span>
                    )}
                  </span>
                  <span className="font-mono text-[9px] text-cortex-dim">
                    {new Date(t.timestamp).toLocaleTimeString([], { hour12: false })}
                  </span>
                </div>
                <div className="text-[12px] leading-snug text-cortex-ink/95 font-mono">{t.content}</div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
