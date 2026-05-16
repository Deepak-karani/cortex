import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

interface PanelProps extends HTMLMotionProps<'div'> {
  title?: string;
  hint?: ReactNode;
  glow?: 'green' | 'cyan' | 'violet' | 'red' | 'yellow' | 'none';
  corners?: boolean;
  scanline?: boolean;
  children: ReactNode;
}

const GLOW_CLASS: Record<NonNullable<PanelProps['glow']>, string> = {
  green: 'shadow-glow-nv',
  cyan: 'shadow-glow',
  violet: 'shadow-glow-violet',
  red: 'shadow-glow-red',
  yellow: 'shadow-glow-yellow',
  none: '',
};

export function Panel({
  title,
  hint,
  glow = 'none',
  corners = false,
  scanline = false,
  children,
  className = '',
  ...rest
}: PanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
      className={`panel relative overflow-hidden ${GLOW_CLASS[glow]} ${corners ? 'nv-corner' : ''} ${className}`}
      {...rest}
    >
      {scanline && <div className="scan-line absolute inset-0" />}
      {title && (
        <div className="panel-header">
          <span className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-nv-green shadow-glow-nv" />
            {title}
          </span>
          {hint && <span className="text-cortex-accent">{hint}</span>}
        </div>
      )}
      <div className="relative">{children}</div>
    </motion.div>
  );
}
