import { motion } from 'framer-motion';
import { Eye, MonitorPlay, Play, Settings2, Square } from 'lucide-react';

interface Props {
  simRunning: boolean;
  cameraRunning: boolean;
  screenRunning: boolean;
  onStartDemo: () => void;
  onStopDemo: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onOpenAdmin: () => void;
}

export function QuickActions({
  simRunning,
  cameraRunning,
  screenRunning,
  onStartDemo,
  onStopDemo,
  onToggleCamera,
  onToggleScreen,
  onOpenAdmin,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {!simRunning ? (
        <Action onClick={onStartDemo} icon={<Play className="w-3 h-3" />} color="green" label="start demo" />
      ) : (
        <Action onClick={onStopDemo} icon={<Square className="w-3 h-3" />} color="red" label="reset" />
      )}
      <Action
        onClick={onToggleCamera}
        icon={<Eye className="w-3 h-3" />}
        color={cameraRunning ? 'cyan' : 'dim'}
        label={cameraRunning ? 'camera on' : 'enable camera'}
      />
      <Action
        onClick={onToggleScreen}
        icon={<MonitorPlay className="w-3 h-3" />}
        color={screenRunning ? 'cyan' : 'dim'}
        label={screenRunning ? 'screen on' : 'share screen'}
      />
      <Action onClick={onOpenAdmin} icon={<Settings2 className="w-3 h-3" />} color="violet" label="admin" />
    </div>
  );
}

const COLOR: Record<string, string> = {
  green: 'border-nv-green/50 text-nv-green bg-nv-green/10 hover:bg-nv-green/20 shadow-glow-nv',
  red: 'border-cortex-red/40 text-cortex-red bg-cortex-red/10 hover:bg-cortex-red/20',
  cyan: 'border-cortex-accent/40 text-cortex-accent bg-cortex-accent/10 hover:bg-cortex-accent/20',
  violet: 'border-cortex-violet/40 text-cortex-violet bg-cortex-violet/10 hover:bg-cortex-violet/20',
  dim: 'border-cortex-border text-cortex-dim hover:text-cortex-ink hover:border-cortex-border-hi',
};

function Action({
  onClick,
  icon,
  color,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  color: string;
  label: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border font-mono text-[10px] uppercase tracking-widest transition ${COLOR[color]}`}
    >
      {icon}
      <span>{label}</span>
    </motion.button>
  );
}
