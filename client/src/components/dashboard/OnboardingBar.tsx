import { motion } from 'framer-motion';
import { Check, ChevronRight, Cpu, Eye, HeartPulse, MonitorPlay, Play, Sparkles } from 'lucide-react';
import { useCortexStore } from '../../store/useCortexStore';

interface Props {
  cameraReady: boolean;
  screenReady: boolean;
  onStartDemo: () => void;
  onEnableCamera: () => void;
  onShareScreen: () => void;
  onStartSimulatedScreen: () => void;
}

export function OnboardingBar({
  cameraReady,
  screenReady,
  onStartDemo,
  onEnableCamera,
  onShareScreen,
  onStartSimulatedScreen,
}: Props) {
  const system = useCortexStore((s) => s.system);
  const heartRate = useCortexStore((s) => s.heartRate);
  const demoMode = useCortexStore((s) => s.demoMode);

  const steps: { key: string; label: string; icon: React.ReactNode; done: boolean; action?: () => void; actionLabel?: string }[] = [
    {
      key: 'demo',
      label: 'Start demo arc',
      icon: <Play className="w-3.5 h-3.5" />,
      done: demoMode,
      action: onStartDemo,
      actionLabel: 'start',
    },
    {
      key: 'hr',
      label: 'Heart rate',
      icon: <HeartPulse className="w-3.5 h-3.5" />,
      done: heartRate.connected,
    },
    {
      key: 'camera',
      label: 'Webcam attention',
      icon: <Eye className="w-3.5 h-3.5" />,
      done: cameraReady,
      action: onEnableCamera,
      actionLabel: 'enable',
    },
    {
      key: 'screen',
      label: 'Screen sharing',
      icon: <MonitorPlay className="w-3.5 h-3.5" />,
      done: screenReady,
      action: () => {
        // Try real screen capture first; if denied, the hook will fall back to simulated.
        onShareScreen();
      },
      actionLabel: 'share',
    },
    {
      key: 'dgx',
      label: 'DGX agent',
      icon: <Cpu className="w-3.5 h-3.5" />,
      done: system.openclawRunning,
    },
  ];

  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl glass nv-corner p-3 flex items-center gap-2 overflow-x-auto scrollbar-thin"
    >
      <div className="flex items-center gap-1.5 pr-2 pl-1 shrink-0">
        <Sparkles className="w-4 h-4 text-nv-green" />
        <span className="text-[10px] uppercase tracking-widest font-mono text-cortex-dim">connect to begin</span>
      </div>
      {steps.map((s, i) => {
        const { key, ...rest } = s;
        return (
          <Step
            key={key}
            {...rest}
            last={i === steps.length - 1}
            onSimScreen={key === 'screen' ? onStartSimulatedScreen : undefined}
          />
        );
      })}
    </motion.div>
  );
}

function Step({
  label,
  icon,
  done,
  action,
  actionLabel,
  last,
  onSimScreen,
}: {
  label: string;
  icon: React.ReactNode;
  done: boolean;
  action?: () => void;
  actionLabel?: string;
  last: boolean;
  onSimScreen?: () => void;
}) {
  return (
    <>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
          done ? 'border-nv-green/40 bg-nv-green/10 text-nv-green' : 'border-cortex-border/60 bg-cortex-bg/40 text-cortex-dim'
        }`}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : icon}
        <span className="text-[11px] uppercase tracking-widest font-mono whitespace-nowrap">{label}</span>
        {!done && action && (
          <button
            onClick={action}
            className="ml-1 pill border border-cortex-accent/40 bg-cortex-accent/10 text-cortex-accent hover:bg-cortex-accent/20"
          >
            {actionLabel ?? 'connect'}
          </button>
        )}
        {!done && onSimScreen && (
          <button
            onClick={onSimScreen}
            className="pill border border-cortex-violet/40 bg-cortex-violet/10 text-cortex-violet hover:bg-cortex-violet/20"
          >
            demo
          </button>
        )}
      </div>
      {!last && <ChevronRight className="w-3 h-3 text-cortex-dim shrink-0" />}
    </>
  );
}
