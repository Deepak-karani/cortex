interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
  min?: number;
  max?: number;
}

export default function Sparkline({
  values,
  width = 220,
  height = 48,
  color = '#7cf3ff',
  fill = 'rgba(124, 243, 255, 0.12)',
  min,
  max,
}: Props) {
  if (values.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeDasharray="3 4" />
      </svg>
    );
  }
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const range = hi - lo || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 4) + 2;
    const y = height - 2 - ((v - lo) / range) * (height - 6);
    return [x, y] as const;
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${path} L ${points.at(-1)![0].toFixed(1)} ${height} L ${points[0][0].toFixed(1)} ${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={area} fill={fill} />
      <path d={path} stroke={color} strokeWidth={1.5} fill="none" />
      <circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r={2.5} fill={color} />
    </svg>
  );
}
