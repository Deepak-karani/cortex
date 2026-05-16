import type { CognitiveAssessment, FutureTimelines } from '../types';

interface Props {
  timelines: FutureTimelines | null;
  assessment: CognitiveAssessment | null;
}

function TimelineChart({
  points,
  color,
  metricKey,
  min,
  max,
  height = 90,
}: {
  points: FutureTimelines['noIntervention']['points'];
  color: string;
  metricKey: 'completionChance' | 'overloadRisk' | 'hrv' | 'heartRate';
  min: number;
  max: number;
  height?: number;
}) {
  const width = 360;
  if (points.length === 0) return <svg width={width} height={height} />;
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * (width - 8) + 4;
    const v = (p[metricKey] as number) ?? 0;
    const y = height - 4 - ((v - min) / range) * (height - 12);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${path} L ${coords.at(-1)![0]} ${height} L ${coords[0][0]} ${height} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={path} stroke={color} strokeWidth={1.7} fill="none" />
      {coords.map(([x, y], i) =>
        i === coords.length - 1 ? <circle key={i} cx={x} cy={y} r={3} fill={color} /> : null,
      )}
    </svg>
  );
}

export default function FutureTimelinePanel({ timelines, assessment }: Props) {
  const idle = !timelines || assessment?.state === 'Green';

  return (
    <div className="panel flex-1 min-h-0 flex flex-col">
      <div className="panel-header">
        <span>branching futures · 12s projection</span>
        <span className="text-cortex-accent">{idle ? 'idle' : 'simulating'}</span>
      </div>
      <div className="panel-body flex-1 min-h-0 grid grid-cols-2 gap-3">
        <TimelineCard
          title={timelines?.noIntervention.label ?? 'Timeline A — No Intervention'}
          summary={
            timelines?.noIntervention.summary ??
            'Awaiting Yellow/Red trigger to project the no-intervention timeline.'
          }
          color="#ff5c7c"
          points={timelines?.noIntervention.points ?? []}
        />
        <TimelineCard
          title={timelines?.intervention.label ?? 'Timeline B — Cortex Intervenes'}
          summary={
            timelines?.intervention.summary ??
            'Awaiting Yellow/Red trigger to project the intervention timeline.'
          }
          color="#3ee892"
          points={timelines?.intervention.points ?? []}
        />
      </div>
    </div>
  );
}

function TimelineCard({
  title,
  summary,
  color,
  points,
}: {
  title: string;
  summary: string;
  color: string;
  points: FutureTimelines['noIntervention']['points'];
}) {
  const last = points.at(-1);
  return (
    <div className="rounded-lg border border-cortex-border/60 bg-cortex-bg/40 overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-cortex-border/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
          <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color }}>
            {title}
          </span>
        </div>
        {last && (
          <span className="font-mono text-[10px] text-cortex-dim">
            completion {Math.round(last.completionChance * 100)}%
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 p-3">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono mb-1">completion chance</div>
          <TimelineChart points={points} color={color} metricKey="completionChance" min={0} max={1} />
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono mb-1">overload risk</div>
          <TimelineChart points={points} color={color} metricKey="overloadRisk" min={0} max={1} />
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono mb-1">HRV</div>
          <TimelineChart points={points} color={color} metricKey="hrv" min={10} max={95} />
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono mb-1">heart rate</div>
          <TimelineChart points={points} color={color} metricKey="heartRate" min={55} max={140} />
        </div>
      </div>

      <div className="px-3 pb-3 pt-1 text-[11px] leading-relaxed text-cortex-ink/85 font-mono">{summary}</div>
    </div>
  );
}
