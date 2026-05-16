import { motion } from 'framer-motion';
import { Activity, Cpu, Eye, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  AttentionMetrics,
  CognitiveAssessment,
  ComputeTelemetry,
  FallbackStatus,
  ScreenSummary,
} from '../types';

interface Props {
  connected: boolean;
  assessment: CognitiveAssessment | null;
  fallback: FallbackStatus;
  attention: AttentionMetrics | null;
  screen: ScreenSummary | null;
  compute: ComputeTelemetry | null;
  rightSlot?: ReactNode;
}

export function HudFrame({ connected, assessment, fallback, attention, screen, compute, rightSlot }: Props) {
  const stateColor =
    assessment?.state === 'Red'
      ? 'text-cortex-red'
      : assessment?.state === 'Yellow'
        ? 'text-cortex-yellow'
        : assessment?.state === 'Intervention'
          ? 'text-cortex-violet'
          : 'text-nv-green';

  return (
    <header className="relative px-6 py-3 border-b border-cortex-border/60 bg-cortex-bg/40 backdrop-blur-xl">
      <div className="absolute inset-x-0 bottom-0 hairline" />

      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="flex items-center gap-3"
          >
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-nv-green shadow-glow-nv animate-pulse-slow" />
            </div>
            <div className="leading-tight">
              <div className="font-display tracking-[0.32em] text-sm text-cortex-ink">
                CORTEX <span className="text-nv-green text-glow">ARENA</span>
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-cortex-dim font-mono">
                cognitive operating system · dgx spark edition
              </div>
            </div>
          </motion.div>

          <div className="h-7 w-px bg-cortex-border" />

          {compute && (
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-cortex-dim">
              <Cpu className="w-3.5 h-3.5 text-nv-green" />
              <span className="text-cortex-ink">{compute.device}</span>
              <span className="text-cortex-dim-hi">·</span>
              <span className="text-cortex-accent">{compute.model}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {assessment && (
            <Chip color={stateColor} dot label={`load ${assessment.cognitiveLoadScore}`} sub={assessment.state} />
          )}
          {attention && (
            <Chip
              color={
                attention.interpretedState === 'Focused'
                  ? 'text-nv-green'
                  : attention.interpretedState === 'Distracted'
                    ? 'text-cortex-red'
                    : attention.interpretedState === 'Fatigued'
                      ? 'text-cortex-violet'
                      : attention.interpretedState === 'Unknown'
                        ? 'text-cortex-dim'
                        : 'text-cortex-yellow'
              }
              dot
              icon={<Eye className="w-3 h-3" />}
              label={`${attention.attentionScore}`}
              sub={attention.interpretedState.toLowerCase()}
            />
          )}
          {screen && (
            <Chip
              color="text-cortex-accent"
              icon={<Activity className="w-3 h-3" />}
              label={screen.activeApp}
              sub={screen.workflowState}
            />
          )}
          <Chip
            color={fallback.active ? 'text-cortex-yellow' : 'text-nv-green'}
            dot
            icon={<ShieldCheck className="w-3 h-3" />}
            label={fallback.active ? 'mock' : 'nemotron live'}
            sub={fallback.active ? 'fallback' : 'gb10'}
          />
          <Chip
            color={connected ? 'text-cortex-accent' : 'text-cortex-red'}
            dot
            icon={connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            label={connected ? 'socket' : 'offline'}
            sub={connected ? 'live' : 'lost'}
          />
          {rightSlot && <div className="ml-2 pl-3 border-l border-cortex-border/60">{rightSlot}</div>}
        </div>
      </div>
    </header>
  );
}

function Chip({
  color,
  dot,
  icon,
  label,
  sub,
}: {
  color: string;
  dot?: boolean;
  icon?: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <motion.div
      layout
      className={`pill border border-current/30 bg-current/5 ${color} flex items-center gap-1.5`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {icon}
      <span className="font-mono text-[11px]">{label}</span>
      {sub && <span className="text-cortex-dim text-[9px] uppercase tracking-widest ml-0.5">{sub}</span>}
    </motion.div>
  );
}
