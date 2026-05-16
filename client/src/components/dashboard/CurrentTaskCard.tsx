import { motion } from 'framer-motion';
import { AlertTriangle, Compass, ListChecks, MoveRight } from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';

export function CurrentTaskCard() {
  const screen = useCortexStore((s) => s.screen);
  const cognitive = useCortexStore((s) => s.cognitive);
  const reports = useCortexStore((s) => s.agent.reports);

  const prioritization = reports.find((r) => r.agent === 'prioritization');
  const nextAction =
    prioritization?.summary ??
    (cognitive.state === 'overloaded' || cognitive.state === 'fatigued'
      ? 'Take a 5-minute reset, then attack the next 25-minute block.'
      : screen.blocker
        ? 'Inspect type definition and compare expected vs actual shape.'
        : 'Keep going — Cortex will surface what to do next.');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl glass nv-corner p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-cortex-accent/15 text-cortex-accent shadow-glow-sm">
            <Compass className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">Current task</div>
            <div className="text-[10px] font-mono text-cortex-dim mt-0.5">
              project · <span className="text-cortex-ink/80">{screen.project || '—'}</span>
            </div>
          </div>
        </div>
        <span className="pill border border-cortex-accent/40 text-cortex-accent bg-cortex-accent/10">
          {screen.activeApp || '—'}
        </span>
      </div>

      <div className="font-display text-xl text-cortex-ink leading-snug">{screen.inferredTask}</div>

      {screen.blocker && (
        <div className="rounded-lg border border-cortex-orange/40 bg-cortex-orange/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-cortex-orange flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cortex-orange font-mono">Detected blocker</div>
            <div className="text-sm text-cortex-ink/85 mt-0.5">{screen.blocker}</div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1">
          <ListChecks className="w-3 h-3" />
          next best action
        </div>
        <div className="text-sm text-cortex-ink/85 leading-snug flex items-start gap-2">
          <MoveRight className="w-4 h-4 text-cortex-violet flex-shrink-0 mt-0.5" />
          {nextAction}
        </div>
      </div>
    </motion.div>
  );
}
