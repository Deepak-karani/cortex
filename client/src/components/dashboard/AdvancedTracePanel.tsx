import { motion } from 'framer-motion';
import { ArrowRight, Brain, CheckCircle2, Lightbulb, Target, Wrench } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { AgentTraceEntry } from '../../types';
import { useCortexStore } from '../../store/useCortexStore';

const META: Record<
  AgentTraceEntry['kind'],
  { label: string; color: string; icon: React.ReactNode }
> = {
  thought: { label: 'THOUGHT', color: '#7cf3ff', icon: <Brain className="w-3 h-3" /> },
  tool_call: { label: 'TOOL CALL', color: '#a07bff', icon: <Wrench className="w-3 h-3" /> },
  tool_result: { label: 'TOOL RESULT', color: '#76B900', icon: <CheckCircle2 className="w-3 h-3" /> },
  decision: { label: 'DECISION', color: '#ffd86b', icon: <Target className="w-3 h-3" /> },
  final_action: { label: 'FINAL ACTION', color: '#ff9a3c', icon: <Lightbulb className="w-3 h-3" /> },
};

export function AdvancedTracePanel() {
  const trace = useCortexStore((s) => s.agent.trace);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [trace]);

  return (
    <div
      ref={scrollRef}
      className="mt-3 rounded-lg border border-cortex-border/60 bg-cortex-bg/40 max-h-72 overflow-y-auto scrollbar-thin p-2 space-y-1.5"
    >
      {trace.length === 0 ? (
        <div className="text-cortex-dim text-[11px] font-mono italic p-2">
          No reasoning steps yet. Start the demo or share screen + camera to begin.
        </div>
      ) : (
        trace.map((t) => {
          const m = META[t.kind];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-md border px-2 py-1.5"
              style={{ borderColor: `${m.color}30`, background: `${m.color}07` }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-1 text-[10px] font-mono tracking-widest" style={{ color: m.color }}>
                  {m.icon}
                  {m.label}
                  {t.toolName && (
                    <>
                      <ArrowRight className="w-3 h-3 text-cortex-dim ml-1" />
                      <span className="text-cortex-dim">{t.toolName}</span>
                    </>
                  )}
                </span>
                <span className="text-[9px] font-mono text-cortex-dim">
                  {new Date(t.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
              </div>
              <div className="text-[12px] text-cortex-ink/90 font-mono leading-snug">{t.content}</div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}
