import { Bar, BarChart, ResponsiveContainer, YAxis } from 'recharts';

interface Props {
  history: { t: number; switches: number }[];
  color?: string;
  height?: number;
}

export function ContextSwitchChart({ history, color = '#a07bff', height = 60 }: Props) {
  const data = history.slice(-30).map((h) => ({ t: h.t, switches: h.switches }));
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <YAxis hide domain={[0, 30]} />
          <Bar dataKey="switches" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
