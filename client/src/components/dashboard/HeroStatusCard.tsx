import { motion } from 'framer-motion';
import { ChevronRight, Sparkles, Timer } from 'lucide-react';
import { CognitiveLoadGauge } from '../charts/CognitiveLoadGauge';
import { useCortexStore } from '../../store/useCortexStore';
import { COGNITIVE_STATE_ACCENT, COGNITIVE_STATE_COPY, COGNITIVE_STATE_LABEL } from '../../lib/constants';

interface Props {
  onStartFocusSprint: () => void;
  onViewReasoning: () => void;
}

const HEADLINES: Record<string, string> = {
  in_flow: "You're in flow.",
  focused: "You're focused.",
  distracted: "You're drifting.",
  fatigued: "You're fatigued.",
  overloaded: 'You may be overloaded.',
  unknown: 'Calibrating sensors…',
};

export function HeroStatusCard({ onStartFocusSprint, onViewReasoning }: Props) {
  const cognitive = useCortexStore((s) => s.cognitive);
  const accent = COGNITIVE_STATE_ACCENT[cognitive.state];
  const label = COGNITIVE_STATE_LABEL[cognitive.state];
  const copy = COGNITIVE_STATE_COPY[cognitive.state];
  const headline = HEADLINES[cognitive.state] ?? 'Calibrating sensors…';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
      className="relative rounded-2xl overflow-hidden glass nv-corner"
      style={{
        boxShadow: `0 0 60px ${accent}25, 0 0 0 1px ${accent}20 inset`,
      }}
    >
      <div className="absolute inset-0 grid-lines opacity-20 pointer-events-none" />
      <div className="absolute inset-0 bg-hud-radial pointer-events-none" />

      <div className="relative grid grid-cols-12 gap-6 p-7">
        <div className="col-span-3 flex items-center justify-center">
          <CognitiveLoadGauge score={cognitive.loadScore} label={label} accent={accent} size={220} stroke={14} />
        </div>

        <div className="col-span-6 flex flex-col justify-center gap-3">
          <motion.h1
            key={headline}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-4xl tracking-tight leading-tight"
            style={{ color: accent }}
          >
            {headline}
          </motion.h1>
          <p className="text-lg text-cortex-ink/85 leading-relaxed max-w-xl">{copy}</p>
          <div className="flex items-center gap-2 mt-1">
            <Sparkles className="w-4 h-4 text-cortex-violet" />
            <span className="text-cortex-violet/90 text-sm">
              <span className="text-cortex-dim mr-1.5">Recommended:</span>
              {cognitive.recommendation}
            </span>
          </div>
          <div className="text-xs font-mono text-cortex-dim mt-1">
            {cognitive.explanation} · confidence{' '}
            <span className="text-cortex-ink/80">{Math.round(cognitive.confidence * 100)}%</span>
          </div>
        </div>

        <div className="col-span-3 flex flex-col justify-center gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onStartFocusSprint}
            className="px-4 py-3 rounded-xl bg-nv-green/15 border border-nv-green/40 text-nv-green hover:bg-nv-green/25 transition flex items-center justify-between shadow-glow-nv"
          >
            <span className="flex items-center gap-2 font-display tracking-wide">
              <Timer className="w-4 h-4" />
              Start Focus Sprint
            </span>
            <ChevronRight className="w-4 h-4" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onViewReasoning}
            className="px-4 py-3 rounded-xl bg-cortex-violet/10 border border-cortex-violet/40 text-cortex-violet hover:bg-cortex-violet/20 transition flex items-center justify-between"
          >
            <span className="flex items-center gap-2 font-display tracking-wide">
              <Sparkles className="w-4 h-4" />
              View Reasoning
            </span>
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
