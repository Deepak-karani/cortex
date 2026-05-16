import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Sparkles } from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';

const TRIGGER_COLOR: Record<string, string> = {
  'Yellow → Red': '#ff5c7c',
  'Green → Red': '#ff5c7c',
  'Green → Yellow': '#ffd86b',
  'Red → Green': '#76B900',
};

/**
 * Wellness coach panel — a chat-like surface for the second Nemotron path.
 * Fires only on cognitive state transitions, so messages are sparse and
 * sacred. Renders nothing until the coach has spoken at least once.
 */
export function WellnessCoachPanel() {
  const latest = useCortexStore((s) => s.coach.latest);
  const history = useCortexStore((s) => s.coach.history);

  if (!latest) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="rounded-2xl glass nv-corner p-5 flex flex-col gap-3"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{ background: '#a07bff1f', color: '#a07bff', boxShadow: '0 0 18px #a07bff40' }}
          >
            <Heart className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">
              Wellness coach · Nemotron
            </div>
            <div className="text-[10px] font-mono text-cortex-ink/70 mt-0.5">
              speaks on cognitive state transitions
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-3 text-[12px] text-cortex-dim italic leading-snug">
          The coach is listening. It will speak when your cognitive state shifts — Yellow into
          Red, Red back to Green, or a sudden spike. Each message is grounded in your live
          biometrics, history, and upcoming calendar.
        </div>
      </motion.div>
    );
  }

  // Render history newest-first, latest gets a glow.
  const reversed = [...history].reverse();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl glass nv-corner p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{ background: '#a07bff1f', color: '#a07bff', boxShadow: '0 0 18px #a07bff40' }}
          >
            <Heart className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">
              Wellness coach · Nemotron
            </div>
            <div className="text-[10px] font-mono text-cortex-ink/70 mt-0.5">
              {history.length} check-in{history.length === 1 ? '' : 's'} this session
            </div>
          </div>
        </div>
        <span className="pill border border-cortex-violet/40 bg-cortex-violet/10 text-cortex-violet">
          <Sparkles className="w-3 h-3" />
          live
        </span>
      </div>

      <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-2 max-h-[280px] overflow-y-auto flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {reversed.map((m, i) => (
            <motion.div
              key={`${m.timestamp}-${i}`}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-md p-3"
              style={{
                background: i === 0 ? 'rgba(160, 123, 255, 0.12)' : 'transparent',
                border: i === 0 ? '1px solid rgba(160, 123, 255, 0.4)' : '1px solid rgba(255,255,255,0.05)',
                boxShadow: i === 0 ? '0 0 24px rgba(160, 123, 255, 0.2)' : 'none',
              }}
            >
              <div className="flex items-center gap-2 text-[10px] font-mono mb-1">
                <span
                  className="pill text-[9px]"
                  style={{
                    color: TRIGGER_COLOR[m.trigger] ?? '#a07bff',
                    background: `${TRIGGER_COLOR[m.trigger] ?? '#a07bff'}15`,
                    borderColor: `${TRIGGER_COLOR[m.trigger] ?? '#a07bff'}55`,
                    border: '1px solid',
                  }}
                >
                  {m.trigger}
                </span>
                <span className="text-cortex-dim">
                  {new Date(m.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div className="text-[13px] text-cortex-ink/90 leading-snug">{m.question}</div>
              {i === 0 && (
                <div
                  className="text-[10px] font-mono text-cortex-dim mt-2 truncate"
                  title={m.rationale}
                >
                  {m.rationale}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
