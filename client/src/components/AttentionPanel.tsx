import { useEffect, useMemo, useRef, useState } from 'react';
import type { AttentionHeatPoint, AttentionMetrics } from '../types';
import type { WebcamStatus } from '../hooks/useAttentionTracking';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement>;
  metrics: AttentionMetrics | null;
  status: WebcamStatus;
  errorMessage: string | null;
  heat: AttentionHeatPoint[];
  fps: number;
  source: 'webcam' | 'simulated' | null;
  streamActive: boolean;
  onStart: () => void;
  onStop: () => void;
}

const INTERPRETED_PALETTE: Record<
  AttentionMetrics['interpretedState'],
  { text: string; bg: string; ring: string; description: string }
> = {
  Focused: {
    text: 'text-cortex-green',
    bg: 'bg-cortex-green/10',
    ring: 'ring-cortex-green/40',
    description: 'Stable centered gaze. Mind is on the task.',
  },
  Distracted: {
    text: 'text-cortex-red',
    bg: 'bg-cortex-red/10',
    ring: 'ring-cortex-red/40',
    description: 'Gaze repeatedly leaving the screen.',
  },
  Fatigued: {
    text: 'text-cortex-violet',
    bg: 'bg-cortex-violet/10',
    ring: 'ring-cortex-violet/40',
    description: 'Blink rate elevated. Energy is dropping.',
  },
  Searching: {
    text: 'text-cortex-yellow',
    bg: 'bg-cortex-yellow/10',
    ring: 'ring-cortex-yellow/40',
    description: 'Scanning multiple regions — likely lost the thread.',
  },
  Overstimulated: {
    text: 'text-cortex-accent',
    bg: 'bg-cortex-accent/10',
    ring: 'ring-cortex-accent/40',
    description: 'Rapid gaze switching. Cognitive fragmentation risk.',
  },
};

const STATUS_LABEL: Record<WebcamStatus, string> = {
  idle: 'idle',
  requesting: 'requesting camera...',
  loading_model: 'loading face mesh...',
  running: 'live · processed locally',
  denied: 'permission denied · simulated',
  unsupported: 'camera unsupported · simulated',
  error_falling_back: 'simulated metrics active',
};

export default function AttentionPanel(props: Props) {
  const interp = props.metrics?.interpretedState ?? 'Focused';
  const palette = INTERPRETED_PALETTE[interp];
  // Show the video as soon as we have a stream — even before FaceMesh has
  // loaded — so the user sees the camera is engaged.
  const isLive = props.streamActive;

  return (
    <div className={`panel relative overflow-hidden flex-1 min-h-0 flex flex-col`}>
      <div className="panel-header">
        <span>attention tracking · webcam mesh</span>
        <span className={props.status === 'running' ? 'text-cortex-accent' : 'text-cortex-yellow'}>
          {STATUS_LABEL[props.status]}
        </span>
      </div>
      <div className="panel-body flex-1 min-h-0 grid grid-cols-5 gap-3">
        {/* LEFT: webcam preview + heat overlay */}
        <div className="col-span-2 flex flex-col gap-2 min-h-0">
          <div className="relative rounded-lg border border-cortex-border/60 bg-cortex-bg/80 overflow-hidden aspect-[4/3]">
            <video
              ref={props.videoRef}
              className={`absolute inset-0 w-full h-full object-cover ${
                isLive ? 'opacity-100' : 'opacity-0'
              } scale-x-[-1]`}
              playsInline
              muted
            />
            {!isLive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-cortex-dim font-mono text-[11px] text-center px-4">
                {props.status === 'idle' ? (
                  <>
                    <div className="text-cortex-accent text-base">◎</div>
                    <div>Click "Enable Camera" to start attention tracking.</div>
                    <div className="text-[10px]">Falls back to simulated metrics if denied.</div>
                  </>
                ) : props.status === 'requesting' || props.status === 'loading_model' ? (
                  <>
                    <div className="text-cortex-accent animate-pulse">●</div>
                    <div>{STATUS_LABEL[props.status]}</div>
                  </>
                ) : (
                  <>
                    <div className="text-cortex-yellow">⚠</div>
                    <div>{props.errorMessage ?? 'Running simulated attention.'}</div>
                    <div className="text-[10px]">Demo continues without breaking.</div>
                  </>
                )}
              </div>
            )}

            {/* Heat overlay */}
            <HeatOverlay heat={props.heat} />

            {/* Gaze direction indicator (centered on face area) */}
            {props.metrics && (
              <GazeIndicator direction={props.metrics.gazeDirection} />
            )}

            {/* Privacy strip */}
            <div className="absolute bottom-1 left-1 right-1 flex justify-between text-[8px] font-mono uppercase tracking-widest text-cortex-dim/90">
              <span>processed locally</span>
              <span>no video stored</span>
              <span>no identity recognition</span>
            </div>

            {props.fps > 0 && (
              <div className="absolute top-1 right-1 font-mono text-[9px] text-cortex-accent/80 bg-cortex-bg/60 px-1.5 py-0.5 rounded">
                {props.fps} fps · {props.source}
              </div>
            )}
          </div>

          <div className="flex gap-1.5">
            {props.status === 'running' ? (
              <button
                onClick={props.onStop}
                className="flex-1 px-2 py-1.5 rounded-md bg-cortex-red/10 border border-cortex-red/40 text-cortex-red font-mono text-[11px] uppercase tracking-widest hover:bg-cortex-red/20"
              >
                stop camera
              </button>
            ) : (
              <button
                onClick={props.onStart}
                className="flex-1 px-2 py-1.5 rounded-md bg-cortex-accent/10 border border-cortex-accent/50 text-cortex-accent font-mono text-[11px] uppercase tracking-widest hover:bg-cortex-accent/20 shadow-glow"
              >
                {props.status === 'idle' ? 'enable camera' : 'retry camera'}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT: numbers + interpretation + stability sparkline */}
        <div className="col-span-3 flex flex-col gap-3 min-h-0">
          <div
            className={`rounded-lg border ${palette.bg} ring-1 ${palette.ring} p-3 flex items-center justify-between`}
          >
            <div>
              <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">
                interpreted state
              </div>
              <div className={`font-mono text-2xl ${palette.text}`}>{interp}</div>
              <div className="text-[11px] text-cortex-ink/80 font-mono mt-0.5">
                {palette.description}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-cortex-dim font-mono">score</div>
              <div className={`font-mono text-3xl ${palette.text}`}>
                {props.metrics?.attentionScore ?? '—'}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-cortex-dim font-mono">
                / 100
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="gaze"
              value={props.metrics?.gazeDirection ?? '—'}
              accent={props.metrics?.gazeDirection !== 'offscreen'}
              warn={props.metrics?.gazeDirection === 'offscreen'}
            />
            <Stat
              label="off-screen 60s"
              value={props.metrics ? `${Math.round(props.metrics.offscreenRatio60s * 100)}%` : '—'}
              warn={!!props.metrics && props.metrics.offscreenRatio60s > 0.3}
            />
            <Stat
              label="distracted"
              value={
                props.metrics
                  ? `${props.metrics.distractionDurationSeconds.toFixed(1)}s`
                  : '—'
              }
              warn={!!props.metrics && props.metrics.distractionDurationSeconds > 4}
            />
            <Stat
              label="blink rate"
              value={
                props.metrics
                  ? `${props.metrics.blinkRate.toFixed(1)}/min`
                  : '—'
              }
              warn={!!props.metrics && (props.metrics.blinkRate > 28 || props.metrics.blinkRate < 4)}
            />
            <Stat
              label="gaze switches"
              value={
                props.metrics ? `${Math.round(props.metrics.gazeSwitchRate)}/min` : '—'
              }
              warn={!!props.metrics && props.metrics.gazeSwitchRate > 30}
            />
            <Stat
              label="face detected"
              value={props.metrics?.faceDetected ? 'yes' : 'no'}
              warn={!props.metrics?.faceDetected && props.status === 'running'}
            />
          </div>

          <StabilityGraph score={props.metrics?.focusStability ?? null} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
  accent,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="p-2 rounded-md bg-cortex-bg/60 border border-cortex-border/60">
      <div className="text-[9px] uppercase tracking-wider text-cortex-dim font-mono">{label}</div>
      <div
        className={`font-mono text-sm ${
          warn ? 'text-cortex-red' : accent ? 'text-cortex-accent' : 'text-cortex-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StabilityGraph({ score }: { score: number | null }) {
  const [history, setHistory] = useState<number[]>([]);
  const lastPushRef = useRef(0);
  useEffect(() => {
    if (score === null) return;
    const now = Date.now();
    if (now - lastPushRef.current > 250) {
      lastPushRef.current = now;
      setHistory((p) => [...p, score].slice(-80));
    }
  }, [score]);

  const width = 360;
  const height = 56;
  const points = useMemo(() => {
    if (history.length < 2) return '';
    return history
      .map((v, i) => {
        const x = (i / (history.length - 1)) * (width - 4) + 2;
        const y = height - 2 - (v / 100) * (height - 6);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }, [history]);

  const color = (score ?? 0) > 70 ? '#3ee892' : (score ?? 0) > 40 ? '#ffd86b' : '#ff5c7c';

  return (
    <div className="rounded-md bg-cortex-bg/60 border border-cortex-border/60 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-cortex-dim font-mono">focus stability</span>
        <span className="font-mono text-xs" style={{ color }}>
          {score ?? '—'}
          <span className="text-cortex-dim ml-1">/100</span>
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
        <line x1={0} x2={width} y1={height - (40 / 100) * (height - 6) - 2} y2={height - (40 / 100) * (height - 6) - 2}
              stroke="#1c2340" strokeDasharray="2 3" />
        <line x1={0} x2={width} y1={height - (70 / 100) * (height - 6) - 2} y2={height - (70 / 100) * (height - 6) - 2}
              stroke="#1c2340" strokeDasharray="2 3" />
        {points && <path d={points} stroke={color} strokeWidth={1.5} fill="none" />}
      </svg>
    </div>
  );
}

function HeatOverlay({ heat }: { heat: AttentionHeatPoint[] }) {
  if (heat.length === 0) return null;
  const now = Date.now();
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <radialGradient id="heat-grad">
          <stop offset="0%" stopColor="#7cf3ff" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#a07bff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#a07bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {heat.map((h, i) => {
        const ageSec = (now - h.t) / 1000;
        if (ageSec > 8) return null;
        const opacity = Math.max(0, 1 - ageSec / 8) * h.weight;
        // Mirror x because the video itself is mirrored via scale-x-[-1].
        const cx = (1 - h.x) * 100;
        const cy = h.y * 100;
        return (
          <circle
            key={`${i}-${h.t}`}
            cx={cx}
            cy={cy}
            r={5 + h.weight * 7}
            fill="url(#heat-grad)"
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
}

function GazeIndicator({ direction }: { direction: AttentionMetrics['gazeDirection'] }) {
  const arrow: Record<AttentionMetrics['gazeDirection'], string> = {
    center: '●',
    left: '◀',
    right: '▶',
    down: '▼',
    offscreen: '⊘',
  };
  const color =
    direction === 'offscreen'
      ? '#ff5c7c'
      : direction === 'center'
      ? '#3ee892'
      : '#ffd86b';
  return (
    <div className="absolute top-1 left-1 font-mono text-[10px] uppercase tracking-widest bg-cortex-bg/70 px-1.5 py-0.5 rounded flex items-center gap-1">
      <span style={{ color }}>{arrow[direction]}</span>
      <span style={{ color }}>{direction}</span>
    </div>
  );
}
