import { motion } from 'framer-motion';
import { CameraOff, Eye, Power, ShieldCheck } from 'lucide-react';
import type { AttentionDiagnostic, WebcamStatus } from '../../hooks/useAttentionTracking';
import { AttentionTrendChart } from '../charts/AttentionTrendChart';
import { SignalCard } from './SignalCard';
import { useCortexStore } from '../../store/useCortexStore';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: WebcamStatus;
  diagnostic: AttentionDiagnostic;
  streamActive: boolean;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
}

const STATE_COPY: Record<string, string> = {
  focused: 'Stable centered gaze. Mind on task.',
  distracted: 'Gaze leaving the screen.',
  fatigued: 'Blink rate elevated.',
  searching: 'Scanning multiple regions.',
  overstimulated: 'Rapid gaze switching.',
  unknown: 'No face yet.',
};

const STATE_ACCENT: Record<string, string> = {
  focused: '#76B900',
  distracted: '#ff5c7c',
  fatigued: '#a07bff',
  searching: '#ffd86b',
  overstimulated: '#7cf3ff',
  unknown: '#6e7aa3',
};

export function WebcamCard({
  videoRef,
  status,
  diagnostic,
  streamActive,
  errorMessage,
  onStart,
  onStop,
}: Props) {
  const webcam = useCortexStore((s) => s.webcam);
  const accent = STATE_ACCENT[webcam.state];

  const reading = !webcam.enabled
    ? 'Disabled'
    : webcam.attentionScore != null
      ? `${webcam.attentionScore}% attention`
      : 'Calibrating…';
  const interpretation = !webcam.enabled
    ? 'Click Enable to start. Frames are processed locally.'
    : webcam.state in STATE_COPY
      ? STATE_COPY[webcam.state]
      : 'Calibrating…';

  return (
    <SignalCard
      title="Webcam Attention"
      icon={<Eye className="w-4 h-4" />}
      connected={status === 'running'}
      reading={reading}
      interpretation={interpretation}
      lastUpdated={webcam.lastUpdated}
      accent="#7cf3ff"
      rightAction={
        status === 'running' ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onStop}
            className="pill border border-cortex-red/40 text-cortex-red bg-cortex-red/10 hover:bg-cortex-red/20 transition"
          >
            <CameraOff className="w-3 h-3" /> stop
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onStart}
            className="pill border border-cortex-accent/40 text-cortex-accent bg-cortex-accent/10 hover:bg-cortex-accent/20 transition"
          >
            <Power className="w-3 h-3" /> enable
          </motion.button>
        )
      }
    >
      <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-cortex-bg/80 border border-cortex-border/50">
        <video
          ref={videoRef}
          className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
            streamActive ? 'opacity-100' : 'opacity-0'
          }`}
          playsInline
          muted
        />
        {!streamActive && (
          <div className="absolute inset-0 grid place-items-center text-cortex-dim font-mono text-[11px] text-center px-3">
            {status === 'requesting' || status === 'loading_model'
              ? 'Initialising face mesh…'
              : status === 'denied' || status === 'error_falling_back'
                ? errorMessage ?? 'Permission denied — using simulated attention.'
                : 'Tap enable to bring the camera online.'}
          </div>
        )}
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-cortex-dim/90">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-nv-green" />
            local
          </span>
          <span>no video stored</span>
          <span>no identity</span>
        </div>
        {webcam.attentionScore != null && streamActive && (
          <div
            className="absolute top-2 right-2 pill bg-cortex-bg/70 border"
            style={{ borderColor: `${accent}50`, color: accent }}
          >
            {webcam.attentionScore}
          </div>
        )}
      </div>

      {webcam.history.length > 1 && (
        <AttentionTrendChart history={webcam.history} color={accent} height={42} />
      )}

      <div className="grid grid-cols-3 gap-2">
        <Mini label="gaze" value={webcam.gazeDirection} />
        <Mini
          label="blinks"
          value={webcam.blinkRate != null ? `${webcam.blinkRate.toFixed(1)}/m` : '—'}
        />
        <Mini
          label="permission"
          value={diagnostic.permissionState}
          warn={diagnostic.permissionState === 'denied'}
        />
      </div>
    </SignalCard>
  );
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md bg-cortex-bg/40 border border-cortex-border/50 p-1.5 truncate">
      <div className="text-[8px] uppercase tracking-widest text-cortex-dim font-mono">{label}</div>
      <div className={`text-xs font-mono mt-0.5 ${warn ? 'text-cortex-red' : 'text-cortex-ink'}`} title={value}>
        {value}
      </div>
    </div>
  );
}
