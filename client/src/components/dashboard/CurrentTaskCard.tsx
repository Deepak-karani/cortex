import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bug,
  Code2,
  Compass,
  Eye,
  ListChecks,
  MessageSquare,
  MoveRight,
  PaintBucket,
  Pencil,
  Sparkles,
  Tv,
  Users,
} from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';
import type { TaskType } from '../../types';

const TASK_META: Record<
  TaskType,
  { label: string; icon: React.ReactNode; accent: string }
> = {
  coding: { label: 'Coding', icon: <Code2 className="w-3.5 h-3.5" />, accent: '#7cf3ff' },
  debugging: { label: 'Debugging', icon: <Bug className="w-3.5 h-3.5" />, accent: '#ff9a3c' },
  reading: { label: 'Reading', icon: <Eye className="w-3.5 h-3.5" />, accent: '#76B900' },
  communicating: { label: 'Communicating', icon: <MessageSquare className="w-3.5 h-3.5" />, accent: '#a07bff' },
  designing: { label: 'Designing', icon: <PaintBucket className="w-3.5 h-3.5" />, accent: '#ffd86b' },
  browsing: { label: 'Browsing', icon: <Tv className="w-3.5 h-3.5" />, accent: '#7cf3ff' },
  writing: { label: 'Writing', icon: <Pencil className="w-3.5 h-3.5" />, accent: '#7cf3ff' },
  meeting: { label: 'In meeting', icon: <Users className="w-3.5 h-3.5" />, accent: '#a07bff' },
  unknown: { label: 'Unknown', icon: <Compass className="w-3.5 h-3.5" />, accent: '#6e7aa3' },
};

export function CurrentTaskCard() {
  const analysis = useCortexStore((s) => s.screen.analysis);
  const screen = useCortexStore((s) => s.screen);
  const reports = useCortexStore((s) => s.agent.reports);
  const cognitive = useCortexStore((s) => s.cognitive);

  const taskType = analysis?.taskType ?? 'unknown';
  const meta = TASK_META[taskType];
  const prioritization = reports.find((r) => r.agent === 'prioritization');
  const nextAction =
    prioritization?.summary ??
    (cognitive.state === 'overloaded' || cognitive.state === 'fatigued'
      ? 'Take a 5-minute reset, then attack the next 25-minute block.'
      : screen.blocker
        ? 'Inspect the type definition and compare expected vs actual shape.'
        : 'Keep going — Cortex will surface what to do next.');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl glass nv-corner p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-xl grid place-items-center"
            style={{ background: `${meta.accent}1f`, color: meta.accent, boxShadow: `0 0 18px ${meta.accent}40` }}
          >
            {meta.icon}
          </span>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-cortex-dim font-mono">Current task</div>
            <div className="flex items-center gap-2 text-[10px] font-mono mt-0.5">
              <span className="pill border" style={{ borderColor: `${meta.accent}55`, color: meta.accent, background: `${meta.accent}15` }}>
                {meta.label}
              </span>
              {analysis && (
                <span className="text-cortex-dim">
                  confidence{' '}
                  <span className="text-cortex-ink/80">{Math.round(analysis.confidence * 100)}%</span>
                </span>
              )}
              {analysis && (
                <span className="text-cortex-dim">
                  source <span className="text-cortex-ink/80">{analysis.source}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right text-[10px] font-mono text-cortex-dim">
          {analysis?.activeApp && <div className="text-cortex-accent">{analysis.activeApp}</div>}
          {analysis?.currentFile && <div className="truncate max-w-[180px]" title={analysis.currentFile}>{analysis.currentFile}</div>}
        </div>
      </div>

      <div className="font-display text-xl text-cortex-ink leading-snug">
        {analysis?.userIntent || screen.inferredTask || 'No task detected yet'}
      </div>

      {analysis?.summary && (
        <div className="text-sm text-cortex-ink/80 leading-snug">{analysis.summary}</div>
      )}

      {screen.blocker && (
        <div className="rounded-lg border border-cortex-orange/40 bg-cortex-orange/10 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-cortex-orange flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cortex-orange font-mono">Detected blocker</div>
            <div className="text-sm text-cortex-ink/85 mt-0.5">{screen.blocker}</div>
          </div>
        </div>
      )}

      {analysis && analysis.visibleSignals.length > 0 && (
        <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1.5">
            <Sparkles className="w-3 h-3" />
            evidence Cortex saw
          </div>
          <ul className="text-[12px] text-cortex-ink/85 space-y-1 leading-snug">
            {analysis.visibleSignals.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-cortex-violet shrink-0">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cortex-dim font-mono mb-1">
          <ListChecks className="w-3 h-3" />
          next best action
        </div>
        <div className="text-sm text-cortex-ink/85 leading-snug flex items-start gap-2">
          <MoveRight className="w-4 h-4 text-cortex-violet flex-shrink-0 mt-0.5" />
          {nextAction}
        </div>
      </div>
    </motion.div>
  );
}
