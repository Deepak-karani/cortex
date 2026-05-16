import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, ChevronsUp } from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';

/**
 * The "gasp moment" — when the user's cognitive state crosses into Red,
 * this overlay briefly takes over the viewport with a single dramatic
 * sentence built from the user's personalization profile.
 *
 * Example:
 *   "Cortex recognized this pattern.
 *    Last time HRV crashed + Slack spiked, Focus Sprint pulled you back
 *    in 7 minutes. Recommending it now."
 *
 * Restraint:
 *   - Fires *only* on the Green/Yellow → Red transition.
 *   - At most once per 90 seconds.
 *   - Auto-dismisses after ~4.5s; click anywhere to dismiss early.
 *   - Disabled entirely if the user has zero prior episodes (nothing to
 *     personalize from — we don't fake adaptive behavior).
 */
const COOLDOWN_MS = 90_000;
const DISPLAY_MS = 4_500;

export function PersonalizationCallout() {
  const cognitiveRaw = useCortexStore((s) => s.cognitive.rawState);
  const profile = useCortexStore((s) => s.profile);

  const [visible, setVisible] = useState(false);
  const prevStateRef = useRef<typeof cognitiveRaw>(null);
  const lastFiredRef = useRef<number>(0);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = cognitiveRaw;

    if (cognitiveRaw !== 'Red') return;
    if (prev === 'Red') return; // already in Red, not a fresh transition
    if (!profile || profile.episodeCount === 0) return;
    if (Date.now() - lastFiredRef.current < COOLDOWN_MS) return;

    lastFiredRef.current = Date.now();
    setVisible(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setVisible(false), DISPLAY_MS) as unknown as number;
  }, [cognitiveRaw, profile]);

  useEffect(() => () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
  }, []);

  if (!profile || profile.episodeCount === 0) return null;

  const triggerPhrase =
    profile.topTriggers.length >= 2
      ? `${profile.topTriggers[0].trigger.toLowerCase()} + ${profile.topTriggers[1].trigger.toLowerCase()}`
      : profile.topTriggers[0]?.trigger?.toLowerCase() ?? 'this pattern';
  const intervention = profile.bestIntervention?.replace(/_/g, ' ');
  const recoveryMin = profile.averageRecoverySeconds
    ? Math.max(1, Math.round(profile.averageRecoverySeconds / 60))
    : null;
  const riskyApp = profile.riskyApps[0] ?? null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="callout"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          style={{ background: 'rgba(8, 12, 24, 0.78)', backdropFilter: 'blur(6px)' }}
          onClick={() => setVisible(false)}
        >
          <motion.div
            initial={{ scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: -8 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="max-w-2xl mx-6 p-8 rounded-2xl border border-cortex-violet/40"
            style={{
              background: 'linear-gradient(180deg, rgba(160, 123, 255, 0.12), rgba(8, 12, 24, 0.95))',
              boxShadow: '0 0 80px rgba(160, 123, 255, 0.35), 0 0 0 1px rgba(160, 123, 255, 0.25) inset',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-cortex-violet" />
              <span className="text-[10px] uppercase tracking-[0.3em] font-mono text-cortex-violet">
                Cortex · pattern recognized
              </span>
            </div>
            <div className="font-display text-2xl md:text-3xl text-cortex-ink leading-snug mb-3">
              Last time {triggerPhrase} hit,{' '}
              {intervention ? (
                <span className="text-cortex-violet">{intervention}</span>
              ) : (
                <span>no clear winner</span>
              )}{' '}
              pulled you back
              {recoveryMin ? (
                <>
                  {' '}in <span className="text-cortex-green">{recoveryMin} minutes</span>
                </>
              ) : null}
              .
            </div>
            <div className="text-sm text-cortex-ink/75 leading-snug">
              Drawn from <span className="text-cortex-accent">{profile.episodeCount}</span> prior
              episodes
              {riskyApp ? (
                <>
                  {' '}and your screen history (<span className="text-cortex-orange">{riskyApp}</span>{' '}
                  has been a recurring stress trigger)
                </>
              ) : null}
              {' '}— all reasoning local on the DGX Spark, none of this leaves the machine.
            </div>
            <div className="mt-5 flex items-center gap-2 text-[11px] font-mono text-cortex-violet">
              <ChevronsUp className="w-3 h-3" />
              <span>Recommending {intervention ?? 'a Socratic re-anchor'} now.</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
