import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

interface Props {
  history: { t: number; bpm: number; hrv: number }[];
  color?: string;
  height?: number;
}

export function HeartRateChart({ history, color = '#76B900', height = 60 }: Props) {
  const data = history.map((h) => ({ t: h.t, bpm: h.bpm }));
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hr-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[50, 130]} />
          <Area type="monotone" dataKey="bpm" stroke={color} strokeWidth={1.8} fill="url(#hr-grad)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
