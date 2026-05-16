import { useEffect, useRef, useState } from 'react';
import { Activity, HeartPulse, Waves } from 'lucide-react';
import type { CognitiveAssessment, Telemetry } from '../types';
import { Panel } from './Panel';

interface Props {
  telemetry: Telemetry | null;
  assessment: CognitiveAssessment | null;
}

const HISTORY = 60;

export function BiometricsTile({ telemetry, assessment }: Props) {
  const [hrHistory, setHrHistory] = useState<number[]>([]);
  const [hrvHistory, setHrvHistory] = useState<number[]>([]);
  const lastTs = useRef<number>(0);

  useEffect(() => {
    if (!telemetry || telemetry.timestamp === lastTs.current) return;
    lastTs.current = telemetry.timestamp;
    setHrHistory((p) => [...p, telemetry.heartRate].slice(-HISTORY));
    setHrvHistory((p) => [...p, telemetry.hrv].slice(-HISTORY));
  }, [telemetry]);

  const hrColor =
    !telemetry ? '#6e7aa3'
      : telemetry.heartRate > 100 ? '#ff5c7c'
        : telemetry.heartRate > 85 ? '#ffd86b'
          : '#76B900';
  const hrvColor =
    !telemetry ? '#6e7aa3'
      : telemetry.hrv < 30 ? '#ff5c7c'
        : telemetry.hrv < 50 ? '#ffd86b'
          : '#76B900';

  return (
    <Panel title="biometrics · apple watch sim" hint={<span>{assessment?.state ?? '—'}</span>} glow="cyan" corners>
      <div className="px-4 py-3 space-y-3">
        <Row
          label="heart rate"
          unit="bpm"
          icon={<HeartPulse className="w-3.5 h-3.5" />}
          value={telemetry?.heartRate ?? '—'}
          history={hrHistory}
          color={hrColor}
          min={55}
          max={130}
        />
        <Row
          label="HRV"
          unit="ms"
          icon={<Waves className="w-3.5 h-3.5" />}
          value={telemetry?.hrv ?? '—'}
          history={hrvHistory}
          color={hrvColor}
          min={10}
          max={95}
        />
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-cortex-border/60">
          <Stat label="typing wpm" value={telemetry?.typingSpeed ?? '—'} icon={<Activity className="w-3 h-3" />} />
          <Stat
            label="error rate"
            value={telemetry ? `${(telemetry.errorRate * 100).toFixed(1)}%` : '—'}
            warn={!!telemetry && telemetry.errorRate > 0.08}
          />
          <Stat
            label="unread"
            value={telemetry?.unreadNotifications ?? '—'}
            warn={!!telemetry && telemetry.unreadNotifications > 18}
          />
        </div>
      </div>
    </Panel>
  );
}

function Row({
  label,
  unit,
  value,
  history,
  color,
  min,
  max,
  icon,
}: {
  label: string;
  unit: string;
  value: string | number;
  history: number[];
  color: string;
  min: number;
  max: number;
  icon: React.ReactNode;
}) {
  const W = 200;
  const H = 40;
  const lo = min;
  const hi = max;
  const range = hi - lo;
  const points =
    history.length < 2
      ? null
      : history
          .map((v, i) => {
            const x = (i / (history.length - 1)) * (W - 4) + 2;
            const y = H - 2 - ((v - lo) / range) * (H - 6);
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ');

  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-mono" style={{ color }}>
          {icon}
          {label}
        </span>
        <span className="font-mono text-2xl" style={{ color }}>
          {value}
          <span className="text-[10px] text-cortex-dim ml-1">{unit}</span>
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
        {points && (
          <>
            <path d={`${points} L ${W - 2} ${H} L 2 ${H} Z`} fill={`${color}22`} />
            <path d={points} stroke={color} strokeWidth={1.4} fill="none" />
          </>
        )}
      </svg>
    </div>
  );
}

function Stat({
  label,
  value,
  warn = false,
  icon,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-cortex-bg/60 border border-cortex-border/60 p-2">
      <div className="text-[8px] uppercase tracking-widest text-cortex-dim font-mono flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`font-mono text-sm ${warn ? 'text-cortex-red' : 'text-cortex-ink'}`}>{value}</div>
    </div>
  );
}
