import { useEffect, useRef, useState } from 'react';
import type { CognitiveAssessment, Telemetry } from '../types';
import Sparkline from './Sparkline';

interface Props {
  telemetry: Telemetry | null;
  assessment: CognitiveAssessment | null;
}

const HISTORY = 40;

export default function BiometricsPanel({ telemetry, assessment }: Props) {
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
    !telemetry ? '#7a86ad'
      : telemetry.heartRate > 100 ? '#ff5c7c'
      : telemetry.heartRate > 85 ? '#ffd86b'
      : '#3ee892';

  const hrvColor =
    !telemetry ? '#7a86ad'
      : telemetry.hrv < 30 ? '#ff5c7c'
      : telemetry.hrv < 50 ? '#ffd86b'
      : '#3ee892';

  return (
    <div className="panel flex-1 min-h-0 flex flex-col">
      <div className="panel-header">
        <span>biometrics · apple watch sim</span>
        <span className="text-cortex-accent">{assessment?.state ?? '—'}</span>
      </div>
      <div className="panel-body flex-1 min-h-0 flex flex-col gap-4">
        <div>
          <div className="flex items-end justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-cortex-dim font-mono">heart rate</span>
            <span className="font-mono text-2xl" style={{ color: hrColor }}>
              {telemetry?.heartRate ?? '—'}
              <span className="text-xs text-cortex-dim ml-1">bpm</span>
            </span>
          </div>
          <Sparkline values={hrHistory} color={hrColor} fill={`${hrColor}22`} min={55} max={130} />
        </div>

        <div>
          <div className="flex items-end justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-cortex-dim font-mono">HRV</span>
            <span className="font-mono text-2xl" style={{ color: hrvColor }}>
              {telemetry?.hrv ?? '—'}
              <span className="text-xs text-cortex-dim ml-1">ms</span>
            </span>
          </div>
          <Sparkline values={hrvHistory} color={hrvColor} fill={`${hrvColor}22`} min={10} max={95} />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-auto pt-3 border-t border-cortex-border/60">
          <Stat label="typing wpm" value={telemetry?.typingSpeed ?? '—'} />
          <Stat
            label="error rate"
            value={telemetry ? `${(telemetry.errorRate * 100).toFixed(1)}%` : '—'}
            warn={!!telemetry && telemetry.errorRate > 0.08}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-cortex-dim font-mono">{label}</div>
      <div className={`font-mono text-lg ${warn ? 'text-cortex-red' : 'text-cortex-ink'}`}>{value}</div>
    </div>
  );
}
