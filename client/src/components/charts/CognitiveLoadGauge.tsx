import { motion } from 'framer-motion';

interface Props {
  score: number;
  label: string;
  accent: string;
  size?: number;
  stroke?: number;
}

export function CognitiveLoadGauge({ score, label, accent, size = 200, stroke = 12 }: Props) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const dash = (score / 100) * C;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="cog-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#76B900" />
            <stop offset="55%" stopColor="#ffd86b" />
            <stop offset="100%" stopColor="#ff5c7c" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(124,243,255,0.08)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#cog-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${C}`}
          initial={false}
          animate={{ strokeDasharray: `${dash} ${C}` }}
          transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
          style={{ filter: 'drop-shadow(0 0 10px rgba(124,243,255,0.3))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[10px] uppercase tracking-[0.3em] font-mono" style={{ color: accent }}>
          load
        </div>
        <motion.div
          key={score}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="font-display text-6xl leading-none text-glow"
          style={{ color: accent }}
        >
          {score}
        </motion.div>
        <div className="text-xs uppercase tracking-[0.3em] font-mono mt-2" style={{ color: accent }}>
          {label}
        </div>
      </div>
    </div>
  );
}
