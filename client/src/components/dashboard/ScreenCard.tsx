import { motion } from 'framer-motion';
import { MonitorPlay, Power, ShieldCheck, Sparkles, Square } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CaptureStatus } from '../../screen/screenCapture';
import { ContextSwitchChart } from '../charts/ContextSwitchChart';
import { SignalCard } from './SignalCard';
import { useCortexStore } from '../../store/useCortexStore';

interface Props {
  status: CaptureStatus;
  videoElement: HTMLVideoElement | null;
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

export function ScreenCard({ status, videoElement, onShareScreen, onStartSimulated, onStop }: Props) {
  const screen = useCortexStore((s) => s.screen);
  const accent = WORKFLOW_ACCENT[screen.workflowState] ?? '#a07bff';
  const previewSlotRef = useRef<HTMLDivElement | null>(null);

  // Attach the screen capture's <video> element into our preview slot.
  // The video element is the same one OCR + frame-grabber are using, so this
  // doesn't open a second getDisplayMedia session.
  useEffect(() => {
    const slot = previewSlotRef.current;
    if (!slot) return;
    if (videoElement && status.kind === 'running') {
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      videoElement.muted = true;
      videoElement.playsInline = true;
      slot.appendChild(videoElement);
      void videoElement.play().catch(() => {});
      return () => {
        if (videoElement.parentElement === slot) slot.removeChild(videoElement);
      };
    }
  }, [videoElement, status.kind]);

  const reading = !screen.enabled ? 'Not sharing' : screen.activeApp;
  const interpretation =
    screen.workflowState === 'debugging' && screen.blocker ? screen.blocker : screen.inferredTask;

  return (
    <SignalCard
      title="Screen Analysis"
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
              <Power className="w-3 h-3" /> start
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
      {/* Live preview when sharing — gives the user immediate visual feedback. */}
      <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-cortex-bg/80 border border-cortex-border/50">
        <div ref={previewSlotRef} className="absolute inset-0" />
        {status.kind !== 'running' && (
          <div className="absolute inset-0 grid place-items-center text-cortex-dim font-mono text-[11px] text-center px-3">
            {status.kind === 'requesting'
              ? 'Requesting screen share permission…'
              : status.kind === 'loading_ocr'
                ? 'Loading OCR engine…'
                : status.kind === 'denied' || status.kind === 'error'
                  ? 'Permission denied — using simulated task arc.'
                  : 'Click Start to let Cortex see what you are working on.'}
          </div>
        )}
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-cortex-dim/90 pointer-events-none">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-nv-green" />
            local
          </span>
          <span>frames not stored</span>
          <span>summaries only</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-cortex-dim">workflow</span>
        <span className="pill border" style={{ borderColor: `${accent}55`, color: accent, background: `${accent}15` }}>
          {WORKFLOW_LABEL[screen.workflowState] ?? screen.workflowState}
        </span>
      </div>

      {screen.switchHistory.length > 1 && (
        <ContextSwitchChart history={screen.switchHistory} height={32} />
      )}
    </SignalCard>
  );
}
