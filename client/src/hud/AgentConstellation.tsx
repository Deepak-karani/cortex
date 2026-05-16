import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Database,
  Eye,
  GitBranch,
  ListChecks,
  Sparkles,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import { useMemo } from 'react';
import type { AgentReport, AgentRole } from '../types';
import { Panel } from './Panel';

interface Props {
  reports: AgentReport[];
}

const AGENT_META: Record<AgentRole, { label: string; icon: React.ReactNode; color: string; hex: string }> = {
  orchestrator: { label: 'Orchestrator', icon: <Sparkles className="w-4 h-4" />, color: 'text-nv-green', hex: '#76B900' },
  workflow: { label: 'Workflow', icon: <Workflow className="w-4 h-4" />, color: 'text-cortex-accent', hex: '#7cf3ff' },
  context_memory: { label: 'Memory', icon: <Database className="w-4 h-4" />, color: 'text-cortex-violet', hex: '#a07bff' },
  productivity: { label: 'Productivity', icon: <TrendingUp className="w-4 h-4" />, color: 'text-cortex-yellow', hex: '#ffd86b' },
  interruption: { label: 'Interruption', icon: <Zap className="w-4 h-4" />, color: 'text-cortex-orange', hex: '#ff9a3c' },
  prioritization: { label: 'Prioritization', icon: <ListChecks className="w-4 h-4" />, color: 'text-cortex-accent', hex: '#7cf3ff' },
  cognitive_load: { label: 'Cognitive', icon: <Brain className="w-4 h-4" />, color: 'text-nv-green', hex: '#76B900' },
  screen_understanding: { label: 'Screen', icon: <Eye className="w-4 h-4" />, color: 'text-cortex-violet', hex: '#a07bff' },
};

const SIZE = 280;
const RADIUS = 90;

const ORDER: AgentRole[] = [
  'workflow',
  'context_memory',
  'productivity',
  'interruption',
  'prioritization',
  'cognitive_load',
  'screen_understanding',
];

export function AgentConstellation({ reports }: Props) {
  const latestByAgent = useMemo(() => {
    const m = new Map<AgentRole, AgentReport>();
    for (const r of reports) {
      const existing = m.get(r.agent);
      if (!existing || existing.timestamp < r.timestamp) m.set(r.agent, r);
    }
    return m;
  }, [reports]);

  const latestReport = reports[0];

  return (
    <Panel
      title="agent constellation · 7 specialists"
      hint={<span>{reports.length} reports</span>}
      glow="green"
      corners
      scanline
      className="overflow-hidden"
    >
      <div className="grid grid-cols-12 gap-4 px-4 py-4">
        <div className="col-span-5 flex items-center justify-center relative">
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <defs>
              <radialGradient id="centerGrad">
                <stop offset="0%" stopColor="#76B900" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#76B900" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Outer ring */}
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS + 14} fill="none" stroke="rgba(124,243,255,0.06)" strokeWidth={1} />
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="rgba(124,243,255,0.15)" strokeDasharray="2 4" />

            {/* Center hub */}
            <circle cx={SIZE / 2} cy={SIZE / 2} r={26} fill="url(#centerGrad)" />
            <circle cx={SIZE / 2} cy={SIZE / 2} r={14} fill="#04050a" stroke="#76B900" strokeWidth={1.5} />
            <text
              x={SIZE / 2}
              y={SIZE / 2 + 3}
              textAnchor="middle"
              fill="#76B900"
              fontSize="9"
              fontFamily="JetBrains Mono"
              style={{ letterSpacing: '0.18em' }}
            >
              ORCH
            </text>

            {/* Spokes */}
            {ORDER.map((role, i) => {
              const angle = (i / ORDER.length) * Math.PI * 2 - Math.PI / 2;
              const x = SIZE / 2 + Math.cos(angle) * RADIUS;
              const y = SIZE / 2 + Math.sin(angle) * RADIUS;
              const recent = latestByAgent.get(role);
              const isHot = recent && Date.now() - recent.timestamp < 6000;
              const color = AGENT_META[role].hex;
              return (
                <g key={role}>
                  <line
                    x1={SIZE / 2}
                    y1={SIZE / 2}
                    x2={x}
                    y2={y}
                    stroke={isHot ? color : 'rgba(124,243,255,0.08)'}
                    strokeWidth={isHot ? 1.4 : 0.8}
                    opacity={isHot ? 0.9 : 0.5}
                  />
                  <motion.circle
                    cx={x}
                    cy={y}
                    r={isHot ? 8 : 6}
                    fill={isHot ? color : '#0b0f1c'}
                    stroke={color}
                    strokeWidth={1.3}
                    animate={{
                      r: isHot ? [6, 9, 6] : 6,
                      opacity: isHot ? [0.7, 1, 0.7] : 0.8,
                    }}
                    transition={{ duration: 1.8, repeat: Infinity }}
                  />
                  <text
                    x={SIZE / 2 + Math.cos(angle) * (RADIUS + 24)}
                    y={SIZE / 2 + Math.sin(angle) * (RADIUS + 24) + 3}
                    textAnchor="middle"
                    fill={isHot ? color : '#6e7aa3'}
                    fontSize="8"
                    fontFamily="JetBrains Mono"
                    style={{ letterSpacing: '0.15em' }}
                  >
                    {AGENT_META[role].label.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="col-span-7 min-w-0">
          <div className="grid grid-cols-2 gap-2 mb-3">
            {ORDER.map((role) => {
              const r = latestByAgent.get(role);
              const meta = AGENT_META[role];
              const isHot = r && Date.now() - r.timestamp < 6000;
              return (
                <motion.div
                  key={role}
                  layout
                  className={`p-2 rounded-md border bg-cortex-bg/40 ${
                    isHot ? 'border-current/40' : 'border-cortex-border/60'
                  } ${meta.color}`}
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest">
                    {meta.icon}
                    <span>{meta.label}</span>
                    {r && (
                      <span className="text-cortex-dim ml-auto text-[8px]">
                        {r.durationMs}ms
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-cortex-ink/90 mt-1 font-mono leading-snug line-clamp-2">
                    {r?.summary ?? 'awaiting first run...'}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {latestReport && (
              <motion.div
                key={latestReport.timestamp}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="flex items-center gap-2 text-[10px] font-mono text-cortex-dim"
              >
                <GitBranch className="w-3 h-3 text-nv-green" />
                <span>
                  latest dispatch ·{' '}
                  <span className="text-cortex-accent">{AGENT_META[latestReport.agent].label}</span> ·{' '}
                  {latestReport.durationMs}ms
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Panel>
  );
}
