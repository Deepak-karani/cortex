import { motion } from 'framer-motion';
import { CircleDot, CircleOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatRelativeTime } from '../../lib/formatters';

interface Props {
  title: string;
  icon: ReactNode;
  connected: boolean;
  reading: string;
  interpretation: string;
  lastUpdated: number | null;
  accent: string;
  rightAction?: ReactNode;
  children?: ReactNode;
}

export function SignalCard({
  title,
  icon,
  connected,
  reading,
  interpretation,
  lastUpdated,
  accent,
  rightAction,
  children,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
      className="rounded-2xl overflow-hidden glass nv-corner relative"
      style={{ boxShadow: `0 0 0 1px ${accent}15 inset` }}
    >
      <div className="p-5 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="w-9 h-9 rounded-xl grid place-items-center"
              style={{ background: `${accent}1f`, color: accent, boxShadow: `0 0 18px ${accent}40` }}
            >
              {icon}
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">{title}</div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono mt-0.5">
                {connected ? (
                  <>
                    <CircleDot className="w-3 h-3" style={{ color: accent }} />
                    <span style={{ color: accent }}>Connected</span>
                  </>
                ) : (
                  <>
                    <CircleOff className="w-3 h-3 text-cortex-dim" />
                    <span className="text-cortex-dim">Not connected</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {rightAction}
        </div>

        <div>
          <div className="font-display text-2xl text-cortex-ink leading-none">{reading}</div>
          <div className="text-sm text-cortex-ink/75 mt-1.5 leading-snug">{interpretation}</div>
        </div>

        {children}

        <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono mt-auto pt-1">
          updated {formatRelativeTime(lastUpdated)}
        </div>
      </div>
    </motion.div>
  );
}
