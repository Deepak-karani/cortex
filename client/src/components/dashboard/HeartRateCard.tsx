import { ArrowDown, ArrowRight, ArrowUp, HeartPulse, Minus } from 'lucide-react';
import { HeartRateChart } from '../charts/HeartRateChart';
import { SignalCard } from './SignalCard';
import { useCortexStore } from '../../store/useCortexStore';

export function HeartRateCard() {
  const hr = useCortexStore((s) => s.heartRate);

  const interpretation = !hr.connected
    ? 'Waiting for Apple Watch stream…'
    : hr.bpm == null
      ? 'No reading yet'
      : hr.stressEstimate > 0.6
        ? 'Elevated — stress response active.'
        : hr.bpm < 70 && (hr.hrv ?? 0) > 50
          ? 'Resting and relaxed.'
          : 'Stable.';

  const TrendIcon = hr.trend === 'rising' ? ArrowUp : hr.trend === 'falling' ? ArrowDown : hr.trend === 'stable' ? Minus : ArrowRight;
  const trendColor =
    hr.trend === 'rising'
      ? '#ff9a3c'
      : hr.trend === 'falling'
        ? '#7cf3ff'
        : hr.trend === 'stable'
          ? '#76B900'
          : '#6e7aa3';

  return (
    <SignalCard
      title="Heart Rate"
      icon={<HeartPulse className="w-4 h-4" />}
      connected={hr.connected}
      reading={hr.bpm != null ? `${hr.bpm} bpm` : '—'}
      interpretation={interpretation}
      lastUpdated={hr.lastUpdated}
      accent="#76B900"
      rightAction={
        <span className="pill border border-cortex-border/60 bg-cortex-bg/40 text-cortex-dim">
          <TrendIcon className="w-3 h-3" style={{ color: trendColor }} />
          <span style={{ color: trendColor }}>{hr.trend}</span>
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 mt-1">
        <Stat label="HRV" value={hr.hrv != null ? `${hr.hrv} ms` : '—'} />
        <Stat label="stress" value={`${Math.round(hr.stressEstimate * 100)}%`} warn={hr.stressEstimate > 0.6} />
      </div>
      {hr.history.length > 1 && <HeartRateChart history={hr.history} color="#76B900" height={48} />}
      <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">
        source · <span className="text-cortex-ink/80">{hr.source}</span>
      </div>
    </SignalCard>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-2">
      <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono">{label}</div>
      <div className={`text-lg font-display leading-none mt-1 ${warn ? 'text-cortex-red' : 'text-cortex-ink'}`}>{value}</div>
    </div>
  );
}
