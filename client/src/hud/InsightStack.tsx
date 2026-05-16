import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Flame, Info, Zap } from 'lucide-react';
import type { ProductivityInsight } from '../types';
import { Panel } from './Panel';

interface Props {
  insights: ProductivityInsight[];
}

const SEVERITY_META: Record<
  ProductivityInsight['severity'],
  { color: string; bg: string; ring: string; icon: React.ReactNode }
> = {
  info: {
    color: 'text-nv-green',
    bg: 'bg-nv-green/5',
    ring: 'border-nv-green/30',
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  warn: {
    color: 'text-cortex-yellow',
    bg: 'bg-cortex-yellow/5',
    ring: 'border-cortex-yellow/30',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
  critical: {
    color: 'text-cortex-red',
    bg: 'bg-cortex-red/5',
    ring: 'border-cortex-red/40',
    icon: <Flame className="w-3.5 h-3.5" />,
  },
};

export function InsightStack({ insights }: Props) {
  return (
    <Panel
      title="productivity intelligence · live patterns"
      hint={<span>{insights.length} detected</span>}
      glow={insights.some((i) => i.severity === 'critical') ? 'red' : insights.length ? 'yellow' : 'green'}
      corners
      className="flex-1 min-h-0 flex flex-col"
    >
      <div className="overflow-y-auto scrollbar-thin px-3 py-2 space-y-1.5" style={{ maxHeight: '22rem' }}>
        {insights.length === 0 && (
          <div className="text-cortex-dim text-[11px] font-mono italic py-2">
            <Info className="w-3 h-3 inline mr-1" />
            No anti-patterns detected. Cortex will surface tab thrash, debug loops, notif spikes, paralysis, deadline pressure, and attention collapse as they happen.
          </div>
        )}
        <AnimatePresence initial={false}>
          {insights.map((i) => {
            const meta = SEVERITY_META[i.severity];
            return (
              <motion.div
                key={i.id}
                layout
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={`rounded-md border ${meta.ring} ${meta.bg} px-2.5 py-1.5`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className={`flex items-center gap-1.5 ${meta.color} font-mono text-[10px] tracking-widest`}>
                    {meta.icon}
                    <span>{i.kind.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="font-mono text-[9px] text-cortex-dim">
                    {new Date(i.timestamp).toLocaleTimeString([], { hour12: false })}
                  </span>
                </div>
                <div className="text-[12px] font-mono text-cortex-ink/95 leading-snug mt-1">
                  <span className={`${meta.color} font-medium`}>{i.title}</span> — {i.body}
                </div>
                {i.recommendedTools && i.recommendedTools.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <Zap className="w-3 h-3 text-cortex-violet" />
                    {i.recommendedTools.map((t) => (
                      <span
                        key={t}
                        className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-cortex-violet/10 text-cortex-violet border border-cortex-violet/30"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
