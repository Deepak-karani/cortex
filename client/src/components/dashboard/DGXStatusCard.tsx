import { Cpu, Sparkles } from 'lucide-react';
import { SignalCard } from './SignalCard';
import { useCortexStore } from '../../store/useCortexStore';

export function DGXStatusCard() {
  const system = useCortexStore((s) => s.system);
  const reading = system.openclawRunning
    ? system.nemotronModel
    : system.fallbackActive
      ? 'Mock fallback'
      : 'Probing…';
  const interpretation = system.openclawRunning
    ? `OpenClaw runtime live on ${system.device}.`
    : `Falling back to local mock. Reason: ${system.fallbackReason}`;

  return (
    <SignalCard
      title="DGX · OpenClaw · Nemotron"
      icon={<Cpu className="w-4 h-4" />}
      connected={system.dgxConnected && system.openclawRunning}
      reading={reading}
      interpretation={interpretation}
      lastUpdated={Date.now()}
      accent="#76B900"
      rightAction={
        <span
          className={`pill border ${
            system.openclawRunning
              ? 'border-nv-green/40 bg-nv-green/10 text-nv-green'
              : 'border-cortex-yellow/40 bg-cortex-yellow/10 text-cortex-yellow'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          {system.openclawRunning ? 'live' : 'fallback'}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Mini label="device" value={system.device} />
        <Mini label="avg latency" value={`${system.latencyMs}ms`} warn={system.latencyMs > 8000} />
      </div>
      <div className="rounded-md bg-cortex-bg/40 border border-cortex-border/50 p-2 font-mono text-[10px] text-cortex-dim">
        <span className="text-cortex-ink/85">model</span> · {system.nemotronModel}
      </div>
    </SignalCard>
  );
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-2 truncate">
      <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono">{label}</div>
      <div className={`text-sm font-mono mt-0.5 truncate ${warn ? 'text-cortex-red' : 'text-cortex-ink'}`} title={value}>
        {value}
      </div>
    </div>
  );
}
