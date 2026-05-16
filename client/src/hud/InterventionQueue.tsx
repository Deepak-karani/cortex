import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  CalendarClock,
  Database,
  FileQuestion,
  History,
  Layers,
  Monitor,
  MoonStar,
  PauseCircle,
  Sparkles,
  X,
} from 'lucide-react';
import type { ToolResult } from '../types';
import { Panel } from './Panel';

interface Props {
  actions: ToolResult[];
}

const ICONS: Record<string, React.ReactNode> = {
  recall_memory: <Database className="w-3.5 h-3.5" />,
  simulate_futures: <Layers className="w-3.5 h-3.5" />,
  mute_slack: <X className="w-3.5 h-3.5" />,
  enable_focus_mode: <Sparkles className="w-3.5 h-3.5" />,
  close_tabs: <X className="w-3.5 h-3.5" />,
  open_relevant_doc: <BookOpen className="w-3.5 h-3.5" />,
  block_calendar_time: <CalendarClock className="w-3.5 h-3.5" />,
  dim_secondary_monitor: <MoonStar className="w-3.5 h-3.5" />,
  ask_socratic: <FileQuestion className="w-3.5 h-3.5" />,
  check_attention_state: <Monitor className="w-3.5 h-3.5" />,
  do_nothing: <PauseCircle className="w-3.5 h-3.5" />,
};

export function InterventionQueue({ actions }: Props) {
  return (
    <Panel
      title="intervention log · executed actions"
      hint={
        <span className="flex items-center gap-1.5">
          <History className="w-3 h-3" />
          {actions.length}
        </span>
      }
      glow="violet"
      corners
      className="flex-1 min-h-0 flex flex-col"
    >
      <div className="overflow-y-auto scrollbar-thin px-3 py-2 space-y-1.5" style={{ maxHeight: '20rem' }}>
        {actions.length === 0 && (
          <div className="text-cortex-dim text-[11px] font-mono italic py-3">
            No interventions yet. Cortex waits for Yellow / Red conditions before acting.
          </div>
        )}
        <AnimatePresence initial={false}>
          {actions.map((a) => (
            <motion.div
              key={`${a.toolName}-${a.timestamp}`}
              layout
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-md border border-cortex-border/60 bg-cortex-bg/40 px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-cortex-violet">{ICONS[a.toolName] ?? '•'}</span>
                  <span className="font-mono text-[11px] text-cortex-accent">{a.toolName}</span>
                  <span
                    className={`pill border text-[9px] ${
                      a.success
                        ? 'border-nv-green/40 text-nv-green bg-nv-green/10'
                        : 'border-cortex-red/40 text-cortex-red bg-cortex-red/10'
                    }`}
                  >
                    {a.success ? 'ok' : 'fail'}
                  </span>
                </div>
                <span className="font-mono text-[9px] text-cortex-dim">
                  {new Date(a.timestamp).toLocaleTimeString([], { hour12: false })}
                </span>
              </div>
              <div className="text-[12px] leading-snug text-cortex-ink/90 font-mono mt-1">{a.reason}</div>
              <div className="text-[10px] text-cortex-dim font-mono mt-0.5 italic">→ {a.expectedBenefit}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
