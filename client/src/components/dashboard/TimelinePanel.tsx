import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Clock,
  Eye,
  HeartPulse,
  Layers,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';

const ICON_BY_KIND: Record<string, React.ReactNode> = {
  hr_spike: <HeartPulse className="w-3.5 h-3.5" />,
  tab_burst: <Layers className="w-3.5 h-3.5" />,
  attention_drop: <Eye className="w-3.5 h-3.5" />,
  debug_loop: <AlertCircle className="w-3.5 h-3.5" />,
  intervention: <Zap className="w-3.5 h-3.5" />,
  focus_sprint: <Timer className="w-3.5 h-3.5" />,
  insight: <Sparkles className="w-3.5 h-3.5" />,
  note: <Clock className="w-3.5 h-3.5" />,
};

const COLOR_BY_SEVERITY: Record<string, string> = {
  info: '#7cf3ff',
  warn: '#ffd86b',
  critical: '#ff5c7c',
};

export function TimelinePanel() {
  const timeline = useCortexStore((s) => s.timeline);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl glass nv-corner p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-cortex-accent/15 text-cortex-accent">
            <Clock className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">Timeline</div>
            <div className="text-[10px] font-mono text-cortex-dim mt-0.5">moments worth remembering</div>
          </div>
        </div>
        <span className="pill border border-cortex-accent/40 text-cortex-accent bg-cortex-accent/10">
          {timeline.length}
        </span>
      </div>

      <div className="max-h-72 overflow-y-auto scrollbar-thin pr-1 space-y-1.5">
        {timeline.length === 0 ? (
          <div className="text-cortex-dim text-sm italic font-mono py-4">
            Cortex will record HR spikes, attention drops, debug loops, interventions, and focus sprints here.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {timeline.map((e) => {
              const c = COLOR_BY_SEVERITY[e.severity];
              return (
                <motion.div
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border bg-cortex-bg/40 p-3"
                  style={{ borderColor: `${c}30` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2" style={{ color: c }}>
                      {ICON_BY_KIND[e.kind] ?? <Clock className="w-3.5 h-3.5" />}
                      <span className="text-[11px] font-mono uppercase tracking-widest">{e.title}</span>
                    </div>
                    <span className="text-[9px] font-mono text-cortex-dim">
                      {new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}
                    </span>
                  </div>
                  {e.detail && <div className="text-[12px] text-cortex-ink/80 leading-snug mt-1.5">{e.detail}</div>}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
