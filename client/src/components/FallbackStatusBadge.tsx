import type { FallbackStatus } from '../types';

interface Props {
  fallback: FallbackStatus;
}

export default function FallbackStatusBadge({ fallback }: Props) {
  const live = !fallback.active;
  return (
    <div
      className={`panel ${
        live ? 'border-cortex-green/30' : 'border-cortex-yellow/30'
      }`}
    >
      <div className="panel-header">
        <span>nemotron reasoning</span>
        <span className={live ? 'text-cortex-green' : 'text-cortex-yellow'}>
          {live ? 'live' : 'mock fallback active'}
        </span>
      </div>
      <div className="panel-body">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              live ? 'bg-cortex-green shadow-glow-green' : 'bg-cortex-yellow shadow-glow-yellow'
            } animate-pulse-slow`}
          />
          <div className="font-mono text-[11px] text-cortex-ink/90 leading-snug">
            {fallback.reason}
          </div>
        </div>
        <div className="text-[10px] text-cortex-dim font-mono mt-2">
          last probed{' '}
          <span className="text-cortex-accent">
            {new Date(fallback.lastChecked).toLocaleTimeString([], { hour12: false })}
          </span>
        </div>
      </div>
    </div>
  );
}
