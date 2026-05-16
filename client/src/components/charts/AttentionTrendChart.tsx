import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';

interface Props {
  history: { t: number; score: number }[];
  color?: string;
  height?: number;
}

export function AttentionTrendChart({ history, color = '#7cf3ff', height = 60 }: Props) {
  const data = history.map((h) => ({ t: h.t, score: h.score }));
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="att-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, 100]} />
          <Area type="monotone" dataKey="score" stroke={color} strokeWidth={1.8} fill="url(#att-grad)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
