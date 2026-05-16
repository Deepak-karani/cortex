import { motion } from 'framer-motion';
import { Activity, Cpu, Gauge, Layers, Zap } from 'lucide-react';
import type { ComputeTelemetry } from '../types';

interface Props {
  compute: ComputeTelemetry | null;
}

export function ComputeStrip({ compute }: Props) {
  const fb = compute ? Math.round(compute.fallbackRatio * 100) : 0;
  return (
    <div className="glass rounded-xl px-4 py-2.5 flex items-center justify-between gap-6">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">
        <Cpu className="w-3.5 h-3.5 text-nv-green" />
        dgx compute lane
      </div>
      <div className="flex items-center gap-6 text-[11px] font-mono">
        <Metric icon={<Activity className="w-3 h-3" />} label="orch / 60s" value={compute?.agentRunsLast60s ?? 0} color="text-cortex-accent" />
        <Metric icon={<Layers className="w-3 h-3" />} label="nemotron / 60s" value={compute?.nemotronCallsLast60s ?? 0} color="text-nv-green" />
        <Metric icon={<Zap className="w-3 h-3" />} label="tools / 60s" value={compute?.toolCallsLast60s ?? 0} color="text-cortex-violet" />
        <Metric
          icon={<Gauge className="w-3 h-3" />}
          label="avg latency"
          value={`${compute?.avgLatencyMs ?? 0}ms`}
          color={
            (compute?.avgLatencyMs ?? 0) > 8000
              ? 'text-cortex-red'
              : (compute?.avgLatencyMs ?? 0) > 2500
                ? 'text-cortex-yellow'
                : 'text-nv-green'
          }
        />
        <Metric
          label="fallback ratio"
          value={`${fb}%`}
          color={fb > 30 ? 'text-cortex-yellow' : 'text-nv-green'}
        />
        <div className="relative w-24 h-1.5 rounded-full bg-cortex-bg/80 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-nv-green via-cortex-accent to-cortex-violet"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (compute?.nemotronCallsLast60s ?? 0) * 6)}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  color,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon && <span className={color}>{icon}</span>}
      <span className="text-cortex-dim uppercase tracking-widest text-[9px]">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
