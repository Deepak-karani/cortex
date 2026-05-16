import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircleQuestion } from 'lucide-react';
import type { CognitiveAssessment, SocraticPrompt } from '../types';
import { Panel } from './Panel';

interface Props {
  socratic: SocraticPrompt | null;
  assessment: CognitiveAssessment | null;
}

export function SocraticTile({ socratic, assessment }: Props) {
  const active = assessment && assessment.state !== 'Green';
  return (
    <Panel
      title="socratic prompt · one question, not a notification"
      hint={<span className={active ? 'text-cortex-yellow' : 'text-cortex-dim'}>{active ? 'live' : 'idle'}</span>}
      glow={active ? 'yellow' : 'none'}
      corners
    >
      <div className="px-4 py-3 grid grid-cols-12 gap-3 items-center">
        <div className="col-span-1 flex justify-center">
          <MessageCircleQuestion className="w-7 h-7 text-cortex-violet" />
        </div>
        <div className="col-span-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={socratic?.timestamp ?? 'idle'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="font-mono text-base text-cortex-ink leading-relaxed"
            >
              <span className="text-cortex-violet mr-2">cortex asks:</span>
              {socratic?.question ?? 'Cortex will surface one question here when load enters the danger zone.'}
            </motion.div>
          </AnimatePresence>
          {socratic && (
            <div className="text-[11px] text-cortex-dim font-mono mt-1.5 italic">why · {socratic.rationale}</div>
          )}
        </div>
        <div className="col-span-2 text-right font-mono text-[9px] uppercase tracking-widest text-cortex-dim">
          {socratic ? (
            <>
              asked <span className="text-cortex-accent">{new Date(socratic.timestamp).toLocaleTimeString([], { hour12: false })}</span>
            </>
          ) : (
            'awaiting trigger'
          )}
        </div>
      </div>
    </Panel>
  );
}
