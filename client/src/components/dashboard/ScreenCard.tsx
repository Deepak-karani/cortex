import { motion } from 'framer-motion';
import { MonitorPlay, Power, Sparkles, Square } from 'lucide-react';
import type { CaptureStatus } from '../../screen/screenCapture';
import { ContextSwitchChart } from '../charts/ContextSwitchChart';
import { SignalCard } from './SignalCard';
import { useCortexStore } from '../../store/useCortexStore';

interface Props {
  status: CaptureStatus;
  onShareScreen: () => Promise<void>;
  onStartSimulated: () => void;
  onStop: () => void;
}

const WORKFLOW_LABEL: Record<string, string> = {
  flow: 'Deep flow',
  searching: 'Researching',
  switching: 'Context switching',
  debugging: 'Debugging',
  communicating: 'In communication',
  idle: 'Idle',
};

const WORKFLOW_ACCENT: Record<string, string> = {
  flow: '#76B900',
  searching: '#7cf3ff',
  switching: '#ffd86b',
  debugging: '#ff9a3c',
  communicating: '#a07bff',
  idle: '#6e7aa3',
};

export function ScreenCard({ status, onShareScreen, onStartSimulated, onStop }: Props) {
  const screen = useCortexStore((s) => s.screen);
  const accent = WORKFLOW_ACCENT[screen.workflowState] ?? '#a07bff';

  const reading = !screen.enabled ? 'Not sharing' : screen.activeApp;
  const interpretation =
    screen.workflowState === 'debugging' && screen.blocker
      ? screen.blocker
      : screen.inferredTask;

  return (
    <SignalCard
      title="Screen Activity"
      icon={<MonitorPlay className="w-4 h-4" />}
      connected={status.kind === 'running' || screen.source === 'simulated'}
      reading={reading}
      interpretation={interpretation}
      lastUpdated={screen.lastUpdated}
      accent="#a07bff"
      rightAction={
        status.kind === 'running' ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onStop}
            className="pill border border-cortex-red/40 text-cortex-red bg-cortex-red/10 hover:bg-cortex-red/20"
          >
            <Square className="w-3 h-3" /> stop
          </motion.button>
        ) : (
          <div className="flex gap-1.5">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => void onShareScreen()}
              className="pill border border-cortex-violet/40 text-cortex-violet bg-cortex-violet/10 hover:bg-cortex-violet/20"
            >
              <Power className="w-3 h-3" /> share
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onStartSimulated}
              className="pill border border-cortex-dim/40 text-cortex-dim hover:text-cortex-ink hover:border-cortex-border-hi"
            >
              <Sparkles className="w-3 h-3" /> demo
            </motion.button>
          </div>
        )
      }
    >
      <div className="rounded-xl bg-cortex-bg/50 border border-cortex-border/50 p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">workflow</span>
          <span className="pill border" style={{ borderColor: `${accent}55`, color: accent, background: `${accent}15` }}>
            {WORKFLOW_LABEL[screen.workflowState] ?? screen.workflowState}
          </span>
        </div>
        <div className="text-sm text-cortex-ink/85 leading-snug truncate" title={screen.activeContext}>
          {screen.activeContext || 'No active context yet.'}
        </div>
        <div className="text-[10px] text-cortex-dim font-mono mt-0.5">
          project · <span className="text-cortex-ink/80">{screen.project || '—'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Mini label="context switches/min" value={String(screen.contextSwitchesPerMinute)} warn={screen.contextSwitchesPerMinute > 16} />
        <Mini label="notifications" value={String(screen.notificationCount)} warn={screen.notificationCount > 18} />
      </div>

      {screen.switchHistory.length > 1 && (
        <ContextSwitchChart history={screen.switchHistory} height={36} />
      )}

      <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">
        source ·{' '}
        <span className="text-cortex-ink/80">
          {screen.source === 'capture' ? 'live capture' : screen.source === 'simulated' ? 'demo arc' : '—'}
        </span>
      </div>
    </SignalCard>
  );
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-cortex-bg/40 border border-cortex-border/50 p-2">
      <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono">{label}</div>
      <div className={`text-lg font-display mt-0.5 ${warn ? 'text-cortex-red' : 'text-cortex-ink'}`}>{value}</div>
    </div>
  );
}
