import { AnimatePresence, motion } from 'framer-motion';
import { Brain, ChevronDown, MessageCircleQuestion, Sparkles, Target } from 'lucide-react';
import { useState } from 'react';
import { AdvancedTracePanel } from './AdvancedTracePanel';
import { useCortexStore } from '../../store/useCortexStore';

export function ReasoningSummary() {
  const agent = useCortexStore((s) => s.agent);
  const cognitive = useCortexStore((s) => s.cognitive);
  const [open, setOpen] = useState(false);

  const noticed = agent.latestThought || cognitive.explanation;
  const why = agent.insights[0]?.body
    ?? (cognitive.state === 'overloaded'
      ? 'Multiple signals — biometrics, attention, screen — agree.'
      : 'Single-signal observation. Confidence is moderate.');
  const recommended = agent.latestRecommendation || cognitive.recommendation;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl glass nv-corner p-5 flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl grid place-items-center bg-cortex-violet/15 text-cortex-violet shadow-glow-violet">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">AI reasoning</div>
            <div className="text-[10px] font-mono text-cortex-dim mt-0.5">
              status · <span className="text-cortex-violet capitalize">{agent.status}</span>
            </div>
          </div>
        </div>
        <span className="pill border border-cortex-violet/40 text-cortex-violet bg-cortex-violet/10">
          {agent.trace.length} steps
        </span>
      </div>

      <div className="space-y-2.5">
        <Row icon={<Brain className="w-4 h-4 text-cortex-accent" />} label="Cortex noticed" body={noticed} />
        <Row icon={<MessageCircleQuestion className="w-4 h-4 text-cortex-yellow" />} label="Why it matters" body={why} />
        <Row icon={<Target className="w-4 h-4 text-nv-green" />} label="Cortex recommends" body={recommended} accent />
      </div>

      {agent.socratic && (
        <motion.div
          key={agent.socratic.timestamp}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-cortex-violet/40 bg-cortex-violet/10 p-3"
        >
          <div className="text-[10px] uppercase tracking-widest text-cortex-violet font-mono mb-1">socratic question</div>
          <div className="text-base text-cortex-ink leading-snug">{agent.socratic.question}</div>
          <div className="text-[11px] text-cortex-dim font-mono mt-1.5 italic">why · {agent.socratic.rationale}</div>
        </motion.div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="self-start flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-mono text-cortex-dim hover:text-cortex-ink transition"
      >
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.div>
        {open ? 'hide advanced trace' : 'view advanced trace'}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AdvancedTracePanel />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Row({ icon, label, body, accent = false }: { icon: React.ReactNode; label: string; body: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 flex items-start gap-2.5 ${
        accent ? 'bg-nv-green/[0.06] border-nv-green/30' : 'bg-cortex-bg/40 border-cortex-border/50'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-0.5">{label}</div>
        <div className="text-sm text-cortex-ink/85 leading-snug">{body}</div>
      </div>
    </div>
  );
}
